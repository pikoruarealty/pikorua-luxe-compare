import { useMemo, useRef, useState, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Minus,
  MapPin,
  ArrowUpRight,
  Ruler,
  CalendarDays,
  Search,
  Eye,
} from "lucide-react";
import { useProperties, usePropertyLookup } from "@/context/PropertiesContext";
import { MAX_COMPARE, MIN_COMPARE, useCompareStore } from "@/stores/compare-store";
import { SaveCompareButton } from "@/components/compare/SaveCompareButton";
import { ShareCompareButton } from "@/components/compare/ShareCompareButton";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ConfigKey, Property } from "@/types/property";
import { CONFIG_KEYS } from "@/types/property";
import { toast } from "sonner";
import { PhotoSlideshow } from "@/components/compare/PhotoSlideshow";
import { useOnboarding } from "@/context/OnboardingContext";
import { allowedConfigKeys, matchesPreferences, parseBudget } from "@/lib/preference-filter";
import { VariantSwitcher, VariantValueCell, variantsOf } from "@/components/compare/VariantColumns";
import { useVariantViewStore, variantKey } from "@/stores/variant-view-store";
import { AreaUnitToggle } from "@/components/compare/AreaUnitToggle";
import { RoomFieldValue } from "@/components/compare/RoomFieldValue";
import { formatAreaNumber, parseBareSqFt, unitLabel } from "@/lib/area-units";
import { livePossessionLabel } from "@/lib/possession-format";
import { calculatePropertyDistances } from "@/lib/distance.functions";
import { useAreaUnitStore } from "@/stores/area-unit-store";

const TERM_INFO: Record<string, { title: string; body: string }> = {
  Developer: {
    title: "Developer",
    body: "A developer is a person or company that plans, builds, and sells projects such as residential apartments, commercial buildings, or townships.",
  },
  Carpet: {
    title: "Carpet Area",
    body: "Carpet Area is the actual usable space inside your home—the area where you can walk, place furniture, and live. It does not include the thickness of walls or common areas like corridors, lifts, or staircases.",
  },
  Possession: {
    title: "Possession Date",
    body: "Possession is the date when the developer hands over the property to the buyer, allowing them to move in or start interior work.",
  },
  Status: {
    title: "Project Status",
    body: "Project Status shows the current stage of the property's construction, such as Under Construction, Nearing Possession, or Ready to Move.",
  },
};

const DASH = "—";

type RoomKey =
  | "livingArea"
  | "kitchen"
  | "bedroom1"
  | "bedroom2"
  | "bedroom3"
  | "bedroom4"
  | "bedroom5";

/** A BHK bucket is one row-group, whatever the layout variants inside it.
 *
 *  This used to build one group per *variant index* across every compared
 *  property, which meant a single property offering 5 BHK Type 1/2/3 forced
 *  three full tables on everyone — and the two properties with one layout each
 *  rendered as walls of "Not available". Variant index also isn't comparable
 *  across properties: one builder's "Type 2" has nothing to do with another's.
 *  Variants now live inside their own property's column instead. */

