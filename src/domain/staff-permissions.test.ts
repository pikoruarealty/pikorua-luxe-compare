import { describe, expect, it } from "vitest";
import { hasStaffPermission, type StaffPermission, type StaffRole } from "./staff-permissions";

const matrix: Record<StaffRole, StaffPermission[]> = {
  owner: ["administer", "publish", "read_commercial", "moderate", "support_customers"],
  reviewer: ["publish", "read_commercial", "moderate"],
  support: ["moderate", "support_customers"],
  developer: ["read_commercial", "manage_own_submissions", "read_own_enquiries"],
};

describe("staff permission matrix", () => {
  const permissions: StaffPermission[] = [
    "administer",
    "publish",
    "read_commercial",
    "moderate",
    "support_customers",
    "manage_own_submissions",
    "read_own_enquiries",
  ];

  for (const role of Object.keys(matrix) as StaffRole[]) {
    it(`fails closed for ${role}`, () => {
      for (const permission of permissions) {
        expect(hasStaffPermission(role, permission)).toBe(matrix[role].includes(permission));
      }
    });
  }

  it("never grants support or developers publication", () => {
    expect(hasStaffPermission("support", "publish")).toBe(false);
    expect(hasStaffPermission("developer", "publish")).toBe(false);
  });
});
