import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, LockKeyhole } from "lucide-react";

import { getMyDeveloperIntelligenceIndex } from "@/api/functions/developer-intelligence.functions";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { EmptyState } from "@/components/portal/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { Skeleton } from "@/components/portal/Skeleton";

export const Route = createFileRoute("/developer/intelligence/")({
  component: DeveloperIntelligenceIndex,
});

function DeveloperIntelligenceIndex() {
  const query = useQuery({
    queryKey: ["developer", "intelligence"],
    queryFn: () => getMyDeveloperIntelligenceIndex(),
    retry: false,
  });

  return (
    <DeveloperLayout>
      <PageHeader
        eyebrow="Developer intelligence"
        title="What buyers compare"
        description="Anonymous 30-day market signals for your published projects. Small cohorts stay private and are not reported."
        actions={
          <Link
            to="/methodology/developer-intelligence"
            className="text-xs font-semibold text-champagne underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
          >
            Methodology and independence
          </Link>
        }
      />

      {query.isPending && (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-[1.75rem]" />
          <Skeleton className="h-48 rounded-[1.75rem]" />
        </div>
      )}
      {query.error && (
        <EmptyState
          icon={BarChart3}
          title="Intelligence could not load"
          message="The reporting service did not respond. Refresh the page to try again."
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
      {query.data && !query.data.featureEnabled && (
        <UnavailableState
          title="Intelligence is not currently enabled"
          message="The reporting feature is being prepared and no developer data is available yet."
        />
      )}
      {query.data?.featureEnabled && !query.data.entitlement.active && (
        <UnavailableState
          title="Intelligence access is inactive"
          message={
            query.data.entitlement.status === "suspended"
              ? "This account’s intelligence access is suspended. Contact PropCompare to review access."
              : "Ask PropCompare about a time-bound trial or paid intelligence access."
          }
        />
      )}
      {query.data?.featureEnabled &&
        query.data.entitlement.active &&
        query.data.projects.length === 0 && (
          <EmptyState
            icon={BarChart3}
            title="No published projects"
            message="Intelligence appears after your first project is approved and published."
          />
        )}
      {query.data?.featureEnabled &&
        query.data.entitlement.active &&
        query.data.projects.length > 0 && (
          <section
            aria-label="Published projects"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.15fr_0.85fr]"
          >
            {query.data.projects.map((project, index) => (
              <Link
                key={project.id}
                to="/developer/intelligence/$propertyId"
                params={{ propertyId: project.id }}
                className={`group flex min-h-48 flex-col justify-between rounded-[1.75rem] bg-foreground/[0.035] p-6 transition duration-200 hover:-translate-y-0.5 hover:bg-foreground/[0.055] focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none ${index === 0 ? "md:row-span-2 md:min-h-64" : ""}`}
              >
                <div>
                  <p className="text-xs tracking-[0.16em] text-muted-foreground">Rolling 30 days</p>
                  <h2 className="mt-3 max-w-md font-display text-2xl font-semibold tracking-tight text-foreground">
                    {project.name}
                  </h2>
                </div>
                <div className="mt-8 flex items-end justify-between gap-4 border-t border-(--rule) pt-5">
                  <div>
                    <p className="font-display text-4xl leading-none tabular-nums">
                      {project.comparisonVolume ?? "—"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {project.suppressed
                        ? "Below the five-session privacy floor"
                        : "Comparison sessions"}
                    </p>
                  </div>
                  <ArrowRight
                    className="h-5 w-5 text-champagne transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            ))}
          </section>
        )}
    </DeveloperLayout>
  );
}

function UnavailableState({ title, message }: { title: string; message: string }) {
  return <EmptyState icon={LockKeyhole} title={title} message={message} />;
}
