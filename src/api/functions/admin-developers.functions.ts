import { createServerFn } from "@tanstack/react-start";
import { throwSafeError } from "@/lib/safe-error";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: devs, error } = await supabaseAdmin
      .from("admin_profiles")
      .select("id, email, full_name, is_active, created_at")
      .eq("role", "developer")
      .order("created_at", { ascending: false });
    if (error) throwSafeError("listDevelopers", error, "Could not load developers");

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

    type EntitlementRow = {
      developer_id: string;
      access_level: "trial" | "paid";
      status: "active" | "suspended";
      starts_at: string;
      ends_at: string | null;
    };
    const { data: entitlementRows, error: entitlementError } = await (
      supabaseAdmin as unknown as {
        from: (table: string) => {
          select: (columns: string) => Promise<{ data: EntitlementRow[] | null; error: unknown }>;
        };
      }
    )
      .from("developer_intelligence_entitlements")
      .select("developer_id, access_level, status, starts_at, ends_at");
    if (entitlementError) {
      throwSafeError(
        "listDevelopers.entitlements",
        entitlementError,
        "Could not load intelligence access",
      );
    }
    const entitlements = new Map((entitlementRows ?? []).map((row) => [row.developer_id, row]));
    const now = Date.now();

    return (devs ?? []).map((d) => {
      const counts = countsByDeveloper.get(d.id);
      const entitlement = entitlements.get(d.id);
      const active = Boolean(
        entitlement &&
        entitlement.status === "active" &&
        new Date(entitlement.starts_at).getTime() <= now &&
        (!entitlement.ends_at || new Date(entitlement.ends_at).getTime() > now),
      );
      return {
        id: d.id,
        email: d.email,
        fullName: d.full_name,
        isActive: d.is_active,
        createdAt: d.created_at,
        pendingSubmissions: Number(counts?.pending_submissions ?? 0),
        totalSubmissions: Number(counts?.total_submissions ?? 0),
        intelligence: {
          accessLevel: entitlement?.access_level ?? null,
          status: entitlement?.status ?? "missing",
          startsAt: entitlement?.starts_at ?? null,
          endsAt: entitlement?.ends_at ?? null,
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

    const { error: profileError } = await supabaseAdmin.from("admin_profiles").insert({
      id: created.user.id,
      role: "developer",
      email: data.email,
      full_name: data.fullName,
      is_active: true,
      created_by: context.adminProfile.id,
    });
    if (profileError) {
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("admin_profiles")
      .update({ is_active: data.isActive })
      .eq("id", data.id)
      .eq("role", "developer");
    if (error) throwSafeError("setDeveloperActive", error, "Could not update developer");
    return { ok: true };
  });
