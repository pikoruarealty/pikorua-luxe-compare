import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { BrochureEnrichPanel } from "@/components/developer/BrochureEnrichPanel";
import {
  getMyPropertyForEdit,
  submitPropertyForReview,
} from "@/api/functions/developer-properties.functions";
import type { PropertyFormValues } from "@/lib/property-schema";

export const Route = createFileRoute("/developer/properties/$id")({
  component: EditDeveloperProperty,
});

function EditDeveloperProperty() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [enriched, setEnriched] = useState<PropertyFormValues | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { data, isPending, error } = useQuery({
    queryKey: ["developer", "property", id],
    queryFn: () => getMyPropertyForEdit({ data: { id } }),
  });

  const submitMutation = useMutation({
    mutationFn: (values: PropertyFormValues) =>
      submitPropertyForReview({ data: { action: "update", propertyId: id, values } }),
    onSuccess: () => {
      toast.success("Edit submitted — your admin will review it before it goes live.");
      navigate({ to: "/developer" });
    },
    onError: (e: Error) => toast.error(e.message || "Could not submit"),
  });

  return (
    <DeveloperLayout title="Edit Property">
      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-red-500">Could not load: {(error as Error).message}</p>}
      {data && (
        <>
          <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
            The live property stays exactly as it is until your admin approves these changes.
          </p>
          <div className="mb-6">
            <BrochureEnrichPanel
              current={enriched ?? data}
              onApply={(merged) => {
                setEnriched(merged);
                setFormKey((k) => k + 1);
              }}
            />
          </div>
          <PropertyForm
            key={formKey}
            defaultValues={enriched ?? data}
            submitLabel="Submit edit for review"
            hidePublishToggle
            submitting={submitMutation.isPending}
            onSubmit={(values) => submitMutation.mutate(values)}
          />
        </>
      )}
    </DeveloperLayout>
  );
}
