import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { Field, Input } from "@/components/portal/FormControls";

export const Route = createFileRoute("/admin/forgot-password")({
  component: AdminForgotPassword,
});

function AdminForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await authClient.requestPasswordReset({ email, redirectTo: "/admin/reset-password" });
    } finally {
      // Always show the same confirmation, whether or not the email exists —
      // no other UI signal should reveal which admin addresses are registered.
      setSubmitting(false);
      setSent(true);
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
          {sent ? (
            <p className="text-sm text-muted-foreground">
              If that email has an admin account, we've sent a link to reset the password. It
              expires in an hour.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your admin email and we'll send you a link to set a new password.
              </p>
              <Field label="Email" htmlFor="forgot-email">
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <button
                type="submit"
                disabled={submitting}
                className="foil flex h-11 w-full items-center justify-center rounded-full text-[11px] font-semibold tracking-luxury uppercase disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
          <Link
            to="/admin/login"
            className="block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
