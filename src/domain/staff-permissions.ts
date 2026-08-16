export type StaffRole = "owner" | "reviewer" | "support" | "developer";

export type StaffPermission =
  | "administer"
  | "publish"
  | "read_commercial"
  | "moderate"
  | "support_customers"
  | "manage_own_submissions"
  | "read_own_enquiries";

const ROLE_PERMISSIONS: Record<StaffRole, ReadonlySet<StaffPermission>> = {
  owner: new Set(["administer", "publish", "read_commercial", "moderate", "support_customers"]),
  reviewer: new Set(["publish", "read_commercial", "moderate"]),
  support: new Set(["moderate", "support_customers"]),
  developer: new Set(["read_commercial", "manage_own_submissions", "read_own_enquiries"]),
};

export function hasStaffPermission(role: StaffRole, permission: StaffPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
