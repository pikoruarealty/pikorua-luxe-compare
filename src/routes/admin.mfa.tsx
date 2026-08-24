import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/mfa")({ component: StaffMfa });

function StaffMfa() {
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [setupAttempt, setSetupAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setQr("");
    setSecret("");
    setFactorId("");

    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;

      const verified = data.totp.find((factor) => factor.status === "verified");
      if (verified) {
        if (!cancelled) setFactorId(verified.id);
        return;
      }

      // Any factor left here is an abandoned enroll attempt (page closed
      // mid-setup, expired session, etc.) — Supabase caps how many TOTP
      // factors an account can hold, so leaving these around eventually
      // makes every future enroll() call fail with no visible cause.
      for (const stale of data.totp) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }

      const enrolled = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "PropCompare staff",
      });
      if (enrolled.error) throw enrolled.error;
      if (cancelled) return;
      setFactorId(enrolled.data.id);
      setQr(enrolled.data.totp.qr_code);
      setSecret(enrolled.data.totp.secret);
    })()
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "MFA setup failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [setupAttempt]);

  const verify = async () => {
    setVerifying(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) return toast.error(challenge.error.message);
      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.replace(/\D/g, ""),
      });
      if (verified.error) return toast.error(verified.error.message);
      toast.success("MFA verified");
      navigate({ to: "/admin" });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-7">
        <ShieldCheck className="h-8 w-8 text-champagne" />
        <h1 className="mt-5 font-display text-3xl font-bold">Staff MFA</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Owner, reviewer, support and developer accounts must verify a time-based one-time code
          before accessing protected portal data.
        </p>
        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Preparing secure setup…</p>
        ) : error ? (
          <div className="mt-6">
            <p className="text-sm text-red-500">{error}</p>
            <button
              type="button"
              onClick={() => setSetupAttempt((n) => n + 1)}
              className="mt-4 h-11 w-full rounded-full border border-border text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {qr && (
              <img src={qr} alt="TOTP enrollment QR code" className="mx-auto mt-6 h-48 w-48" />
            )}
            {secret && (
              <p className="mt-3 break-all rounded-xl bg-muted p-3 text-xs">
                Manual setup key: {secret}
              </p>
            )}
            <label htmlFor="mfa-code" className="mt-6 block text-sm font-medium">
              Six-digit authenticator code
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-center text-xl tracking-[0.35em]"
            />
            <button
              type="button"
              disabled={!factorId || code.length !== 6 || verifying}
              onClick={verify}
              className="mt-4 h-11 w-full rounded-full bg-champagne text-sm font-semibold text-lux-black disabled:opacity-40"
            >
              {verifying ? "Verifying…" : "Verify and continue"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
