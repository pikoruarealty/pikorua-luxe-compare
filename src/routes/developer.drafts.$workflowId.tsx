import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { ExtractedFieldsReview } from "@/components/developer/ExtractedFieldsReview";
import { PropertyForm } from "@/components/admin/PropertyForm";
import {
  getMyDraftForReview,
  submitMyDraftSubmission,
} from "@/api/functions/developer-properties.functions";
import { getBrochureExtraction } from "@/api/functions/brochure-extract.functions";
import { mapExtractedPayload } from "@/lib/brochure-field-mapping";
import type { PropertyFormValues } from "@/lib/property-schema";

function normalizeUnavailableBrochureValues<T>(value: T): T {
  if (typeof value === "string") {
    return (
      /^(?:n\/?a|not\s+(?:stated|mentioned|specified|available)(?:\s+in\s+(?:the\s+)?(?:brochure|document))?)$/i.test(
        value.trim(),
      )
        ? ""
        : value
    ) as T;
  }
  if (Array.isArray(value)) return value.map(normalizeUnavailableBrochureValues) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeUnavailableBrochureValues(item),
      ]),
    ) as T;
  }
  return value;
}

export const Route = createFileRoute("/developer/drafts/$workflowId")({
  component: ReviewDraftSubmission,
});

function ReviewDraftSubmission() {
  const { workflowId } = Route.useParams();
  const navigate = useNavigate();
  const [reviewedValues, setReviewedValues] = useState<PropertyFormValues | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: ["developer", "draft", workflowId],
    queryFn: () => getMyDraftForReview({ data: { workflowId } }),
  });
  const evidence = useQuery({
    queryKey: ["developer", "draft-evidence", workflowId, data?.brochureJobId],
    queryFn: () => getBrochureExtraction({ data: { jobId: data!.brochureJobId! } }),
    enabled: Boolean(data?.brochureJobId),
  });

  const submitMutation = useMutation({
    mutationFn: (values: PropertyFormValues) =>
      submitMyDraftSubmission({ data: { workflowId, values } }),
    onSuccess: () => {
      toast.success("Submitted — your admin will review it before it goes live.");
      navigate({ to: "/developer" });
    },
    onError: (e: Error) => toast.error(e.message || "Could not submit"),
  });

  return (
    <DeveloperLayout title="Review draft">
      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-red-500">Could not load: {(error as Error).message}</p>}
      {data && (
        <>
          {data.brochureJobId && !reviewedValues ? (
            evidence.isPending ? (
              <p className="text-sm text-muted-foreground">Loading brochure evidence…</p>
            ) : evidence.error ? (
              <p className="max-w-2xl text-sm text-red-500">
                Brochure evidence could not be loaded: {(evidence.error as Error).message}
              </p>
            ) : evidence.data ? (
              <ExtractedFieldsReview
                response={evidence.data}
                onCancel={() => navigate({ to: "/developer" })}
                onContinue={(partial, selection, overrides) => {
                  const {
                    workflowId: _workflowId,
                    action: _action,
                    brochureJobId: _brochureJobId,
                    ...form
                  } = data;
                  setReviewedValues({
                    ...normalizeUnavailableBrochureValues(form),
                    ...mapExtractedPayload(evidence.data.extraction, overrides, selection),
                    ...partial,
                  });
                }}
              />
            ) : null
          ) : (
            <>
              <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
                {data.action === "create"
                  ? "Check the final details before submitting. Fields kept as N/A are omitted from customer details."
                  : "Check the final details before submitting. The live property stays exactly as it is until your admin approves it."}
              </p>
              <PropertyForm
                defaultValues={
                  reviewedValues ??
                  normalizeUnavailableBrochureValues(
                    (({
                      workflowId: _workflowId,
                      action: _action,
                      brochureJobId: _brochureJobId,
                      ...form
                    }) => form)(data),
                  )
                }
                submitLabel="Submit for owner approval"
                hidePublishToggle
                submitting={submitMutation.isPending}
                onSubmit={(values) => submitMutation.mutate(values)}
              />
            </>
          )}
        </>
      )}
    </DeveloperLayout>
  );
}
