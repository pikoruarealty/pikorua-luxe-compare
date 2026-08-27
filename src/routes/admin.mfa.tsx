import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import QRCode from "qrcode";

import { authClient } from "@/lib/auth/auth-client";
import { ADMIN_ME_KEY } from "@/api/queries/admin.queries";
import { getCurrentAdminProfile } from "@/api/functions/admin-auth.functions";

const searchSchema = z.object({
  // "verify": arrived via signIn.email()'s twoFactorRedirect — an account
  // that already has a factor enrolled, mid-challenge. "enroll": first login
  // before 2FA is set up (or a direct visit, e.g. to regenerate codes).
  mode: z.enum(["enroll", "verify"]).optional().default("enroll"),
});

export const Route = createFileRoute("/admin/mfa")({
  validateSearch: searchSchema,
  component: StaffMfa,
});

function StaffMfa() {
  const { mode } = Route.useSearch();
  return mode === "verify" ? <VerifyStep /> : <EnrollOrManageStep />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-7">
        <ShieldCheck className="h-8 w-8 text-champagne" />
        <h1 className="mt-5 font-display text-3xl font-bold">Staff MFA</h1>
        {children}
      </section>
    </main>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
      className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-center text-xl tracking-[0.35em]"
      placeholder="000000"
    />
  );
}

async function goToRoleHome(
  getProfileFn: () => Promise<Awaited<ReturnType<typeof getCurrentAdminProfile>>>,
  queryClient: ReturnType<typeof useQueryClient>,
  navigate: ReturnType<typeof useNavigate>,
) {
  const profile = await getProfileFn();
  queryClient.setQueryData(ADMIN_ME_KEY, profile);
  navigate({ to: profile?.role === "developer" ? "/developer" : "/admin" });
}

// Post sign-in challenge for an account that already has a factor enrolled.
// better-auth tracks the pending login via its own short-lived cookie —
// no session exists yet, so nothing here needs the current session.
function VerifyStep() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getProfileFn = useServerFn(getCurrentAdminProfile);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const verify = async () => {
    setVerifying(true);
    try {
      const { error } = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        toast.error(error.message ?? "Verification failed");
        return;
      }
      toast.success("MFA verified");
      await goToRoleHome(getProfileFn, queryClient, navigate);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Shell>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Enter the {useBackupCode ? "backup code" : "six-digit code"} from your authenticator app to
        finish signing in.
      </p>
      <label htmlFor="mfa-code" className="mt-6 block text-sm font-medium">
        {useBackupCode ? "Backup code" : "Six-digit authenticator code"}
      </label>
      {useBackupCode ? (
        <input
          id="mfa-code"
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
          className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-center text-lg tracking-[0.2em]"
        />
      ) : (
        <CodeInput value={code} onChange={setCode} />
      )}
      <button
        type="button"
        disabled={!code || verifying}
        onClick={verify}
        className="mt-4 h-11 w-full rounded-full bg-champagne text-sm font-semibold text-lux-black disabled:opacity-40"
      >
        {verifying ? "Verifying…" : "Verify and continue"}
      </button>
      <button
        type="button"
        onClick={() => {
          setUseBackupCode((v) => !v);
          setCode("");
        }}
        className="mt-3 w-full text-center text-xs text-muted-foreground underline"
      >
        {useBackupCode ? "Use my authenticator app instead" : "Use a backup code instead"}
      </button>
    </Shell>
  );
}

// First login before 2FA is set up, or a direct visit by an already-enrolled
// account (e.g. to regenerate backup codes). Which of those it is can only be
// known once the current session's profile loads.
function EnrollOrManageStep() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getProfileFn = useServerFn(getCurrentAdminProfile);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProfileFn().then((profile) => {
      if (cancelled) return;
      if (!profile) {
        navigate({ to: "/admin/login" });
        return;
      }
      setAlreadyEnrolled(profile.twoFactorEnabled);
      setLoadingProfile(false);
    });
    return () => {
      cancelled = true;
    };
  }, [getProfileFn, navigate]);

  if (loadingProfile) {
    return (
      <Shell>
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      </Shell>
    );
  }

  return alreadyEnrolled ? (
    <RegenerateBackupCodes />
  ) : (
    <EnrollNewFactor onDone={() => goToRoleHome(getProfileFn, queryClient, navigate)} />
  );
}

function EnrollNewFactor({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const startEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStarting(true);
    try {
      const { data, error: enableError } = await authClient.twoFactor.enable({
        password,
        method: "totp",
      });
      if (enableError || !data || data.method !== "totp") {
        setError(enableError?.message ?? "Could not start MFA setup");
        return;
      }
      setQr(await QRCode.toDataURL(data.totpURI));
      setBackupCodes(data.backupCodes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start MFA setup");
    } finally {
      setStarting(false);
    }
  };

  const confirmEnroll = async () => {
    setVerifying(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        toast.error(error.message ?? "Verification failed");
        return;
      }
      toast.success("MFA enabled");
      onDone();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  if (!qr) {
    return (
      <>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Owner, reviewer, support and developer accounts must set up an authenticator app before
          accessing protected portal data. Confirm your password to begin.
        </p>
        <form onSubmit={startEnroll} className="mt-6 space-y-4">
          <label htmlFor="mfa-password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="mfa-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-background px-4"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={starting || !password}
            className="h-11 w-full rounded-full bg-champagne text-sm font-semibold text-lux-black disabled:opacity-40"
          >
            {starting ? "Starting…" : "Continue"}
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <img src={qr} alt="TOTP enrollment QR code" className="mx-auto mt-6 h-48 w-48" />
      <div className="mt-4 rounded-xl bg-muted p-3 text-xs">
        <p className="font-semibold">Save these backup codes now — shown only once.</p>
        <p className="mt-1 text-muted-foreground">
          Use one if you ever lose access to your authenticator app.
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">
          {backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
      <label htmlFor="mfa-code" className="mt-6 block text-sm font-medium">
        Six-digit authenticator code
      </label>
      <CodeInput value={code} onChange={setCode} />
      <button
        type="button"
        disabled={code.length !== 6 || verifying}
        onClick={confirmEnroll}
        className="mt-4 h-11 w-full rounded-full bg-champagne text-sm font-semibold text-lux-black disabled:opacity-40"
      >
        {verifying ? "Verifying…" : "Confirm and finish setup"}
      </button>
    </>
  );
}

function RegenerateBackupCodes() {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  const regenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data, error: genError } = await authClient.twoFactor.generateBackupCodes({
        password,
      });
      if (genError || !data) {
        setError(genError?.message ?? "Could not regenerate backup codes");
        return;
      }
      setCodes(data.backupCodes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not regenerate backup codes");
    } finally {
      setSubmitting(false);
    }
  };

  if (codes) {
    return (
      <div className="mt-6 rounded-xl bg-muted p-3 text-xs">
        <p className="font-semibold">New backup codes — shown only once.</p>
        <p className="mt-1 text-muted-foreground">Your old backup codes no longer work.</p>
        <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        MFA is already set up on this account. Confirm your password to generate a fresh set of
        backup codes — this replaces any codes issued before.
      </p>
      <form onSubmit={regenerate} className="mt-6 space-y-4">
        <label htmlFor="mfa-password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="mfa-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-12 w-full rounded-xl border border-border bg-background px-4"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !password}
          className="h-11 w-full rounded-full border border-border text-sm font-semibold"
        >
          {submitting ? "Generating…" : "Regenerate backup codes"}
        </button>
      </form>
    </>
  );
}
