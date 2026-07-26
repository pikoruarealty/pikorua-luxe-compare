import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, X } from "lucide-react";
import { MAX_COMPARE, MIN_COMPARE, useCompareStore } from "@/stores/compare-store";
import { useProperties, usePropertyLookup } from "@/context/PropertiesContext";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOnboarding } from "@/context/OnboardingContext";
import { matchesPreferences } from "@/lib/preference-filter";
import type { Property } from "@/types/property";
import { CONFIG_KEYS } from "@/types/property";
import { columnWeight, useVariantViewStore } from "@/stores/variant-view-store";

interface Props {
  /** Ref to a section above the tray's active zone. Tray shows once this scrolls out of view. */
  watchRef: RefObject<HTMLElement | null>;
  /** Optional ref — once this section enters the viewport, the tray hides. */
  hideRef?: RefObject<HTMLElement | null>;
  /** Called when the user clicks Compare with >= MIN_COMPARE slots filled. */
  onCompare?: () => void;
  /** Called when the user clicks an empty "Add a property" slot. */
  onAdd?: () => void;
}

/** Height of the fixed SiteHeader in its scrolled (compact) state.
 *
 *  The tray only ever appears after the hero has left the viewport, by which
 *  point the header has already shrunk from 68px to 58px — so this must track
 *  the compact height, not the resting one. It was pinned at 68 and left a 10px
 *  slot of page content showing between the two fixed bars. Keep in sync with
 *  the `h-[58px]` branch in SiteHeader.tsx. */
const HEADER_H_SCROLLED = 58;

/**
 * Floating, sticky comparison tray. Second visual representation of the
 * existing compare store — does not own any state of its own.
 */
