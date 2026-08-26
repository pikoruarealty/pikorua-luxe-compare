import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import type { ConsumerComparison } from "@/contracts/consumer";
import { useOnboarding } from "@/context/OnboardingContext";
import { SiteHeader } from "@/components/layout/SiteHeader";
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
  if (loaderData.mode === "disabled") return <ComparisonDisabled />;
  return (
    <V2ComparePage
      comparison={loaderData.bootstrap.comparison}
      propscoreEnabled={loaderData.bootstrap.propscoreEnabled}
      intelligenceFeedbackEnabled={loaderData.bootstrap.intelligenceFeedbackEnabled}
    />
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
