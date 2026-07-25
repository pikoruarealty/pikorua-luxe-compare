import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_ME_KEY } from "@/lib/admin.queries";
import { getCurrentAdminProfile } from "@/lib/admin-auth.functions";
import { Field, Input } from "@/components/portal/FormControls";

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
          <p className="font-display text-2xl tracking-[0.2em] gold-text">PIKORUA</p>
          <div className="mt-3 flex items-center justify-center gap-2.5">
            <span className="h-px w-6 bg-(--rule-strong)" />
            <p className="font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
              Admin Portal
            </p>
            <span className="h-px w-6 bg-(--rule-strong)" />
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="glass space-y-4 rounded-2xl p-6 shadow-(--shadow-lift)"
        >
          <Field label="Email" htmlFor="admin-email">
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="admin-password">
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="foil flex h-11 w-full items-center justify-center rounded-full text-[11px] font-semibold tracking-luxury uppercase disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
