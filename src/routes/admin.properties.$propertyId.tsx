import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { getPropertyForEdit, updateProperty } from "@/lib/property-crud.functions";
import { PROPERTIES_KEY } from "@/lib/properties.queries";
import type { PropertyFormValues } from "@/lib/property-schema";

export const Route = createFileRoute("/admin/properties/$propertyId")({
  component: EditProperty,
});

function EditProperty() {
  const { propertyId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: property,
    isPending,
    error,
  } = useQuery({
    queryKey: ["admin", "property", propertyId],
    queryFn: () => getPropertyForEdit({ data: { id: propertyId } }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (values: PropertyFormValues) =>
      updateProperty({ data: { id: propertyId, values } }),
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
        <PropertyForm
          defaultValues={property}
          submitLabel="Save changes"
          submitting={mutation.isPending}
          onSubmit={(values) => mutation.mutate(values)}
        />
      )}
    </AdminLayout>
  );
}
