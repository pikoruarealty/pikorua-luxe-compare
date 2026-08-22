import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Minus,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  buildApprovalSections,
  missingFieldLabels,
  CONFIG_BUCKET_OPTIONS,
} from "@/lib/brochure-field-mapping";
import type {
  ConfigBucket,
  ExtractionResponse,
  VariantOverrides,
} from "@/lib/brochure-field-mapping";
import type { PropertyFormValues } from "@/lib/property-schema";
import { loadReviewProgress, saveReviewProgress } from "@/lib/brochure-review-storage";

// The viewer panel is anchored to this gap from the viewport's right edge and
// resized within it, so these three numbers are the single source of truth
// for both the panel's CSS and the bounds math below.
const PANEL_RIGHT_GAP = 24;
const PANEL_BOTTOM_GAP = 24;
const PANEL_MIN_WIDTH = 280;
const PANEL_MIN_HEIGHT = 240;
const PANEL_DEFAULT_WIDTH = 380;
const PANEL_DEFAULT_HEIGHT = 480;

function confidenceStyle(confidence: number): string {
  if (confidence >= 0.85) return "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400";
  if (confidence >= 0.6) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-red-500/15 text-red-700 dark:text-red-400";
}

/** Several fields routinely cite the same brochure page (a plan sheet prints
 *  both areas and every room dimension at once) — this is the key that ties
 *  them together so the page only gets rendered once. */
function pageKey(sourceFile: string, sourcePage: number): string {
  return `${sourceFile}::${sourcePage}`;
}

/** Step 2 of the OCR path. Every single value the extractor produced gets its
 *  own tick — no bulk approve, no bundling several measurements behind one
 *  checkbox — so agreeing to a number is always a deliberate act. */
