import { createServerFn } from "@tanstack/react-start";
import { throwSafeError } from "@/lib/safe-error";
import { requireOwnerAuth } from "@/lib/auth/admin-auth-middleware";
import {
  insertDeveloperProfile,
  listDeveloperProfiles,
  setDeveloperActive as setDeveloperActiveRow,
} from "@/repositories/admin-profile.repository.server";
import { listAllEntitlements } from "@/repositories/developer-intelligence.repository.server";
export { setDeveloperIntelligenceEntitlement } from "./developer-intelligence.functions";

export interface DeveloperAccount {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  pendingSubmissions: number;
  totalSubmissions: number;
  intelligence: {
    accessLevel: "trial" | "paid" | null;
    status: "active" | "suspended" | "missing";
    startsAt: string | null;
    endsAt: string | null;
    active: boolean;
  };
}

/** Owner-only: every developer account, with a submission-count summary so the
 *  owner can see activity without opening the submissions queue. */
export const listDevelopers = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<DeveloperAccount[]> => {
    const devs = await listDeveloperProfiles();

    // property_submissions (V1) has no local equivalent yet — Phase C scope.
    const { getDatabase } = await import("@/db/client.server");
    const { propertySubmissionWorkflows } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    const counts = await getDatabase()
      .select({
        developerId: propertySubmissionWorkflows.developerId,
        pendingSubmissions: sql<number>`count(*) filter (where ${propertySubmissionWorkflows.state} = 'in_review')::int`,
        totalSubmissions: sql<number>`count(*)::int`,
      })
      .from(propertySubmissionWorkflows)
      .groupBy(propertySubmissionWorkflows.developerId);
    const countsByDeveloper = new Map(counts.map((row) => [row.developerId, row]));

    const entitlementRows = await listAllEntitlements();
    const entitlements = new Map(entitlementRows.map((row) => [row.developerId, row]));
    const now = Date.now();

    return devs.map((d) => {
      const counts = countsByDeveloper.get(d.id);
      const entitlement = entitlements.get(d.id);
      const active = Boolean(
        entitlement &&
        entitlement.status === "active" &&
        entitlement.startsAt.getTime() <= now &&
        (!entitlement.endsAt || entitlement.endsAt.getTime() > now),
      );
      return {
        id: d.id,
        email: d.email,
        fullName: d.fullName,
        isActive: d.isActive,
        createdAt: d.createdAt.toISOString(),
        pendingSubmissions: Number(counts?.pendingSubmissions ?? 0),
        totalSubmissions: Number(counts?.totalSubmissions ?? 0),
        intelligence: {
          accessLevel: (entitlement?.accessLevel as "trial" | "paid" | undefined) ?? null,
          status: (entitlement?.status as "active" | "suspended" | undefined) ?? "missing",
          startsAt: entitlement?.startsAt.toISOString() ?? null,
          endsAt: entitlement?.endsAt?.toISOString() ?? null,
          active,
        },
      };
    });
  });

/** Owner-only: creates a better-auth login for the developer plus their
 *  admin_profiles row. The owner sets the password directly and hands it to
 *  the developer out of band (WhatsApp, email, in person). */
export const createDeveloper = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { email: string; password: string; fullName?: string }) => {
    const email = data?.email?.trim().toLowerCase();
    const password = data?.password ?? "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    return { email, password, fullName: data.fullName?.trim() || null };
  })
  .handler(async ({ data, context }) => {
    const { createStaffCredential } =
      await import("@/repositories/auth-credential.repository.server");
    const id = crypto.randomUUID();

    try {
      await createStaffCredential({
        id,
        email: data.email,
        fullName: data.fullName,
        password: data.password,
      });
    } catch (authError) {
      throwSafeError("createDeveloper.auth", authError, "Could not create the developer's login");
    }

    try {
      await insertDeveloperProfile({
        id,
        email: data.email,
        fullName: data.fullName,
        createdBy: context.adminProfile.id,
      });
    } catch (profileError) {
      // Don't leave an orphaned login behind if the profile insert failed.
      const { getDatabase } = await import("@/db/client.server");
      const { user } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      await getDatabase()
        .delete(user)
        .where(eq(user.id, id))
        .catch(() => {});
      throwSafeError("createDeveloper.profile", profileError, "Could not create developer profile");
    }

    return { id, email: data.email };
  });

/** Owner-only: clears an existing 2FA enrollment so a locked-out developer
 *  (lost authenticator, no backup codes saved) can re-enroll from scratch on
 *  their next sign-in, instead of being permanently locked out. */
export const resetDeveloperMfa = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing developer id");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { getDatabase } = await import("@/db/client.server");
    const { user, twoFactor } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDatabase();
    await db.transaction(async (tx) => {
      await tx.delete(twoFactor).where(eq(twoFactor.userId, data.id));
      await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, data.id));
    });
    return { ok: true };
  });

/** Owner-only: deactivating blocks sign-in immediately (requireAdminAuth checks
 *  is_active) without deleting their account or submission history. */
export const setDeveloperActive = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string; isActive: boolean }) => {
    if (!data?.id) throw new Error("Missing developer id");
    return { id: data.id, isActive: Boolean(data.isActive) };
  })
  .handler(async ({ data }) => {
    await setDeveloperActiveRow(data.id, data.isActive);
    return { ok: true };
  });
