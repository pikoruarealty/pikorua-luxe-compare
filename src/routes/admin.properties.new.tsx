import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { createProperty } from "@/lib/property-crud.functions";
import { PROPERTIES_KEY } from "@/lib/properties.queries";
import type { PropertyFormValues } from "@/lib/property-schema";

export const Route = createFileRoute("/admin/properties/new")({
  component: NewProperty,
});

function NewProperty() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (values: PropertyFormValues) => createProperty({ data: values }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "properties"] });
      await queryClient.invalidateQueries({ queryKey: PROPERTIES_KEY });
      await router.invalidate();
      toast.success("Property created and live on the site");
      navigate({ to: "/admin/properties" });
    },
    onError: (e: Error) => toast.error(e.message || "Could not create property"),
  });

  return (
    <AdminLayout title="Add property" requireOwner>
      <Link
        to="/admin/properties"
        className="mb-6 inline-flex items-center gap-2 text-xs tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to properties
      </Link>
      <PropertyForm
        submitLabel="Create property"
        submitting={mutation.isPending}
        onSubmit={(values) => mutation.mutate(values)}
      />
    </AdminLayout>
  );
}
