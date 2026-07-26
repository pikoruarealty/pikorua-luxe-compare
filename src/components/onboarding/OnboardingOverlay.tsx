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
  const { phase, setPhase, quizAnswers, quizEditMode, cancelQuizEdit } = useOnboarding();
  // The public sign-in / quiz gate must never appear on the admin portal.
  const isAdminRoute = useRouterState({
    select: (s) => s.location.pathname.startsWith("/admin"),
  });

  // Auth and the first-time quiz are compulsory — the only way out is a
  // signed-in profile / completed quiz. Editing preferences later (reopened
  // from account settings) is the one case that stays dismissable.
  const dismiss = useCallback(() => {
    if (quizEditMode) cancelQuizEdit();
    setPhase("idle");
  }, [quizEditMode, cancelQuizEdit, setPhase]);

  // Escape key cancels/dismisses the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

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
    !isAdminRoute &&
    (phase === "auth" || phase === "welcome" || phase === "review-preferences" || phase === "quiz");

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="onboarding-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex items-stretch justify-center overflow-y-auto sm:items-center"
          style={{
            backgroundColor: "rgba(10, 10, 12, 0.65)",
            backdropFilter: "blur(4px)",
          }}
          aria-modal="true"
          role="dialog"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex w-full max-w-[480px] flex-col overflow-hidden rounded-card border border-[var(--rule)] bg-card p-5 shadow-2xl sm:my-8 sm:p-8"
            style={{ minHeight: "min(100dvh, 580px)" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-card"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 0%, color-mix(in oklab, var(--color-champagne) 12%, transparent), transparent 60%)",
                zIndex: 0,
              }}
            />

            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              title="Close"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--rule)] bg-card/90 text-foreground transition-colors hover:border-foreground/40 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
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