function roomFieldsFor(k: ConfigKey): { key: RoomKey; label: string }[] {
  const bedroomCount: Record<ConfigKey, number> = {
    "4 BHK": 4,
    "5 BHK": 5,
    Penthouse: 5,
    Duplex: 4,
  };
  const n = bedroomCount[k] ?? 4;
  const bedroomKeys: RoomKey[] = ["bedroom1", "bedroom2", "bedroom3", "bedroom4", "bedroom5"];
  const bedrooms = bedroomKeys.slice(0, n).map((key, i) => ({
    key,
    label: `Bedroom ${i + 1}`,
  }));
  return [
    { key: "livingArea", label: "Drawing / Living / Dining" },
    { key: "kitchen", label: "Kitchen" },
    ...bedrooms,
  ];
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
  const { quizAnswers, requestAuth } = useOnboarding();
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
  // Fallback to the full catalogue when preferences yield zero matches so
  // the picker is never empty — the user can still compare.
  const noMatches = Boolean(quizAnswers) && filtered.length === 0;
  const pickable = filtered.length > 0 ? filtered : allProperties;
  const visibleConfigKeys = useMemo<ConfigKey[]>(() => {
    const allowed = allowedConfigKeys(quizAnswers);
    if (allowed.length === 0 || noMatches) return CONFIG_KEYS;
    // Start with the user's picked configs, then add any other configs the
    // selected properties offer whose price still fits the quiz budget.
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
        // Unknown price → include; known price → include only if at least
        // one variant of this config is inside range.
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
  // Per-BHK budget standing, based on how far the cheapest variant of that
  // BHK sits above the top of the selected range: "in" fits outright: "near"
  // is a modest step up (a 5 BHK over a 4 BHK budget, say); "far" is a much
  // bigger jump (a Penthouse over the same budget). Undefined (no budget
  // picked, or no price data) means no badge/collapse — full details show
  // compulsorily.
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
      <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-7">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              Comparison · {items.length} / {MAX_COMPARE}
            </p>
            <h2 className="mt-1.5 font-display text-[24px] sm:text-[28px] leading-tight text-foreground">
              Compare residences
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ready && <SaveCompareButton properties={items} className="px-3.5 py-1.5" />}
            {ready && <ShareCompareButton properties={items} />}
            {ready && (
              <Link
                to="/compare"
                search={{ ids: items.map((p) => p.id).join(",") }}
                onClick={() => window.setTimeout(() => requestAuth(), 1200)}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-[11px] tracking-wide text-background transition hover:opacity-85"
              >
                Open full report <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
            {items.length > 0 && (
              <button
                onClick={clear}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[11px] tracking-wide text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
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
          <div className="mb-4 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
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
              <ComparisonGrid
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
              className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center"
            >
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <p className="mt-2 text-[13px] text-muted-foreground">
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
}: {
  slot: Property | null;
  index: number;
  onRemove: (id: string) => void;
  onPick: (id: string) => void;
  currentSelected: string[];
  pickable: Property[];
}) {
  const [open, setOpen] = useState(false);

  if (slot) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden rounded-xl border border-border bg-card"
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
            onClick={() => onRemove(slot.id)}
            aria-label="Remove"
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white hover:bg-black/80 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="absolute bottom-2.5 left-3 right-3 text-white">
            <p className="text-[9px] uppercase tracking-[0.24em] opacity-80">
              {String.fromCharCode(65 + index)}
            </p>
            <h3 className="descender-safe mt-0.5 font-display text-[15px] leading-tight line-clamp-1">
              {slot.name}
            </h3>
            <p className="text-[11px] opacity-80 line-clamp-1">{slot.developer}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const available = pickable.filter((p) => !currentSelected.includes(p.id));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-full min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent px-6 py-8 text-center transition-colors hover:border-foreground/40 hover:bg-muted/30"
      >
        <div className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground group-hover:text-foreground group-hover:border-foreground/40 transition-colors">
          <Plus className="h-4 w-4" />
        </div>
        <p className="text-[12px] text-foreground/80">
          Add property {String.fromCharCode(65 + index)}
        </p>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden border-border bg-popover p-0 sm:rounded-2xl">
          <PropertyPicker
            available={available}
            indexLabel={String.fromCharCode(65 + index)}
            onPick={(id) => {
              onPick(id);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function PropertyPicker({
  available,
  indexLabel,
  onPick,
}: {
  available: Property[];
  indexLabel: string;
  onPick: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(1);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((p) =>
      [p.name, p.location, p.developer, p.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [available, query]);

  const total = filtered.length;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? el.scrollTop / max : 0;
    setProgress(p);
    // Map scroll 0→1 onto residence 1→total.
    setPosition(Math.min(total, Math.max(1, Math.round(p * (total - 1)) + 1)));
  };

  if (available.length === 0) {
    return (
      <>
        <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
          <DialogTitle className="font-display text-[22px] text-foreground">
            All properties added
          </DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">
            Remove one from your comparison to swap it out.
          </DialogDescription>
        </DialogHeader>
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">Nothing left to add.</p>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-3 pt-5">
        <div className="flex items-end justify-between gap-4 pr-10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Select property {indexLabel}
            </p>
            <DialogTitle className="mt-1 font-display text-[20px] text-foreground">
              Choose from your matched residences
            </DialogTitle>
          </div>
          <ScrollCounter position={position} total={total} progress={progress} />
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, developer or location…"
            className="w-full rounded-full border border-border bg-background py-2.5 pr-3 pl-9 text-sm text-foreground outline-none focus:border-champagne"
          />
        </div>

        <DialogDescription className="sr-only">
          Search or scroll to browse residences and add one to your comparison.
        </DialogDescription>
      </DialogHeader>

      {filtered.length === 0 ? (
        <p className="flex-1 px-6 py-16 text-center text-sm text-muted-foreground">
          No residences match “{query}”.
        </p>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 snap-y snap-mandatory scroll-smooth overflow-y-auto px-5 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex flex-col gap-5">
            {filtered.map((p) => (
              <div key={p.id} className="snap-start">
                <PickerCard property={p} onPick={onPick} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Round scroll indicator + "X of Y" position, top-right of the picker header.
function ScrollCounter({
  position,
  total,
  progress,
}: {
  position: number;
  total: number;
  progress: number;
}) {
  const r = 15;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex shrink-0 items-center gap-3">
      <p className="text-[12px] tabular-nums whitespace-nowrap text-muted-foreground">
        <span className="font-semibold text-foreground">{position}</span> of {total}
      </p>
      <div className="relative grid h-11 w-11 place-items-center">
        <svg className="h-11 w-11 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="2.5" className="stroke-border" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="stroke-champagne transition-[stroke-dashoffset] duration-150"
            style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - progress) }}
          />
        </svg>
        <span className="absolute text-[10px] font-semibold text-champagne">{position}</span>
      </div>
    </div>
  );
}

function propertyImages(p: Property): string[] {
  const g = (p.gallery ?? {}) as unknown as Record<string, string>;
  const list = [p.image, g.livingRoom, g.masterBedroom, g.pool, g.clubhouse].filter(
    (s): s is string => Boolean(s),
  );
  return Array.from(new Set(list));
}

function PickerCard({ property: p, onPick }: { property: Property; onPick: (id: string) => void }) {
  const images = useMemo(() => propertyImages(p), [p]);
  const [idx, setIdx] = useState(0);
  const total = images.length;
  const go = (dir: 1 | -1) => setIdx((i) => (i + dir + total) % total);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg sm:flex-row sm:min-h-[48vh]">
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-muted sm:aspect-auto sm:w-[55%]">
        <AnimatePresence initial={false} mode="sync">
          <motion.img
            key={images[idx]}
            src={images[idx]}
            alt={p.name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </AnimatePresence>
        <span
          className="absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[8px] font-semibold tracking-luxury backdrop-blur-md"
          style={{ background: "rgba(255,255,255,0.92)", color: "#0a0a0a" }}
        >
          {p.status}
        </span>
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/80"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/80"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-label={`Image ${i + 1}`}
                  className={`h-1 rounded-full transition-all ${
                    i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div>
          <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            <span className="inline-block h-px w-5 bg-champagne" /> {p.developer}
          </p>
          <h3 className="mt-2 font-display text-[22px] leading-[1.05] tracking-[-0.01em] text-foreground sm:text-[26px]">
            {p.name}
          </h3>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            {p.configuration}
          </p>
        </div>

        <div className="space-y-2.5">
          <DetailRow
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Location"
            value={p.location}
          />
          <DetailRow icon={<Ruler className="h-3.5 w-3.5" />} label="Size" value={p.size} />
          <DetailRow
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            label="Possession"
            value={livePossessionLabel(p.possession, p.possessionAsOf)}
          />
        </div>

        <button
          type="button"
          onClick={() => onPick(p.id)}
          className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-5 py-3.5 text-[11px] font-semibold tracking-[0.26em] text-foreground transition hover:border-champagne hover:bg-champagne hover:text-lux-black"
        >
          <Plus className="h-3.5 w-3.5" /> ADD TO COMPARE
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[8px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-[12px] font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */
const parseMaxNum = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const nums = String(s)
    .replace(/,/g, "")
    .match(/\d+(\.\d+)?/g);
  if (!nums) return null;
  return Math.max(...nums.map(parseFloat));
};
function bestIndex(values: (number | null)[]): number | null {
  const valid = values.map((v, i) => ({ v, i })).filter((x) => x.v !== null) as {
    v: number;
    i: number;
  }[];
  if (valid.length < 2) return null;
  const max = Math.max(...valid.map((x) => x.v));
  const winners = valid.filter((x) => x.v === max);
  if (winners.length === valid.length) return null;
  return winners[0].i;
}

// A price up to 20% over budget reads as a small, natural step up (like a
// 5 BHK sitting just above a 4 BHK budget); beyond that it's a different
// price tier entirely (like a Penthouse), not a near-miss.
const NEAR_BUDGET_THRESHOLD = 0.2;
function budgetStanding(cheapestPrice: number, budgetHi: number): "in" | "near" | "far" {
  if (cheapestPrice <= budgetHi) return "in";
  const overBy = (cheapestPrice - budgetHi) / budgetHi;
  return overBy <= NEAR_BUDGET_THRESHOLD ? "near" : "far";
}

/* ---------------- grid ---------------- */
function ComparisonGrid({
  items,
  visibleConfigKeys,
  slotBudgetStatus,
  budgetLabel,
}: {
  items: Property[];
  visibleConfigKeys: ConfigKey[];
  slotBudgetStatus: Record<string, "in" | "near" | "far">;
  budgetLabel: string | null;
}) {
  const cols = items.length;
  const gridTpl = cols === 2 ? "md:grid-cols-[200px_1fr_1fr]" : "md:grid-cols-[200px_1fr_1fr_1fr]";
  const areaUnit = useAreaUnitStore((s) => s.unit);

  // Shared with the sticky tray so its chips can size to these columns.
  const {
    active: activeVariant,
    expanded: expandedTypes,
    setActive,
    toggleExpanded,
  } = useVariantViewStore();
  const activeIdxFor = (key: ConfigKey, p: Property) => activeVariant[variantKey(key, p.id)] ?? 0;
  const isExpanded = (key: ConfigKey, p: Property) => expandedTypes[variantKey(key, p.id)] ?? false;
  const selectVariant = (key: ConfigKey, p: Property, idx: number) =>
    setActive(variantKey(key, p.id), idx);
  const toggleExpand = (key: ConfigKey, p: Property) => toggleExpanded(variantKey(key, p.id));

  // The "largest area" marker compares each property's *currently shown*
  // variant — comparing a property's biggest layout against another's smallest
  // would make the badge meaningless.
  const winnerFor = (key: ConfigKey) =>
    bestIndex(
      items.map((p) => parseMaxNum(variantsOf(p, key)[activeIdxFor(key, p)]?.area ?? null)),
    );
  const carpetWinner = bestIndex(items.map((p) => parseMaxNum(p.carpetArea)));

  // A fanned-out column carries N layouts, so it takes N shares of the row
  // width rather than being crushed into one. Returns undefined when nothing in
  // this BHK is expanded, leaving the default even split untouched.
  const colTplFor = (key: ConfigKey): string | undefined => {
    const subCols = items.map((p) => (isExpanded(key, p) ? variantsOf(p, key).length : 1));
    if (subCols.every((n) => n === 1)) return undefined;
    return `200px ${subCols.map((n) => `minmax(0, ${n}fr)`).join(" ")}`;
  };

  return (
    <div className="overflow-hidden rounded-xl border-2 border-border-strong bg-background/40">
      {/* Header row */}
      <div className={`hidden md:grid ${gridTpl} border-b-2 border-border-strong bg-muted/30`}>
        <div className="border-r border-border-strong px-4 py-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Attribute
        </div>
        {items.map((p, i) => (
          <div key={p.id} className={`px-4 py-3 ${i > 0 ? "border-l border-border-strong" : ""}`}>
            <div className="flex items-center justify-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-background text-[10px] font-medium">
                {String.fromCharCode(65 + i)}
              </span>
              <div className="min-w-0 text-center">
                <p className="descender-safe font-display text-[14px] leading-tight text-foreground line-clamp-1">
                  {p.name}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                  {p.developer}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile pills */}
      <div className="md:hidden flex flex-wrap gap-1.5 px-3 py-2.5 border-b border-border bg-muted/30">
        {items.map((p, i) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px]"
          >
            <span className="grid h-4 w-4 place-items-center rounded-full bg-foreground text-background text-[9px]">
              {String.fromCharCode(65 + i)}
            </span>
            <span className="truncate max-w-[100px]">{p.name}</span>
          </span>
        ))}
      </div>

      <SectionLabel title="Identity" />
      <Row
        label="Developer"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.developer} />}
      />
      <Row
        label="RERA ID"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <RegistrationLink id={p.reraId} url={p.reraUrl} />}
      />

      <SectionLabel title="Project Structure" />
      <Row
        label="Plot Size"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.plotSize ?? null} />}
      />
      <Row
        label="Total Towers"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.totalTowers?.toString() ?? null} />}
      />
      <Row
        label="Total Floors"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.totalFloors?.toString() ?? null} />}
      />
      <Row
        label="Units per Floor"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.unitsPerFloor?.toString() ?? null} />}
      />
      <Row
        label="Total Units"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.totalUnits?.toString() ?? null} />}
      />
      <Row
        label="Available BHK Types"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.availableBhkTypes ?? null} />}
      />

      <SectionLabel title="Configurations" />
      {visibleConfigKeys.map((key) => {
        const winnerIdx = winnerFor(key);
        return (
          <Row
            key={key}
            label={key}
            items={items}
            gridTpl={gridTpl}
            colTpl={colTplFor(key)}
            render={(p, i) => {
              const variants = variantsOf(p, key);
              if (variants.length === 0) return <NotAvail />;
              return (
                <div className="space-y-1.5">
                  <VariantSwitcher
                    property={p}
                    variants={variants}
                    activeIdx={activeIdxFor(key, p)}
                    expanded={isExpanded(key, p)}
                    onSelect={(idx) => selectVariant(key, p, idx)}
                    onToggleExpand={() => toggleExpand(key, p)}
                  />
                  <VariantValueCell
                    variants={variants}
                    activeIdx={activeIdxFor(key, p)}
                    expanded={isExpanded(key, p)}
                    onSelect={(idx) => selectVariant(key, p, idx)}
                    render={(v, vi) => {
                      const sqft = parseBareSqFt(v.area);
                      return (
                        <Numeric
                          primary={sqft !== null ? formatAreaNumber(sqft, areaUnit) : DASH}
                          unit={sqft !== null ? unitLabel(areaUnit) : undefined}
                          isBest={winnerIdx === i && vi === activeIdxFor(key, p)}
                        />
                      );
                    }}
                  />
                </div>
              );
            }}
          />
        );
      })}

      <SectionLabel title="Room Dimensions" />
      {visibleConfigKeys.map((key) => (
        <RoomDimensionsGroup
          key={`rooms-${key}`}
          configKey={key}
          status={slotBudgetStatus[key]}
          budgetLabel={budgetLabel}
          items={items}
          gridTpl={gridTpl}
          colTpl={colTplFor(key)}
          activeIdxFor={activeIdxFor}
          isExpanded={isExpanded}
          selectVariant={selectVariant}
          toggleExpand={toggleExpand}
        />
      ))}

      <SectionLabel title="Construction & Amenities" />
      <Row
        label="Parking Levels"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.parkingLevels?.toString() ?? null} />}
      />
      <Row
        label="Podium Structure"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.podiumStructure ?? null} />}
      />
      <Row
        label="Lifts per Tower"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.liftsPerTower?.toString() ?? null} />}
      />
      <Row
        label="Open Space"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.openSpace ?? null} />}
      />
      <Row
        label="Geyser / Heat Pump Provided"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.geyserHeatPumpProvided ?? null} />}
      />
      <Row
        label="VRV / AC Provided"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.vrvAcProvided ?? null} />}
      />
      <Row
        label="Window glasses"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.windowGlazing ?? null} />}
      />
      <Row
        label="Bath & Sanitary Fittings"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.bathSanitaryFittings ?? null} />}
      />
      <Row
        label="Flooring"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.flooringType ?? null} />}
      />
      <Row
        label="Density (Units per acre)"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.unitsPerAcre ?? null} />}
      />
      <Row
        label="Construction Quality"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.constructionQuality ?? null} />}
      />
      <Row
        label="Internal Ceiling Height"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.internalCeilingHeight ?? null} />}
      />
      <Row
        label="Clubhouse Size"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.clubhouseSize ?? null} />}
      />
      <Row
        label="Amenities"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <AmenitiesCell amenities={p.amenities} />}
      />

      <SectionLabel title="Location & Timeline" />
      <Row
        label="Address"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.location} />}
      />
      <DistanceCalculator items={items} gridTpl={gridTpl} />
      <Row
        label="Proposed Start Date (RERA)"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.proposedStartDateRera ?? null} />}
      />
      <Row
        label="Possession"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={livePossessionLabel(p.possession, p.possessionAsOf)} />}
      />
      <Row
        label="Status"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.status} />}
      />

      <SectionLabel title="Developer" />
      <Row
        label="Background"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.developerBackground ?? null} />}
      />
      <Row
        label="Experience (Years)"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.developerExperienceYears?.toString() ?? null} />}
      />
      <Row
        label="Total Delivered Projects"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.totalDeliveredProjects?.toString() ?? null} />}
      />
      <Row
        label="Ongoing Projects"
        items={items}
        gridTpl={gridTpl}
        render={(p) => <Plain value={p.ongoingProjects?.toString() ?? null} />}
      />
      <Row
        label="Notable Delivered Projects"
        items={items}
        gridTpl={gridTpl}
        render={(p) =>
          p.notableDeliveredProjects?.length ? (
            <ul className="space-y-1.5">
              {p.notableDeliveredProjects.map((project) => (
                <li key={project} className="text-[13px] text-foreground/85 leading-snug">
                  {project}
                </li>
              ))}
            </ul>
          ) : (
            <Plain value={null} />
          )
        }
      />

      <SectionLabel title="Distinctions" />
      <Row
        label="Highlights"
        items={items}
        gridTpl={gridTpl}
        render={(p) =>
          p.advantages?.length ? (
            <ul className="space-y-1.5">
              {p.advantages.slice(0, 5).map((a, idx) => (
                <li key={a} className="flex gap-2 text-[13px] text-foreground/85 leading-snug">
                  <span className="text-muted-foreground text-[11px] pt-0.5 min-w-[16px]">
                    {idx + 1}.
                  </span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Plain value={null} />
          )
        }
      />
      <Row
        label="Verdict"
        items={items}
        gridTpl={gridTpl}
        render={(p) =>
          p.expertNote ? (
            <p className="text-[13px] leading-relaxed text-foreground/85">"{p.expertNote}"</p>
          ) : (
            <Plain value={null} />
          )
        }
      />

      <div className="border-b border-border bg-muted/10 px-4 py-2 text-[10px] text-muted-foreground">
        All areas and dimensions are approximate, as shared by the developer.
      </div>

      <SectionLabel title="Gallery" />
      <div className={`grid ${cols === 2 ? "grid-cols-2" : "grid-cols-3"} ${gridTpl}`}>
        <div className="hidden md:flex items-center px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground border-r border-border">
          Photo
        </div>
        {items.map((p, i) => (
          <div
            key={p.id}
            id={`gallery-${p.id}`}
            className={`p-2.5 scroll-mt-32 ${i > 0 ? "md:border-l md:border-border" : ""}`}
          >
            <div className="overflow-hidden rounded-lg aspect-[16/10] ring-1 ring-border transition-shadow [&.flash]:ring-2 [&.flash]:ring-foreground [&.flash]:shadow-lg">
              <PhotoSlideshow property={p} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One config's room-dimension block. In-budget configs show their living
 *  area / kitchen / bedroom fields compulsorily; configs priced above the
 *  selected budget are labelled and collapsed behind a "View details" toggle
 *  instead — the developer still offers it, but it's not the primary pick. */
function RoomDimensionsGroup({
  configKey,
  status,
  budgetLabel,
  items,
  gridTpl,
  colTpl,
  activeIdxFor,
  isExpanded,
  selectVariant,
  toggleExpand,
}: {
  configKey: ConfigKey;
  status: "in" | "near" | "far" | undefined;
  budgetLabel: string | null;
  items: Property[];
  gridTpl: string;
  colTpl?: string;
  activeIdxFor: (key: ConfigKey, p: Property) => number;
  isExpanded: (key: ConfigKey, p: Property) => boolean;
  selectVariant: (key: ConfigKey, p: Property, idx: number) => void;
  toggleExpand: (key: ConfigKey, p: Property) => void;
}) {
  const collapsible = status === "near" || status === "far";
  const [expanded, setExpanded] = useState(false);
  const showFields = !collapsible || expanded;

  const headerTone =
    status === "in"
      ? "border-y border-emerald-600/25 bg-emerald-600/10"
      : status === "near"
        ? "border-y border-amber-500/25 bg-amber-500/10"
        : status === "far"
          ? "border-y border-red-600/25 bg-red-600/10"
          : "border-y border-border-strong bg-muted/50";

  return (
    <div>
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 ${headerTone}`}>
        <div className="flex items-center gap-2">
          <span className="font-display text-[17px] font-bold tracking-tight text-foreground">
            {configKey}
          </span>
          {status === "in" && budgetLabel && (
            <span className="rounded-full bg-emerald-600/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
              In selected range
            </span>
          )}
          {status === "near" && budgetLabel && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
              Slightly above selected range
            </span>
          )}
          {status === "far" && budgetLabel && (
            <span className="rounded-full bg-red-600/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-red-700 dark:text-red-400">
              Well above selected range
            </span>
          )}
        </div>
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? "Hide details" : "View details"}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>
      {/* Type switcher sits once per group, above the room rows, so the strips
          it controls line up with the bands running down every row below. */}
      {showFields && items.some((p) => variantsOf(p, configKey).length > 1) && (
        <div
          className={`compare-row grid ${gridTpl} border-b border-border-strong bg-muted/25`}
          style={colTpl ? ({ "--row-cols": colTpl } as React.CSSProperties) : undefined}
        >
          <div className="hidden px-4 py-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground md:block">
            Layout
          </div>
          {items.map((p, i) => (
            <div
              key={p.id}
              className={`px-2.5 py-2 md:px-4 ${i > 0 ? "border-l border-border-strong" : ""}`}
            >
              <VariantSwitcher
                property={p}
                variants={variantsOf(p, configKey)}
                activeIdx={activeIdxFor(configKey, p)}
                expanded={isExpanded(configKey, p)}
                onSelect={(idx) => selectVariant(configKey, p, idx)}
                onToggleExpand={() => toggleExpand(configKey, p)}
              />
            </div>
          ))}
        </div>
      )}

      {showFields &&
        roomFieldsFor(configKey).map(({ key, label }) => (
          <Row
            key={`${configKey}-${key}`}
            label={label}
            items={items}
            gridTpl={gridTpl}
            colTpl={colTpl}
            render={(p) => {
              const variants = variantsOf(p, configKey);
              if (variants.length === 0) return <NotAvail />;
              return (
                <VariantValueCell
                  variants={variants}
                  activeIdx={activeIdxFor(configKey, p)}
                  expanded={isExpanded(configKey, p)}
                  onSelect={(idx) => selectVariant(configKey, p, idx)}
                  render={(v) =>
                    v[key] ? (
                      <div className="text-[14px] leading-snug text-foreground md:text-center">
                        <RoomFieldValue value={v[key]} />
                      </div>
                    ) : (
                      <Plain value={null} />
                    )
                  }
                />
              );
            }}
          />
        ))}
    </div>
  );
}

/* ---------------- primitives ---------------- */
function SectionLabel({ title }: { title: string }) {
  return (
    <div className="border-y-2 border-border-strong bg-muted/70 px-4 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-foreground/70">
        {title}
      </span>
    </div>
  );
}

function Row({
  label,
  items,
  gridTpl,
  render,
  colTpl,
}: {
  label: string;
  items: Property[];
  gridTpl: string;
  render: (p: Property, i: number) => React.ReactNode;
  /** Overrides the even column split from md up — see .compare-row in styles.css. */
  colTpl?: string;
}) {
  const info = TERM_INFO[label];
  const [open, setOpen] = useState(false);
  const mobileCols = items.length === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div
      className={`compare-row grid ${mobileCols} ${gridTpl} border-b border-border last:border-b-0`}
      style={colTpl ? ({ "--row-cols": colTpl } as React.CSSProperties) : undefined}
    >
      <div className="col-span-full md:col-span-1 px-4 py-3 md:border-r md:border-border-strong bg-muted/10 flex items-center gap-1.5">
        <span className="font-display text-[14px] font-medium tracking-tight text-foreground">
          {label}
        </span>
        {info && (
          <>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-opacity hover:opacity-80"
              aria-label={`More about ${label}`}
              title={`More about ${label}`}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl">{info.title}</DialogTitle>
                  <DialogDescription className="pt-2 text-[14px] leading-relaxed text-foreground/80">
                    {info.body}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
      {items.map((p, i) => (
        <div
          key={p.id}
          className={`px-2.5 py-2.5 md:px-4 ${i > 0 ? "border-l border-border-strong" : ""}`}
        >
          <div className="md:hidden mb-1 truncate text-[9px] uppercase tracking-wide text-muted-foreground">
            {String.fromCharCode(65 + i)} · {p.name}
          </div>
          {render(p, i)}
        </div>
      ))}
    </div>
  );
}

function Plain({ value, italic }: { value: string | null | undefined; italic?: boolean }) {
  return (
    <p
      className={`text-[14px] leading-snug text-foreground md:text-center ${
        italic ? "text-foreground/75" : ""
      }`}
    >
      {value ?? DASH}
    </p>
  );
}

/** Lets a visitor type their own address and get an approximate straight-line
 *  distance to each compared property — computed server-side from geocoded
 *  coordinates that never reach the client, so no map or exact location is
 *  ever shown, only the resulting "~N km" figure. */
function DistanceCalculator({ items, gridTpl }: { items: Property[]; gridTpl: string }) {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [distances, setDistances] = useState<Record<string, number | null>>({});

  const handleCalculate = async () => {
    if (!address.trim() || status === "loading") return;
    setStatus("loading");
    try {
      const result = await calculatePropertyDistances({
        data: {
          address,
          properties: items.map((p) => ({
            id: p.id,
            address: [p.location, p.city, p.state].filter(Boolean).join(", "),
          })),
        },
      });
      if (result.ok) {
        setDistances(result.distancesKm);
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <div className="border-b border-border bg-muted/10 px-4 py-3">
        <p className="mb-2 text-[12px] text-muted-foreground">
          Add your home or office address and we'll estimate how far each residence is.
          Approximate distance only, no map or exact location shown.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCalculate()}
            placeholder="e.g. Prahlad Nagar, Ahmedabad"
            className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-champagne"
          />
          <button
            type="button"
            onClick={handleCalculate}
            disabled={!address.trim() || status === "loading"}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[11px] font-medium tracking-wide text-background transition hover:opacity-85 disabled:opacity-50"
          >
            {status === "loading" ? "Calculating…" : "Calculate distance"}
          </button>
        </div>
        {status === "error" && (
          <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
            Couldn't locate that address. Try adding more detail (area, city).
          </p>
        )}
      </div>
      <Row
        label="Distance from your location"
        items={items}
        gridTpl={gridTpl}
        render={(p) => {
          if (status === "idle" || status === "error") return <Plain value={null} />;
          if (status === "loading") return <Plain value="Calculating…" italic />;
          const km = distances[p.id];
          return <Plain value={km !== null && km !== undefined ? `~${km} km away` : null} />;
        }}
      />
    </>
  );
}

function RegistrationLink({ id, url }: { id: string | null | undefined; url: string | null | undefined }) {
  if (!id) return <Plain value={null} />;
  if (!url) return <Plain value={id} />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[14px] leading-snug text-foreground underline decoration-border-strong underline-offset-2 transition-colors hover:text-champagne md:justify-center"
    >
      {id}
      <ArrowUpRight className="h-3 w-3 shrink-0" />
    </a>
  );
}

/** Full amenity list, inline — the row simply grows to fit rather than
 *  truncating, so nothing is hidden behind a click. */
function AmenitiesCell({ amenities }: { amenities: string[] }) {
  if (!amenities.length) return <Plain value={null} />;
  return (
    <p className="text-[13px] leading-relaxed text-foreground/85 md:text-center">
      {amenities.join(" · ")}
    </p>
  );
}

function NotAvail() {
  return (
    // inline-flex hugs its content, so centring has to come from the flow —
    // md:flex lets justify-center actually take effect in the column.
    <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground md:flex md:justify-center">
      <Minus className="h-3 w-3" /> Not available
    </span>
  );
}

function Numeric({
  primary,
  unit,
  secondary,
  isBest,
}: {
  primary: string;
  unit?: string;
  secondary?: string;
  isBest?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 md:justify-center">
      <p
        className={`font-display leading-tight text-[16px] ${
          isBest ? "font-semibold text-foreground" : "text-foreground/90"
        }`}
      >
        {primary}
        {unit && (
          <span className="ml-1 text-[10px] text-muted-foreground tracking-wide">{unit}</span>
        )}
      </p>
      {secondary && <span className="text-[11px] text-muted-foreground">· {secondary}</span>}
    </div>
  );
}
