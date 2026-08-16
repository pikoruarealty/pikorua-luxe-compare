import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Inbox } from "lucide-react";
import { toast } from "sonner";

import {
  getMyDeveloperEnquiries,
  setMyDeveloperEnquiryStatus,
} from "@/api/functions/engagement.functions";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { EmptyState } from "@/components/portal/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { Skeleton } from "@/components/portal/Skeleton";

export const Route = createFileRoute("/developer/enquiries")({
  component: DeveloperEnquiries,
});

function DeveloperEnquiries() {
  const client = useQueryClient();
  const updateStatus = useServerFn(setMyDeveloperEnquiryStatus);
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["developer-enquiries"],
    queryFn: () => getMyDeveloperEnquiries(),
  });
  return (
    <DeveloperLayout title="Enquiries">
      <PageHeader
        eyebrow="Developer"
        title="Price enquiries"
        description="Verified-phone enquiries for your own published properties. No customer budget or activity history is shared here."
      />
      {query.isPending && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-2xl" />
          ))}
        </div>
      )}
      {query.error && <p className="text-sm text-red-500">{query.error.message}</p>}
      {query.data?.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="No enquiries yet"
          message="New consented enquiries will appear here without email or SMS notifications."
        />
      )}
      <div className="space-y-4">
        {query.data?.map((enquiry) => (
          <article key={enquiry.id} className="rounded-2xl border border-(--rule) bg-card p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs tracking-luxury text-muted-foreground uppercase">
                  {enquiry.propertyName}
                </p>
                <h2 className="mt-2 font-display text-xl font-bold">
                  {enquiry.contactName ?? "Account deleted"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {enquiry.contactPhone ?? "Contact details removed"}
                </p>
              </div>
              <select
                aria-label={`Status for enquiry from ${enquiry.contactName ?? "former user"}`}
                value={enquiry.status}
                disabled={busyId === enquiry.id}
                onChange={async (event) => {
                  const status = event.target.value as "new" | "viewed" | "contacted" | "closed";
                  setBusyId(enquiry.id);
                  try {
                    await updateStatus({ data: { enquiryId: enquiry.id, status } });
                    await client.invalidateQueries({ queryKey: ["developer-enquiries"] });
                  } catch (cause) {
                    toast.error(cause instanceof Error ? cause.message : "Could not update status");
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="h-10 rounded-xl border border-(--rule) bg-background px-3 text-sm capitalize"
              >
                <option value="new">New</option>
                <option value="viewed">Viewed</option>
                <option value="contacted">Contacted</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            {enquiry.message && (
              <p className="mt-4 whitespace-pre-wrap text-sm">{enquiry.message}</p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Consented enquiry · {new Date(enquiry.createdAt).toLocaleString("en-IN")}
            </p>
          </article>
        ))}
      </div>
    </DeveloperLayout>
  );
}
