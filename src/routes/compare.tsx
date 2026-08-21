import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import type { ConsumerComparison } from "@/contracts/consumer";
import { useOnboarding } from "@/context/OnboardingContext";
import { getComparisonBootstrap } from "@/api/functions/properties.functions";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ComparisonHero } from "@/components/compare/ComparisonHero";
import { PropertyHeaderCards } from "@/components/compare/PropertyHeaderCards";
import { SectionNav } from "@/components/compare/SectionNav";
import { OverviewSection } from "@/components/compare/OverviewSection";
import { RoomDimensionsSection } from "@/components/compare/RoomDimensionsSection";
import { AmenitiesSection } from "@/components/compare/AmenitiesSection";
import { AdvantagesSection } from "@/components/compare/AdvantagesSection";
import { DifferenceHighlights } from "@/components/compare/DifferenceHighlights";
import { GalleryComparison } from "@/components/compare/GalleryComparison";
import { ExpertVerdict } from "@/components/compare/ExpertVerdict";
import { PreferenceBanner } from "@/components/marketing/PreferenceBanner";
import { getCatalogueBootstrap } from "@/api/functions/catalogue-bootstrap.functions";
import { getV2ComparisonPage } from "@/api/functions/comparison-page.functions";
import { V2Comparison } from "@/components/compare/V2Comparison";
import { useActivityLog } from "@/hooks/use-activity-log";
import { readStoredCataloguePreference } from "@/lib/preferences-storage";

const searchSchema = z.object({
  ids: z.string().optional().default(""),
  /** Set by ShareCompareButton — marks an inbound link from someone else. */
  shared: z.coerce.boolean().optional().default(false),
});

