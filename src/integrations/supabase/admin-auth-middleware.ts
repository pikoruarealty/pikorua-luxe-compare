// Hand-maintained. Composes requireAuthSession (src/lib/auth/auth-middleware.ts)
// with an admin_profiles role gate.
import { createMiddleware } from "@tanstack/react-start";
import { hasStaffPermission, type StaffRole } from "@/domain/staff-permissions";
import { requireAuthSession } from "@/lib/auth/auth-middleware";

export interface AdminProfileContext {
  id: string;
  role: StaffRole;
  email: string;
  isActive: boolean;
}

// Any active admin (owner OR developer). Injects context.adminProfile.
export const requireAdminAuth = createMiddleware({ type: "function" })
  .middleware([requireAuthSession])
  .server(async ({ next, context }) => {
    const enforceMfa =
      process.env.STAFF_MFA_ENFORCE === "0"
        ? false
        : process.env.STAFF_MFA_ENFORCE === "1" || process.env.NODE_ENV === "production";
    // A session can only exist for a 2FA-enabled account after the 2FA
    // challenge succeeds (better-auth's twoFactor plugin never sets the
    // session cookie on sign-in until then) — so an established session
    // already implies 2FA was satisfied this sign-in, for accounts that
    // have it enabled. This only blocks accounts that never finished
    // enrollment, matching the old aal2 check's effect.
    if (enforceMfa && !context.session.user.twoFactorEnabled) {
      throw new Error("MFA verification required");
    }
    const { getAdminProfileById } = await import("@/repositories/admin-profile.repository.server");
    const data = await getAdminProfileById(context.userId);
    if (!data || !data.isActive) {
      throw new Error("Unauthorized: not an active admin");
    }
    if (!["owner", "reviewer", "support", "developer"].includes(data.role)) {
      throw new Error("Unauthorized: invalid role");
    }
    const adminProfile: AdminProfileContext = {
      id: data.id,
      role: data.role as AdminProfileContext["role"],
      email: data.email,
      isActive: data.isActive,
    };
    return next({ context: { adminProfile } });
  });

// Owner only. Layers on top of requireAdminAuth.
export const requireOwnerAuth = createMiddleware({ type: "function" })
  .middleware([requireAdminAuth])
  .server(async ({ next, context }) => {
    if (context.adminProfile.role !== "owner") {
      throw new Error("Forbidden: owner access required");
    }
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
