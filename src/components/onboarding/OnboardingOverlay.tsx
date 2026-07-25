import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useOnboarding } from "@/context/OnboardingContext";
import { AuthFlow } from "./AuthFlow";
import { WelcomeCard } from "./WelcomeCard";
import { PropertyQuiz } from "./PropertyQuiz";
import { ReviewPreferences } from "./ReviewPreferences";

export function OnboardingOverlay() {
  const { phase, setPhase, quizAnswers, quizEditMode, cancelQuizEdit, hydrated } = useOnboarding();
  // The public sign-in / quiz gate must never appear on the admin or
  // developer portals — those have their own account-based auth entirely.
  const isPortalRoute = useRouterState({
    select: (s) => s.location.pathname.startsWith("/admin") || s.location.pathname.startsWith("/developer"),
  });

  // Auth and the first-time quiz are compulsory — the only way out is a
  // signed-in profile / completed quiz. Editing preferences later (reopened
  // from account settings) is the one case that stays dismissable.
  const dismiss = useCallback(() => {
    if (quizEditMode) cancelQuizEdit();
  }, [quizEditMode, cancelQuizEdit]);

  // Escape only cancels an in-progress preference edit.
  useEffect(() => {
    if (!quizEditMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quizEditMode, dismiss]);

  // idle -> auth on first scroll (one-time, compulsory). Gated on `hydrated`
  // so a returning signed-in user's brief "idle" flash before the session
  // check resolves can't misfire this.
  useEffect(() => {
    if (isPortalRoute || !hydrated || phase !== "idle") return;
    const onScroll = () => {
      if (window.scrollY > 200) setPhase("auth");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isPortalRoute, hydrated, phase, setPhase]);

  // welcome -> site-preview lands the visitor straight on the property
  // picker (the "suite" section, 3 comparison slots) instead of the top of
  // the homepage. Site-wide CSS sets `scroll-behavior: smooth`, which makes
  // scrollIntoView({behavior:"auto"}) animate instead of jumping instantly —
  // so the listener below armed while that animation was still in flight and
  // mistook its tail end for the visitor's first scroll. Forcing the html
  // element's scroll-behavior to "auto" for the jump makes it truly instant,
  // so the listener can arm on the very next frame with nothing left to fire.
  useEffect(() => {
    if (isPortalRoute || phase !== "site-preview") return;
    const suite = document.getElementById("suite");
    if (suite) {
      const html = document.documentElement;
      const prevScrollBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      suite.scrollIntoView({ behavior: "auto", block: "start" });
      html.style.scrollBehavior = prevScrollBehavior;
    }

    let armed = false;
    let baseline = window.scrollY;
    const armFrame = requestAnimationFrame(() => {
      baseline = window.scrollY;
      armed = true;
    });

    const triggerQuiz = () => setPhase("quiz");
    const onScroll = () => {
      if (armed && Math.abs(window.scrollY - baseline) > 40) triggerQuiz();
    };
    const onInteract = () => {
      if (armed) triggerQuiz();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onInteract);
    return () => {
      cancelAnimationFrame(armFrame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onInteract);
    };
  }, [isPortalRoute, phase, setPhase]);

  // Lock body scroll while overlay card is visible
  useEffect(() => {
    const active =
      phase === "auth" || phase === "welcome" || phase === "review-preferences" || phase === "quiz";
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  const active =
    !isPortalRoute &&
    (phase === "auth" || phase === "welcome" || phase === "review-preferences" || phase === "quiz");

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="onboarding-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[100] flex items-stretch justify-center overflow-y-auto sm:items-center"
          style={{
            backgroundColor: "rgba(10, 10, 12, 0.18)",
            backdropFilter: "blur(2px)",
          }}
          aria-modal="true"
          role="dialog"
          onClick={(e) => {
            if (e.target === e.currentTarget && quizEditMode) dismiss();
          }}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-champagne/20 bg-card p-5 shadow-2xl sm:my-8 sm:p-8"
            style={{ minHeight: "min(100dvh, 580px)" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 0%, color-mix(in oklab, var(--color-champagne) 12%, transparent), transparent 60%)",
                zIndex: 0,
              }}
            />

            {quizEditMode && (
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close"
                title="Close"
                className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-champagne/30 bg-card/90 text-champagne transition-colors hover:brightness-110"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <div className="relative flex flex-1 flex-col" style={{ zIndex: 1 }}>
              {phase === "auth" && <AuthFlow />}
              {phase === "welcome" && <WelcomeCard />}
              {phase === "review-preferences" && <ReviewPreferences />}
              {phase === "quiz" && (
                <PropertyQuiz
                  initialAnswers={quizEditMode ? (quizAnswers ?? undefined) : undefined}
                  editMode={quizEditMode}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
