import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Inbox, MousePointerClick, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PageHeader } from "@/components/portal/PageHeader";
import { StatTile } from "@/components/portal/StatTile";
import { Skeleton } from "@/components/portal/Skeleton";
import { adminMeQueryOptions } from "@/lib/admin.queries";
import { getAdminStats } from "@/lib/customers.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: profile } = useQuery(adminMeQueryOptions());
  const isOwner = profile?.role === "owner";
  const { data: stats, isPending } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => getAdminStats(),
    retry: false,
    enabled: isOwner,
  });

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description={profile?.email ? `Welcome back, ${profile.email}.` : "Welcome back."}
      />

      {isOwner && (
        <>
          {isPending && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-33 rounded-2xl" />
              ))}
            </div>
          )}

          {stats && (
            <>
              {stats.pendingSubmissions > 0 && (
                <Link
                  to="/admin/submissions"
                  className="hover-lift mb-6 flex items-center justify-between gap-4 rounded-2xl border border-champagne/30 bg-champagne/6 px-5 py-4 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-champagne/15 text-champagne">
                      <Inbox className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {stats.pendingSubmissions} submission
                        {stats.pendingSubmissions === 1 ? "" : "s"} awaiting review
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Approve or reject developer changes to keep the site current.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-label text-[11px] font-semibold tracking-luxury text-champagne uppercase">
                    Review <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  icon={Users}
                  label="Customers"
                  value={stats.customers}
                  hint={`${stats.quizCompleted} completed the quiz`}
                  to="/admin/customers"
                />
                <StatTile
                  icon={MousePointerClick}
                  label="Interactions"
                  value={stats.totalInteractions}
                  hint={`${stats.anonymousInteractions} before sign-up`}
                  to="/admin/customers"
                />
                <StatTile
                  icon={Building2}
                  label="Properties"
                  value={stats.properties}
                  hint={`${stats.publishedProperties} live on site`}
                  to="/admin/properties"
                />
                <StatTile
                  icon={Inbox}
                  label="Pending submissions"
                  value={stats.pendingSubmissions}
                  hint="Awaiting your approval"
                  to="/admin/submissions"
                />
              </div>

              {stats.customers === 0 && (
                <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
                  No customers have signed up yet. As soon as someone completes sign-in on the
                  website, they'll appear under Customers with their details, requirements and
                  activity.
                </p>
              )}
            </>
          )}
        </>
      )}

      {!isOwner && (
        <p className="text-sm text-muted-foreground">Use the sidebar to manage properties.</p>
      )}
    </AdminLayout>
  );
}
