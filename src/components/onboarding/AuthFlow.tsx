import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Briefcase,
  LogIn,
  Mail,
  Phone,
  Store,
  TrendingUp,
  User as UserIcon,
  UserPlus,
  Loader2,
} from "lucide-react";
import { useOnboarding, type UserProfile, type QuizAnswers } from "@/context/OnboardingContext";
import { sendOtp, verifyOtp } from "@/api/functions/otp.functions";
import { sendEmailOtp, verifyEmailOtp } from "@/api/functions/email-otp.functions";
import {
  upsertProfileAfterOtp,
  checkAccountExists,
  completeLogin,
} from "@/api/functions/profile.functions";
import { OtpBoxes } from "@/components/onboarding/OtpBoxes";
import { GoogleSignInButton } from "@/components/onboarding/GoogleSignInButton";
import type { GoogleIdentity } from "@/api/functions/google-auth.functions";

/** choice → (login: identity → otp) | (signup: details → email-otp → phone → profession) */
type Screen =
  | "choice"
  | "login-identity"
  | "login-otp"
  | "signup-details"
  | "signup-email-otp"
  | "signup-phone"
  | "signup-profession";

const SIGNUP_STEPS: Screen[] = [
  "signup-details",
  "signup-email-otp",
  "signup-phone",
  "signup-profession",
];

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
}> = [
  { key: "job", label: "Salaried professional", Icon: Briefcase },
  { key: "business", label: "Business owner", Icon: Store },
  { key: "investor", label: "Investor", Icon: TrendingUp },
  { key: "other", label: "Other", Icon: UserIcon },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const transition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const };

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function AuthFlow() {
  const { setUserProfile, setQuizAnswers, setPhase, authOnly, finishGatedAuth } = useOnboarding();
  const [screen, setScreen] = useState<Screen>("choice");

  // --- shared identity state ---
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [phone, setPhone] = useState("");

  // --- verification proofs ---
  const [emailToken, setEmailToken] = useState("");
  const [phoneToken, setPhoneToken] = useState("");
  const [smsSessionId, setSmsSessionId] = useState("");

  // --- login-specific ---
  const [loginChannel, setLoginChannel] = useState<"email" | "phone">("email");

  // --- profession ---
  const [profession, setProfession] = useState<UserProfile["profession"] | "">("");
  const [businessName, setBusinessName] = useState("");

  // --- transient ui ---
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [otpReset, setOtpReset] = useState(0);
  const [shake, setShake] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  const sendOtpFn = useServerFn(sendOtp);
  const verifyOtpFn = useServerFn(verifyOtp);
  const sendEmailOtpFn = useServerFn(sendEmailOtp);
  const verifyEmailOtpFn = useServerFn(verifyEmailOtp);
  const upsertProfileFn = useServerFn(upsertProfileAfterOtp);
  const checkAccountFn = useServerFn(checkAccountExists);
  const completeLoginFn = useServerFn(completeLogin);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const fullPhoneDigits = () => `${country.code.replace("+", "")}${phone.replace(/\D/g, "")}`;
  const go = (next: Screen) => {
    setError("");
    setScreen(next);
  };

  /** Where a visitor lands once they hold a valid session, login or sign-up. */
  const landAfterAuth = (saved: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string;
    profession: string | null;
    businessName: string | null;
    quizAnswers: QuizAnswers | null;
  }) => {
    setUserProfile({
      name: saved.name ?? name.trim(),
      email: saved.email ?? email.trim(),
      phone: saved.phone,
      profession: (saved.profession as UserProfile["profession"]) ?? "other",
      businessName: saved.businessName ?? undefined,
      uid: saved.id,
    });

    const hasPrefs =
      saved.quizAnswers &&
      ((saved.quizAnswers.bhk?.length ?? 0) > 0 ||
        (saved.quizAnswers.propertyType?.length ?? 0) > 0 ||
        Boolean(saved.quizAnswers.budgetRange) ||
        Boolean(saved.quizAnswers.city));

    // Shared-link recipients land on the comparison they were sent, not the
    // welcome-then-quiz march.
    if (authOnly) finishGatedAuth();
    else if (hasPrefs) {
      setQuizAnswers(saved.quizAnswers);
      setPhase("review-preferences");
    } else setPhase("welcome");
  };

  // ---------------------------------------------------------------- login ---
  const startLogin = async () => {
    const isEmail = loginChannel === "email";
    const identity = isEmail ? email.trim().toLowerCase() : fullPhoneDigits();

    if (isEmail && !EMAIL_RE.test(identity)) return setError("Enter a valid email address.");
    if (!isEmail) {
      const digits = phone.replace(/\D/g, "");
      if (country.code === "+91" && digits.length !== 10) {
        return setError("Enter a 10-digit Indian number.");
      }
      if (digits.length < 6) return setError("Enter a valid number.");
    }

    setBusy(true);
    setError("");
    try {
      const { exists } = await checkAccountFn({ data: { identity, channel: loginChannel } });
      if (!exists) {
        setError(
          isEmail
            ? "No account found with that email. Create one instead."
            : "No account found with that number. Create one instead.",
        );
        return;
      }
      if (isEmail) {
        await sendEmailOtpFn({ data: { email: identity } });
      } else {
        const res = await sendOtpFn({ data: { phone: identity } });
        setSmsSessionId(res.sessionId);
      }
      setOtpReset((k) => k + 1);
      setResendIn(30);
      go("login-otp");
    } catch (e) {
      setError(errText(e, "Couldn't send the code. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const submitLoginOtp = async (code: string) => {
    setBusy(true);
    setError("");
    try {
      const saved =
        loginChannel === "email"
          ? await verifyEmailOtpFn({
              data: { email: email.trim().toLowerCase(), otp: code },
            }).then((r) => completeLoginFn({ data: { emailToken: r.emailToken } }))
          : await verifyOtpFn({
              data: { sessionId: smsSessionId, otp: code },
            }).then((r) => completeLoginFn({ data: { verificationToken: r.verificationToken } }));
      landAfterAuth(saved);
    } catch (e) {
      setError(errText(e, "That code didn't match. Try again."));
      setShake((s) => s + 1);
      setOtpReset((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  /** Google has already proven the address, so its token stands in for the
   *  email OTP. On the sign-in path we go straight to the account; on sign-up
   *  we skip the email step and land on phone verification, which stays
   *  compulsory — the phone is what makes an account unique. */
  const handleGoogle = async (identity: GoogleIdentity) => {
    setEmail(identity.email);
    setEmailToken(identity.emailToken);
    if (identity.name && !name.trim()) setName(identity.name);

    if (screen === "signup-details") {
      go("signup-phone");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const saved = await completeLoginFn({ data: { emailToken: identity.emailToken } });
      landAfterAuth(saved);
    } catch (e) {
      const message = errText(e, "Couldn't sign you in.");
      // No account yet — Google proved the email, so carry that into sign-up
      // rather than making them start over.
      if (/No account found/i.test(message)) {
        setError("No account with that Google email yet — let's create one.");
        go("signup-phone");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  // --------------------------------------------------------------- sign-up ---
  const submitDetails = async () => {
    if (!name.trim()) return setError("Please enter your name.");
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) return setError("Enter a valid email.");

    setBusy(true);
    setError("");
    try {
      await sendEmailOtpFn({ data: { email: cleanEmail } });
      setOtpReset((k) => k + 1);
      setResendIn(30);
      go("signup-email-otp");
    } catch (e) {
      setError(errText(e, "Couldn't send the code. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const submitSignupEmailOtp = async (code: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await verifyEmailOtpFn({
        data: { email: email.trim().toLowerCase(), otp: code },
      });
      setEmailToken(res.emailToken);
      go("signup-phone");
    } catch (e) {
      setError(errText(e, "That code didn't match. Try again."));
      setShake((s) => s + 1);
      setOtpReset((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const sendSignupSms = async () => {
    const digits = phone.replace(/\D/g, "");
    if (country.code === "+91" && digits.length !== 10) {
      return setError("Enter a 10-digit Indian number.");
    }
    if (digits.length < 6) return setError("Enter a valid number.");

    setBusy(true);
    setError("");
    try {
      const res = await sendOtpFn({ data: { phone: fullPhoneDigits() } });
      setSmsSessionId(res.sessionId);
      setOtpReset((k) => k + 1);
      setResendIn(30);
    } catch {
      setError("Couldn't send the code. Check the number and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitSignupSmsOtp = async (code: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await verifyOtpFn({
        data: { sessionId: smsSessionId, otp: code },
      });
      setPhoneToken(res.verificationToken);
      go("signup-profession");
    } catch {
      setError("That code didn't match. Try again.");
      setShake((s) => s + 1);
      setOtpReset((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const finishSignup = async () => {
    if (!profession) return;
    setBusy(true);
    setError("");
    try {
      const saved = await upsertProfileFn({
        data: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          profession,
          businessName: businessName.trim() || undefined,
          verificationToken: phoneToken,
          emailToken,
        },
      });
      landAfterAuth(saved);
    } catch (e) {
      setError(errText(e, "Couldn't save your profile. Try again."));
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------ navigation ---
  const resendCurrent = async () => {
    if (resendIn > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const usingEmail = screen === "signup-email-otp" || loginChannel === "email";
      if (screen === "signup-phone" || (screen === "login-otp" && !usingEmail)) {
        const res = await sendOtpFn({ data: { phone: fullPhoneDigits() } });
        setSmsSessionId(res.sessionId);
      } else {
        await sendEmailOtpFn({ data: { email: email.trim().toLowerCase() } });
      }
      setOtpReset((k) => k + 1);
      setResendIn(30);
    } catch (e) {
      setError(errText(e, "Couldn't resend. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setError("");
    switch (screen) {
      case "login-identity":
      case "signup-details":
        return setScreen("choice");
      case "login-otp":
        return setScreen("login-identity");
      case "signup-email-otp":
        return setScreen("signup-details");
      case "signup-phone":
        return setScreen("signup-email-otp");
      case "signup-profession":
        return setScreen("signup-phone");
      default:
        return;
    }
  };

  const signupIdx = SIGNUP_STEPS.indexOf(screen);
  const showBiz = profession === "business" || profession === "investor";
  const loginTarget =
    loginChannel === "email" ? email.trim().toLowerCase() : `${country.code} ${phone}`;

  return (
    <div className="flex h-full flex-col">
      {/* Back button + sign-up progress dots */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex w-16 shrink-0 justify-start">
          {screen !== "choice" && <BackBtn onClick={goBack} />}
        </div>
        <div className="flex flex-1 justify-center gap-2">
          {signupIdx >= 0 &&
            SIGNUP_STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i <= signupIdx ? "bg-champagne" : "bg-border"
                }`}
              />
            ))}
        </div>
        <div className="w-16 shrink-0" />
      </div>

      <AnimatePresence mode="wait">
        {/* ------------------------------------------------------- choice --- */}
        {screen === "choice" && (
          <Pane key="choice">
            <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
              Welcome to PropCompare
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to pick up where you left off, or create an account to start comparing.
            </p>

            <div className="mt-8 space-y-3">
              <ChoiceCard
                Icon={LogIn}
                title="I already have an account"
                subtitle="Sign in with your email or phone number"
                onClick={() => go("login-identity")}
              />
              <ChoiceCard
                Icon={UserPlus}
                title="I'm new here"
                subtitle="Create your account — takes about a minute"
                onClick={() => go("signup-details")}
              />
            </div>

            <p
              className="mt-auto pt-10 text-center text-muted-foreground"
              style={{ fontSize: "var(--step--2)" }}
            >
              We never share your information.
            </p>
          </Pane>
        )}

        {/* ------------------------------------------------ login: identity --- */}
        {screen === "login-identity" && (
          <Pane key="login-identity">
            <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We'll send a one-time code to confirm it's you.
            </p>

            <div className="mt-6 flex gap-2 rounded-full border border-border p-1">
              {(["email", "phone"] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => {
                    setLoginChannel(ch);
                    setError("");
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-sm transition-colors ${
                    loginChannel === ch
                      ? "bg-champagne font-medium text-lux-black"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {ch === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                  {ch === "email" ? "Email" : "Phone"}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {loginChannel === "email" ? (
                <FieldInput
                  label="Email address"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  type="email"
                  onEnter={startLogin}
                />
              ) : (
                <PhoneField
                  country={country}
                  setCountry={setCountry}
                  open={countryOpen}
                  setOpen={setCountryOpen}
                  phone={phone}
                  setPhone={setPhone}
                  onEnter={startLogin}
                />
              )}
              <ErrorText message={error} />
              {error.includes("Create one instead") && (
                <button
                  type="button"
                  onClick={() => go("signup-details")}
                  className="mt-2 text-sm text-champagne underline underline-offset-2"
                >
                  Create an account →
                </button>
              )}
            </div>

            <div className="mt-auto pt-10">
              <GoldButton onClick={startLogin} loading={busy}>
                Send code
              </GoldButton>
              <OrDivider />
              <GoogleSignInButton onIdentity={handleGoogle} onError={setError} />
            </div>
          </Pane>
        )}

        {/* ----------------------------------------------------- login: otp --- */}
        {screen === "login-otp" && (
          <Pane key="login-otp">
            <OtpHeading target={loginTarget} onChange={goBack} />
            <div className="mt-10">
              <OtpBoxes
                onComplete={submitLoginOtp}
                disabled={busy}
                resetKey={otpReset}
                shakeKey={shake}
              />
            </div>
            <OtpFooter
              busy={busy}
              error={error}
              resendIn={resendIn}
              onResend={resendCurrent}
              verifyingLabel="Signing you in…"
            />
          </Pane>
        )}

        {/* -------------------------------------------------- signup: name --- */}
        {screen === "signup-details" && (
          <Pane key="signup-details">
            <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
              Create your account
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A private profile, just for your PropCompare experience.
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
                onEnter={submitDetails}
              />
              <ErrorText message={error} />
            </div>

            <div className="mt-auto pt-10">
              <GoldButton onClick={submitDetails} loading={busy}>
                Verify email →
              </GoldButton>
              <p
                className="mt-4 text-center text-muted-foreground"
                style={{ fontSize: "var(--step--2)" }}
              >
                We'll email you a 6-digit code.
              </p>
              <OrDivider />
              <GoogleSignInButton onIdentity={handleGoogle} onError={setError} />
              <p
                className="mt-3 text-center text-muted-foreground"
                style={{ fontSize: "var(--step--2)" }}
              >
                Google confirms your email — you'll still verify your phone.
              </p>
            </div>
          </Pane>
        )}

        {/* --------------------------------------------- signup: email otp --- */}
        {screen === "signup-email-otp" && (
          <Pane key="signup-email-otp">
            <OtpHeading
              target={email.trim().toLowerCase()}
              onChange={goBack}
              label="Check your inbox"
            />
            <div className="mt-10">
              <OtpBoxes
                onComplete={submitSignupEmailOtp}
                disabled={busy}
                resetKey={otpReset}
                shakeKey={shake}
              />
            </div>
            <OtpFooter
              busy={busy}
              error={error}
              resendIn={resendIn}
              onResend={resendCurrent}
              verifyingLabel="Verifying…"
            />
          </Pane>
        )}

        {/* -------------------------------------------------- signup: phone --- */}
        {screen === "signup-phone" && (
          <Pane key="signup-phone">
            {!smsSessionId ? (
              <>
                <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
                  Now verify your number
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Email confirmed. Every PropCompare account is secured with a verified phone
                  number.
                </p>
                <div className="mt-8">
                  <PhoneField
                    country={country}
                    setCountry={setCountry}
                    open={countryOpen}
                    setOpen={setCountryOpen}
                    phone={phone}
                    setPhone={setPhone}
                    onEnter={sendSignupSms}
                  />
                  <ErrorText message={error} />
                </div>
                <div className="mt-auto pt-10">
                  <GoldButton onClick={sendSignupSms} loading={busy}>
                    Send OTP
                  </GoldButton>
                </div>
              </>
            ) : (
              <>
                <OtpHeading
                  target={`${country.code} ${phone}`}
                  onChange={() => {
                    setSmsSessionId("");
                    setError("");
                  }}
                  changeLabel="Change number"
                />
                <div className="mt-10">
                  <OtpBoxes
                    onComplete={submitSignupSmsOtp}
                    disabled={busy}
                    resetKey={otpReset}
                    shakeKey={shake}
                  />
                </div>
                <OtpFooter
                  busy={busy}
                  error={error}
                  resendIn={resendIn}
                  onResend={resendCurrent}
                  verifyingLabel="Verifying…"
                />
              </>
            )}
          </Pane>
        )}

        {/* --------------------------------------------- signup: profession --- */}
        {screen === "signup-profession" && (
          <Pane key="signup-profession">
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
              {error && (
                <p className="mb-3 text-center text-xs text-red-600 dark:text-red-400">{error}</p>
              )}
              <GoldButton onClick={finishSignup} disabled={!profession} loading={busy}>
                Complete profile →
              </GoldButton>
            </div>
          </Pane>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------- parts --- */

function Pane({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={transition}
      className="flex flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}

function ChoiceCard({
  Icon,
  title,
  subtitle,
  onClick,
}: {
  Icon: typeof Briefcase;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-card border border-border bg-background p-4 text-left transition-all hover:border-champagne hover:bg-champagne/5"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-champagne/10 text-champagne">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-champagne" />
    </button>
  );
}

function OtpHeading({
  target,
  onChange,
  label = "Enter the code we sent",
  changeLabel = "Change",
}: {
  target: string;
  onChange: () => void;
  label?: string;
  changeLabel?: string;
}) {
  return (
    <>
      <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
        {label}
      </h2>
      <p className="mt-2 text-sm break-words text-muted-foreground">
        Sent to {target}{" "}
        <button
          type="button"
          onClick={onChange}
          className="text-champagne underline underline-offset-2"
        >
          {changeLabel}
        </button>
      </p>
    </>
  );
}

function OtpFooter({
  busy,
  error,
  resendIn,
  onResend,
  verifyingLabel,
}: {
  busy: boolean;
  error: string;
  resendIn: number;
  onResend: () => void;
  verifyingLabel: string;
}) {
  return (
    <>
      {error && <p className="mt-4 text-center text-xs text-red-600 dark:text-red-400">{error}</p>}
      {busy && (
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> {verifyingLabel}
        </p>
      )}
      <div className="mt-auto pt-10 text-center text-xs text-muted-foreground">
        Didn't receive it?{" "}
        <button
          type="button"
          disabled={resendIn > 0 || busy}
          onClick={onResend}
          className="text-champagne disabled:text-muted-foreground"
        >
          {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
        </button>
      </div>
    </>
  );
}

function PhoneField({
  country,
  setCountry,
  open,
  setOpen,
  phone,
  setPhone,
  onEnter,
}: {
  country: (typeof COUNTRIES)[number];
  setCountry: (c: (typeof COUNTRIES)[number]) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  phone: string;
  setPhone: (v: string) => void;
  onEnter?: () => void;
}) {
  return (
    <>
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
            onClick={() => setOpen(!open)}
            className="flex h-12 items-center gap-2 rounded-card border border-border bg-background px-3 text-sm text-foreground hover:border-champagne/40"
          >
            <span>{country.flag}</span>
            <span>{country.code}</span>
            <span className="text-muted-foreground">▾</span>
          </button>
          {open && (
            <div className="absolute top-full left-0 z-10 mt-1 w-44 overflow-hidden rounded-card border border-border bg-background shadow-[var(--shadow-pop)]">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  onClick={() => {
                    setCountry(c);
                    setOpen(false);
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
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          placeholder="98765 43210"
          // Placeholder is deliberately far lighter than --muted-foreground:
          // at full strength it reads as an already-entered number.
          className="h-12 flex-1 rounded-card border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/45 outline-none focus:border-champagne/60"
        />
      </div>
    </>
  );
}

function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span
        className="tracking-luxury text-muted-foreground"
        style={{ fontSize: "var(--step--2)" }}
      >
        or
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  if (!message) return null;
  return <p className="mt-2 text-xs text-red-600 dark:text-red-400">{message}</p>;
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  onEnter?: () => void;
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
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        className="h-12 w-full rounded-card border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/45 outline-none focus:border-champagne/60"
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
