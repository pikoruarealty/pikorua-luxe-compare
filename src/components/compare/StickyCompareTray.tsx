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
    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-68px 0px 0px 0px" }, // 68px = navbar height
    );
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
      rootMargin: "-68px 0px 0px 0px",
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
          className="fixed left-0 right-0 z-50 border-b border-[color-mix(in_oklab,var(--brand)_30%,transparent)] bg-[color-mix(in_oklab,var(--background)_92%,transparent)] backdrop-blur-md [transform:translateZ(0)]"
          style={{ top: 68, willChange: "transform" }}
        >
          <div className="container-lux py-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <p className="whitespace-nowrap text-[10px] uppercase tracking-luxury text-champagne">
                Comparison Suite · {items.length} / {MAX_COMPARE}
              </p>
              <button
                type="button"
                aria-disabled={!ready}
                disabled={!ready}
                onClick={() => ready && onCompare?.()}
                className={[
                  "whitespace-nowrap rounded-full border px-5 py-2 text-[11px] uppercase tracking-luxury transition",
                  ready
                    ? "border-[var(--brand)] text-[var(--brand)] hover:bg-[color-mix(in_oklab,var(--brand)_12%,transparent)]"
                    : "cursor-not-allowed border-[color-mix(in_oklab,var(--brand)_35%,transparent)] text-[color-mix(in_oklab,var(--brand)_45%,transparent)] opacity-50",
                ].join(" ")}
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
              <div className="hidden md:block text-[10px] uppercase tracking-luxury text-muted-foreground self-center">
                Properties
              </div>
              {slots.map((slot, i) => (
                <SlotPill
                  key={i}
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
  selectedIds,
  onRemove,
}: {
  slot: Property | null;
  selectedIds: string[];
  onRemove: () => void;
}) {
  const base = "flex h-14 w-full items-center gap-3 rounded-2xl border px-3 text-sm";

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

  if (!slot) {
    return (
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${base} border-dashed border-[color-mix(in_oklab,var(--brand)_45%,transparent)] text-ivory/60 hover:text-ivory hover:border-[var(--brand)] hover:bg-[color-mix(in_oklab,var(--brand)_8%,transparent)] transition cursor-pointer text-left`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Add a property to comparison"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-[color-mix(in_oklab,var(--brand)_45%,transparent)]">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <span className="truncate text-[12px] uppercase tracking-luxury">
            {open ? "Choose a residence" : "Add a property"}
          </span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-2xl border border-[color-mix(in_oklab,var(--brand)_35%,transparent)] bg-[var(--glass-bg)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.55)] backdrop-blur-xl"
              role="listbox"
            >
              <div className="border-b border-[color-mix(in_oklab,var(--brand)_20%,transparent)] p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    quizAnswers ? "Search your matched residences…" : "Search residences…"
                  }
                  className="w-full rounded-lg bg-transparent px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="max-h-72 overflow-y-auto p-1">
                {options.length === 0 ? (
                  <p className="p-4 text-center text-[12px] text-muted-foreground">
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
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[color-mix(in_oklab,var(--brand)_10%,transparent)]"
                      role="option"
                    >
                      <img
                        src={p.image}
                        alt=""
                        className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="descender-safe truncate font-display text-[14px] leading-tight text-foreground">
                          {p.name}
                        </p>
                        <p className="truncate text-[10px] uppercase tracking-luxury text-muted-foreground">
                          {p.developer} · {p.location}
                        </p>
                      </div>
                      <Check className="h-3.5 w-3.5 opacity-0" />
                    </button>
                  ))
                )}
              </div>
              {quizAnswers && (
                <div className="border-t border-[color-mix(in_oklab,var(--brand)_20%,transparent)] px-3 py-2 text-[10px] uppercase tracking-luxury text-muted-foreground">
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
      className={`${base} group border-[color-mix(in_oklab,var(--brand)_60%,transparent)] bg-soft-black/60 text-ivory transition hover:border-[var(--brand)]`}
    >
      <img src={slot.image} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <p className="descender-safe truncate font-display text-[15px] leading-tight">
          {slot.name}
        </p>
        <p className="truncate text-[10px] uppercase tracking-luxury text-muted-foreground">
          {slot.developer} · {slot.location}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${slot.name} from comparison`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-champagne/30 text-ivory/70 transition hover:border-champagne hover:text-champagne hover:bg-champagne/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
