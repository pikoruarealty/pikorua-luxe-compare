import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ArrowUpRight,
  ChevronDown,
  GitCompareArrows,
  LayoutList,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useProperties } from "@/context/PropertiesContext";
import { PropertyListRow } from "@/components/property/PropertyListRow";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TickerStrip } from "@/components/TickerStrip";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { DeveloperAlliances } from "@/components/DeveloperAlliances";
import { ComparisonBoard } from "@/components/compare/ComparisonBoard";
import { StickyCompareTray } from "@/components/compare/StickyCompareTray";
import { PreferenceBanner } from "@/components/PreferenceBanner";
import { PreferencePanel } from "@/components/PreferencePanel";
import { SuggestedComparisons } from "@/components/SuggestedComparisons";
import { SuggestedProperties } from "@/components/SuggestedProperties";
import { useOnboarding } from "@/context/OnboardingContext";
import { useHydrated } from "@/hooks/use-hydrated";
import { hasActiveFilters, matchesPreferences } from "@/lib/preference-filter";
import type { Property } from "@/types/property";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pikorua — Luxury Residences" },
      {
        name: "description",
        content:
          "Compose a side-by-side comparison of ultra-luxury residences with Pikorua's curated comparison suite.",
      },
      { property: "og:title", content: "Pikorua — Luxury Residences" },
      {
        property: "og:description",
        content: "Compare ultra-luxury residences side by side.",
      },
    ],
  }),
  component: Index,
});

