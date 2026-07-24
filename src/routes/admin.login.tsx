import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_ME_KEY } from "@/lib/admin.queries";
import { getCurrentAdminProfile } from "@/lib/admin-auth.functions";

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getProfileFn = useServerFn(getCurrentAdminProfile);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in as an admin, skip the form — land wherever their role
  // goes. Calls the server function directly (not the cached query) so this
  // never trusts a stale "not signed in" result left over from a previous check.
  useEffect(() => {
    let cancelled = false;
    getProfileFn().then((profile) => {
      if (cancelled) return;
      queryClient.setQueryData(ADMIN_ME_KEY, profile);
      if (profile) navigate({ to: profile.role === "owner" ? "/admin" : "/developer" });
    });
    return () => {
      cancelled = true;
    };
  }, [getProfileFn, queryClient, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Incorrect email or password.");
        return;
      }
      // Re-check admin status server-side (a valid Supabase user isn't
      // necessarily an admin). Calls the server function directly rather than
      // going through the query cache — every sign-in attempt is a fresh
      // identity, so a stale "not an admin" result from a previous attempt
      // (this account's own or a different one entirely) must never apply here.
      const profile = await getProfileFn();
      if (!profile) {
        await supabase.auth.signOut();
        queryClient.setQueryData(ADMIN_ME_KEY, null);
        setError("This account doesn't have admin access.");
        return;
      }
      queryClient.setQueryData(ADMIN_ME_KEY, profile);
      navigate({ to: profile.role === "owner" ? "/admin" : "/developer" });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl tracking-[0.2em] text-champagne">PIKORUA</p>
          <p className="mt-2 text-[11px] tracking-[0.24em] text-muted-foreground uppercase">
            Admin Portal
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-border bg-card p-6"
        >
          <div>
            <label className="mb-1.5 block text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Email
            </label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-champagne"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-champagne"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-11 w-full items-center justify-center rounded-full bg-champagne text-sm font-medium tracking-wide text-lux-black transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