export function ExtractedFieldsReview({
  response,
  onContinue,
  onCancel,
}: {
  response: ExtractionResponse;
  onContinue: (
    values: Partial<PropertyFormValues>,
    approvedKeys: (keyof PropertyFormValues)[],
    overrides: VariantOverrides,
  ) => void;
  onCancel: () => void;
}) {
  // Restored once on mount if this job's review was left and come back to —
  // by closing the tab, going back a step, or resuming by job id later.
  const [saved] = useState(() => loadReviewProgress(response.job_id));

  const [overrides, setOverrides] = useState<VariantOverrides>(() => saved?.overrides ?? {});
  const sections = useMemo(() => buildApprovalSections(response, overrides), [response, overrides]);
  const allItems = useMemo(
    () => sections.flatMap((s) => s.groups.flatMap((g) => g.items)),
    [sections],
  );
  const missing = useMemo(() => missingFieldLabels(response), [response]);

  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(
      allItems.filter((i) => i.formField || i.configField).map((i) => [i.key, i.value]),
    ),
    ...saved?.values,
  }));
  // List-style items (amenities, highlights) are pills, not one text box —
  // edited by adding/removing entries rather than retyping the whole value.
  const [listValues, setListValues] = useState<Record<string, string[]>>(() => ({
    ...Object.fromEntries(allItems.filter((i) => i.values).map((i) => [i.key, i.values!])),
    ...saved?.listValues,
  }));
  const [newPillText, setNewPillText] = useState<Record<string, string>>({});
  const removePill = (key: string, index: number) =>
    setListValues((lv) => ({ ...lv, [key]: (lv[key] ?? []).filter((_, i) => i !== index) }));
  const addPill = (key: string) => {
    const text = (newPillText[key] ?? "").trim();
    if (!text) return;
    setListValues((lv) => ({ ...lv, [key]: [...(lv[key] ?? []), text] }));
    setNewPillText((t) => ({ ...t, [key]: "" }));
  };
  // A number the OCR is confident about and no consistency check disputed
  // doesn't need a click to prove it was looked at — only the ones actually
  // worth a second glance should cost the reviewer one. Still a real,
  // uncheckable-if-wrong checkbox, just pre-ticked.
  const [approved, setApproved] = useState<Record<string, boolean>>(() => ({
    ...Object.fromEntries(
      allItems
        .filter((i) => (i.confidence ?? 0) > 0.75 && !i.validationWarning)
        .map((i) => [i.key, true]),
    ),
    ...saved?.approved,
  }));
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    saveReviewProgress(response.job_id, { approved, values, listValues, overrides });
  }, [response.job_id, approved, values, listValues, overrides]);

  // Only the first item to cite a given page gets the actual <img> — every
  // later item citing that same page just links back up to it, so a plan
  // sheet backing six room dimensions renders once, not six times.
  const firstPageOccurrence = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of allItems) {
      if (!item.sourceFile || !item.sourcePage) continue;
      const key = pageKey(item.sourceFile, item.sourcePage);
      if (!seen.has(key)) seen.set(key, item.key);
    }
    return seen;
  }, [allItems]);

  // Collapsed by default to keep the page short — except a field a
  // cross-check actively flagged, which opens straight away since that's
  // exactly the value the reviewer needs the source page for.
  const [expandedPages, setExpandedPages] = useState<Set<string>>(() => {
    const flagged = new Set<string>();
    for (const item of allItems) {
      if (item.validationWarning && item.sourceFile && item.sourcePage) {
        flagged.add(pageKey(item.sourceFile, item.sourcePage));
      }
    }
    return flagged;
  });
  const togglePage = (key: string) =>
    setExpandedPages((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // The full-size page render lives in a fixed side panel rather than inline
  // in the card — a plan sheet is too big to read at card width, and pinning
  // it means it survives the reviewer scrolling down to the next field.
  const [viewer, setViewer] = useState<{ sourceFile: string; sourcePage: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewerViewportRef = useRef<HTMLDivElement | null>(null);
  const viewerImageRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const reviewRootRef = useRef<HTMLDivElement | null>(null);
  const [panelBounds, setPanelBounds] = useState({
    top: 96,
    maxWidth: PANEL_DEFAULT_WIDTH,
    maxHeight: PANEL_DEFAULT_HEIGHT,
  });
  const [panelSize, setPanelSize] = useState({
    width: PANEL_DEFAULT_WIDTH,
    height: PANEL_DEFAULT_HEIGHT,
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const openViewer = (sourceFile: string, sourcePage: number) => {
    setViewer({ sourceFile, sourcePage });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Keeps the panel flush with the portal header's bottom rule and stops it
  // from ever covering the review column to its left or running off-screen —
  // recomputed whenever the viewer opens or the window resizes, since both
  // the header height and the review column's width can vary. The portal
  // header isn't sticky, so once the reviewer has scrolled down to a field
  // further down the list, its bottom edge sits above the viewport (a
  // negative coordinate) — clamp to a minimum so the fixed panel doesn't get
  // positioned off-screen and appear to vanish the instant it opens.
  useEffect(() => {
    const recompute = () => {
      const root = reviewRootRef.current;
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      const header = root.closest("main")?.querySelector("header");
      const rawTop = header ? header.getBoundingClientRect().bottom : PANEL_RIGHT_GAP;
      const top = Math.max(PANEL_RIGHT_GAP, rawTop);
      const maxWidth = Math.max(
        PANEL_MIN_WIDTH,
        window.innerWidth - PANEL_RIGHT_GAP - (rootRect.right + PANEL_RIGHT_GAP),
      );
      const maxHeight = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - top - PANEL_BOTTOM_GAP);
      setPanelBounds({ top, maxWidth, maxHeight });
      setPanelSize((s) => ({
        width: Math.min(s.width, maxWidth),
        height: Math.min(s.height, maxHeight),
      }));
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [viewer]);

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: panelSize.width,
      height: panelSize.height,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing) return;
    const dx = resizeStartRef.current.x - e.clientX;
    const dy = e.clientY - resizeStartRef.current.y;
    setPanelSize({
      width: Math.min(
        panelBounds.maxWidth,
        Math.max(PANEL_MIN_WIDTH, resizeStartRef.current.width + dx),
      ),
      height: Math.min(
        panelBounds.maxHeight,
        Math.max(PANEL_MIN_HEIGHT, resizeStartRef.current.height + dy),
      ),
    });
  };
  const stopResizing = () => setIsResizing(false);

  // Keeps the image from being dragged or pinch-zoomed past its own edges —
  // panning stops being useful once there's nothing left off-screen to reveal.
  const clampPan = (next: { x: number; y: number }, z: number) => {
    const viewport = viewerViewportRef.current;
    const img = viewerImageRef.current;
    if (!viewport || !img) return next;
    const maxX = Math.max(0, (img.offsetWidth * z - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * z - viewport.clientHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const setZoomClamped = (nextZoom: number) => {
    const z = Math.min(4, Math.max(1, nextZoom));
    setZoom(z);
    setPan((p) => clampPan(p, z));
  };

  // Re-clamp whenever the panel is resized — the viewport it's panning
  // within just changed size.
  useEffect(() => {
    setPan((p) => clampPan(p, zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSize]);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Trackpad pinch is reported by the browser as a wheel event with ctrlKey
  // set (there's no cross-browser gesture API worth relying on instead); a
  // plain two-finger scroll pans. Attached natively rather than via onWheel
  // so preventDefault actually stops the page/tab from zooming too.
  useEffect(() => {
    const viewport = viewerViewportRef.current;
    if (!viewport || !viewer) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        setZoom((z) => {
          const next = Math.min(4, Math.max(1, z - e.deltaY * 0.01));
          setPan((p) => clampPan(p, next));
          return next;
        });
      } else {
        setPan((p) => clampPan({ x: p.x - e.deltaX, y: p.y - e.deltaY }, zoomRef.current));
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [viewer]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPan(
      clampPan(
        { x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y },
        zoom,
      ),
    );
  };
  const stopDragging = () => setIsDragging(false);

  const pageImageUrl = (sourceFile: string, sourcePage: number): string | null => {
    if (!response.imageBaseUrl || !response.imageTicket) return null;
    const url = new URL(
      `/api/properties/${encodeURIComponent(response.job_id)}/page-image`,
      response.imageBaseUrl,
    );
    url.searchParams.set("file", sourceFile);
    url.searchParams.set("page", String(sourcePage));
    url.searchParams.set("t", response.imageTicket);
    return url.toString();
  };

  const remaining = allItems.filter((i) => !approved[i.key]).length;

  const handleContinue = () => {
    if (remaining > 0) {
      setShowError(true);
      const first = allItems.find((i) => !approved[i.key]);
      if (first) {
        document
          .querySelector(`[data-approval="${first.key}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    const mapped = allItems.filter((i) => i.formField);
    const partial: Record<string, string | string[]> = {};
    for (const item of mapped) {
      partial[item.formField as string] = item.values
        ? (listValues[item.key] ?? item.values)
        : (values[item.key] ?? item.value);
    }

    // Config-variant measurements (areas, room dimensions) don't map onto a
    // top-level form field — they land on configs[bucket][configIndex]
    // instead, so any edit here is threaded through as a per-variant
    // override, the same channel already used for a reviewer's BHK/label
    // corrections.
    const mergedOverrides: VariantOverrides = { ...overrides };
    for (const item of allItems) {
      if (!item.configField || item.configIndex === undefined) continue;
      const value = values[item.key] ?? item.value;
      if (!value) continue;
      const idx = item.configIndex;
      mergedOverrides[idx] = {
        ...mergedOverrides[idx],
        fields: { ...mergedOverrides[idx]?.fields, [item.configField]: value },
      };
    }

    onContinue(
      partial as unknown as Partial<PropertyFormValues>,
      mapped.map((i) => i.formField as keyof PropertyFormValues),
      mergedOverrides,
    );
  };

  const setVariant = (index: number, patch: { bucket?: ConfigBucket; label?: string }) =>
    setOverrides((o) => ({ ...o, [index]: { ...o[index], ...patch } }));

  return (
    <div ref={reviewRootRef} className="max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Here's everything we found. Check each value against the source, fix anything wrong, then
        approve it. All {allItems.length} need a tick — one at a time, on purpose.
      </p>

      {missing.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-dashed border-(--rule-strong) bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Not found in any file, fill these in yourself: {missing.join(", ")}</span>
        </div>
      )}
      {response.extraction.warnings?.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {response.extraction.warnings.length} value
            {response.extraction.warnings.length > 1 ? "s" : ""} flagged by a consistency check —
            look for the amber notes below each one.
          </span>
        </div>
      )}

      {sections.map((sec) => (
        <section key={sec.title} className="mt-7">
          <h3 className="mb-3 font-label text-[11px] font-semibold tracking-luxury text-champagne uppercase">
            {sec.title}
          </h3>

          {sec.groups.map((group, gi) => (
            <div
              key={`${group.title ?? "g"}-${group.configIndex ?? gi}`}
              className={gi > 0 ? "mt-5" : ""}
            >
              {group.configIndex === undefined
                ? group.title && (
                    <p className="mb-2 text-sm font-medium text-foreground">{group.title}</p>
                  )
                : /* The OCR reads the BHK off whatever the floor plan printed,
                     and plan books are often ambiguous or label sub-units
                     inconsistently — so the reviewer can move a variant to the
                     right BHK and rename it before any of it reaches the form. */
                  (() => {
                    const idx = group.configIndex;
                    return (
                      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted/25 px-2.5 py-2">
                        <input
                          value={overrides[idx]?.label ?? group.title ?? ""}
                          onChange={(e) => setVariant(idx, { label: e.target.value })}
                          aria-label="Variant name"
                          className="min-w-0 flex-1 rounded-md border border-(--rule-strong) bg-background px-2.5 py-1.5 text-sm font-medium text-foreground outline-none focus:border-champagne"
                        />
                        {group.sourceLabel && (
                          <span
                            className="w-full text-[11px] text-muted-foreground"
                            title="What the brochure called this layout"
                          >
                            brochure: {group.sourceLabel}
                          </span>
                        )}
                        <select
                          value={group.bucket ?? "bhk4"}
                          onChange={(e) =>
                            setVariant(idx, { bucket: e.target.value as ConfigBucket })
                          }
                          aria-label="Which configuration this belongs to"
                          className="rounded-md border border-(--rule-strong) bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-champagne"
                        >
                          {CONFIG_BUCKET_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {group.labelWarning && (
                          <p className="mt-1 flex w-full items-start gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{group.labelWarning}</span>
                          </p>
                        )}
                      </div>
                    );
                  })()}
              <div className="space-y-2">
                {group.items.map((item) => {
                  const isApproved = Boolean(approved[item.key]);
                  const needsAttention = showError && !isApproved;
                  const editable = Boolean(item.formField) || Boolean(item.configField);
                  return (
                    <div
                      key={item.key}
                      data-approval={item.key}
                      className={`rounded-xl border p-3 transition-colors ${
                        isApproved
                          ? "border-emerald-600/40 bg-emerald-600/5"
                          : needsAttention
                            ? "border-red-500/50"
                            : "border-(--rule)"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
                              {item.label}
                            </p>
                            {item.confidence !== undefined && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${confidenceStyle(item.confidence)}`}
                              >
                                {Math.round(item.confidence * 100)}% confident
                              </span>
                            )}
                          </div>

                          {item.values ? (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {(listValues[item.key] ?? item.values).map((v, vi) => (
                                <span
                                  key={`${item.key}-${vi}`}
                                  className="inline-flex items-center gap-1 rounded-full border border-(--rule) bg-muted/30 py-1 pr-1.5 pl-2.5 text-xs text-foreground"
                                >
                                  {v}
                                  <button
                                    type="button"
                                    onClick={() => removePill(item.key, vi)}
                                    aria-label={`Remove ${v}`}
                                    className="text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                              <input
                                value={newPillText[item.key] ?? ""}
                                onChange={(e) =>
                                  setNewPillText((t) => ({ ...t, [item.key]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addPill(item.key);
                                  }
                                }}
                                onBlur={() => addPill(item.key)}
                                placeholder="Add…"
                                className="min-w-[6rem] flex-1 rounded-full border border-dashed border-(--rule-strong) bg-background px-2.5 py-1 text-xs text-foreground outline-none focus:border-champagne"
                              />
                            </div>
                          ) : editable ? (
                            <input
                              value={values[item.key] ?? ""}
                              onChange={(e) =>
                                setValues((v) => ({ ...v, [item.key]: e.target.value }))
                              }
                              className="mt-1.5 w-full rounded-lg border border-(--rule-strong) bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-champagne focus:ring-2 focus:ring-champagne/30"
                            />
                          ) : (
                            <p className="mt-1 text-sm text-foreground">{item.value}</p>
                          )}

                          {item.validationWarning && (
                            <p className="mt-1.5 flex items-start gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                              <span>{item.validationWarning}</span>
                            </p>
                          )}

                          {(item.snippet || item.sourceFile) && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                              {item.snippet && <span>"{item.snippet}"</span>}
                              {item.sourceFile && (
                                <span>
                                  {" "}
                                  — {item.sourceFile}
                                  {item.sourcePage ? ` p.${item.sourcePage}` : ""}
                                </span>
                              )}
                            </p>
                          )}

                          {item.sourceFile &&
                            item.sourcePage &&
                            (() => {
                              const sourceFile = item.sourceFile as string;
                              const sourcePage = item.sourcePage as number;
                              const key = pageKey(sourceFile, sourcePage);
                              const isFirst = firstPageOccurrence.get(key) === item.key;

                              if (!isFirst) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => openViewer(sourceFile, sourcePage)}
                                    className="mt-1.5 text-[11px] font-medium text-champagne underline underline-offset-2"
                                  >
                                    ↑ Same page as above (p.{sourcePage})
                                  </button>
                                );
                              }

                              const url = pageImageUrl(sourceFile, sourcePage);
                              if (!url) return null;
                              const expanded = expandedPages.has(key);
                              const isActive =
                                viewer?.sourceFile === sourceFile &&
                                viewer?.sourcePage === sourcePage;
                              return (
                                <div className="mt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => togglePage(key)}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-champagne"
                                  >
                                    <ImageIcon className="h-3 w-3" />
                                    {expanded ? "Hide" : "View"} page {sourcePage}
                                    {expanded ? (
                                      <ChevronUp className="h-3 w-3" />
                                    ) : (
                                      <ChevronDown className="h-3 w-3" />
                                    )}
                                  </button>
                                  {expanded && (
                                    <button
                                      type="button"
                                      onClick={() => openViewer(sourceFile, sourcePage)}
                                      className={`mt-2 block overflow-hidden rounded-lg border shadow-(--shadow-lift) ${
                                        isActive ? "border-champagne" : "border-(--rule)"
                                      }`}
                                    >
                                      <img
                                        src={url}
                                        alt={`${sourceFile} page ${sourcePage}`}
                                        loading="lazy"
                                        className="h-28 w-auto max-w-full"
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                        </div>

                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pt-0.5">
                          <input
                            type="checkbox"
                            checked={isApproved}
                            onChange={(e) =>
                              setApproved((a) => ({ ...a, [item.key]: e.target.checked }))
                            }
                            className="h-4 w-4"
                          />
                          <span
                            className={`flex items-center gap-1 text-xs font-medium ${
                              isApproved
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}

      {showError && remaining > 0 && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          Approve all {remaining} remaining value{remaining > 1 ? "s" : ""} before continuing.
        </p>
      )}

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-(--rule) bg-background/90 py-4 backdrop-blur">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-(--rule-strong) px-5 py-2.5 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="foil rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase"
        >
          Continue to form
        </button>
        <span className="text-xs text-muted-foreground">
          {allItems.length - remaining} of {allItems.length} approved
        </span>
      </div>

      {viewer &&
        (() => {
          const url = pageImageUrl(viewer.sourceFile, viewer.sourcePage);
          if (!url) return null;
          return (
            <div
              style={{
                top: panelBounds.top,
                right: PANEL_RIGHT_GAP,
                width: panelSize.width,
                height: panelSize.height,
              }}
              className="fixed z-40 hidden flex-col overflow-hidden rounded-2xl border border-(--rule-strong) bg-card shadow-(--shadow-lift) lg:flex"
            >
              <div className="flex items-center justify-between gap-2 border-b border-(--rule) px-3 py-2">
                <p
                  className="min-w-0 truncate text-[11px] font-medium text-muted-foreground"
                  title={`${viewer.sourceFile} p.${viewer.sourcePage}`}
                >
                  {viewer.sourceFile} — p.{viewer.sourcePage}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setZoomClamped(zoom - 0.5)}
                    disabled={zoom <= 1}
                    aria-label="Zoom out"
                    className="grid h-6 w-6 place-items-center rounded-full border border-(--rule-strong) text-foreground transition-colors hover:border-champagne/50 disabled:opacity-30"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-9 text-center font-label text-[10px] tracking-wide text-muted-foreground">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomClamped(zoom + 0.5)}
                    disabled={zoom >= 4}
                    aria-label="Zoom in"
                    className="grid h-6 w-6 place-items-center rounded-full border border-(--rule-strong) text-foreground transition-colors hover:border-champagne/50 disabled:opacity-30"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewer(null)}
                    aria-label="Close preview"
                    className="ml-1 grid h-6 w-6 place-items-center rounded-full border border-(--rule-strong) text-muted-foreground transition-colors hover:border-champagne/50 hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div
                ref={viewerViewportRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDragging}
                onPointerLeave={stopDragging}
                className="relative flex flex-1 touch-none items-center justify-center overflow-hidden bg-muted/15 p-2"
                style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
              >
                <img
                  ref={viewerImageRef}
                  src={url}
                  alt={`${viewer.sourceFile} page ${viewer.sourcePage}`}
                  draggable={false}
                  onLoad={() => setPan((p) => clampPan(p, zoom))}
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                  className="max-h-full max-w-full rounded object-contain select-none"
                />
              </div>
              <div
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={stopResizing}
                onPointerLeave={stopResizing}
                role="separator"
                aria-label="Resize preview panel"
                className="absolute bottom-0 left-0 z-10 flex h-5 w-5 touch-none items-end justify-start p-1 [cursor:sw-resize]"
              >
                <span className="h-2.5 w-2.5 rounded-tr-sm border-t border-r border-(--rule-strong)" />
              </div>
            </div>
          );
        })()}
    </div>
  );
}