/** Case-insensitive match across the fields a buyer would search by. */
function matchesQuery(p: Property, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [p.name, p.developer, p.location, p.configuration, p.category, p.status, p.possession]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function Index() {
  const heroRef = useRef<HTMLElement | null>(null);
  const slotsRef = useRef<HTMLDivElement | null>(null);
  const collectionRef = useRef<HTMLElement | null>(null);
  const { quizAnswers, setQuizAnswers } = useOnboarding();
  const properties = useProperties();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hydrated = useHydrated();

  const activeFilterCount =
    (quizAnswers?.propertyType?.length ?? 0) +
    (quizAnswers?.bhk?.length ?? 0) +
    (quizAnswers?.budgetRange ? 1 : 0);

  const clearFilters = () => {
    setQuizAnswers(null);
    try {
      window.localStorage.removeItem("pikorua:quiz-answers");
    } catch {
      // ignore
    }
  };

  // Hero slideshow — cycles through the first few residences.
  const featured = useMemo(() => properties.slice(0, 5), [properties]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  useEffect(() => {
    if (heroPaused || featured.length <= 1) return;
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % featured.length), 4500);
    return () => clearInterval(id);
  }, [heroPaused, featured.length]);
  const hero = featured[heroIdx];

  // Gentle cursor-follow tilt on the hero composition.
  const tiltX = useMotionValue(0.5);
  const tiltY = useMotionValue(0.5);
  const tiltRotateX = useSpring(useTransform(tiltY, [0, 1], [3.5, -3.5]), {
    stiffness: 140,
    damping: 20,
  });
  const tiltRotateY = useSpring(useTransform(tiltX, [0, 1], [-4.5, 4.5]), {
    stiffness: 140,
    damping: 20,
  });
  const onTiltMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    tiltX.set((e.clientX - r.left) / r.width);
    tiltY.set((e.clientY - r.top) / r.height);
  };
  const resetTilt = () => {
    tiltX.set(0.5);
    tiltY.set(0.5);
  };

  // Strict filtering: with active filters the collection shows ONLY
  // matching residences — nothing else is appended below.
  const filtersActive = hasActiveFilters(quizAnswers);
  const filtered = useMemo(() => {
    if (!filtersActive) return properties;
    const types = (quizAnswers?.propertyType ?? []).map((t) => t.toLowerCase());
    const bhks = (quizAnswers?.bhk ?? []).map((b) => b.replace(/\s*BHK$/i, "").trim());
    const score = (p: Property) => {
      let s = 0;
      const config = p.configuration?.toLowerCase() ?? "";
      const cat = p.category.toLowerCase();
      for (const t of types) {
        if (cat === t) s += 2;
        else if (config.includes(t)) s += 2;
      }
      for (const b of bhks) {
        if (config.includes(`${b} bhk`) || config.includes(`${b},`)) s += 1;
      }
      return s;
    };
    return properties
      .filter((p) => matchesPreferences(p, quizAnswers))
      .sort((a, b) => score(b) - score(a));
  }, [properties, filtersActive, quizAnswers]);

  // Free-text search applies on top of the filters.
  const visibleRows = useMemo(
    () => filtered.filter((p) => matchesQuery(p, query)),
    [filtered, query],
  );
  const searching = query.trim().length > 0;
  const visibleCount = visibleRows.length;

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen">
      <div aria-hidden className="page-grain" />
      <SiteHeader />
      <StickyCompareTray
        watchRef={heroRef}
        hideRef={slotsRef}
        onCompare={() => scrollToId("suite")}
        onAdd={() => scrollToId("collection")}
      />

      {/* ============ HERO — Editorial Split ============ */}
      <section
        id="hero"
        ref={heroRef}
        className="relative overflow-hidden pt-24 pb-12 scroll-mt-28 sm:pt-28"
      >
        {/* Ambient decor — soft monochrome washes */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_7%,transparent),transparent_70%)] blur-3xl" />
          <div className="absolute top-10 right-[-160px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_5%,transparent),transparent_70%)] blur-3xl" />
        </div>

        <div className="container-lux relative z-10">
          <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            {/* LEFT — copy */}
            <div className="relative pt-2 sm:pt-6">
              <h1 className="font-display text-[46px] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[62px] lg:text-[74px]">
                {[
                  <>India's Smartest</>,
                  <>
                    <span className="gold-text">Property Comparison</span>
                  </>,
                  <>Platform.</>,
                ].map((line, i) => (
                  <span
                    key={i}
                    className="descender-safe block overflow-hidden sm:whitespace-nowrap"
                  >
                    <motion.span
                      className="block"
                      // Must clear the descender padding too, or the incoming
                      // line peeks into it before the reveal starts.
                      initial={{ y: "135%" }}
                      animate={{ y: 0 }}
                      transition={{
                        duration: 0.9,
                        delay: 0.12 + i * 0.14,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      {line}
                    </motion.span>
                  </span>
                ))}
              </h1>

              {/* Pill search — filters the collection below */}
              <motion.form
                onSubmit={(e) => {
                  e.preventDefault();
                  scrollToId("collection");
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.4 }}
                className="mt-9 flex w-full max-w-xl items-center gap-2 rounded-full border border-foreground/10 bg-card/85 p-1.5 backdrop-blur-md shadow-[0_24px_60px_-34px_rgba(0,0,0,0.25)]"
              >
                <div className="flex flex-1 items-center gap-3 px-5">
                  <Search
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--brand-accent, var(--brand))" }}
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, location, or developer…"
                    aria-label="Search residences"
                    className="w-full bg-transparent py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  {searching && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="foil rounded-full px-5 py-3 text-[12px] font-semibold tracking-luxury sm:px-7"
                >
                  Explore
                </button>
              </motion.form>

              {/* Quick-pick chips — one tap filters the collection */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="mt-3.5 flex flex-wrap items-center gap-2"
              >
                <span className="text-[10px] tracking-luxury text-muted-foreground">Popular</span>
                {["Penthouse", "Bungalow", "Ready to Move", "4 BHK", "Duplex"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setQuery(c);
                      scrollToId("collection");
                    }}
                    className="rounded-full border border-foreground/12 bg-card px-3.5 py-1.5 text-[11px] text-foreground/75 transition hover:border-foreground/40 hover:text-foreground"
                  >
                    {c}
                  </button>
                ))}
              </motion.div>

              {/* Secondary CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.55 }}
                className="mt-6 flex flex-wrap items-center gap-3"
              >
                <button
                  onClick={() => scrollToId("suite")}
                  className="group inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-card px-5 py-2.5 text-[12px] font-medium text-foreground transition hover:border-foreground/40 hover:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.35)]"
                >
                  <GitCompareArrows className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-180" />{" "}
                  Start a comparison
                </button>
                <button
                  onClick={() => scrollToId("collection")}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
                >
                  <LayoutList className="h-3.5 w-3.5" /> Browse the collection
                </button>
              </motion.div>
            </div>

            {/* RIGHT — Featured residence composition */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onMouseMove={onTiltMove}
              onMouseLeave={resetTilt}
              className="relative mx-auto w-full max-w-[min(460px,60vh)] lg:mx-0 lg:justify-self-end"
              style={{ rotateX: tiltRotateX, rotateY: tiltRotateY, transformPerspective: 1400 }}
            >
              {/* Frame accent */}
              <div
                aria-hidden
                className="absolute -inset-5 rounded-[34px] border border-foreground/10"
                style={{
                  background:
                    "linear-gradient(160deg, color-mix(in oklab, var(--foreground) 6%, transparent), transparent)",
                }}
              />

              {/* Featured slideshow — calendar page flip */}
              <div
                className="shine-host relative overflow-hidden rounded-[28px] shadow-[0_50px_120px_-40px_rgba(0,0,0,0.45)]"
                style={{ perspective: 1600 }}
                onMouseEnter={() => setHeroPaused(true)}
                onMouseLeave={() => setHeroPaused(false)}
              >
                <div
                  className="relative aspect-[4/5] w-full"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <AnimatePresence initial={false} mode="sync">
                    <motion.div
                      key={hero?.id ?? "hero"}
                      initial={{ rotateX: -84, opacity: 0.35 }}
                      animate={{ rotateX: 0, opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.55, delay: 0.35 } }}
                      transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0"
                      style={{
                        transformOrigin: "top center",
                        backfaceVisibility: "hidden",
                        transformStyle: "preserve-3d",
                      }}
                    >
                      <img
                        src={hero?.image}
                        alt={hero?.name ?? "Featured residence"}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="eager"
                        decoding="async"
                      />
                      {/* fold shade — darkens while the page is mid-flip */}
                      <motion.div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-black"
                        initial={{ opacity: 0.55 }}
                        animate={{ opacity: 0 }}
                        transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </motion.div>
                  </AnimatePresence>
                  {/* centre crease line, like a flip-calendar hinge */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-white/25"
                  />
                  <span aria-hidden className="shine" />
                </div>
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5 text-[10px] tracking-luxury text-white">
                  <span className="rounded-full bg-black/40 px-3 py-1 backdrop-blur">
                    Featured · {hero?.location ?? "Reserve"}
                  </span>
                  <span className="rounded-full bg-black/40 px-3 py-1 font-display text-[13px] tabular-nums backdrop-blur">
                    {String(heroIdx + 1).padStart(2, "0")}
                    <span className="opacity-50">
                      {" "}
                      / {String(featured.length).padStart(2, "0")}
                    </span>
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-6 text-white">
                  <div className="text-[10px] tracking-luxury opacity-80">Editor's choice</div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={hero?.id ?? "hero-caption"}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.4 }}
                    >
                      <div className="mt-1 font-display text-2xl font-bold leading-tight sm:text-[28px]">
                        {hero?.name}
                      </div>
                      <div className="mt-1 text-[12px] opacity-80">{hero?.configuration}</div>
                      {hero && (
                        <Link
                          to="/residence/$id"
                          params={{ id: hero.id }}
                          className="mt-2 inline-flex items-center gap-1.5 text-[10px] tracking-luxury text-white/80 underline-offset-4 transition hover:text-white hover:underline"
                        >
                          View residence <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  {/* Slide dots */}
                  <div className="mt-4 flex gap-1.5">
                    {featured.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setHeroIdx(i)}
                        aria-label={`Show ${p.name}`}
                        className={`h-[3px] rounded-full transition-all duration-500 ${
                          i === heroIdx ? "w-7 bg-white" : "w-2.5 bg-white/40 hover:bg-white/70"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============ TICKER ============ */}
      <TickerStrip />

      {/* ============ COMPARISON SUITE ============ */}
      <section id="suite" className="relative scroll-mt-28 overflow-hidden py-12 sm:py-16">
        <div className="container-lux relative z-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-(--rule-strong) sm:w-12" />
                <p className="font-label text-[10px] font-semibold tracking-luxury text-champagne sm:text-[11px]">
                  The Suite
                </p>
              </div>
              <h2
                className="mt-4 font-display leading-[1.02] tracking-[-0.01em] text-ivory"
                style={{ fontSize: "var(--step-3)" }}
              >
                Compare, <span className="gold-text">side by side</span>
              </h2>
            </div>
            <p className="max-w-xs pb-1 text-[14px] leading-relaxed text-muted-foreground">
              Pick two or three residences. Every detail lines up below.
            </p>
          </div>
        </div>
        <div className="mt-8">
          <ComparisonBoard slotsRef={slotsRef} />
        </div>
      </section>

      {/* ============ SUGGESTED PROPERTIES ============ */}
      <SuggestedProperties />

      {/* ============ SUGGESTED COMPARISONS ============ */}
      <SuggestedComparisons />

      {/* ============ RECENTLY VIEWED ============ */}
      <RecentlyViewed />

      {/* ============ DEVELOPER ALLIANCES ============ */}
      <DeveloperAlliances />

      {/* ============ COLLECTION ============ */}
      <section
        id="collection"
        ref={collectionRef}
        className="relative scroll-mt-28 overflow-hidden py-16 sm:py-24"
      >
        <div className="container-lux relative z-10">
          <div className="mt-8 flex flex-wrap items-end justify-between gap-6 border-b border-(--rule) pb-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-(--rule-strong) sm:w-12" />
                <p className="font-label text-[10px] font-semibold tracking-luxury text-champagne sm:text-[11px]">
                  The Collection
                </p>
              </div>
              <h2
                className="mt-4 font-display leading-[1.02] tracking-[-0.01em] text-ivory"
                style={{ fontSize: "var(--step-3)" }}
              >
                Residences in <span className="gold-text">focus</span>
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                Hover a residence to expand it — "Add to Compare" sends it to the Suite.
              </p>
            </div>
            <div className="flex items-baseline gap-3">
              <span
                className="font-display leading-none text-champagne tabular-nums"
                style={{ fontSize: "var(--step-4)" }}
              >
                {searching || filtersActive ? visibleCount : properties.length}
              </span>
              <span className="font-label text-[11px] tracking-luxury text-muted-foreground">
                {searching || filtersActive ? "matching residences" : "curated residences"}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <PreferenceBanner />
          </div>

          {searching && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-champagne/20 bg-champagne/5 px-5 py-3">
              <Search className="h-3.5 w-3.5 text-champagne" />
              <p className="text-[13px] text-foreground">
                Showing results for <span className="font-semibold">"{query.trim()}"</span>
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-champagne/30 px-3 py-1 text-[11px] tracking-luxury text-champagne transition hover:bg-champagne/10"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
          )}

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr] lg:items-start">
            <div className="lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2 pref-scroll">
              {/* Mobile: filters collapse behind a toggle so the list stays first. */}
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-3.5 text-left lg:hidden"
              >
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <SlidersHorizontal className="h-4 w-4 text-champagne" />
                  Filters
                  {hydrated && activeFilterCount > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-champagne px-1.5 text-[10px] font-semibold text-lux-black">
                      {activeFilterCount}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${
                    filtersOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div className={`${filtersOpen ? "mt-3 block" : "hidden"} lg:mt-0 lg:block`}>
                <PreferencePanel />
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {visibleCount === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/40 px-8 py-16 text-center">
                  <Search className="mx-auto h-5 w-5 text-muted-foreground" />
                  <h3 className="mt-4 font-display text-xl text-ivory">No residences found</h3>
                  <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">
                    {searching
                      ? `Nothing matches "${query.trim()}". Try a different name, location, or developer — or clear the search.`
                      : "No residences match your current filters. Loosen a filter or clear them to see the full collection."}
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {searching && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="inline-flex items-center gap-2 rounded-full border border-champagne/40 px-5 py-2.5 text-[11px] tracking-luxury text-champagne transition hover:bg-champagne/10"
                      >
                        <X className="h-3 w-3" /> Clear search
                      </button>
                    )}
                    {filtersActive && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="inline-flex items-center gap-2 rounded-full border border-champagne/40 px-5 py-2.5 text-[11px] tracking-luxury text-champagne transition hover:bg-champagne/10"
                      >
                        <X className="h-3 w-3" /> Clear filters
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {filtersActive && (
                    <div className="mb-2 flex items-center gap-3">
                      <span className="text-[10px] tracking-luxury text-champagne">
                        Matched to your preferences · {visibleCount}
                      </span>
                      <span className="h-px flex-1 bg-champagne/15" />
                    </div>
                  )}

                  {visibleRows.map((p, i) => (
                    <div key={p.id} id={`property-row-${p.id}`} className="group/row scroll-mt-32">
                      <PropertyListRow property={p} index={i} />
                      {i < visibleRows.length - 1 && <RowDivider />}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function RowDivider() {
  return (
    <div className="my-1 flex items-center gap-4 px-2 opacity-60">
      <span className="h-px flex-1 bg-champagne/12" />
    </div>
  );
}