export function StickyCompareTray({ watchRef, hideRef, onCompare, onAdd }: Props) {
  const hydrated = useHydrated();
  const { selected: rawSelected, remove } = useCompareStore();
  const selected = hydrated ? rawSelected : [];
  const getPropertyById = usePropertyLookup();

  const [pastHero, setPastHero] = useState(false);
  const [reachedHide, setReachedHide] = useState(false);

  useEffect(() => {
    const el = watchRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), {
      threshold: 0,
      rootMargin: `-${HEADER_H_SCROLLED}px 0px 0px 0px`,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [watchRef]);

  useEffect(() => {
    const el = hideRef?.current;
    if (!el) {
      setReachedHide(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setReachedHide(entry.isIntersecting), {
      threshold: 0,
      rootMargin: `-${HEADER_H_SCROLLED}px 0px 0px 0px`,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hideRef]);

  const visible = pastHero && !reachedHide;

  const items = selected.map((id) => getPropertyById(id)).filter(Boolean) as Property[];
  const slots: (Property | null)[] = Array.from(
    { length: MAX_COMPARE },
    (_, i) => items[i] ?? null,
  );
  const ready = items.length >= MIN_COMPARE;

  // Mirror whatever the comparison table below is doing with layout variants.
  // Empty slots keep a weight of 1 so the row still spans MAX_COMPARE columns.
  const expandedMap = useVariantViewStore((s) => s.expanded);
  const trayColTpl = useMemo(() => {
    const weights = slots.map((p) => (p ? columnWeight(p, expandedMap, CONFIG_KEYS) : 1));
    if (weights.every((w) => w === 1)) return undefined;
    return `200px ${weights.map((w) => `minmax(0, ${w}fr)`).join(" ")}`;
    // `slots` is rebuilt each render; the ids it holds are what actually matter.
  }, [expandedMap, selected.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="sticky-compare-tray"
          aria-label="Comparison tray"
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed left-0 right-0 z-50 border-b border-[var(--rule)] bg-[color-mix(in_oklab,var(--background)_92%,transparent)] backdrop-blur-md [transform:translateZ(0)]"
          style={{ top: HEADER_H_SCROLLED, willChange: "transform" }}
        >
          <div className="container-lux py-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <p
                className="tracking-luxury whitespace-nowrap text-champagne"
                style={{ fontSize: "var(--step--2)" }}
              >
                Comparison Suite · {items.length} / {MAX_COMPARE}
              </p>
              <button
                type="button"
                aria-disabled={!ready}
                disabled={!ready}
                onClick={() => ready && onCompare?.()}
                className={[
                  "tracking-luxury whitespace-nowrap rounded-full border px-5 py-2 transition",
                  ready
                    ? "border-[var(--brand)] text-[var(--brand)] hover:bg-[color-mix(in_oklab,var(--brand)_12%,transparent)]"
                    : "cursor-not-allowed border-[var(--rule-strong)] text-muted-foreground opacity-50",
                ].join(" ")}
                style={{ fontSize: "var(--step--2)" }}
              >
                Compare
              </button>
            </div>

            {/* Chips track the table's column widths: fan a property out into
                three layouts below and its chip widens to match, so the header
                stays a legend for what's underneath it. Collapsing reverts. */}
            <div
              className="compare-row grid grid-cols-3 gap-3 transition-[grid-template-columns] duration-300 ease-out sm:gap-4 md:[grid-template-columns:200px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
              style={trayColTpl ? ({ "--row-cols": trayColTpl } as React.CSSProperties) : undefined}
            >
              <div
                className="tracking-luxury hidden self-center text-muted-foreground md:block"
                style={{ fontSize: "var(--step--2)" }}
              >
                Properties
              </div>
              {slots.map((slot, i) => (
                <SlotPill
                  key={i}
                  index={i}
                  slot={slot}
                  selectedIds={selected}
                  onRemove={() => slot && remove(slot.id)}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SlotPill({
  slot,
  index = 0,
  selectedIds,
  onRemove,
}: {
  slot: Property | null;
  index?: number;
  selectedIds: string[];
  onRemove: () => void;
}) {
  const base = "flex h-14 w-full items-center gap-3 rounded-card border px-3";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { quizAnswers } = useOnboarding();
  const { toggle } = useCompareStore();
  const ALL_PROPERTIES = useProperties();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const options = useMemo(() => {
    const filtered = ALL_PROPERTIES.filter((p) => matchesPreferences(p, quizAnswers));
    const list = filtered.length ? filtered : ALL_PROPERTIES;
    const q = query.trim().toLowerCase();
    return list
      .filter((p) => !selectedIds.includes(p.id))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) ||
            p.developer.toLowerCase().includes(q) ||
            p.location.toLowerCase().includes(q)
          : true,
      );
  }, [ALL_PROPERTIES, quizAnswers, query, selectedIds]);

  const alignmentClass =
    index === 0
      ? "left-0"
      : index >= 2
        ? "right-0 left-auto"
        : "left-0 sm:left-1/2 sm:-translate-x-1/2";

  if (!slot) {
    return (
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${base} cursor-pointer border-dashed border-[var(--rule-strong)] text-left text-ivory/60 transition hover:border-foreground/40 hover:text-ivory`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Add a property to comparison"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-[var(--rule-strong)]">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <span className="tracking-luxury truncate" style={{ fontSize: "var(--step--2)" }}>
            {open ? "Choose a residence" : "Add a property"}
          </span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className={`absolute top-[calc(100%+8px)] z-[100] w-[320px] sm:w-[360px] max-w-[calc(100vw-2rem)] rounded-card border border-[var(--border-strong)] bg-card text-foreground shadow-2xl ${alignmentClass}`}
              role="listbox"
            >
              <div className="border-b border-[var(--border)] bg-muted/30 p-2.5">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    quizAnswers ? "Search your matched residences…" : "Search residences…"
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-background px-3 py-2 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus:border-champagne md:text-sm"
                />
              </div>
              <div className="max-h-72 overflow-y-auto p-1.5 [webkit-overflow-scrolling:touch]">
                {options.length === 0 ? (
                  <p
                    className="p-4 text-center text-muted-foreground"
                    style={{ fontSize: "var(--step--2)" }}
                  >
                    No matching residences.
                  </p>
                ) : (
                  options.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const res = toggle(p.id);
                        if (res.ok) {
                          setOpen(false);
                          setQuery("");
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-card px-2.5 py-2.5 text-left touch-manipulation transition hover:bg-muted active:bg-muted/80"
                      role="option"
                    >
                      <img
                        src={p.image}
                        alt=""
                        className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="descender-safe truncate font-display font-medium leading-tight text-foreground"
                          style={{ fontSize: "var(--step--1)" }}
                        >
                          {p.name}
                        </p>
                        <p
                          className="tracking-luxury truncate text-muted-foreground"
                          style={{ fontSize: "var(--step--2)" }}
                        >
                          {p.developer} · {p.location}
                        </p>
                      </div>
                      <Check className="h-3.5 w-3.5 opacity-0" />
                    </button>
                  ))
                )}
              </div>
              {quizAnswers && (
                <div
                  className="tracking-luxury border-t border-[var(--border)] bg-muted/20 px-3 py-2 text-muted-foreground"
                  style={{ fontSize: "var(--step--2)" }}
                >
                  Filtered by your preferences
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      className={`${base} group border-[var(--rule)] bg-soft-black/60 text-ivory transition hover:border-foreground/40`}
    >
      <img src={slot.image} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <p
          className="descender-safe truncate font-display leading-tight"
          style={{ fontSize: "var(--step--1)" }}
        >
          {slot.name}
        </p>
        <p
          className="tracking-luxury truncate text-muted-foreground"
          style={{ fontSize: "var(--step--2)" }}
        >
          {slot.developer} · {slot.location}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${slot.name} from comparison`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--rule)] text-ivory/70 transition hover:border-foreground/40 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
