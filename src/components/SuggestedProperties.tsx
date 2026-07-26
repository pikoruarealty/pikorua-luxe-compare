import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, MapPin, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useProperties } from "@/context/PropertiesContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { matchesPreferences, parseBudget, allowedConfigKeys } from "@/lib/preference-filter";
import type { Property, ConfigKey } from "@/types/property";
import type { QuizAnswers } from "@/context/OnboardingContext";
import { MAX_COMPARE, useCompareStore } from "@/stores/compare-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useImagePrewarm } from "@/hooks/use-image-prewarm";
import { PropertyHoverCard } from "@/components/property/PropertyHoverCard";

const parsePrice = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const m = String(s).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
};

/** Lowest price (in Cr) among the user's preferred configs, else any config. */
function minRelevantPrice(p: Property, answers: QuizAnswers): number | null {
  const wanted = allowedConfigKeys(answers);
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
  return min;
}

/** Same as matchesPreferences but budget-agnostic. */
function matchesNonBudget(p: Property, answers: QuizAnswers): boolean {
  const stripped: QuizAnswers = { ...answers, budgetRange: "", budgetSub: "" };
  return matchesPreferences(p, stripped);
}

function anyMinPrice(p: Property): number | null {
  const prices = Object.values(p.configurations)
    .flat()
    .map((c) => parsePrice(c?.price))
    .filter((n): n is number => n !== null);
  return prices.length ? Math.min(...prices) : null;
}

function buildBuckets(properties: Property[], answers: QuizAnswers) {
  const inPrefs = properties.filter((p) => matchesPreferences(p, answers));

  const band = parseBudget(answers.budgetSub || answers.budgetRange);
  let above: Property[] = [];
  let below: Property[] = [];

  if (band) {
    const [lo, hi] = band;
    const candidates = properties.filter(
      (p) => !inPrefs.includes(p) && matchesNonBudget(p, answers),
    );
    for (const p of candidates) {
      const price = minRelevantPrice(p, answers);
      if (price === null) continue;
      if (price > hi + 0.5) above.push(p);
      else if (price < lo - 0.5) below.push(p);
    }

    // Fallbacks: widen to ANY property above/below the user's budget so each
    // section always has something to show.
    if (above.length === 0) {
      above = properties.filter((p) => {
        if (inPrefs.includes(p)) return false;
        const m = anyMinPrice(p);
        return m !== null && m > hi + 0.5;
      });
    }
    if (below.length === 0) {
      below = properties.filter((p) => {
        if (inPrefs.includes(p)) return false;
        const m = anyMinPrice(p);
        return m !== null && m < lo - 0.5;
      });
    }
  } else {
    // No budget chosen — split the catalogue around the median price so both
    // marquees still appear with relevant comparisons.
    const priced = properties
      .filter((p) => !inPrefs.includes(p))
      .map((p) => ({ p, m: anyMinPrice(p) }))
      .filter((x): x is { p: Property; m: number } => x.m !== null)
      .sort((a, b) => a.m - b.m);
    if (priced.length) {
      const median = priced[Math.floor(priced.length / 2)].m;
      above = priced.filter((x) => x.m >= median).map((x) => x.p);
      below = priced.filter((x) => x.m < median).map((x) => x.p);
    }
  }

  above.sort((a, b) => (anyMinPrice(a) ?? 0) - (anyMinPrice(b) ?? 0));
  below.sort((a, b) => (anyMinPrice(b) ?? 0) - (anyMinPrice(a) ?? 0));

  // Fallback so the Suggested marquee never disappears.
  let suggested = inPrefs;
  if (suggested.length === 0) {
    suggested = properties.filter((p) => matchesNonBudget(p, answers));
  }

  return { suggested, above, below };
}

