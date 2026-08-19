import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Star } from "lucide-react";

import type { ConsumerComparison } from "@/contracts/consumer";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { LocationDistances } from "./LocationDistances";
import { PropScoreComparison } from "@/components/propscore/PropScorePanel";

export function V2Comparison({
  comparison,
  propscoreEnabled = false,
}: {
  comparison: ConsumerComparison;
  propscoreEnabled?: boolean;
}) {
  const [selected, setSelected] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      comparison.properties.map((property) => [
        property.property.id,
        property.selectedConfigurationId ?? property.configurations[0]?.id ?? null,
      ]),
    ),
  );
  const chosen = comparison.properties.map((property) => ({
    ...property,
    configuration: property.configurations.find(
      (configuration) => configuration.id === selected[property.property.id],
    ),
  }));
  const comparableArea = useMemo(() => {
    const values = chosen.map((item) => item.configuration);
    return (
      values.every((value) => value && value.areaValue !== null) &&
      new Set(values.map((value) => value?.areaBasis)).size === 1 &&
      new Set(values.map((value) => value?.areaUnit)).size === 1
    );
  }, [chosen]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="container-lux pt-28 pb-20">
        <p className="text-xs tracking-[0.18em] text-champagne uppercase">
          Authenticated comparison
        </p>
        <h1 className="mt-3 max-w-4xl font-display text-4xl font-extrabold sm:text-5xl">
          Factual differences, without a manufactured winner.
        </h1>
        {!comparison.preferencesApplied && (
          <p className="mt-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            This comparison has no confirmed preferences, so budget-fit indicators are absent.
          </p>
        )}

        <div
          className="mt-10 grid gap-5 max-lg:grid-cols-1"
          style={{ gridTemplateColumns: `repeat(${chosen.length}, minmax(0, 1fr))` }}
        >
          {chosen.map((item) => {
            const configuration = item.configuration;
            const fit = configuration?.fit ?? item.fit;
            return (
              <article
                key={item.property.id}
                className="min-w-0 rounded-2xl border border-border bg-card p-5"
              >
                <div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                  {item.property.heroImageUrl ? (
                    <img
                      src={item.property.heroImageUrl}
                      alt={item.property.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Approved media pending
                    </div>
                  )}
                </div>
                <h2 className="mt-5 truncate font-display text-2xl font-bold">
                  {item.property.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.property.developerName ?? "Developer not stated"}
                </p>
                <label className="mt-5 block text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Configuration
                  <select
                    value={configuration?.id ?? ""}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [item.property.id]: event.target.value,
                      }))
                    }
                    className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm normal-case tracking-normal text-foreground"
                  >
                    {item.configurations.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.displayName}
                        {option.variantName ? ` · ${option.variantName}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <dl className="mt-6 space-y-4 text-sm">
                  <Fact term="Location">
                    <MapPin className="mr-1 inline h-4 w-4" />
                    {item.property.locality ?? item.property.cityName}
                  </Fact>
                  <Fact term="Price">Price on request</Fact>
                  <Fact term="Budget fit">
                    {comparison.preferencesApplied ? fitLabel(fit) : "Not applied"}
                  </Fact>
                  <Fact term="Area">
                    {comparableArea && configuration?.areaValue !== null
                      ? `${configuration?.areaValue} ${areaUnit(configuration?.areaUnit)}`
                      : "Not directly comparable"}
                  </Fact>
                  <Fact term="Structured reviews">
                    {item.property.publishedReviewCount
                      ? `${item.property.publishedReviewCount} published`
                      : "No published reviews"}
                  </Fact>
                  <Fact term="Verification">
                    Verified by PropCompare ·{" "}
                    {new Date(item.verificationDate).toLocaleDateString("en-IN")}
                  </Fact>
                </dl>
                {(configuration?.commercialDataStale ?? item.commercialDataStale) && (
                  <p className="mt-5 text-xs text-amber-300">
                    Matching uses older verified commercial information. Request the current price
                    before deciding.
                  </p>
                )}
              </article>
            );
          })}
        </div>
        <LocationDistances
          properties={chosen.map((item) => ({
            slug: item.property.slug,
            name: item.property.name,
          }))}
        />
        {propscoreEnabled && (
          <PropScoreComparison
            properties={chosen.map((item) => ({
              slug: item.property.slug,
              name: item.property.name,
            }))}
          />
        )}
        <div className="mt-10 rounded-2xl border border-border p-5">
          <h2 className="font-display text-xl font-bold">Why some values are not compared</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Areas are compared only when every selected configuration uses the same measurement
            basis and unit. Missing information remains “Not stated” rather than becoming zero or a
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

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="border-t border-border pt-3">
      <dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">{term}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

function fitLabel(fit: string | undefined) {
  if (fit === "within") return "Matches selected budget";
  if (fit === "slightly_above") return "Slightly above selected budget";
  if (fit === "well_above") return "Well above selected budget";
  if (fit === "slightly_below") return "Slightly below selected budget";
  if (fit === "well_below") return "Well below selected budget";
  return "Commercial fit unavailable";
}

function areaUnit(unit: string | null | undefined) {
  if (unit === "sq_ft") return "sq ft";
  if (unit === "sq_m") return "sq m";
  if (unit === "sq_yd") return "sq yd";
  return "";
}
