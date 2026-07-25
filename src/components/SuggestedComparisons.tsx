import { useMemo, useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, GitCompareArrows } from "lucide-react";
import { useProperties } from "@/context/PropertiesContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { MIN_COMPARE, useCompareStore } from "@/stores/compare-store";
import { useSavedComparesStore } from "@/stores/saved-compares-store";
import { SaveCompareButton } from "@/components/compare/SaveCompareButton";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { matchesPreferences, parseBudget, allowedConfigKeys } from "@/lib/preference-filter";
import type { Property, ConfigKey } from "@/types/property";
import type { QuizAnswers } from "@/context/OnboardingContext";

const parsePrice = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const m = String(s).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
};

function minPrice(p: Property, wanted: ConfigKey[]): number | null {
  const keys = (
    wanted.length > 0
      ? wanted.filter((k) => p.configurations[k]?.length)
      : (Object.keys(p.configurations) as ConfigKey[])
  ) as ConfigKey[];
  let min: number | null = null;
  for (const k of keys) {
    for (const cfg of p.configurations[k] ?? []) {
      const price = parsePrice(cfg.price);
      if (price === null) continue;
      if (min === null || price < min) min = price;
    }
  }
  if (min !== null) return min;
  // fallback across all configs
  const all = Object.values(p.configurations)
    .flat()
    .map((c) => parsePrice(c?.price))
    .filter((n): n is number => n !== null);
  return all.length ? Math.min(...all) : null;
}

function sharedConfig(a: Property, b: Property, wanted: ConfigKey[]): ConfigKey | null {
  const pool = wanted.length > 0 ? wanted : (Object.keys(a.configurations) as ConfigKey[]);
  for (const k of pool) {
    if (a.configurations[k]?.length && b.configurations[k]?.length) return k;
  }
  return null;
}

type Pair = { a: Property; b: Property; score: number };