export function SuggestedProperties() {
  const { quizAnswers } = useOnboarding();
  const allProperties = useProperties();
  const hydrated = useHydrated();
  const { selected: rawSelected } = useCompareStore();
  // A property already sitting in the comparison suite above has nothing to
  // gain from also showing up as a "suggestion" right below it. Memoised so the
  // pre-hydration empty array keeps a stable ref (no needless recompute below).
  const selected = useMemo(() => (hydrated ? rawSelected : []), [hydrated, rawSelected]);
  const properties = useMemo(
    () => (selected.length ? allProperties.filter((p) => !selected.includes(p.id)) : allProperties),
    [allProperties, selected],
  );

  const buckets = useMemo(() => {
    if (!quizAnswers) {
      // No quiz yet — Suggested = full catalogue; split rest by median price.
      const priced = properties
        .map((p) => ({ p, m: anyMinPrice(p) }))
        .filter((x): x is { p: Property; m: number } => x.m !== null)
        .sort((a, b) => a.m - b.m);
      const median = priced.length ? priced[Math.floor(priced.length / 2)].m : 0;
      return {
        suggested: properties,
        above: priced.filter((x) => x.m >= median).map((x) => x.p),
        below: priced.filter((x) => x.m < median).map((x) => x.p),
      };
    }
    const b = buildBuckets(properties, quizAnswers);
    // Final safety nets: none of the three marquees may be empty.
    if (b.suggested.length === 0) b.suggested = properties;
    if (b.above.length === 0) {
      const pricedAll = properties
        .filter((p) => !b.suggested.includes(p))
        .map((p) => ({ p, m: anyMinPrice(p) }))
        .filter((x): x is { p: Property; m: number } => x.m !== null)
        .sort((a, b) => b.m - a.m);
      b.above = pricedAll.map((x) => x.p);
    }
    if (b.below.length === 0) {
      const pricedAll = properties
        .filter((p) => !b.suggested.includes(p))
        .map((p) => ({ p, m: anyMinPrice(p) }))
        .filter((x): x is { p: Property; m: number } => x.m !== null)
        .sort((a, b) => a.m - b.m);
      b.below = pricedAll.map((x) => x.p);
    }
    return b;
  }, [properties, quizAnswers]);

  return (
    <section
      id="suggested"
      className="relative scroll-mt-28 border-y border-champagne/10 py-12 sm:py-16"
    >
      <Marquee
        anchorId="suggested-in-budget"
        title={
          <>
            Suggested <span className="gold-text">properties</span>
          </>
        }
        subtitle="In your budget and matched to your preferences."
        list={buckets.suggested}
        chipLabel={null}
      />
    </section>
  );
}

