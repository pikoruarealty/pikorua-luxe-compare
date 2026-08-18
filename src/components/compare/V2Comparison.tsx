import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import type { ConsumerComparison } from "@/contracts/consumer";
import { useOnboarding } from "@/context/OnboardingContext";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { LocationDistances } from "./LocationDistances";
import { PropScoreComparison } from "@/components/propscore/PropScorePanel";
import { ComparisonMatrixTableV2 } from "./ComparisonMatrixTableV2";
import { MissingAlternatives } from "./MissingAlternatives";
import { UnlockGate } from "./UnlockGate";
import { WeightingStrip } from "./WeightingStrip";
import { WhyThisWins } from "./WhyThisWins";

export function V2Comparison({
  comparison,
  propscoreEnabled = false,
}: {
  comparison: ConsumerComparison;
  propscoreEnabled?: boolean;
}) {
  const { requestGatedAuth } = useOnboarding();
  const [selectedConfigId, setSelectedConfigId] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      comparison.properties.map((property) => [
        property.property.id,
        property.selectedConfigurationId ?? property.configurations[0]?.id ?? null,
      ]),
    ),
  );

  const locked = comparison.properties.some((property) => property.gated === null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="container-lux pt-28 pb-20">
        <p className="text-xs tracking-[0.18em] text-champagne uppercase">Factual comparison</p>
        <h1 className="mt-3 max-w-4xl font-display text-4xl font-extrabold sm:text-5xl">
          Factual differences, without a manufactured winner.
        </h1>
        {!comparison.preferencesApplied && (
          <p className="mt-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            This comparison has no confirmed preferences, so budget-fit indicators are absent.
          </p>
        )}

        {locked && <UnlockGate onUnlock={requestGatedAuth} />}

        <div className="mt-8">
          <ComparisonMatrixTableV2
            items={comparison.properties}
            selectedConfigId={selectedConfigId}
            onSelectConfig={(propertyId, configId) =>
              setSelectedConfigId((current) => ({ ...current, [propertyId]: configId }))
            }
          />
        </div>

        <LocationDistances
          properties={comparison.properties.map((item) => ({
            slug: item.property.slug,
            name: item.property.name,
          }))}
        />
        {propscoreEnabled && (
          <PropScoreComparison
            properties={comparison.properties.map((item) => ({
              slug: item.property.slug,
              name: item.property.name,
            }))}
          />
        )}
        {propscoreEnabled && !locked && (
          <>
            <WeightingStrip
              properties={comparison.properties.map((item) => ({
                slug: item.property.slug,
                name: item.property.name,
              }))}
            />
            <WhyThisWins
              properties={comparison.properties.map((item) => ({
                slug: item.property.slug,
                name: item.property.name,
              }))}
            />
          </>
        )}
        <MissingAlternatives
          comparisonSlugs={comparison.properties.map((item) => item.property.slug)}
        />
        <div className="mt-10 rounded-2xl border border-border p-5">
          <h2 className="font-display text-xl font-bold">Why some values are not compared</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Areas are compared only when every selected configuration uses the same measurement
            basis and unit. Missing information remains "Not stated" rather than becoming zero or a
            generated claim.
          </p>
        </div>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to catalogue
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
