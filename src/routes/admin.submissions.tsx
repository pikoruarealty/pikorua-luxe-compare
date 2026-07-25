import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Inbox, X } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PageHeader } from "@/components/portal/PageHeader";
import { StatusBadge, submissionTone } from "@/components/portal/StatusBadge";
import { EmptyState } from "@/components/portal/EmptyState";
import { Skeleton } from "@/components/portal/Skeleton";
import { TableWrap, Th, Td } from "@/components/portal/Table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { submissionsQueryOptions, SUBMISSIONS_KEY } from "@/lib/submissions.queries";
import {
  getSubmission,
  approveSubmission,
  rejectSubmission,
} from "@/lib/admin-submissions.functions";
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

const reviewBtnClass =
  "rounded-full border border-[var(--rule-strong)] px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none";

type StatusFilter = "pending" | "approved" | "rejected" | "all";
const FILTERS: StatusFilter[] = ["pending", "approved", "rejected", "all"];

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
    <AdminLayout requireOwner>
      <PageHeader
        eyebrow="Review"
        title="Submissions"
        description="Properties developers have added or edited. Nothing reaches the public site until you approve it."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-2 text-xs font-medium tracking-[0.1em] uppercase transition-colors focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none ${
                active
                  ? "bg-champagne text-lux-black"
                  : "border border-[var(--rule-strong)] text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {f}
              {f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          );
        })}
      </div>

      {isPending && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load: {(error as Error).message}
        </p>
      )}

      {!isPending && !error && rows.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="Nothing here"
          message={
            filter === "pending"
              ? "No submissions are awaiting review right now."
              : `No ${filter === "all" ? "" : filter + " "}submissions to show.`
          }
        />
      )}

      {!isPending && !error && rows.length > 0 && (
        <>
          {/* Mobile: card list */}
          <div className="space-y-3 lg:hidden">
            {rows.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-[var(--rule)] bg-card p-4 shadow-[var(--shadow-lift)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{s.propertyName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="capitalize">{s.action}</span> · {s.developerName}
                    </p>
                  </div>
                  <StatusBadge tone={submissionTone(s.status)}>{s.status}</StatusBadge>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--rule)] pt-3">
                  <p className="text-xs text-muted-foreground">
                    {dateFmt.format(new Date(s.createdAt))}
                  </p>
                  <button type="button" onClick={() => setOpenId(s.id)} className={reviewBtnClass}>
                    {s.status === "pending" ? "Review" : "View"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <TableWrap className="hidden lg:block">
            <thead className="bg-muted/40">
              <tr className="border-b border-[var(--rule)]">
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
                <tr
                  key={s.id}
                  className="border-b border-[var(--rule)] transition-colors last:border-0 hover:bg-foreground/2"
                >
                  <Td className="font-medium text-foreground">{s.propertyName}</Td>
                  <Td className="text-muted-foreground capitalize">{s.action}</Td>
                  <Td>
                    <p className="text-foreground">{s.developerName}</p>
                    <p className="text-xs text-muted-foreground">{s.developerEmail}</p>
                  </Td>
                  <Td className="text-muted-foreground">{dateFmt.format(new Date(s.createdAt))}</Td>
                  <Td>
                    <StatusBadge tone={submissionTone(s.status)}>{s.status}</StatusBadge>
                  </Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setOpenId(s.id)}
                      className={reviewBtnClass}
                    >
                      {s.status === "pending" ? "Review" : "View"}
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </>
      )}

      {openId && <SubmissionDetail id={openId} onClose={() => setOpenId(null)} />}
    </AdminLayout>
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

  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-[var(--rule)] px-6 py-4 text-left">
          <DialogTitle className="font-display text-lg font-normal">Review submission</DialogTitle>
          <DialogDescription className="sr-only">
            Read-only view of a developer's property submission with approve and reject actions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isPending && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 rounded" />
              ))}
            </div>
          )}
          {data && <PayloadPreview payload={data.payload} action={data.action} />}
        </div>

        {data?.status === "pending" && (
          <div className="border-t border-[var(--rule)] px-6 py-4">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the developer if rejecting (optional)"
              rows={2}
              className="mb-3 w-full rounded-lg border border-[var(--rule-strong)] bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-champagne focus:ring-2 focus:ring-champagne/30"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => rejectMutation.mutate()}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-[var(--rule-strong)] px-5 py-2.5 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-red-500/50 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" /> Reject
              </button>
              <button
                type="button"
                onClick={() => approveMutation.mutate()}
                disabled={busy}
                className="foil inline-flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" />
                {approveMutation.isPending ? "Approving…" : "Approve & publish"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Plain, read-only walk through the submitted payload — a reviewer isn't
 *  editing here, just confirming what the developer sent before it goes live. */
function PayloadPreview({
  payload,
  action,
}: {
  payload: PropertyFormValues;
  action: "create" | "update";
}) {
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
      <StatusBadge tone={action === "create" ? "positive" : "neutral"}>
        {action === "create" ? "New property" : "Edit to a live property"}
      </StatusBadge>

      <Section title="Basics" rows={basics} />
      <Section title="Project structure" rows={structure} />

      {CONFIG_BUCKETS.map(({ key, label }) => {
        const variants = payload.configs?.[key as keyof typeof payload.configs] ?? [];
        if (!variants.length) return null;
        return (
          <div key={key}>
            <p className="mb-2 font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
              {label}
            </p>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="rounded-lg border border-[var(--rule)] px-3 py-2 text-sm">
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
          <p className="mb-2 font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
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
      <p className="mb-2 font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[var(--rule)] bg-muted/30 p-4">
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
