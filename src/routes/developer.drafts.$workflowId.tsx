import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { PropertyForm } from "@/components/admin/PropertyForm";
import {
  getMyDraftForReview,
  submitMyDraftSubmission,
} from "@/api/functions/developer-properties.functions";
import type { PropertyFormValues } from "@/lib/property-schema";

export const Route = createFileRoute("/developer/drafts/$workflowId")({
  component: ReviewDraftSubmission,
});

function ReviewDraftSubmission() {
  const { workflowId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isPending, error } = useQuery({
    queryKey: ["developer", "draft", workflowId],
    queryFn: () => getMyDraftForReview({ data: { workflowId } }),
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
          <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
            {data.action === "create"
              ? "This property was queued for you to check before it's submitted for review. Nothing goes live until your admin approves it."
              : "This edit was queued for you to check before it's submitted for review. The live property stays exactly as it is until your admin approves it."}
          </p>
          <PropertyForm
            defaultValues={data}
            submitLabel="Submit for review"
            hidePublishToggle
            submitting={submitMutation.isPending}
            onSubmit={(values) => submitMutation.mutate(values)}
          />
        </>
      )}
    </DeveloperLayout>
  );
}
