import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";

export const Route = createFileRoute("/admin/submissions")({
  component: AdminSubmissions,
});

function AdminSubmissions() {
  return (
    <AdminLayout title="Submissions" requireOwner>
      <p className="text-sm text-muted-foreground">Developer submission queue coming up.</p>
    </AdminLayout>
  );
}
