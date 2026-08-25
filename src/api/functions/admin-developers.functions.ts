import { createServerFn } from "@tanstack/react-start";
import { throwSafeError } from "@/lib/safe-error";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type CountRow = {
      developer_id: string;
      pending_submissions: number;
      total_submissions: number;
    };
    type CountClient = {
      from: (table: string) => {
        select: (columns: string) => Promise<{ data: CountRow[] | null; error: unknown }>;
      };
    };
    const { data: counts, error: countsError } = await (supabaseAdmin as unknown as CountClient)
      .from("developer_submission_counts")
      .select("developer_id, pending_submissions, total_submissions");
    if (countsError) {
      throwSafeError("listDevelopers.counts", countsError, "Could not load developer activity");
    }
    const countsByDeveloper = new Map((counts ?? []).map((row) => [row.developer_id, row]));

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
        pendingSubmissions: Number(counts?.pending_submissions ?? 0),
        totalSubmissions: Number(counts?.total_submissions ?? 0),
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

/** Owner-only: creates a Supabase Auth user for the developer plus their
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (authError || !created?.user) {
      throwSafeError("createDeveloper.auth", authError, "Could not create the developer's login");
    }

    try {
      await insertDeveloperProfile({
        id: created.user.id,
        email: data.email,
        fullName: data.fullName,
        createdBy: context.adminProfile.id,
      });
    } catch (profileError) {
      // Don't leave an orphaned auth user behind if the profile insert failed.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      throwSafeError("createDeveloper.profile", profileError, "Could not create developer profile");
    }

    return { id: created.user.id, email: data.email };
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
