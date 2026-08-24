import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { PropertiesProvider, useProperties } from "@/context/PropertiesContext";
import {
  WORKSPACE_CATALOGUE_KEY,
  workspaceCatalogueQueryOptions,
} from "@/api/queries/properties.queries";
import { PropertyListRow } from "@/components/property/PropertyListRow";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { TickerStrip } from "@/components/marketing/TickerStrip";
import { RecentlyViewed } from "@/components/marketing/RecentlyViewed";
import { ComparisonBoard } from "@/components/compare/ComparisonBoard";
import { StickyCompareTray } from "@/components/compare/StickyCompareTray";
import { PreferenceBanner } from "@/components/marketing/PreferenceBanner";
import { PreferencePanel } from "@/components/marketing/PreferencePanel";
import { SuggestedComparisons } from "@/components/marketing/SuggestedComparisons";
import { SuggestedProperties } from "@/components/marketing/SuggestedProperties";
import { useOnboarding } from "@/context/OnboardingContext";
import { useHydrated } from "@/hooks/use-hydrated";
import { hasActiveFilters, matchesPreferences } from "@/lib/preference-filter";
import type { Property } from "@/types/property";
import { getCatalogueBootstrap } from "@/api/functions/catalogue-bootstrap.functions";
import { V2CataloguePage } from "@/components/catalogue/V2CataloguePage";
import { DeveloperAlliances } from "@/components/marketing/DeveloperAlliances";
import { LandingSections } from "@/components/landing/LandingSections";
import { PropertyShowcase } from "@/components/landing/PropertyShowcase";
import { scrollToId } from "@/lib/scroll-to-id";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PropCompare — Compare. Decide. Confidently." },
      {
        name: "description",
        content:
          "Compare ultra-luxury residences side by side and decide with clarity — configurations, pricing, RERA and possession, all in one view.",
      },
      { property: "og:title", content: "PropCompare — Compare. Decide. Confidently." },
      {
        property: "og:description",
        content: "Compare ultra-luxury residences side by side and decide with clarity.",
      },
    ],
  }),
  loader: async ({ context }) => {
    const v2 = await getCatalogueBootstrap();
    if (v2.enabled) return { v2, properties: [], tier: "public" as const };
    const catalogue = await context.queryClient.ensureQueryData(workspaceCatalogueQueryOptions());
    return { v2, properties: catalogue.properties, tier: catalogue.tier };
  },
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
  const { properties, v2, tier } = Route.useLoaderData();
  useCatalogueTierSync(tier);
  if (v2.enabled) return <V2CataloguePage markets={v2.markets} />;
  return (
    <PropertiesProvider properties={properties}>
      <IndexContent />
    </PropertiesProvider>
  );
}

/** The catalogue is served at one of two tiers, chosen server-side from the
 *  session cookie. Signing in or out mid-visit changes which tier the visitor is
 *  entitled to, but the cached query still holds the other one — so drop it and
 *  re-run the loader as soon as the two disagree. */
function useCatalogueTierSync(tier: "public" | "gated") {
  const { userProfile, hydrated } = useOnboarding();
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    if (!hydrated) return;
    if (Boolean(userProfile) === (tier === "gated")) return;
    void queryClient
      .invalidateQueries({ queryKey: WORKSPACE_CATALOGUE_KEY })
      .then(() => router.invalidate());
  }, [hydrated, userProfile, tier, queryClient, router]);
}

