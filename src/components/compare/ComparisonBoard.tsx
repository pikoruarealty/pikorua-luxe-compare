import { useMemo, useState, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, ChevronDown, Sparkles, ArrowUpRight } from "lucide-react";
import { useProperties, usePropertyLookup } from "@/context/PropertiesContext";
import { MAX_COMPARE, MIN_COMPARE, useCompareStore } from "@/stores/compare-store";
import { SaveCompareButton } from "@/components/compare/SaveCompareButton";
import { ShareCompareButton } from "@/components/compare/ShareCompareButton";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ConfigKey, Property } from "@/types/property";
import { CONFIG_KEYS } from "@/types/property";
import { toast } from "sonner";
import { useOnboarding } from "@/context/OnboardingContext";
import { saveQuizAnswers } from "@/lib/profile.functions";
import { allowedConfigKeys, matchesPreferences, parseBudget } from "@/lib/preference-filter";
import { AreaUnitToggle } from "@/components/compare/AreaUnitToggle";
import { PropertyPickerModal } from "@/components/compare/PropertyPickerModal";
import { ComparisonMatrixTable } from "@/components/compare/ComparisonMatrixTable";

const NEAR_BUDGET_THRESHOLD = 0.2;
function budgetStanding(cheapestPrice: number, budgetHi: number): "in" | "near" | "far" {
  if (cheapestPrice <= budgetHi) return "in";
  const overBy = (cheapestPrice - budgetHi) / budgetHi;
  return overBy <= NEAR_BUDGET_THRESHOLD ? "near" : "far";
}

