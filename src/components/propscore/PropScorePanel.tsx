import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, MapPin, ShieldCheck } from "lucide-react";

import { getGatedPropScore } from "@/api/functions/propscore.functions";
import type { GatedPropScorePayload } from "@/contracts/consumer";

export function PropScorePanel({ slug }: { slug: string }) {
  const query = useQuery({
    queryKey: ["propscore", slug],
    queryFn: () => getGatedPropScore({ data: { slug } }),
    staleTime: 60_000,
    retry: false,
  });
  if (query.isPending) return <ScoreSkeleton />;
  if (!query.data) return <PendingScore />;
  return <ScoreCard score={query.data} />;
}

export function PropScoreComparison({
  properties,
}: {
  properties: Array<{ slug: string; name: string }>;
}) {
  const queries = useQueries({
    queries: properties.map((property) => ({
      queryKey: ["propscore", property.slug],
      queryFn: () => getGatedPropScore({ data: { slug: property.slug } }),
      staleTime: 60_000,
      retry: false,
    })),
  });
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-champagne uppercase">PropScore</p>
          <h2 className="mt-2 font-display text-3xl font-bold">Source-backed score breakdown</h2>
        </div>
        <MethodologyLink />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {properties.map((property, index) => (
          <div key={property.slug}>
            <h3 className="mb-3 truncate text-sm font-semibold">{property.name}</h3>
            {queries[index].isPending ? (
              <ScoreSkeleton />
            ) : queries[index].data ? (
              <ScoreCard score={queries[index].data} compact />
            ) : (
              <PendingScore />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ScoreCard({
  score,
  compact = false,
}: {
  score: GatedPropScorePayload;
  compact?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Overall</p>
          {score.composite === null ? (
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Overall PropScore pending sufficient verified evidence.
            </p>
          ) : (
            <p className="mt-1 font-display text-5xl font-extrabold">
              {score.composite}
              <span className="text-lg text-muted-foreground">/100</span>
            </p>
          )}
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          {score.coveragePercent}% covered
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {score.dimensions.map((dimension) => (
          <details key={dimension.key} className="rounded-xl border border-border p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold capitalize">
              <span>{dimension.key === "privacy" ? "Privacy / Density" : dimension.key}</span>
              <span>{dimension.score === null ? "Pending" : `${dimension.score}/100`}</span>
            </summary>
            <div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              {dimension.why.length ? (
                dimension.why.map((reason) => (
                  <p key={`${reason.label}-${reason.evidenceAsOf}`}>
                    {reason.explanation}{" "}
                    <span>Evidence checked {formatDate(reason.evidenceAsOf)}.</span>
                  </p>
                ))
              ) : (
                <p>Not enough verified evidence to score this dimension.</p>
              )}
            </div>
          </details>
        ))}
      </div>
      {!compact && <ReraAndConnectivity score={score} />}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
        <span>Method {score.methodologyVersion}</span>
        <MethodologyLink />
      </div>
    </section>
  );
}

function ReraAndConnectivity({ score }: { score: GatedPropScorePayload }) {
  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {score.reraCrossCheck.status === "matched" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-300" />
          )}
          RERA cross-check
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {score.reraCrossCheck.status.replaceAll("_", " ")}
          {score.reraCrossCheck.checkedAt
            ? ` · checked ${formatDate(score.reraCrossCheck.checkedAt)}`
            : ""}
        </p>
        {score.reraCrossCheck.areaDiscrepancies.map((difference) => (
          <p
            key={difference.configurationLabel}
            className="mt-2 text-xs leading-5 text-muted-foreground"
          >
            {difference.configurationLabel}: brochure says {difference.brochureValue}; RERA says{" "}
            {difference.reraValue} ({difference.differencePercent.toFixed(1)}% difference).
          </p>
        ))}
      </div>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-champagne" /> Connectivity
        </h3>
        {score.connectivity.length ? (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {score.connectivity.map((item) => (
              <li key={`${item.category}-${item.landmark}`}>
                {item.landmark}:{" "}
                {item.distanceKm === null
                  ? "Unavailable"
                  : `${item.distanceKm} km · ${item.durationMinutes} min drive`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Verified connectivity snapshot pending.
          </p>
        )}
      </div>
    </div>
  );
}

function PendingScore() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <ShieldCheck className="h-5 w-5 text-champagne" />
      <p className="mt-3 text-sm font-semibold">PropScore pending</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        No overall score is published until all five dimensions have sufficient verified evidence.
      </p>
      <div className="mt-4">
        <MethodologyLink />
      </div>
    </div>
  );
}

function ScoreSkeleton() {
  return (
    <div
      className="h-52 animate-pulse rounded-2xl border border-border bg-card"
      aria-label="Loading PropScore"
    />
  );
}

function MethodologyLink() {
  return (
    <Link to="/methodology/propscore" className="text-xs text-champagne hover:underline">
      Read the methodology
    </Link>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN");
}
