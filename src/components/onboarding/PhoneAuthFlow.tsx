import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Loader2, Phone, UserRound } from "lucide-react";

import { sendOtp, verifyOtp } from "@/api/functions/otp.functions";
import {
  checkAccountExists,
  completeLogin,
  upsertPhoneProfileAfterOtp,
} from "@/api/functions/profile.functions";
import type { GoogleIdentity } from "@/api/functions/google-auth.functions";
import { useOnboarding, type QuizAnswers, type UserProfile } from "@/context/OnboardingContext";

import { GoogleSignInButton } from "./GoogleSignInButton";
import { OtpBoxes } from "./OtpBoxes";

type Screen = "details" | "otp";

export function PhoneAuthFlow() {
  const { setUserProfile, setQuizAnswers, setPhase, authOnly, finishGatedAuth } = useOnboarding();
  const [screen, setScreen] = useState<Screen>("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [existing, setExisting] = useState(false);
  const [google, setGoogle] = useState<GoogleIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [otpKey, setOtpKey] = useState(0);

  const sendOtpFn = useServerFn(sendOtp);
  const verifyOtpFn = useServerFn(verifyOtp);
  const checkAccountFn = useServerFn(checkAccountExists);
  const completeLoginFn = useServerFn(completeLogin);
  const createAccountFn = useServerFn(upsertPhoneProfileAfterOtp);

  const digits = phone.replace(/\D/g, "");
  const fullPhone = `91${digits}`;

  const finish = (saved: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string;
    profession: string | null;
    businessName: string | null;
    quizAnswers: QuizAnswers | null;
  }) => {
    setUserProfile({
      uid: saved.id,
      name: saved.name ?? name.trim(),
      email: saved.email ?? "",
      phone: saved.phone,
      profession: (saved.profession as UserProfile["profession"]) ?? "other",
      businessName: saved.businessName ?? undefined,
    });
    if (saved.quizAnswers) setQuizAnswers(saved.quizAnswers);
    if (authOnly) finishGatedAuth();
    else setPhase("complete");
  };

  const requestCode = async () => {
    if (digits.length !== 10) return setError("Enter a valid 10-digit Indian phone number.");
    setBusy(true);
    setError("");
    try {
      const account = await checkAccountFn({ data: { identity: fullPhone, channel: "phone" } });
      if (!account.exists && !name.trim()) {
        setError("Enter your name to create a phone-verified account.");
        return;
      }
      const sent = await sendOtpFn({ data: { phone: fullPhone } });
      setExisting(account.exists);
      setSessionId(sent.sessionId);
      setOtpKey((value) => value + 1);
      setScreen("otp");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (otp: string) => {
    setBusy(true);
    setError("");
    try {
      const proof = await verifyOtpFn({ data: { sessionId, otp } });
      const saved = existing
        ? await completeLoginFn({ data: { verificationToken: proof.verificationToken } })
        : await createAccountFn({
            data: {
              name: name.trim(),
              verificationToken: proof.verificationToken,
              email: google?.email,
              emailToken: google?.emailToken,
            },
          });
      finish(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That code did not match.");
      setOtpKey((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async (identity: GoogleIdentity) => {
    setBusy(true);
    setError("");
    try {
      const saved = await completeLoginFn({ data: { emailToken: identity.emailToken } });
      finish(saved);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not continue with Google.";
      if (/No account found/i.test(message)) {
        setGoogle(identity);
        if (identity.name) setName(identity.name);
        setError("Verify a phone number to link this Google account.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col" aria-live="polite">
      <p className="text-xs font-semibold tracking-[0.18em] text-champagne uppercase">
        Phone-verified access
      </p>
      <h2 className="mt-3 font-display text-3xl font-bold text-foreground">
        {screen === "details" ? "Continue to PropCompare" : "Enter your verification code"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {screen === "details"
          ? "Comparison, saves, reviews and price enquiries use a verified phone account. Public project details stay open."
          : `We sent a one-time code to +91 ${digits}.`}
      </p>

      {screen === "details" ? (
        <div className="mt-7 space-y-4">
          <label className="block text-sm text-foreground">
            Name
            <span className="relative mt-2 block">
              <UserRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={100}
                className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3 outline-none focus:border-champagne focus:ring-2 focus:ring-champagne/30"
              />
            </span>
          </label>
          <label className="block text-sm text-foreground">
            Phone
            <span className="relative mt-2 flex">
              <span className="flex h-11 items-center rounded-l-lg border border-r-0 border-border bg-muted px-3 text-sm">
                +91
              </span>
              <Phone className="absolute left-16 top-3 h-4 w-4 text-muted-foreground" />
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                autoComplete="tel-national"
                aria-label="Indian phone number"
                className="h-11 min-w-0 flex-1 rounded-r-lg border border-border bg-background pl-10 pr-3 outline-none focus:border-champagne focus:ring-2 focus:ring-champagne/30"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={requestCode}
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-champagne px-5 text-sm font-semibold text-lux-black disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Send verification code
          </button>
          <div className="relative py-2 text-center text-xs text-muted-foreground before:absolute before:left-0 before:top-1/2 before:w-[43%] before:border-t before:border-border after:absolute after:right-0 after:top-1/2 after:w-[43%] after:border-t after:border-border">
            or
          </div>
          <GoogleSignInButton onIdentity={handleGoogle} onError={setError} />
        </div>
      ) : (
        <div className="mt-8">
          <OtpBoxes key={otpKey} onComplete={submitCode} disabled={busy} />
          <button
            type="button"
            onClick={() => setScreen("details")}
            className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Change phone number
          </button>
        </div>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
