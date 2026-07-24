import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { getMyDeveloperDashboard } from "@/lib/developer-properties.functions";

export const Route = createFileRoute("/developer/")({
  component: DeveloperDashboard,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function DeveloperDashboard() {
  const { data, isPending, error } = useQuery({
    queryKey: ["developer", "dashboard"],
    queryFn: () => getMyDeveloperDashboard(),
  });

  return (
    <DeveloperLayout title="My Properties">
      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-red-500">Could not load: {(error as Error).message}</p>}

      {data && (
        <div className="space-y-10">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg text-foreground">Live on the site</h2>
              <Link
                to="/developer/properties/new"
                className="inline-flex items-center gap-2 rounded-full bg-champagne px-4 py-2 text-xs font-medium tracking-[0.12em] text-lux-black uppercase transition-opacity hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Add property
              </Link>
            </div>
            {data.properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing here yet — add your first property to get started.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {data.properties.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.location}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {p.hasPendingUpdate && (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                          Edit pending review
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] uppercase ${
                          p.isPublished ? "bg-champagne/15 text-champagne" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.isPublished ? "Live" : "Hidden"}
                      </span>
                      <Link
                        to="/developer/properties/$id"
                        params={{ id: p.id }}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                        title="Edit"
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
            <h2 className="mb-3 font-display text-lg text-foreground">Submission history</h2>
            {data.submissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {data.submissions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
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
                    <StatusBadge status={s.status} />
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

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const styles = {
    pending: "bg-muted text-muted-foreground",
    approved: "bg-champagne/15 text-champagne",
    rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
  }[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase ${styles}`}
    >
      {status}
    </span>
  );
}
