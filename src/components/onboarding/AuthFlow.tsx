import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Store, TrendingUp, User as UserIcon, Loader2 } from "lucide-react";
import { useOnboarding, type UserProfile } from "@/context/OnboardingContext";
import { sendOtp, verifyOtp } from "@/lib/otp.functions";
import { upsertProfileAfterOtp } from "@/lib/profile.functions";

type Step = "details" | "phone" | "otp" | "profession";

const COUNTRIES = [
  { code: "+91", flag: "🇮🇳", label: "India" },
  { code: "+1", flag: "🇺🇸", label: "USA" },
  { code: "+44", flag: "🇬🇧", label: "UK" },
  { code: "+971", flag: "🇦🇪", label: "UAE" },
  { code: "+61", flag: "🇦🇺", label: "Australia" },
];

const PROFESSIONS: Array<{
  key: UserProfile["profession"];
  label: string;
  Icon: typeof Briefcase;
  needsBiz: boolean;
}> = [
  { key: "job", label: "Salaried professional", Icon: Briefcase, needsBiz: false },
  { key: "business", label: "Business owner", Icon: Store, needsBiz: true },
  { key: "investor", label: "Investor", Icon: TrendingUp, needsBiz: true },
  { key: "other", label: "Other", Icon: UserIcon, needsBiz: false },
];

const STEPS: Step[] = ["details", "phone", "otp", "profession"];