export function ComparisonBoard({
  slotsRef,
}: {
  /** Ref attached to the "Add property A/B/C" picker cards — lets the sticky
   *  tray reappear once these scroll out of view, instead of staying hidden
   *  for the whole comparison table below them. */
  slotsRef?: RefObject<HTMLDivElement | null>;
} = {}) {
  const hydrated = useHydrated();
  const { quizAnswers, setQuizAnswers, requestAuth } = useOnboarding();
  const saveQuizAnswersFn = useServerFn(saveQuizAnswers);
  const clearFilters = () => {
    setQuizAnswers(null);
    try {
      window.localStorage.removeItem("pikorua:quiz-answers");
    } catch {
      // ignore
    }
    saveQuizAnswersFn({ data: { answers: null } }).catch(() => {});
  };
  const { selected: rawSelected, toggle, remove, clear } = useCompareStore();
  const allProperties = useProperties();
  const getPropertyById = usePropertyLookup();
  const selected = useMemo(() => (hydrated ? rawSelected : []), [hydrated, rawSelected]);
  const items = useMemo(
    () => selected.map((id) => getPropertyById(id)).filter(Boolean) as Property[],
    [selected, getPropertyById],
  );
  const filtered = useMemo(
    () => allProperties.filter((p) => matchesPreferences(p, quizAnswers)),
    [allProperties, quizAnswers],
  );

  const noMatches = Boolean(quizAnswers) && filtered.length === 0;
  const pickable = filtered.length > 0 ? filtered : allProperties;
  const visibleConfigKeys = useMemo<ConfigKey[]>(() => {
    const allowed = allowedConfigKeys(quizAnswers);
    if (allowed.length === 0 || noMatches) return CONFIG_KEYS;
    const set = new Set<ConfigKey>(allowed);
    const budget = parseBudget(quizAnswers?.budgetSub || quizAnswers?.budgetRange);
    for (const p of items) {
      for (const k of CONFIG_KEYS) {
        if (set.has(k)) continue;
        const variants = p.configurations[k];
        if (!variants?.length) continue;
        if (!budget) {
          set.add(k);
          continue;
        }
        const [lo, hi] = budget;
        const anyVariantFits = variants.some((cfg) => {
          const m = (cfg.price ?? "").match(/[\d.]+/);
          const price = m ? parseFloat(m[0]) : null;
          return price === null || (price >= lo - 0.5 && price <= hi + 0.5);
        });
        if (anyVariantFits) set.add(k);
      }
    }
    return CONFIG_KEYS.filter((k) => set.has(k));
  }, [quizAnswers, noMatches, items]);

  const slotBudgetStatus = useMemo<Record<string, "in" | "near" | "far">>(() => {
    const budget = parseBudget(quizAnswers?.budgetSub || quizAnswers?.budgetRange);
    if (!budget) return {};
    const [, hi] = budget;
    const status: Record<string, "in" | "near" | "far"> = {};
    for (const key of visibleConfigKeys) {
      const prices = items
        .flatMap((p) => p.configurations[key] ?? [])
        .map((cfg) => {
          const m = cfg.price?.match(/[\d.]+/);
          return m ? parseFloat(m[0]) : null;
        })
        .filter((n): n is number => n !== null);
      if (prices.length === 0) continue;
      status[key] = budgetStanding(Math.min(...prices), hi);
    }
    return status;
  }, [quizAnswers, visibleConfigKeys, items]);

  const budgetLabel = quizAnswers?.budgetSub || quizAnswers?.budgetRange || null;
  const slots: (Property | null)[] = Array.from(
    { length: MAX_COMPARE },
    (_, i) => items[i] ?? null,
  );
  const ready = items.length >= MIN_COMPARE;

  return (
    <section className="container-lux">
      <div className="rounded-card border border-[var(--rule)] bg-card/40 p-5 sm:p-7">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div className="min-w-0">
            <p
              className="uppercase tracking-luxury text-muted-foreground"
              style={{ fontSize: "var(--step--2)" }}
            >
              Comparison · {items.length} / {MAX_COMPARE}
            </p>
            <h2
              className="mt-1.5 font-display leading-tight text-foreground"
              style={{ fontSize: "var(--step-1)" }}
            >
              Compare residences
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ready && (
              <SaveCompareButton
                properties={items}
                className="px-3.5 py-1.5 min-h-[36px] touch-manipulation active:scale-95"
              />
            )}
            {ready && (
              <ShareCompareButton
                properties={items}
                className="min-h-[36px] touch-manipulation active:scale-95"
              />
            )}
            {ready && (
              <Link
                to="/compare"
                search={{ ids: items.map((p) => p.id).join(",") }}
                onClick={() => window.setTimeout(() => requestAuth(), 1200)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 tracking-wide text-background touch-manipulation transition hover:opacity-85 active:scale-95"
                style={{ fontSize: "var(--step--2)" }}
              >
                Open full report <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
            {items.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--rule)] px-3.5 py-1.5 tracking-wide text-muted-foreground touch-manipulation transition-colors hover:border-foreground/40 hover:text-foreground active:scale-95"
                style={{ fontSize: "var(--step--2)" }}
              >
                <X className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
        </div>

        {ready && (
          <div className="pb-4">
            <AreaUnitToggle />
          </div>
        )}

        {noMatches && (
          <div
            className="mb-4 rounded-card border border-dashed border-[var(--rule-strong)] bg-muted/20 px-3 py-2 text-muted-foreground"
            style={{ fontSize: "var(--step--1)" }}
          >
            No residences match your current preferences — showing the full catalogue so you can
            still compare.
          </div>
        )}

        {/* Slot picker */}
        <div ref={slotsRef} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot, idx) => (
            <SlotCard
              key={idx}
              slot={slot}
              index={idx}
              onRemove={(id) => remove(id)}
              onPick={(id) => {
                const r = toggle(id);
                if (!r.ok && r.reason) toast.error(r.reason);
              }}
              currentSelected={selected}
              pickable={pickable}
              noMatches={noMatches}
              onClearFilters={clearFilters}
            />
          ))}
        </div>

        <AnimatePresence initial={false}>
          {ready ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-6"
            >
              <ComparisonMatrixTable
                items={items}
                visibleConfigKeys={visibleConfigKeys}
                slotBudgetStatus={slotBudgetStatus}
                budgetLabel={budgetLabel}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6 flex flex-col items-center justify-center rounded-card border border-dashed border-[var(--rule-strong)] px-6 py-10 text-center"
            >
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground" style={{ fontSize: "var(--step--1)" }}>
                Add at least {MIN_COMPARE} properties to compare.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function SlotCard({
  slot,
  index,
  onRemove,
  onPick,
  currentSelected,
  pickable,
  noMatches,
  onClearFilters,
}: {
  slot: Property | null;
  index: number;
  onRemove: (id: string) => void;
  onPick: (id: string) => void;
  currentSelected: string[];
  pickable: Property[];
  noMatches: boolean;
  onClearFilters: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (slot) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden rounded-card border border-[var(--rule)] bg-card"
      >
        <div className="relative aspect-[16/9] overflow-hidden">
          <img
            src={slot.image}
            alt={slot.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <button
            type="button"
            onClick={() => onRemove(slot.id)}
            aria-label="Remove"
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="absolute bottom-2.5 left-3 right-3 text-white">
            <p className="tracking-luxury opacity-80" style={{ fontSize: "var(--step--2)" }}>
              {String.fromCharCode(65 + index)}
            </p>
            <h3
              className="descender-safe mt-0.5 font-display leading-tight line-clamp-1"
              style={{ fontSize: "var(--step--1)" }}
            >
              {slot.name}
            </h3>
            <p className="opacity-80 line-clamp-1" style={{ fontSize: "var(--step--2)" }}>
              {slot.developer}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-full min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-[var(--rule-strong)] bg-transparent px-6 py-8 text-center transition-colors hover:border-foreground/40 hover:bg-muted/30"
      >
        <div className="grid h-9 w-9 place-items-center rounded-full border border-[var(--rule)] text-muted-foreground transition-colors group-hover:border-foreground/40 group-hover:text-foreground">
          <Plus className="h-4 w-4" />
        </div>
        <p className="text-foreground/80" style={{ fontSize: "var(--step--1)" }}>
          Add property {String.fromCharCode(65 + index)}
        </p>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      <PropertyPickerModal
        open={open}
        onOpenChange={setOpen}
        index={index}
        onPick={(id) => {
          onPick(id);
          setOpen(false);
        }}
        currentSelected={currentSelected}
        pickable={pickable}
        noMatches={noMatches}
        onClearFilters={onClearFilters}
      />
    </>
  );
}
