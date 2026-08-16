import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareText, Star } from "lucide-react";
import { toast } from "sonner";

import {
  getMyDeveloperReviews,
  saveDeveloperReviewResponse,
} from "@/api/functions/engagement.functions";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { EmptyState } from "@/components/portal/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";

export const Route = createFileRoute("/developer/reviews")({ component: DeveloperReviews });

function DeveloperReviews() {
  const client = useQueryClient();
  const save = useServerFn(saveDeveloperReviewResponse);
  const query = useQuery({
    queryKey: ["developer-reviews"],
    queryFn: () => getMyDeveloperReviews(),
  });
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) return;
    setResponses(Object.fromEntries(query.data.map((item) => [item.id, item.responseText ?? ""])));
  }, [query.data]);
  return (
    <DeveloperLayout title="Reviews">
      <PageHeader
        eyebrow="Developer"
        title="Customer reviews"
        description="Post one labelled response to reviews on your properties. Responses are public and cannot include prices, rates or contact details."
      />
      {query.data?.length === 0 && (
        <EmptyState
          icon={MessageSquareText}
          title="No published reviews"
          message="Published reviews on your properties will appear here."
        />
      )}
      <div className="space-y-4">
        {query.data?.map((review) => (
          <article key={review.id} className="rounded-2xl border border-(--rule) bg-card p-5">
            <p className="text-xs tracking-luxury text-muted-foreground uppercase">
              {review.propertyName}
            </p>
            <div className="mt-3 flex justify-between gap-4">
              <p className="font-semibold">{review.publicName}</p>
              <p className="inline-flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-champagne text-champagne" /> {review.rating}/5
              </p>
            </div>
            {review.reviewText && (
              <p className="mt-3 whitespace-pre-wrap text-sm">{review.reviewText}</p>
            )}
            <label htmlFor={`response-${review.id}`} className="mt-5 block text-sm font-medium">
              Developer response
            </label>
            <textarea
              id={`response-${review.id}`}
              maxLength={2000}
              value={responses[review.id] ?? ""}
              onChange={(event) =>
                setResponses((current) => ({ ...current, [review.id]: event.target.value }))
              }
              className="mt-2 min-h-24 w-full rounded-xl border border-(--rule) bg-background p-3 text-sm"
            />
            <button
              type="button"
              disabled={busyId === review.id || !(responses[review.id]?.trim().length ?? 0)}
              onClick={async () => {
                setBusyId(review.id);
                try {
                  await save({
                    data: { reviewId: review.id, responseText: responses[review.id]!.trim() },
                  });
                  await client.invalidateQueries({ queryKey: ["developer-reviews"] });
                  toast.success("Developer response published");
                } catch (cause) {
                  toast.error(
                    cause instanceof Error ? cause.message : "Could not publish response",
                  );
                } finally {
                  setBusyId(null);
                }
              }}
              className="mt-3 h-10 rounded-full bg-champagne px-5 text-sm font-semibold text-lux-black disabled:opacity-40"
            >
              Publish response
            </button>
          </article>
        ))}
      </div>
    </DeveloperLayout>
  );
}
