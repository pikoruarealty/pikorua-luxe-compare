import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { getModerationQueue, moderateReview } from "@/api/functions/engagement.functions";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { EmptyState } from "@/components/portal/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { Skeleton } from "@/components/portal/Skeleton";

export const Route = createFileRoute("/admin/moderation")({ component: ModerationQueue });

function ModerationQueue() {
  const client = useQueryClient();
  const adjudicate = useServerFn(moderateReview);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["moderation-queue"], queryFn: () => getModerationQueue() });
  return (
    <AdminLayout title="Moderation">
      <PageHeader
        eyebrow="Trust & safety"
        title="Review reports"
        description="Reports remain visible until a reviewer, support agent or owner records a reasoned decision. Reports never auto-hide content."
      />
      {query.isPending && <Skeleton className="h-40 rounded-2xl" />}
      {query.error && <p className="text-sm text-red-500">{query.error.message}</p>}
      {query.data?.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title="Queue is clear"
          message="No open review reports require a decision."
        />
      )}
      <div className="space-y-4">
        {query.data?.map((item) => (
          <article key={item.reportId} className="rounded-2xl border border-(--rule) bg-card p-5">
            <p className="text-xs tracking-luxury text-muted-foreground uppercase">
              {item.propertyName} · report: {item.reasonCode}
            </p>
            <div className="mt-3 flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{item.publicName}</p>
                <p className="mt-1 text-sm">{item.rating}/5</p>
              </div>
              <span className="text-xs capitalize text-muted-foreground">{item.visibility}</span>
            </div>
            {item.reviewText && (
              <p className="mt-4 whitespace-pre-wrap text-sm">{item.reviewText}</p>
            )}
            <label className="mt-5 block text-sm font-medium" htmlFor={`reason-${item.reportId}`}>
              Decision reason
            </label>
            <textarea
              id={`reason-${item.reportId}`}
              value={reasons[item.reportId] ?? ""}
              onChange={(event) =>
                setReasons((current) => ({ ...current, [item.reportId]: event.target.value }))
              }
              className="mt-2 min-h-20 w-full rounded-xl border border-(--rule) bg-background p-3 text-sm"
            />
            <div className="mt-3 flex gap-2">
              {(["hide", "restore"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={
                    busyId === item.reviewId || (reasons[item.reportId]?.trim().length ?? 0) < 3
                  }
                  onClick={async () => {
                    setBusyId(item.reviewId);
                    try {
                      await adjudicate({
                        data: {
                          reviewId: item.reviewId,
                          action,
                          reason: reasons[item.reportId]!.trim(),
                        },
                      });
                      await client.invalidateQueries({ queryKey: ["moderation-queue"] });
                      toast.success(`Review ${action === "hide" ? "hidden" : "restored"}`);
                    } catch (cause) {
                      toast.error(cause instanceof Error ? cause.message : "Decision failed");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className={`h-10 rounded-full px-5 text-sm font-semibold capitalize disabled:opacity-40 ${action === "hide" ? "bg-red-600 text-white" : "border border-(--rule)"}`}
                >
                  {action}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </AdminLayout>
  );
}
