// Staff role gates built on the better-auth session middleware.
import { createMiddleware } from "@tanstack/react-start";

import { hasStaffPermission, type StaffRole } from "@/domain/staff-permissions";
import { requireAuthSession } from "./auth-middleware";

export interface AdminProfileContext {
  id: string;
  role: StaffRole;
  email: string;
  isActive: boolean;
}

export const requireAdminAuth = createMiddleware({ type: "function" })
  .middleware([requireAuthSession])
  .server(async ({ next, context }) => {
    const enforceMfa =
      process.env.STAFF_MFA_ENFORCE === "0"
        ? false
        : process.env.STAFF_MFA_ENFORCE === "1" || process.env.NODE_ENV === "production";
    if (enforceMfa && !context.session.user.twoFactorEnabled) {
      throw new Error("MFA verification required");
    }
    const { getAdminProfileById } = await import("@/repositories/admin-profile.repository.server");
    const data = await getAdminProfileById(context.userId);
    if (!data || !data.isActive) throw new Error("Unauthorized: not an active admin");
    if (!["owner", "reviewer", "support", "developer"].includes(data.role)) {
      throw new Error("Unauthorized: invalid role");
    }
    return next({
      context: {
        adminProfile: {
          id: data.id,
          role: data.role as StaffRole,
          email: data.email,
          isActive: data.isActive,
        } satisfies AdminProfileContext,
      },
    });
  });

export const requireOwnerAuth = createMiddleware({ type: "function" })
  .middleware([requireAdminAuth])
  .server(async ({ next, context }) => {
    if (context.adminProfile.role !== "owner") throw new Error("Forbidden: owner access required");
    return next();
  });

export const requireReviewerAuth = createMiddleware({ type: "function" })
  .middleware([requireAdminAuth])
  .server(async ({ next, context }) => {
    if (!hasStaffPermission(context.adminProfile.role, "publish")) {
      throw new Error("Forbidden: reviewer access required");
    }
    return next();
  });

export const requireDeveloperAuth = createMiddleware({ type: "function" })
  .middleware([requireAdminAuth])
  .server(async ({ next, context }) => {
    if (!hasStaffPermission(context.adminProfile.role, "manage_own_submissions")) {
      throw new Error("Forbidden: developer access required");
    }
    return next();
  });

export const requireModerationAuth = createMiddleware({ type: "function" })
  .middleware([requireAdminAuth])
  .server(async ({ next, context }) => {
    if (!hasStaffPermission(context.adminProfile.role, "moderate")) {
      throw new Error("Forbidden: moderation access required");
    }
    return next();
  });
