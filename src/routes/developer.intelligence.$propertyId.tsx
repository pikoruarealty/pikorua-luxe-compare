import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, MessageSquareText, UsersRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { getMyDeveloperProjectIntelligence } from "@/api/functions/developer-intelligence.functions";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { EmptyState } from "@/components/portal/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { Skeleton } from "@/components/portal/Skeleton";
import { INTELLIGENCE_REASON_LABELS } from "@/domain/developer-intelligence";
import { REVIEW_DIMENSION_LABELS } from "@/domain/structured-reviews";

export const Route = createFileRoute("/developer/intelligence/$propertyId")({
  component: DeveloperProjectIntelligence,
});

const chartTooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--rule)",
  borderRadius: "0.75rem",
  color: "var(--foreground)",
  fontSize: "0.75rem",
};

function DeveloperProjectIntelligence() {
  const { propertyId } = Route.useParams();
  const query = useQuery({
    queryKey: ["developer", "intelligence", propertyId],
    queryFn: () => getMyDeveloperProjectIntelligence({ data: { propertyId } }),
    retry: false,
  });

  return (
    <DeveloperLayout>
      <Link
        to="/developer/intelligence"
        className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All projects
      </Link>
      {query.isPending && <DashboardSkeleton />}
      {query.error && (
        <EmptyState
          icon={BarChart3}
          title="Project intelligence could not load"
          message={query.error.message || "The reporting service did not respond."}
          action={
            <button
              type="button"
              onClick={() => query.refetch()}
              className="text-sm font-semibold text-champagne hover:underline"
            >
              Retry
            </button>
          }
        />
      )}
      {query.data && <IntelligenceDashboard data={query.data} />}
    </DeveloperLayout>
  );
}

