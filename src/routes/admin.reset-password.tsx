import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { Field, Input } from "@/components/portal/FormControls";

export const Route = createFileRoute("/admin/reset-password")({
  component: AdminResetPassword,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
});

function AdminResetPassword() {
  const { token, error: linkError } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (resetError) {
        setError("This link is invalid or has expired. Request a new one.");
        return;
      }
      navigate({ to: "/admin/login" });
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
          <p className="font-display text-2xl tracking-[0.02em] gold-text">PropCompare</p>
          <div className="mt-3 flex items-center justify-center gap-2.5">
            <span className="h-px w-6 bg-(--rule-strong)" />
            <p className="font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
              Admin Portal
            </p>
            <span className="h-px w-6 bg-(--rule-strong)" />
          </div>
        </div>

        <div className="glass space-y-4 rounded-2xl p-6 shadow-(--shadow-lift)">
          {!token || linkError ? (
            <>
              <p className="text-sm text-red-600 dark:text-red-400">
                This link is invalid or has expired.
              </p>
              <Link
                to="/admin/forgot-password"
                className="foil flex h-11 w-full items-center justify-center rounded-full text-[11px] font-semibold tracking-luxury uppercase"
              >
                Request a new link
              </Link>
            </>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">Choose a new password.</p>
              <Field label="New password" htmlFor="reset-password">
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Confirm password" htmlFor="reset-password-confirm">
                <Input
                  id="reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="foil flex h-11 w-full items-center justify-center rounded-full text-[11px] font-semibold tracking-luxury uppercase disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Set new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
