import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, History, Pencil, Plus } from "lucide-react";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { PageHeader } from "@/components/portal/PageHeader";
import { EmptyState } from "@/components/portal/EmptyState";
import { Skeleton } from "@/components/portal/Skeleton";
import { StatusBadge, submissionTone } from "@/components/portal/StatusBadge";
import { getMyDeveloperDashboard } from "@/api/functions/developer-properties.functions";

export const Route = createFileRoute("/developer/")({
  component: DeveloperDashboard,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function DeveloperDashboard() {
  const { data, isPending, error } = useQuery({
    queryKey: ["developer", "dashboard"],
    queryFn: () => getMyDeveloperDashboard(),
  });

  return (
    <DeveloperLayout>
      <PageHeader
        eyebrow="Developer"
        title="My Properties"
        description="Your listings on PropCompare and the status of every change you've submitted."
        actions={
          <Link
            to="/developer/properties/new"
            className="foil inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase"
          >
            <Plus className="h-3.5 w-3.5" /> Add property
          </Link>
        }
      />

      {isPending && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load: {(error as Error).message}
        </p>
      )}

      {data && (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 font-label text-[11px] font-semibold tracking-luxury text-muted-foreground uppercase">
              Live on the site
            </h2>
            {data.properties.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No properties yet"
                message="Add your first property to get it in front of buyers on PropCompare."
                action={
                  <Link
                    to="/developer/properties/new"
                    className="foil inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add property
                  </Link>
                }
              />
            ) : (
              <div className="divide-y divide-(--rule) overflow-hidden rounded-2xl border border-(--rule) bg-card shadow-(--shadow-lift)">
                {data.properties.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-foreground/2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.location}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                      {p.hasPendingUpdate && (
                        <StatusBadge tone="warning">Edit in review</StatusBadge>
                      )}
                      <StatusBadge tone={p.isPublished ? "positive" : "neutral"}>
                        {p.isPublished ? "Live" : "Hidden"}
                      </StatusBadge>
                      <Link
                        to="/developer/properties/$id"
                        params={{ id: p.id }}
                        className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
                        title="Edit"
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-label text-[11px] font-semibold tracking-luxury text-muted-foreground uppercase">
              Submission history
            </h2>
            {data.submissions.length === 0 ? (
              <EmptyState
                icon={History}
                title="No submissions yet"
                message="Changes you submit for review will show up here with their status."
              />
            ) : (
              <div className="divide-y divide-(--rule) overflow-hidden rounded-2xl border border-(--rule) bg-card shadow-(--shadow-lift)">
                {data.submissions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{s.propertyName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.action === "create" ? "New property" : "Edit"} · submitted{" "}
                        {dateFmt.format(new Date(s.createdAt))}
                      </p>
                      {s.status === "rejected" && s.reviewerNote && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {s.reviewerNote}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge tone={submissionTone(s.status)}>{s.status}</StatusBadge>
                      {/* Only while it's still pending — once reviewed, the
                          submission is a record of what was decided. */}
                      {s.status === "pending" && (
                        <Link
                          to="/developer/submissions/$id"
                          params={{ id: s.id }}
                          title="Edit this submission"
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </DeveloperLayout>
  );
}
