import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export interface AdminProfileDTO {
  id: string;
  role: "owner" | "reviewer" | "support" | "developer";
  email: string;
  fullName: string | null;
  isActive: boolean;
}

// Tolerant: returns null (never throws) when there's no valid admin session, so
// the client-side guard can cleanly decide between "render" and "redirect to login".
// Runs client-initiated (attachSupabaseAuth attaches the bearer token); during SSR
// no token is present, so this returns null and the client re-checks after hydration.
export const getCurrentAdminProfile = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminProfileDTO | null> => {
    try {
      const request = getRequest();
      const authHeader = request?.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) return null;
      const token = authHeader.slice("Bearer ".length).trim();
      if (!token || token.split(".").length !== 3) return null;

      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) return null;

      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user?.id) return null;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("admin_profiles")
        .select("id, role, email, full_name, is_active")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (error || !data || !data.is_active) return null;

      return {
        id: data.id,
        role: data.role,
        email: data.email,
        fullName: data.full_name,
        isActive: data.is_active,
      };
    } catch {
      return null;
    }
  },
);
