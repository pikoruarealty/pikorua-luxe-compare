import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Store, TrendingUp, User as UserIcon, Loader2 } from "lucide-react";
import { useOnboarding, type UserProfile } from "@/context/OnboardingContext";
import { sendOtp, verifyOtp } from "@/api/functions/otp.functions";
import { upsertProfileAfterOtp } from "@/api/functions/profile.functions";

type Step = "details" | "phone" | "profession";

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

const STEPS: Step[] = ["details", "phone", "profession"];

export function AuthFlow() {
  const { setUserProfile, setQuizAnswers, setPhase, authOnly, finishGatedAuth } = useOnboarding();
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
    if (step !== "phone" || !sessionId) return;
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [step, sessionId, resendIn]);

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

  // Fill boxes from `start` with a run of digits, then focus/submit. Shared by
  // single-key typing, paste, and SMS autofill so all three behave identically.
  const fillFrom = (start: number, digits: string) => {
    const next = [...otpDigits];
    for (let k = 0; k < digits.length && start + k < 6; k++) next[start + k] = digits[k];
    setOtpDigits(next);
    const lastFilled = Math.min(start + digits.length, 6) - 1;
    otpRefs.current[Math.max(0, lastFilled)]?.focus();
    if (next.every((d) => d.length === 1)) submitOtp(next.join(""));
  };

  const handleOtpChange = (i: number, val: string) => {
    const cleaned = val.replace(/\D/g, "");
    // Autofill can deliver the whole code to one box — spread it across the row
    // instead of keeping only the last digit.
    if (cleaned.length > 1) return fillFrom(i, cleaned);
    const v = cleaned.slice(-1);
    const next = [...otpDigits];
    next[i] = v;
    setOtpDigits(next);
    if (v && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.every((d) => d.length === 1)) {
      submitOtp(next.join(""));
    }
  };

  // maxLength=1 truncates a pasted code before onChange sees it, so paste is
  // handled explicitly here from the clipboard text.
  const handleOtpPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const cleaned = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!cleaned) return;
    e.preventDefault();
    fillFrom(i, cleaned);
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

  // Lets a visitor undo "send OTP" without a separate back-navigable step —
  // returns to the plain phone-entry view on the same screen.
  const changeNumber = () => {
    setSessionId("");
    setVerificationToken("");
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpError("");
    setPhoneError("");
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
      // A returning visitor whose phone matched an existing profile with
      // saved preferences shouldn't be marched through the quiz again —
      // show what they told us last time instead, with a plain edit option.
      const returningWithPrefs =
        saved.quizAnswers &&
        ((saved.quizAnswers.bhk?.length ?? 0) > 0 ||
          (saved.quizAnswers.propertyType?.length ?? 0) > 0 ||
          Boolean(saved.quizAnswers.budgetRange) ||
          Boolean(saved.quizAnswers.city));
      // Shared-link recipients skip the welcome-then-quiz march and land on
      // the comparison they were actually sent.
      if (authOnly) finishGatedAuth();
      else if (returningWithPrefs) {
        setQuizAnswers(saved.quizAnswers);
        setPhase("review-preferences");
      } else setPhase("welcome");
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : "Couldn't save profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const activeIdx = STEPS.indexOf(step);
  const showBiz = profession === "business" || profession === "investor";
  // OTP already sent for this session — going back to re-edit the number
  // shouldn't silently resend it, just let the visitor change it and send again.
  const goBack = () => {
    if (activeIdx > 0) setStep(STEPS[activeIdx - 1]);
  };

  const transition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className="flex h-full flex-col">
      {/* Back button + step dots */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex w-16 shrink-0 justify-start">
          {activeIdx > 0 && <BackBtn onClick={goBack} />}
        </div>
        <div className="flex flex-1 justify-center gap-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i <= activeIdx ? "bg-champagne" : "bg-border"
              }`}
            />
          ))}
        </div>
        <div className="w-16 shrink-0" />
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
            <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
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
              {detailsError && (
                <p className="text-xs text-red-600 dark:text-red-400">{detailsError}</p>
              )}
            </div>

            <div className="mt-auto pt-10">
              <GoldButton onClick={handleDetails}>Continue →</GoldButton>
              <p
                className="mt-4 text-center text-muted-foreground"
                style={{ fontSize: "var(--step--2)" }}
              >
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
            {!sessionId ? (
              <>
                <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
                  One last step. Verify your number
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  We'll send a one-time code to confirm it's you.
                </p>

                <div className="mt-8">
                  <label
                    className="tracking-luxury mb-2 block text-muted-foreground"
                    style={{ fontSize: "var(--step--2)" }}
                  >
                    Phone number
                  </label>
                  <div className="flex gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setCountryOpen((o) => !o)}
                        className="flex h-12 items-center gap-2 rounded-card border border-border bg-background px-3 text-sm text-foreground hover:border-champagne/40"
                      >
                        <span>{country.flag}</span>
                        <span>{country.code}</span>
                        <span className="text-muted-foreground">▾</span>
                      </button>
                      {countryOpen && (
                        <div className="absolute top-full left-0 z-10 mt-1 w-44 overflow-hidden rounded-card border border-border bg-background shadow-[var(--shadow-pop)]">
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
                      className="h-12 flex-1 rounded-card border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-champagne/60"
                    />
                  </div>
                  {phoneError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{phoneError}</p>
                  )}
                </div>

                <div className="mt-auto pt-10">
                  <GoldButton onClick={handleSendOtp} loading={sending}>
                    Send OTP
                  </GoldButton>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
                  Enter the code we sent
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sent to {country.code} {phone}{" "}
                  <button
                    type="button"
                    onClick={changeNumber}
                    className="text-champagne underline underline-offset-2"
                  >
                    Change number
                  </button>
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
                      onPaste={(e) => handleOtpPaste(i, e)}
                      inputMode="numeric"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      disabled={verifying || Boolean(verificationToken)}
                      className="h-[52px] w-12 rounded-card border border-border bg-background text-center text-lg text-foreground outline-none focus:border-champagne disabled:opacity-60"
                    />
                  ))}
                </motion.div>

                {otpError && (
                  <p className="mt-4 text-center text-xs text-red-600 dark:text-red-400">
                    {otpError}
                  </p>
                )}
                {verifying && (
                  <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Verifying…
                  </p>
                )}

                {verificationToken ? (
                  <div className="mt-auto pt-10">
                    <GoldButton onClick={() => setStep("profession")}>Continue →</GoldButton>
                  </div>
                ) : (
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
                )}
              </>
            )}
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
            <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
              What best describes you?
            </h2>
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
                    className={`rounded-card border p-5 text-left transition-all ${
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
                <p className="mb-3 text-center text-xs text-red-600 dark:text-red-400">
                  {completeError}
                </p>
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
      <label
        className="tracking-luxury mb-2 block text-muted-foreground"
        style={{ fontSize: "var(--step--2)" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-card border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-champagne/60"
      />
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tracking-luxury flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      style={{ fontSize: "var(--step--2)" }}
    >
      ← Back
    </button>
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
