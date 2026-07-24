import { createFileRoute } from "@tanstack/react-router";
import { DeveloperLayout } from "@/components/developer/DeveloperLayout";
import { AddPropertyFlow } from "@/components/developer/AddPropertyFlow";

export const Route = createFileRoute("/developer/properties/new")({
  component: NewDeveloperProperty,
});

function NewDeveloperProperty() {
  return (
    <DeveloperLayout title="Add Property">
      <AddPropertyFlow />
    </DeveloperLayout>
  );
}