function IntelligenceDashboard({
  data,
}: {
  data: Awaited<ReturnType<typeof getMyDeveloperProjectIntelligence>>;
}) {
  const { behaviour } = data;
  const sentiment = data.sentiment
    .filter((item) => !item.suppressed && item.average !== null)
    .map((item) => ({
      name: REVIEW_DIMENSION_LABELS[item.dimension],
      score: item.average,
      reviews: item.reviewCount,
    }));
  const current = behaviour.comparisonVolume.current;
  const trend = behaviour.comparisonVolume.trend;

  return (
    <>
      <PageHeader
        eyebrow="Developer intelligence · rolling 30 days"
        title={data.project.name}
        description="Aggregate comparison behaviour and published structured reviews. Generated signals are directional research, not verified sales outcomes."
      />
      {behaviour.comparisonVolume.suppressed ? (
        <EmptyState
          icon={UsersRound}
          title="Collecting a private cohort"
          message="Insights appear after at least five unique comparison sessions. Until then, no breakdown is reported."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
          <div className="space-y-5">
            <section
              className="rounded-[1.75rem] bg-foreground/[0.035] p-6 sm:p-8"
              aria-labelledby="volume-title"
            >
              <p id="volume-title" className="text-xs tracking-[0.16em] text-muted-foreground">
                Comparison volume
              </p>
              <div className="mt-7 flex flex-wrap items-end justify-between gap-6">
                <p className="font-display text-6xl leading-none tracking-tight tabular-nums sm:text-7xl">
                  {current}
                </p>
                <div className="max-w-xs text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {trend === "new"
                      ? "New this period"
                      : trend === null
                        ? "No comparable prior cohort"
                        : `${trend > 0 ? "+" : ""}${trend}% vs prior 30 days`}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Repeated opens of the same comparison by one actor on one day count once.
                  </p>
                </div>
              </div>
            </section>

            <ChartSection
              title="Most compared alongside"
              description="Published projects appearing in at least five of the same comparison sessions."
            >
              {behaviour.competitors.length ? (
                <div className="space-y-4">
                  {behaviour.competitors.map((competitor) => (
                    <div
                      key={competitor.slug}
                      className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_2fr_auto] sm:items-center"
                    >
                      <p className="truncate text-sm font-medium">{competitor.name}</p>
                      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className="h-full rounded-full bg-champagne"
                          style={{ width: `${competitor.sharePercent}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {competitor.sessions} · {competitor.sharePercent}%
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <QuietEmpty text="No competing project has reached the five-session reporting floor." />
              )}
            </ChartSection>

            <div className="grid gap-5 lg:grid-cols-2">
              <ReasonSection title="Why buyers chose this" rows={behaviour.chosenReasons} />
              <ReasonSection title="What led buyers elsewhere" rows={behaviour.rejectedReasons} />
            </div>
          </div>

          <aside className="space-y-5">
            <ChartSection
              title="Feedback coverage"
              description="Optional answers submitted from the comparison page."
            >
              <p className="font-display text-4xl tabular-nums">
                {behaviour.feedbackResponseRatePercent ?? 0}%
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {behaviour.feedbackResponses} privacy-qualified responses
              </p>
            </ChartSection>
            <BandSection band={behaviour.bandPositioning} />
            <ChartSection
              title="Structured sentiment"
              description="Published, experienced review dimensions only."
            >
              {sentiment.length ? (
                <div
                  className="h-80"
                  role="img"
                  aria-label="Average structured review ratings by dimension"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sentiment} layout="vertical" margin={{ left: 8, right: 12 }}>
                      <CartesianGrid horizontal={false} stroke="var(--rule)" />
                      <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={105} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Bar dataKey="score" fill="var(--champagne-gold)" radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <QuietEmpty text="No review dimension has five published responses in this period." />
              )}
            </ChartSection>
          </aside>
        </div>
      )}
      <aside className="mt-6 border-l-2 border-champagne/50 py-2 pl-5 text-sm leading-6 text-muted-foreground">
        Paying for intelligence never changes PropScore, recommendations, verification, moderation,
        or catalogue order.{" "}
        <Link to="/methodology/developer-intelligence" className="text-champagne hover:underline">
          Read the permanent policy.
        </Link>
      </aside>
    </>
  );
}

function ChartSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] bg-foreground/[0.035] p-6">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ReasonSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    code: keyof typeof INTELLIGENCE_REASON_LABELS;
    responses: number;
    sharePercent: number;
  }>;
}) {
  return (
    <ChartSection
      title={title}
      description="Explicit buyer feedback; no reason is inferred from browsing."
    >
      {rows.length ? (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.code}>
              <div className="flex justify-between gap-3 text-xs">
                <span>{INTELLIGENCE_REASON_LABELS[row.code]}</span>
                <span className="text-muted-foreground tabular-nums">{row.sharePercent}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-champagne"
                  style={{ width: `${row.sharePercent}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <QuietEmpty text="No reason has reached five responses." />
      )}
    </ChartSection>
  );
}

function BandSection({
  band,
}: {
  band: Awaited<
    ReturnType<typeof getMyDeveloperProjectIntelligence>
  >["behaviour"]["bandPositioning"];
}) {
  if (band.suppressed)
    return (
      <ChartSection
        title="Buyer-band positioning"
        description="Project band compared with stated buyer preferences."
      >
        <QuietEmpty text="Fewer than five sessions include a usable budget band." />
      </ChartSection>
    );
  const total = band.knownSessions || 1;
  const segments = [
    { label: "Below buyer band", value: band.below },
    { label: "Aligned", value: band.aligned },
    { label: "Above buyer band", value: band.above },
  ];
  return (
    <ChartSection
      title="Buyer-band positioning"
      description={`${band.coveragePercent}% of comparison sessions include a stated buyer budget band.`}
    >
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {segments.map((segment, index) => (
          <div
            key={segment.label}
            className={
              index === 1 ? "bg-champagne" : index === 0 ? "bg-champagne/45" : "bg-foreground/25"
            }
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-5 space-y-2 text-xs">
        {segments.map((segment) => (
          <li key={segment.label} className="flex justify-between">
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="tabular-nums">{segment.value}</span>
          </li>
        ))}
      </ul>
    </ChartSection>
  );
}

function QuietEmpty({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-background/50 p-4 text-xs leading-5 text-muted-foreground">
      {text}
    </p>
  );
}
function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Skeleton className="h-96 rounded-[1.75rem]" />
        <Skeleton className="h-96 rounded-[1.75rem]" />
      </div>
    </div>
  );
}