function IndexContent() {
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

  // Lock body scroll while mobile filter modal is open.
  useEffect(() => {
    if (!filtersOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [filtersOpen]);

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

      {/* ============ LANDING MARKETING ============ */}
      {/* The outer section keeps the #hero anchor and gives StickyCompareTray a
          real element spanning the above-the-fold region for its observer. */}
      <section id="hero" ref={heroRef} className="scroll-mt-28">
        {/* V1 has no requirements form, so its CTAs go to the collection. */}
        <LandingSections onPrimary={() => scrollToId("collection")} />
      </section>

      {/* ============ TICKER ============ */}
      <TickerStrip />

      {/* ============ COMPARISON SUITE ============ */}
      <section id="suite" className="relative scroll-mt-28 overflow-hidden py-8 sm:py-12">
        <div className="container-lux relative z-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-[var(--rule-strong)] sm:w-12" />
                <p className="font-label text-[10px] font-semibold tracking-luxury text-champagne sm:text-[11px]">
                  The Suite
                </p>
              </div>
              <h2
                className="mt-4 font-display leading-[1.02] tracking-[-0.01em] text-foreground"
                style={{ fontSize: "var(--step-3)" }}
              >
                Compare, <span className="gold-text">side by side</span>
              </h2>
            </div>
            <p className="pb-1 text-[14px] text-muted-foreground">
              Select two or three residences to compare side by side.
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

      {/* ============ SHOWCASE ============ */}
      <PropertyShowcase />

      {/* ============ DEVELOPER ALLIANCES ============ */}
      <DeveloperAlliances />

      {/* ============ COLLECTION ============ */}
      {/* No overflow-hidden here — this section has nothing decorative to
          clip (unlike the hero above it), and overflow-hidden on an
          ancestor is what silently breaks position:sticky for the filter
          sidebar below: any ancestor with overflow other than visible stops
          a sticky descendant from sticking past that ancestor's box. */}
      <section id="collection" ref={collectionRef} className="relative scroll-mt-28 py-8 sm:py-12">
        <div className="container-lux relative z-10">
          <div className="flex flex-col justify-between gap-6 border-b border-[var(--rule)] pb-6 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-[var(--rule-strong)] sm:w-12" />
                <p className="font-label tracking-luxury text-xs font-semibold uppercase text-champagne">
                  The Collection
                </p>
              </div>
              <h2
                className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
                style={{ letterSpacing: "var(--tracking-display)" }}
              >
                Residences in <span className="gold-text">focus</span>
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Select any residence to inspect floor plans and compare details.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <div className="flex items-center gap-2.5 rounded-full border border-champagne/30 bg-champagne/5 px-4 py-2">
                <span className="font-display text-lg font-bold leading-none text-champagne tabular-nums sm:text-xl">
                  {searching || filtersActive ? visibleCount : properties.length}
                </span>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {searching || filtersActive ? "matching residences" : "curated residences"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <PreferenceBanner />
          </div>

          {searching && (
            // A transient notice, not a decision the visitor made — same
            // hairline treatment as the preference banner above it, gold
            // reserved for the "Clear" action rather than the whole bar.
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-card border border-[var(--rule)] bg-card/60 px-5 py-3">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-foreground" style={{ fontSize: "var(--step--1)" }}>
                Showing results for <span className="font-semibold">"{query.trim()}"</span>
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="tracking-luxury ml-auto inline-flex items-center gap-1.5 rounded-full border border-champagne/30 px-3 py-1 text-champagne transition hover:bg-champagne/10"
                style={{ fontSize: "var(--step--2)" }}
              >
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
          )}

          <div className="mt-10 flex flex-col gap-6">
            {/* Desktop & Mobile Refine Collection Trigger Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-2xl border border-[var(--rule)] bg-card p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-champagne/30 bg-champagne/10 text-champagne">
                  <SlidersHorizontal className="h-4 w-4 stroke-[2.2]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-bold text-foreground">
                      Refine Collection
                    </h3>
                    {hydrated && activeFilterCount > 0 && (
                      <span className="rounded-full border border-champagne/30 bg-champagne/15 px-2.5 py-0.5 text-[10px] font-extrabold text-champagne">
                        {activeFilterCount} Active
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Filter by architectural style, BHK configuration, or budget spectrum
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 self-end sm:self-auto">
                {hydrated && activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule)] bg-background/60 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:border-champagne/40 hover:text-champagne"
                  >
                    <RotateCcw className="h-3 w-3 text-champagne" /> Clear all
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-champagne via-muted-gold to-champagne px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-lux-black shadow-md shadow-champagne/20 transition hover:opacity-95 active:scale-95"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Filter Options</span>
                </button>
              </div>
            </div>

            {/* Slide-Over Preference Drawer — Portaled to Document Body for Desktop & Mobile */}
            {hydrated &&
              createPortal(
                <AnimatePresence>
                  {filtersOpen && (
                    <div>
                      {/* Dark Backdrop Overlay */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setFiltersOpen(false)}
                        className="fixed inset-0 z-[99998] bg-black/80 backdrop-blur-sm"
                      />

                      {/* Fixed Slide-Over Drawer Container (Left Side) */}
                      <motion.div
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        transition={{ type: "spring", stiffness: 340, damping: 32 }}
                        className="fixed inset-y-0 left-0 z-[99999] flex w-full max-w-full sm:max-w-md flex-col overflow-hidden border-r border-[var(--rule)] bg-card text-foreground shadow-2xl"
                      >
                        {/* Fixed Top Bar — Luxury Glass & Gold Accents */}
                        <div className="flex shrink-0 items-center justify-between border-b border-[var(--rule)] bg-card/95 px-5 py-4 pt-4 sm:pt-6 backdrop-blur-md">
                          <div className="flex items-center gap-2.5">
                            <SlidersHorizontal className="h-4 w-4 text-champagne" />
                            <div>
                              <p className="font-label tracking-luxury text-[10px] font-bold uppercase text-champagne">
                                Collection Filter
                              </p>
                              <h3 className="font-display text-base font-bold text-foreground">
                                Refine Preferences
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {activeFilterCount > 0 && (
                              <button
                                type="button"
                                onClick={clearFilters}
                                className="text-xs font-bold uppercase tracking-wider text-champagne transition hover:opacity-80"
                              >
                                Clear all
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setFiltersOpen(false)}
                              className="rounded-full border border-[var(--rule)] bg-muted/60 p-2.5 text-foreground transition hover:border-foreground/40 hover:bg-muted"
                              aria-label="Close filters"
                            >
                              <X className="h-5 w-5 stroke-[2.5]" />
                            </button>
                          </div>
                        </div>

                        {/* Preference Options Body — no-scroll */}
                        <div className="flex-1 overflow-hidden bg-card/40 px-6 py-6">
                          <PreferencePanel hideHeader={true} />
                        </div>

                        {/* Sticky Bottom Action CTA */}
                        <div className="shrink-0 border-t border-[var(--rule)] bg-card/95 p-4 pb-6 backdrop-blur-md">
                          <button
                            type="button"
                            onClick={() => setFiltersOpen(false)}
                            className="tracking-luxury inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-champagne via-muted-gold to-champagne text-xs font-bold uppercase tracking-wider text-lux-black shadow-xl shadow-champagne/20 transition duration-200 hover:opacity-95 active:scale-[0.99]"
                          >
                            <span>
                              Apply Filters ({visibleCount}{" "}
                              {visibleCount === 1 ? "Residence" : "Residences"})
                            </span>
                            <ArrowUpRight className="h-4 w-4 stroke-[3]" />
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>,
                document.body,
              )}

            <div className="flex flex-col gap-6">
              {visibleCount === 0 ? (
                <div className="rounded-card border border-dashed border-[var(--rule-strong)] bg-card/40 px-8 py-16 text-center">
                  <Search className="mx-auto h-5 w-5 text-muted-foreground" />
                  <h3
                    className="mt-4 font-display text-foreground"
                    style={{ fontSize: "var(--step-1)" }}
                  >
                    No residences found
                  </h3>
                  <p
                    className="mx-auto mt-2 max-w-sm text-muted-foreground"
                    style={{ fontSize: "var(--step--1)" }}
                  >
                    {searching
                      ? `Nothing matches "${query.trim()}". Try a different name, location, or developer — or clear the search.`
                      : "No residences match your current filters. Loosen a filter or clear them to see the full collection."}
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {searching && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="tracking-luxury inline-flex items-center gap-2 rounded-full border border-champagne/40 px-5 py-2.5 text-champagne transition hover:bg-champagne/10"
                        style={{ fontSize: "var(--step--2)" }}
                      >
                        <X className="h-3 w-3" /> Clear search
                      </button>
                    )}
                    {filtersActive && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="tracking-luxury inline-flex items-center gap-2 rounded-full border border-champagne/40 px-5 py-2.5 text-champagne transition hover:bg-champagne/10"
                        style={{ fontSize: "var(--step--2)" }}
                      >
                        <X className="h-3 w-3" /> Clear filters
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {visibleRows.map((p, i) => (
                    <div key={p.id} id={`property-row-${p.id}`} className="group/row scroll-mt-32">
                      <PropertyListRow property={p} index={i} />
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
