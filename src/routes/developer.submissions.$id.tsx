import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { PropertyForm } from "@/components/admin/PropertyForm";
import {
  getMyPendingSubmission,
  updateMyPendingSubmission,
} from "@/api/functions/developer-properties.functions";
import type { PropertyFormValues } from "@/lib/property-schema";

export const Route = createFileRoute("/developer/submissions/$id")({
  component: EditPendingSubmission,
});

function EditPendingSubmission() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const { data, isPending, error } = useQuery({
    queryKey: ["developer", "submission", id],
    queryFn: () => getMyPendingSubmission({ data: { id } }),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (values: PropertyFormValues) =>
      updateMyPendingSubmission({ data: { id, values } }),
    onSuccess: () => {
      toast.success("Submission updated — it's still waiting for your admin to review it.");
      navigate({ to: "/developer" });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });

  return (
    <DeveloperLayout title="Edit Submission">
      <button
        type="button"
        onClick={() => navigate({ to: "/developer" })}
        className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-(--rule-strong) px-4 py-2 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{(error as Error).message}</p>}

      {data && (
        <>
          <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
            This hasn't been reviewed yet, so you can still change anything. Saving replaces what
            your admin will see — it doesn't create a second request.
          </p>
          <PropertyForm
            defaultValues={data}
            submitLabel="Save changes"
            hidePublishToggle
            submitting={saveMutation.isPending}
            onSubmit={(values) => saveMutation.mutate(values)}
          />
        </>
      )}
    </DeveloperLayout>
  );
}
