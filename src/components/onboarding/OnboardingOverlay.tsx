import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useOnboarding } from "@/context/OnboardingContext";
import { PhoneAuthFlow } from "./PhoneAuthFlow";
import { WelcomeCard } from "./WelcomeCard";
import { PropertyQuiz } from "./PropertyQuiz";
import { ReviewPreferences } from "./ReviewPreferences";

export function OnboardingOverlay() {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const { phase, setPhase, quizAnswers, quizEditMode, cancelQuizEdit, hydrated, userProfile } =
    useOnboarding();
  // The public sign-in / quiz gate must never appear on the admin or developer
  // portals — those have their own account-based auth entirely.
  const isPortalRoute = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/admin") || s.location.pathname.startsWith("/developer"),
  });

  // Authentication is action-gated. Anonymous visitors can browse public
  // details, and dismissing auth must preserve their current selection.
  const locked = false;

  const dismiss = useCallback(() => {
    if (locked) return;
    if (quizEditMode) cancelQuizEdit();
    setPhase("idle");
  }, [locked, quizEditMode, cancelQuizEdit, setPhase]);

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
    !isPortalRoute &&
    (phase === "auth" || phase === "welcome" || phase === "review-preferences" || phase === "quiz");

  useEffect(() => {
    if (!active) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trap);
      restoreFocusRef.current?.focus();
    };
  }, [active]);

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
          aria-label="PropCompare account authentication"
          role="dialog"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
        >
          <motion.div
            ref={dialogRef}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-[var(--rule)] bg-card p-6 shadow-2xl sm:my-8 sm:p-8"
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

            {!locked && (
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close"
                title="Close"
                className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--rule)] bg-card/90 text-foreground transition-colors hover:border-foreground/40 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <div className="relative flex flex-1 flex-col" style={{ zIndex: 1 }}>
              {phase === "auth" && <PhoneAuthFlow />}
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
