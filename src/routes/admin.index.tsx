import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
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
    <AdminLayout title="Dashboard">
      <p className="mb-8 text-sm text-muted-foreground">
        Welcome back{profile?.email ? `, ${profile.email}` : ""}.
      </p>

      {isOwner && (
        <>
          {isPending && <p className="text-sm text-muted-foreground">Loading figures…</p>}
          {stats && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Customers"
                  value={stats.customers}
                  hint={`${stats.quizCompleted} completed the quiz`}
                  to="/admin/customers"
                />
                <StatCard
                  label="Interactions"
                  value={stats.totalInteractions}
                  hint={`${stats.anonymousInteractions} before sign-up`}
                  to="/admin/customers"
                />
                <StatCard
                  label="Properties"
                  value={stats.properties}
                  hint={`${stats.publishedProperties} live on site`}
                  to="/admin/properties"
                />
                <StatCard
                  label="Pending submissions"
                  value={stats.pendingSubmissions}
                  hint="Awaiting your approval"
                  to="/admin/submissions"
                />
              </div>

              {stats.customers === 0 && (
                <p className="mt-8 text-sm text-muted-foreground">
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

function StatCard({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: number;
  hint: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-champagne/50"
    >
      <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}
