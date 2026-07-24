import { createServerFn } from "@tanstack/react-start";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";

export interface DeveloperAccount {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  pendingSubmissions: number;
  totalSubmissions: number;
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
    if (error) throw new Error(error.message);

    const { data: submissions } = await supabaseAdmin
      .from("property_submissions")
      .select("developer_id, status");

    return (devs ?? []).map((d) => {
      const mine = (submissions ?? []).filter((s) => s.developer_id === d.id);
      return {
        id: d.id,
        email: d.email,
        fullName: d.full_name,
        isActive: d.is_active,
        createdAt: d.created_at,
        pendingSubmissions: mine.filter((s) => s.status === "pending").length,
        totalSubmissions: mine.length,
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
      throw new Error(authError?.message ?? "Could not create the developer's login");
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
      throw new Error(profileError.message);
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
    if (error) throw new Error(error.message);
    return { ok: true };
  });
