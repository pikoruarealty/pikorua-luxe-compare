import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Image as ImageIcon, TriangleAlert, X } from "lucide-react";
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
  const [overrides, setOverrides] = useState<VariantOverrides>({});
  const sections = useMemo(() => buildApprovalSections(response, overrides), [response, overrides]);
  const allItems = useMemo(
    () => sections.flatMap((s) => s.groups.flatMap((g) => g.items)),
    [sections],
  );
  const missing = useMemo(() => missingFieldLabels(response), [response]);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(allItems.filter((i) => i.formField).map((i) => [i.key, i.value])),
  );
  // List-style items (amenities, highlights) are pills, not one text box —
  // edited by adding/removing entries rather than retyping the whole value.
  const [listValues, setListValues] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(allItems.filter((i) => i.values).map((i) => [i.key, i.values!])),
  );
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
  const [approved, setApproved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      allItems
        .filter((i) => (i.confidence ?? 0) > 0.75 && !i.validationWarning)
        .map((i) => [i.key, true]),
    ),
  );
  const [showError, setShowError] = useState(false);

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
  const jumpToPageImage = (key: string) => {
    setExpandedPages((s) => (s.has(key) ? s : new Set(s).add(key)));
    document
      .querySelector(`[data-page-anchor="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
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
    onContinue(
      partial as unknown as Partial<PropertyFormValues>,
      mapped.map((i) => i.formField as keyof PropertyFormValues),
      overrides,
    );
  };

  const setVariant = (index: number, patch: { bucket?: ConfigBucket; label?: string }) =>
    setOverrides((o) => ({ ...o, [index]: { ...o[index], ...patch } }));

  return (
    <div className="max-w-2xl">
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
            {response.extraction.warnings.length > 1 ? "s" : ""} flagged by a consistency
            check — look for the amber notes below each one.
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
                  const editable = Boolean(item.formField);
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
                                    onClick={() => jumpToPageImage(key)}
                                    className="mt-1.5 text-[11px] font-medium text-champagne underline underline-offset-2"
                                  >
                                    ↑ Same page as above (p.{sourcePage})
                                  </button>
                                );
                              }

                              const url = pageImageUrl(sourceFile, sourcePage);
                              if (!url) return null;
                              const expanded = expandedPages.has(key);
                              return (
                                <div data-page-anchor={key} className="mt-1.5">
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
                                    <img
                                      src={url}
                                      alt={`${sourceFile} page ${sourcePage}`}
                                      loading="lazy"
                                      className="mt-2 max-h-[70vh] w-auto max-w-full rounded-lg border border-(--rule) shadow-(--shadow-lift)"
                                    />
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
    </div>
  );
}