function buildPairs(properties: Property[], answers: QuizAnswers | null): Pair[] {
  const wanted = allowedConfigKeys(answers);
  const pool = answers
    ? properties.filter((p) => matchesPreferences(p, answers))
    : properties.slice();

  const list = pool.length >= 2 ? pool : properties.slice();
  const pairs: Pair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const pa = minPrice(a, wanted);
      const pb = minPrice(b, wanted);
      if (pa === null || pb === null) continue;
      const shared = sharedConfig(a, b, wanted);
      if (wanted.length > 0 && !shared) continue;

      const priceDelta = Math.abs(pa - pb) / Math.max(pa, pb);
      let score = 0;
      // similar price band (within 20%)
      if (priceDelta <= 0.2) score += 5;
      else if (priceDelta <= 0.35) score += 2;
      // same location
      if (a.location && b.location && a.location === b.location) score += 4;
      // shared configuration
      if (shared) score += 3;
      // similar size
      if (a.sizeNumeric && b.sizeNumeric) {
        const sizeDelta =
          Math.abs(a.sizeNumeric - b.sizeNumeric) / Math.max(a.sizeNumeric, b.sizeNumeric);
        if (sizeDelta <= 0.2) score += 3;
      }
      // differ on builder → makes it a useful comparison
      if (a.developer !== b.developer) score += 1;

      if (score < 3) continue;
      const key = `${a.id}-${b.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ a, b, score });
    }
  }

  pairs.sort((x, y) => y.score - x.score);

  // Diversify: cap each property to appear in max 2 pairs
  const count = new Map<string, number>();
  const picked: Pair[] = [];
  for (const p of pairs) {
    const ca = count.get(p.a.id) ?? 0;
    const cb = count.get(p.b.id) ?? 0;
    if (ca >= 2 || cb >= 2) continue;
    picked.push(p);
    count.set(p.a.id, ca + 1);
    count.set(p.b.id, cb + 1);
    if (picked.length >= 6) break;
  }

  // Fallback: if too few, just take top pairs
  if (picked.length < 4) {
    for (const p of pairs) {
      if (picked.includes(p)) continue;
      picked.push(p);
      if (picked.length >= 6) break;
    }
  }
  return picked.slice(0, 6);
}

const HEADINGS = [
  "People Also Compare",
  "Most Compared",
  "Popular Comparisons",
  "Similar Properties to Compare",
];

export function SuggestedComparisons() {
  const { quizAnswers } = useOnboarding();
  const allProperties = useProperties();
  const hydrated = useHydrated();
  const { selected: rawSelected } = useCompareStore();
  // A pair suggesting a property already in the comparison suite above is
  // redundant — leave it out until that property is removed from the suite.
  const selected = hydrated ? rawSelected : [];
  const properties = useMemo(
    () => (selected.length ? allProperties.filter((p) => !selected.includes(p.id)) : allProperties),
    [allProperties, selected],
  );
  const pairs = useMemo(
    () => buildPairs(properties, quizAnswers ?? null),
    [properties, quizAnswers],
  );
  // Pick a stable heading per mount on the client only to avoid SSR/CSR
  // hydration mismatch from Math.random().
  const [heading, setHeading] = useState<string>(HEADINGS[0]);
  useEffect(() => {
    setHeading(HEADINGS[Math.floor(Math.random() * HEADINGS.length)]);
  }, []);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pairs.length]);

  const nudge = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 480), behavior: "smooth" });
  };

  if (pairs.length === 0) return null;

  return (
    <section className="relative scroll-mt-28 border-t border-[var(--rule)] py-14 sm:py-20">
      <div className="container-lux">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              className="font-display leading-tight text-ivory"
              style={{ fontSize: "var(--step-2)", letterSpacing: "var(--tracking-display)" }}
            >
              {heading.split(" ").slice(0, -1).join(" ")}{" "}
              <span className="gold-text">{heading.split(" ").slice(-1)[0]}</span>
            </h2>
            <p className="mt-1.5 text-muted-foreground" style={{ fontSize: "var(--step--1)" }}>
              Head-to-head matchups picked from your budget and preferences.
            </p>
          </div>
          {/* Pagination arrows, not a themed accent — every other prev/next
              control in the app is neutral (Lightbox, PickerCard carousel). */}
          <div className="hidden gap-2 sm:flex">
            <button
              onClick={() => nudge(-1)}
              disabled={!canLeft}
              aria-label="Previous"
              className="grid h-10 w-10 place-items-center rounded-full border border-[var(--rule)] text-foreground transition-colors disabled:opacity-30 hover:border-foreground/40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => nudge(1)}
              disabled={!canRight}
              aria-label="Next"
              className="grid h-10 w-10 place-items-center rounded-full border border-[var(--rule)] text-foreground transition-colors disabled:opacity-30 hover:border-foreground/40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-[max(1.25rem,calc((100vw-80rem)/2))] pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pairs.map((pair, i) => (
          <ComparisonCard key={`${pair.a.id}-${pair.b.id}`} pair={pair} index={i} />
        ))}
      </div>
    </section>
  );
}

function ComparisonCard({ pair, index }: { pair: Pair; index: number }) {
  const { a, b } = pair;
  const { clear, toggle, selected } = useCompareStore();
  const { isSaved } = useSavedComparesStore();
  const properties = useProperties();
  const hydrated = useHydrated();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const outgoing = selected
    .map((id) => properties.find((p) => p.id === id))
    .filter((p): p is Property => Boolean(p));
  const outgoingNames = outgoing.map((p) => p.name);
  const outgoingIsSaved = hydrated && isSaved(selected);

  // Confirm only when the swap actually costs the visitor something. A suite
  // that already holds this pair loses nothing, and neither does one that's
  // already saved — it can be reopened from the saved list, so there is no
  // decision left to make.
  const wouldReplace =
    hydrated &&
    selected.length > 0 &&
    !outgoingIsSaved &&
    !(selected.length === 2 && selected.every((id) => id === a.id || id === b.id));

  const canSaveOutgoing = hydrated && outgoing.length >= MIN_COMPARE && !outgoingIsSaved;

  const applyCompare = () => {
    clear();
    toggle(a.id);
    toggle(b.id);
    // Scroll to the on-page comparison suite
    if (typeof window !== "undefined") {
      // slight delay so store subscribers re-render the board first
      requestAnimationFrame(() => {
        const el = document.getElementById("suite");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleCompare = () => {
    if (wouldReplace) {
      setConfirmOpen(true);
      return;
    }
    applyCompare();
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.3) }}
      className="group relative flex w-[calc(100vw-2.5rem)] shrink-0 snap-center flex-col overflow-hidden rounded-card sm:w-[380px] sm:snap-start"
      style={{
        background: "var(--card)",
        border: "1px solid var(--rule)",
        boxShadow:
          "0 1px 0 0 color-mix(in oklab, var(--foreground) 6%, transparent) inset, 0 22px 46px -28px color-mix(in oklab, var(--foreground) 32%, transparent), 0 6px 14px -8px color-mix(in oklab, var(--foreground) 18%, transparent)",
      }}
    >
      <div className="relative grid grid-cols-2">
        <div className="relative block aspect-[4/3] overflow-hidden">
          <img
            src={a.image}
            alt={a.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, color-mix(in oklab, #000 30%, transparent) 0%, transparent 45%)",
            }}
          />
        </div>
        <div className="relative block aspect-[4/3] overflow-hidden">
          <img
            src={b.image}
            alt={b.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, color-mix(in oklab, #000 30%, transparent) 0%, transparent 45%)",
            }}
          />
        </div>

        {/* Strong vertical partition between the two property images */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 bottom-0 -translate-x-1/2"
          style={{
            width: "2px",
            background:
              "linear-gradient(to bottom, transparent 0%, var(--champagne, #c8a45d) 15%, var(--champagne, #c8a45d) 85%, transparent 100%)",
            boxShadow: "0 0 12px color-mix(in oklab, var(--champagne, #c8a45d) 55%, transparent)",
            opacity: 0.9,
          }}
        />
      </div>

      <div className="relative grid grid-cols-2 gap-3 p-4 pt-7">
        <PropertyBrief property={a} />

        {/* Plain hairline — the gold "vs" marker already lives on the image
            divider above and the badge below; a second glowing gold line
            here was doubling up the one accent this card needs. */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 -translate-x-1/2"
          style={{ width: "1px", background: "var(--rule-strong)" }}
        />

        {/* VS badge centered over the property-name row */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10">
          <div
            className="grid h-11 w-11 place-items-center rounded-full font-display font-semibold tracking-wider"
            style={{
              fontSize: "var(--step--2)",
              background: "var(--foreground)",
              color: "var(--background)",
              border: "2px solid var(--card)",
              boxShadow: "0 8px 22px -6px color-mix(in oklab, var(--foreground) 45%, transparent)",
            }}
          >
            VS
          </div>
        </div>

        <PropertyBrief property={b} />
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={handleCompare}
          className="tracking-luxury flex w-full items-center justify-center gap-2 rounded-full gold-border py-2.5 text-champagne transition-colors hover:bg-champagne hover:text-lux-black"
          style={{ fontSize: "var(--step--2)" }}
        >
          <GitCompareArrows className="h-3.5 w-3.5" /> Compare Now
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your comparison suite?</AlertDialogTitle>
            <AlertDialogDescription>
              Your suite currently holds{" "}
              {outgoingNames.length > 0 ? outgoingNames.join(", ") : "other residences"}. Comparing{" "}
              {a.name} vs {b.name} will clear the suite and load this matchup instead.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Lead with the loss, not the option — the visitor needs to know the
              current suite is unsaved before they weigh replacing it. */}
          {canSaveOutgoing && (
            <div className="rounded-card border border-[var(--rule)] bg-muted/40 px-3.5 py-3">
              <p className="font-medium text-foreground" style={{ fontSize: "var(--step--1)" }}>
                This comparison isn't saved yet.
              </p>
              <p
                className="mt-1 leading-snug text-muted-foreground"
                style={{ fontSize: "var(--step--1)" }}
              >
                Replace it and it's gone. Save it first and you can reopen it any time from your
                saved list.
              </p>
              <SaveCompareButton
                properties={outgoing}
                saveLabel="Save current and go"
                className="mt-2.5"
                onSaved={() => {
                  setConfirmOpen(false);
                  // Let the flight land and the dialog close before the suite
                  // swaps out underneath it.
                  window.setTimeout(applyCompare, 260);
                }}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my suite</AlertDialogCancel>
            <AlertDialogAction onClick={applyCompare}>
              {canSaveOutgoing ? "Replace without saving" : "Replace and compare"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.article>
  );
}

function PropertyBrief({ property }: { property: Property }) {
  return (
    <div className="min-w-0">
      <p
        className="tracking-luxury truncate font-semibold text-muted-foreground"
        style={{ fontSize: "var(--step--2)" }}
      >
        {property.developer}
      </p>
      <h3
        className="descender-safe mt-1 truncate font-display font-medium text-foreground"
        style={{ fontSize: "var(--step--1)" }}
      >
        {property.name}
      </h3>
      {property.location ? (
        <p className="mt-1 truncate text-muted-foreground" style={{ fontSize: "var(--step--2)" }}>
          {property.location}
        </p>
      ) : null}
    </div>
  );
}
