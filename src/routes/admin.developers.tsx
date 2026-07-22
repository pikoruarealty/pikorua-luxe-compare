import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";

export const Route = createFileRoute("/admin/developers")({
  component: AdminDevelopers,
});

function AdminDevelopers() {
  return (
    <AdminLayout title="Developers" requireOwner>
      <p className="text-sm text-muted-foreground">Developer account management coming up.</p>
    </AdminLayout>
  );
}