export const Route = createFileRoute("/compare")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ ids: search.ids }),
  loader: async ({ deps }) => {
    const slugs = deps.ids
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 3);
    const v2 = await getCatalogueBootstrap();
    if (v2.enabled) {
      if (!v2.comparisonEnabled) {
        return { mode: "disabled" as const };
      }
      return {
        mode: "v2" as const,
        bootstrap:
          slugs.length > 0
            ? await getV2ComparisonPage({ data: { slugs } })
            : {
                comparison: null,
                propscoreEnabled: false,
                intelligenceFeedbackEnabled: false,
              },
      };
    }
    return {
      mode: "legacy" as const,
      bootstrap:
        slugs.length > 0
          ? await getComparisonBootstrap({ data: { slugs } })
          : { authRequired: false as const, properties: [] },
    };
  },
  head: () => ({
    meta: [
      { title: "Comparison Suite — PropCompare" },
      {
        name: "description",
        content: "Side-by-side comparison of luxury residences from the PropCompare collection.",
      },
      { property: "og:title", content: "Comparison Suite — PropCompare" },
      {
        property: "og:description",
        content: "Side-by-side comparison of luxury residences.",
      },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const loaderData = Route.useLoaderData();
  if (loaderData.mode === "v2") {
    return (
      <V2ComparePage
        comparison={loaderData.bootstrap.comparison}
        propscoreEnabled={loaderData.bootstrap.propscoreEnabled}
        intelligenceFeedbackEnabled={loaderData.bootstrap.intelligenceFeedbackEnabled}
      />
    );
  }
  return <LegacyComparePage loaderData={loaderData} />;
}

type LegacyLoaderData = Exclude<ReturnType<typeof Route.useLoaderData>, { mode: "v2" }>;

function LegacyComparePage({ loaderData }: { loaderData: LegacyLoaderData }) {
  const { shared } = Route.useSearch();
  const { userProfile, hydrated, requestGatedAuth } = useOnboarding();
  const router = useRouter();
  const logActivity = useActivityLog();

  const bootstrap = loaderData.mode === "disabled" ? null : loaderData.bootstrap;
  const properties =
    loaderData.mode === "legacy" && !loaderData.bootstrap.authRequired
      ? loaderData.bootstrap.properties
      : [];
  const projectNames =
    loaderData.mode === "disabled"
      ? []
      : loaderData.bootstrap.authRequired
        ? loaderData.bootstrap.projects.map((property: { name: string }) => property.name)
        : loaderData.bootstrap.properties.map((property: { name: string }) => property.name);

  // A shared link is gated: the recipient identifies themselves before the
  // comparison renders. Wait for `hydrated` so a returning signed-in visitor
  // never sees the gate flash while the session check resolves.
  const gated = Boolean(bootstrap?.authRequired && hydrated && !userProfile);
  useEffect(() => {
    if (gated) requestGatedAuth();
  }, [gated, requestGatedAuth]);
  useEffect(() => {
    if (gated) logActivity("gate_shown");
  }, [gated, logActivity]);
  useEffect(() => {
    if (bootstrap?.authRequired && userProfile) {
      logActivity("gate_unlocked");
      void router.invalidate();
    }
  }, [bootstrap?.authRequired, logActivity, router, userProfile]);
  const comparisonReady = Boolean(!bootstrap?.authRequired && properties.length >= 2);
  useEffect(() => {
    if (comparisonReady) logActivity("compare_open");
  }, [comparisonReady, logActivity]);
  if (!bootstrap) return <ComparisonDisabled />;
  // Hold the comparison back entirely rather than rendering it behind the
  // overlay — the content must not be readable before the visitor signs in.
  if (bootstrap.authRequired) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
          <p className="text-[11px] tracking-luxury text-champagne">
            {shared ? "Shared comparison" : "Authentication required"}
          </p>
          <h1 className="mt-4 font-display text-4xl text-ivory sm:text-5xl">
            {shared ? (
              <>
                A comparison was <span className="gold-text">shared with you</span>
              </>
            ) : (
              <>
                Sign in to <span className="gold-text">compare properties</span>
              </>
            )}
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">
            {projectNames.length >= 2
              ? `${projectNames.join(" vs ")}. Sign in with your details to view the full comparison.`
              : "Sign in with your details to view the full comparison."}
          </p>
          {hydrated && (
            <button
              onClick={requestGatedAuth}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-champagne px-7 py-3 text-xs tracking-luxury text-lux-black transition hover:opacity-90"
            >
              Continue to view
            </button>
          )}
        </div>
      </div>
    );
  }

  if (properties.length < 2) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
          <p className="text-[11px] tracking-luxury text-champagne">Comparison unavailable</p>
          <h1 className="mt-4 font-display text-4xl text-ivory sm:text-5xl">
            Select at least <span className="gold-text">two residences</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Return to the collection and add 2–3 properties to begin comparison.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full gold-border px-6 py-3 text-xs tracking-luxury text-champagne hover:bg-champagne hover:text-lux-black"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Residences
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-6">
        <ComparisonHero properties={properties} />
        <div className="mb-6">
          <PreferenceBanner />
        </div>
        <PropertyHeaderCards properties={properties} />
        <div className="mt-6">
          <SectionNav />
        </div>
        <OverviewSection properties={properties} />
        <RoomDimensionsSection properties={properties} />
        <AmenitiesSection properties={properties} />
        <AdvantagesSection properties={properties} />
        <DifferenceHighlights properties={properties} />
        <GalleryComparison properties={properties} />
        <ExpertVerdict properties={properties} />

        <div className="mt-20 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full gold-border px-6 py-3 text-xs tracking-luxury text-champagne hover:bg-champagne hover:text-lux-black"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Residences
          </Link>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

function V2ComparePage({
  comparison,
  propscoreEnabled,
  intelligenceFeedbackEnabled,
}: {
  comparison: ConsumerComparison | null;
  propscoreEnabled: boolean;
  intelligenceFeedbackEnabled: boolean;
}) {
  const { userProfile } = useOnboarding();
  const router = useRouter();
  const logActivity = useActivityLog();

  const compareOpen = Boolean(comparison && comparison.properties.length >= 2);
  const locked = Boolean(
    comparison && comparison.properties.some((property) => property.gated === null),
  );
  useEffect(() => {
    if (compareOpen && comparison) {
      const stored = readStoredCataloguePreference();
      logActivity("compare_open", null, {
        propertySlugs: comparison.properties.map((item) => item.property.slug).sort(),
        marketId: stored?.marketId,
        budgetBandId: stored?.budgetBandId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareOpen]);
  useEffect(() => {
    if (locked) logActivity("gate_shown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);
  useEffect(() => {
    if (locked && userProfile) {
      logActivity("gate_unlocked");
      void router.invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, userProfile]);

  if (!comparison) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="container-lux pt-40 text-center">
          Select at least two projects to compare.
        </div>
      </div>
    );
  }

  return (
    <V2Comparison
      comparison={comparison}
      propscoreEnabled={propscoreEnabled}
      intelligenceFeedbackEnabled={intelligenceFeedbackEnabled}
    />
  );
}

function ComparisonDisabled() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
        <p className="text-[11px] tracking-luxury text-champagne">Comparison unavailable</p>
        <h1 className="mt-4 font-display text-4xl text-ivory sm:text-5xl">
          This feature is not currently enabled.
        </h1>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full gold-border px-6 py-3 text-xs tracking-luxury text-champagne"
        >
          <ArrowLeft className="h-4 w-4" /> Back to residences
        </Link>
      </main>
    </div>
  );
}
