import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BrochureEnrichPanel } from "@/components/developer/BrochureEnrichPanel";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PropertyForm } from "@/components/admin/PropertyForm";
import {
  getV2PropertyForEdit,
  updateV2Property,
} from "@/api/functions/property-v2-admin.functions";
import { PROPERTIES_KEY } from "@/api/queries/properties.queries";
import type { PropertyFormValues } from "@/lib/property-schema";

export const Route = createFileRoute("/admin/properties/$propertyId")({
  component: EditProperty,
});

function EditProperty() {
  const { propertyId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [enriched, setEnriched] = useState<PropertyFormValues | null>(null);
  const [enrichedJobId, setEnrichedJobId] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);

  const {
    data: property,
    isPending,
    error,
  } = useQuery({
    queryKey: ["admin", "property", propertyId],
    queryFn: () => getV2PropertyForEdit({ data: { id: propertyId } }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (values: PropertyFormValues) =>
      updateV2Property({ data: { id: propertyId, jobId: enrichedJobId, values } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "properties"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "property", propertyId] });
      await queryClient.invalidateQueries({ queryKey: PROPERTIES_KEY });
      await router.invalidate();
      toast.success("Changes saved and live on the site");
      navigate({ to: "/admin/properties" });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save changes"),
  });

  return (
    <AdminLayout title={property ? `Edit — ${property.name}` : "Edit property"} requireOwner>
      <Link
        to="/admin/properties"
        className="mb-6 inline-flex items-center gap-2 text-xs tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to properties
      </Link>

      {isPending && <p className="text-sm text-muted-foreground">Loading property…</p>}
      {error && <p className="text-sm text-red-500">{(error as Error).message}</p>}

      {property && (
        <>
          <div className="mb-6">
            <BrochureEnrichPanel
              current={enriched ?? property}
              onApply={(merged, jobId) => {
                setEnriched(merged);
                setEnrichedJobId(jobId);
                // PropertyForm owns its react-hook-form state, so remount it to
                // pick up the merged values as fresh defaults.
                setFormKey((k) => k + 1);
              }}
            />
          </div>
          <PropertyForm
            key={formKey}
            defaultValues={enriched ?? property}
            submitLabel="Save changes"
            submitting={mutation.isPending}
            onSubmit={(values) => mutation.mutate(values)}
          />
        </>
      )}
    </AdminLayout>
  );
}