export function AuthFlow() {
  const { setUserProfile, setPhase, authOnly, finishGatedAuth } = useOnboarding();
  const [step, setStep] = useState<Step>("details");

  // Details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [detailsError, setDetailsError] = useState("");

  // Phone
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [sessionId, setSessionId] = useState("");

  // OTP
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [shake, setShake] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const [verificationToken, setVerificationToken] = useState("");
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Profession
  const [profession, setProfession] = useState<UserProfile["profession"] | "">("");
  const [businessName, setBusinessName] = useState("");

  const sendOtpFn = useServerFn(sendOtp);
  const verifyOtpFn = useServerFn(verifyOtp);
  const upsertProfileFn = useServerFn(upsertProfileAfterOtp);
  const [saving, setSaving] = useState(false);

  // OTP resend countdown
  useEffect(() => {
    if (step !== "otp") return;
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [step, resendIn]);

  const fullPhoneDigits = () => `${country.code.replace("+", "")}${phone.replace(/\D/g, "")}`;

  const handleDetails = () => {
    if (!name.trim()) return setDetailsError("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setDetailsError("Enter a valid email.");
    setDetailsError("");
    setStep("phone");
  };

  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (country.code === "+91" && digits.length !== 10) {
      return setPhoneError("Enter a 10-digit Indian number.");
    }
    if (digits.length < 6) return setPhoneError("Enter a valid number.");
    setPhoneError("");
    setSending(true);
    try {
      const result = await sendOtpFn({ data: { phone: fullPhoneDigits() } });
      setSessionId(result.sessionId);
      setOtpDigits(["", "", "", "", "", ""]);
      setResendIn(30);
      setStep("otp");
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setPhoneError("Couldn't send the code. Please check the number and try again.");
    } finally {
      setSending(false);
    }
  };

  const submitOtp = async (code: string) => {
    setVerifying(true);
    setOtpError("");
    try {
      const result = await verifyOtpFn({
        data: { sessionId, otp: code, phone: fullPhoneDigits() },
      });
      setVerificationToken(result.verificationToken);
      setStep("profession");
    } catch {
      setOtpError("That code didn't match. Try again.");
      setShake((s) => s + 1);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setVerifying(false);
    }
  };

  const handleOtpChange = (i: number, val: string) => {
    const v = val.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[i] = v;
    setOtpDigits(next);
    if (v && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.every((d) => d.length === 1)) {
      submitOtp(next.join(""));
    }
  };

  const handleOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
      const next = [...otpDigits];
      next[i - 1] = "";
      setOtpDigits(next);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || sending) return;
    setSending(true);
    try {
      const result = await sendOtpFn({ data: { phone: fullPhoneDigits() } });
      setSessionId(result.sessionId);
      setResendIn(30);
      setOtpError("");
    } catch {
      setOtpError("Couldn't resend. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const [completeError, setCompleteError] = useState("");
  const handleComplete = async () => {
    if (!profession) return;
    setSaving(true);
    setCompleteError("");
    try {
      const saved = await upsertProfileFn({
        data: {
          name: name.trim(),
          email: email.trim(),
          profession,
          businessName: businessName.trim() || undefined,
          verificationToken,
        },
      });
      const profile: UserProfile = {
        name: saved.name ?? name.trim(),
        email: saved.email ?? email.trim(),
        phone: `${country.code} ${phone.replace(/\D/g, "")}`,
        profession: (saved.profession as UserProfile["profession"]) ?? profession,
        businessName: saved.businessName ?? undefined,
        uid: saved.id,
      };
      setUserProfile(profile);
      // Shared-link recipients skip the welcome-then-quiz march and land on
      // the comparison they were actually sent.
      if (authOnly) finishGatedAuth();
      else setPhase("welcome");
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : "Couldn't save profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const activeIdx = STEPS.indexOf(step);
  const showBiz = profession === "business" || profession === "investor";

  const transition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className="flex h-full flex-col">
      {/* Step dots */}
      <div className="mb-8 flex justify-center gap-2">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i <= activeIdx ? "bg-champagne" : "bg-border"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === "details" && (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={transition}
            className="flex flex-1 flex-col"
          >
            <h2 className="font-display text-3xl text-foreground">
              Tell us a little about yourself
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A private profile, just for your Pikorua experience.
            </p>

            <div className="mt-8 space-y-4">
              <FieldInput
                label="Full name"
                value={name}
                onChange={setName}
                placeholder="Your name"
              />
              <FieldInput
                label="Email address"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                type="email"
              />
              {detailsError && <p className="text-xs text-red-600 dark:text-red-400">{detailsError}</p>}
            </div>

            <div className="mt-auto pt-10">
              <GoldButton onClick={handleDetails}>Continue →</GoldButton>
              <p className="mt-4 text-center text-[11px] text-muted-foreground">
                We never share your information.
              </p>
            </div>
          </motion.div>
        )}

        {step === "phone" && (
          <motion.div
            key="phone"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={transition}
            className="flex flex-1 flex-col"
          >
            <h2 className="font-display text-3xl text-foreground">
              One last step — verify your number
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We'll send a one-time code to confirm it's you.
            </p>

            <div className="mt-8">
              <label className="mb-2 block text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Phone number
              </label>
              <div className="flex gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCountryOpen((o) => !o)}
                    className="flex h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:border-champagne/40"
                  >
                    <span>{country.flag}</span>
                    <span>{country.code}</span>
                    <span className="text-muted-foreground">▾</span>
                  </button>
                  {countryOpen && (
                    <div className="absolute top-full left-0 z-10 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-background shadow-xl">
                      {COUNTRIES.map((c) => (
                        <button
                          key={c.code}
                          onClick={() => {
                            setCountry(c);
                            setCountryOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                        >
                          <span>{c.flag}</span>
                          <span>{c.code}</span>
                          <span className="text-muted-foreground">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="98765 43210"
                  className="h-12 flex-1 rounded-lg border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-champagne/60"
                />
              </div>
              {phoneError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{phoneError}</p>}
            </div>

            <div className="mt-auto pt-10">
              <GoldButton onClick={handleSendOtp} loading={sending}>
                Send OTP
              </GoldButton>
            </div>
          </motion.div>
        )}

        {step === "otp" && (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={transition}
            className="flex flex-1 flex-col"
          >
            <h2 className="font-display text-3xl text-foreground">Enter the code we sent</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sent to {country.code} {phone}
            </p>

            <motion.div
              key={shake}
              animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="mt-10 flex justify-center gap-2"
            >
              {otpDigits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  value={d}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKey(i, e)}
                  inputMode="numeric"
                  maxLength={1}
                  disabled={verifying}
                  className="h-[52px] w-12 rounded-lg border border-border bg-background text-center text-lg text-foreground outline-none focus:border-champagne"
                />
              ))}
            </motion.div>

            {otpError && <p className="mt-4 text-center text-xs text-red-600 dark:text-red-400">{otpError}</p>}
            {verifying && (
              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Verifying…
              </p>
            )}

            <div className="mt-auto pt-10 text-center text-xs text-muted-foreground">
              Didn't receive it?{" "}
              <button
                disabled={resendIn > 0 || sending}
                onClick={handleResend}
                className="text-champagne disabled:text-muted-foreground"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
            </div>
          </motion.div>
        )}

        {step === "profession" && (
          <motion.div
            key="profession"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={transition}
            className="flex flex-1 flex-col"
          >
            <h2 className="font-display text-3xl text-foreground">What best describes you?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This helps us tailor which properties we show you first.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3">
              {PROFESSIONS.map(({ key, label, Icon }) => {
                const selected = profession === key;
                return (
                  <button
                    key={key}
                    onClick={() => setProfession(key)}
                    className={`rounded-2xl border p-5 text-left transition-all ${
                      selected
                        ? "border-champagne bg-champagne/10"
                        : "border-border bg-background hover:border-foreground/30"
                    }`}
                  >
                    <Icon className="h-7 w-7 text-champagne" />
                    <div className="mt-3 text-sm text-foreground">{label}</div>
                  </button>
                );
              })}
            </div>

            <motion.div
              initial={false}
              animate={{ height: showBiz ? "auto" : 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-5">
                <FieldInput
                  label="Business / company name"
                  value={businessName}
                  onChange={setBusinessName}
                  placeholder="Optional"
                />
              </div>
            </motion.div>

            <div className="mt-auto pt-10">
              {completeError && (
                <p className="mb-3 text-center text-xs text-red-600 dark:text-red-400">{completeError}</p>
              )}
              <GoldButton onClick={handleComplete} disabled={!profession} loading={saving}>
                Complete profile →
              </GoldButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-lg border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-champagne/60"
      />
    </div>
  );
}

function GoldButton({
  children,
  onClick,
  loading,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-champagne text-sm font-medium tracking-wide text-lux-black transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