function Marquee({
  anchorId,
  title,
  subtitle,
  list,
  chipLabel,
}: {
  anchorId: string;
  title: React.ReactNode;
  subtitle: string;
  list: Property[];
  chipLabel: string | null;
}) {
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
  }, [list.length]);

  const nudge = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 560), behavior: "smooth" });
  };

  if (list.length === 0) return null;

  return (
    <div id={anchorId} className="scroll-mt-28">
      <div className="container-lux">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-[28px] leading-tight text-ivory sm:text-[36px]">
              {title}
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-luxury text-muted-foreground">
              {list.length} {list.length === 1 ? "match" : "matches"}
            </span>
            <div className="hidden gap-2 sm:flex">
              <button
                type="button"
                onClick={() => nudge(-1)}
                disabled={!canLeft}
                aria-label="Previous"
                className="grid h-9 w-9 place-items-center rounded-full gold-border text-champagne transition-opacity disabled:opacity-30 hover:bg-champagne/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => nudge(1)}
                disabled={!canRight}
                aria-label="Next"
                className="grid h-9 w-9 place-items-center rounded-full gold-border text-champagne transition-opacity disabled:opacity-30 hover:bg-champagne/10"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="mt-7 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-[max(1.25rem,calc((100vw-80rem)/2))] pb-2 sm:gap-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {list.map((p) => (
          <SuggestionCard key={`${anchorId}-${p.id}`} property={p} chipLabel={chipLabel} />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({ property, chipLabel }: { property: Property; chipLabel: string | null }) {
  const hydrated = useHydrated();
  const { isSelected, toggle, selected } = useCompareStore();
  const selectedFlag = hydrated && isSelected(property.id);
  const atMax = hydrated && selected.length >= MAX_COMPARE && !selectedFlag;

  const handleToggle = () => {
    const result = toggle(property.id);
    if (!result.ok && result.reason) toast.error(result.reason);
    else if (!selectedFlag) toast.success(`${property.name} added to compare`);
  };

  const slides = useMemo(() => {
    const g = property.gallery ?? ({} as Record<string, string>);
    const list = [property.image, g.livingRoom, g.masterBedroom, g.pool, g.clubhouse].filter(
      (src): src is string => Boolean(src),
    );
    return Array.from(new Set(list));
  }, [property]);

  const [slideIdx, setSlideIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  // Prewarm cover + gallery so the hover card opens with images already decoded.
  useImagePrewarm(open ? slides : [property.image]);

  // While the card is open, lock page scroll so the view stays put.
  // The card is dismissed only via the X button or Escape.
  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const prevBodyPos = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevBodyTouchAction = body.style.touchAction;
    const prevHtmlOverflow = documentElement.style.overflow;
    const prevHtmlOverscroll = documentElement.style.overscrollBehavior;
    const prevHtmlScrollBehavior = documentElement.style.scrollBehavior;
    body.classList.add("suggested-popup-open");
    documentElement.style.scrollBehavior = "auto";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      body.classList.remove("suggested-popup-open");
      body.style.position = prevBodyPos;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.touchAction = prevBodyTouchAction;
      documentElement.style.overflow = prevHtmlOverflow;
      documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      window.scrollTo(0, scrollY);
      documentElement.style.scrollBehavior = prevHtmlScrollBehavior;
    };
  }, [open]);

  return (
    <>
      <motion.button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ y: -6 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="suggested-card group/card relative shrink-0 snap-start overflow-hidden rounded-2xl text-left"
        style={{
          background: "var(--card)",
          border: "1px solid var(--glass-border)",
          boxShadow:
            "0 1px 0 0 color-mix(in oklab, var(--foreground) 6%, transparent) inset, 0 18px 40px -24px color-mix(in oklab, var(--foreground) 28%, transparent), 0 4px 12px -6px color-mix(in oklab, var(--foreground) 14%, transparent)",
        }}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          <img
            src={property.image}
            alt={property.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover/card:scale-105"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, color-mix(in oklab, #000 28%, transparent) 0%, transparent 38%)",
            }}
          />
          <span
            className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[9px] font-semibold tracking-luxury backdrop-blur-md"
            style={{
              background: "rgba(255,255,255,0.92)",
              color: "#0a0a0a",
              border: "1px solid rgba(8,8,8,0.08)",
              boxShadow: "0 2px 8px -2px rgba(0,0,0,0.18)",
            }}
          >
            {property.status}
          </span>
          {chipLabel && (
            <span
              className="absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[9px] font-semibold tracking-luxury"
              style={{
                background: "var(--foreground)",
                color: "var(--background)",
                boxShadow: "0 2px 8px -2px rgba(0,0,0,0.25)",
              }}
            >
              {chipLabel}
            </span>
          )}
          <span
            className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold tracking-luxury opacity-0 transition-opacity group-hover/card:opacity-100"
            style={{ background: "var(--foreground)", color: "var(--background)" }}
          >
            View <ArrowUpRight className="h-2.5 w-2.5" />
          </span>
        </div>
        <div className="p-4">
          <p className="text-[9px] font-semibold tracking-luxury text-muted-foreground">
            {property.developer}
          </p>
          <h3 className="descender-safe mt-1 truncate font-display text-[18px] font-medium text-foreground">
            {property.name}
          </h3>
          <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" /> {property.location}
          </p>
        </div>
      </motion.button>

      <PropertyHoverCard
        property={property}
        anchorRef={anchorRef}
        open={open}
        slides={slides}
        slideIdx={slideIdx}
        onSlideChange={setSlideIdx}
        selectedFlag={selectedFlag}
        atMax={atMax}
        onToggleCompare={handleToggle}
        onPointerEnter={() => {}}
        onPointerLeave={() => {}}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
