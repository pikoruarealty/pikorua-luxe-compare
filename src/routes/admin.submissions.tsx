import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { submissionsQueryOptions, SUBMISSIONS_KEY } from "@/lib/submissions.queries";
import { getSubmission, approveSubmission, rejectSubmission } from "@/lib/admin-submissions.functions";
import { PROPERTIES_KEY } from "@/lib/properties.queries";
import type { PropertyFormValues } from "@/lib/property-schema";
import { CONFIG_BUCKETS } from "@/lib/property-schema";

export const Route = createFileRoute("/admin/submissions")({
  component: AdminSubmissions,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function AdminSubmissions() {
  const { data: submissions, isPending, error } = useQuery(submissionsQueryOptions());
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = submissions ?? [];
    return filter === "all" ? list : list.filter((s) => s.status === filter);
  }, [submissions, filter]);

  const pendingCount = (submissions ?? []).filter((s) => s.status === "pending").length;

  return (
    <AdminLayout title="Submissions" requireOwner>
      <p className="mb-6 text-sm text-muted-foreground">
        Properties developers have added or edited. Nothing here reaches the public site until you
        approve it.
      </p>

      <div className="mb-4 flex gap-2">
        {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-2 text-xs font-medium tracking-[0.1em] uppercase transition-colors ${
              filter === f
                ? "bg-champagne text-lux-black"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
            {f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading submissions…</p>}
      {error && <p className="text-sm text-red-500">Could not load: {(error as Error).message}</p>}

      {!isPending && !error && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-card text-left">
              <tr className="border-b border-border">
                <Th>Property</Th>
                <Th>Action</Th>
                <Th>Developer</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
                <Th className="text-right">Review</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{s.propertyName}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{s.action}</td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">{s.developerName}</p>
                    <p className="text-xs text-muted-foreground">{s.developerEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dateFmt.format(new Date(s.createdAt))}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setOpenId(s.id)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/30"
                    >
                      {s.status === "pending" ? "Review" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {openId && <SubmissionDetail id={openId} onClose={() => setOpenId(null)} />}
    </AdminLayout>
  );
}

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const styles = {
    pending: "bg-muted text-muted-foreground",
    approved: "bg-champagne/15 text-champagne",
    rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
  }[status];
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase ${styles}`}>
      {status}
    </span>
  );
}

function SubmissionDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isPending } = useQuery({
    queryKey: ["admin", "submissions", id],
    queryFn: () => getSubmission({ data: { id } }),
  });
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY });
    await queryClient.invalidateQueries({ queryKey: PROPERTIES_KEY });
  };

  const approveMutation = useMutation({
    mutationFn: () => approveSubmission({ data: { id } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Approved — now live on the site");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not approve"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectSubmission({ data: { id, note } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Rejected");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not reject"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-lg text-foreground">Review submission</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
          {data && <PayloadPreview payload={data.payload} action={data.action} />}
        </div>

        {data?.status === "pending" && (
          <div className="border-t border-border px-6 py-4">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the developer if rejecting (optional)"
              rows={2}
              className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-champagne"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || approveMutation.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-foreground uppercase transition-colors hover:border-red-500/50 hover:text-red-500 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" /> Reject
              </button>
              <button
                type="button"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-champagne px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-lux-black uppercase transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" />
                {approveMutation.isPending ? "Approving…" : "Approve & publish"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Plain, read-only walk through the submitted payload — a reviewer isn't
 *  editing here, just confirming what the developer sent before it goes live. */
function PayloadPreview({ payload, action }: { payload: PropertyFormValues; action: "create" | "update" }) {
  const basics: [string, string | undefined][] = [
    ["Name", payload.name],
    ["Developer", payload.developer],
    ["Category", payload.category],
    ["Status", payload.status],
    ["Possession", payload.possession],
    ["Location", payload.location],
    ["City / State", [payload.city, payload.state].filter(Boolean).join(", ")],
    ["Tagline", payload.tagline],
    ["RERA ID", payload.reraId],
    ["RERA link", payload.reraUrl],
  ];
  const structure: [string, string | undefined][] = [
    ["Plot size", payload.plotSize],
    ["Total towers", payload.totalTowers],
    ["Total floors", payload.totalFloors],
    ["Units per floor", payload.unitsPerFloor],
    ["Total units", payload.totalUnits],
    ["Available BHK types", payload.availableBhkTypes],
  ];

  return (
    <div className="space-y-6">
      <span className="inline-block rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {action === "create" ? "New property" : "Edit to a live property"}
      </span>

      <Section title="Basics" rows={basics} />
      <Section title="Project structure" rows={structure} />

      {CONFIG_BUCKETS.map(({ key, label }) => {
        const variants = payload.configs?.[key as keyof typeof payload.configs] ?? [];
        if (!variants.length) return null;
        return (
          <div key={key}>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              {label}
            </p>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
                  {v.type && <span className="mr-2 font-medium text-foreground">{v.type}</span>}
                  <span className="text-muted-foreground">
                    {[v.area && `${v.area} sq ft`, v.price].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {payload.amenities?.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Amenities
          </p>
          <p className="text-sm text-foreground">{payload.amenities.join(" · ")}</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: [string, string | undefined][] }) {
  const filled = rows.filter(([, v]) => v);
  if (filled.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {filled.map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-sm text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}
