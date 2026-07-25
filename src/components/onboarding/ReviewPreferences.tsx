import { motion } from "framer-motion";
import { Check, Pencil } from "lucide-react";
import { useOnboarding } from "@/context/OnboardingContext";

/** Shown instead of the full quiz when a returning visitor already has saved
 *  preferences — confirms what they told us last time rather than asking
 *  everything again, with a single "Edit" escape hatch into the full quiz
 *  (pre-filled) for whoever wants to actually change something. */
export function ReviewPreferences() {
  const { userProfile, quizAnswers, completeOnboarding, openQuizForEdit } = useOnboarding();
  const firstName = userProfile?.name?.trim().split(/\s+/)[0] ?? "there";

  const rows = [
    {
      label: "Location",
      value: [quizAnswers?.city, quizAnswers?.state].filter(Boolean).join(", "),
    },
    { label: "Property type", value: quizAnswers?.propertyType?.join(", ") ?? "" },
    {
      label: "Configuration",
      value: quizAnswers?.bhk?.map((b) => `${b} BHK`).join(", ") ?? "",
    },
    { label: "Budget", value: quizAnswers?.budgetSub || quizAnswers?.budgetRange || "" },
  ].filter((r) => r.value);

  const keepAndContinue = () => {
    completeOnboarding(quizAnswers);
    window.setTimeout(() => {
      document.getElementById("suite")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex h-full flex-col"
    >
      <h2 className="font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
        Welcome back, {firstName}.
      </h2>
      <p className="mt-2 text-muted-foreground" style={{ fontSize: "var(--step--1)" }}>
        Here's what you told us last time. Still sounds right?
      </p>

      <div className="mt-8 space-y-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-4 rounded-card border border-[var(--rule)] bg-background px-4 py-3"
          >
            <span
              className="tracking-luxury text-muted-foreground"
              style={{ fontSize: "var(--step--2)" }}
            >
              {r.label}
            </span>
            <span
              className="text-right font-medium text-foreground"
              style={{ fontSize: "var(--step--1)" }}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-3 pt-10">
        <button
          type="button"
          onClick={keepAndContinue}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-champagne font-medium tracking-wide text-lux-black transition-opacity hover:opacity-95"
          style={{ fontSize: "var(--step--1)" }}
        >
          <Check className="h-4 w-4" /> Looks good, continue
        </button>
        <button
          type="button"
          onClick={openQuizForEdit}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--rule)] font-medium tracking-wide text-foreground transition-colors hover:border-foreground/40"
          style={{ fontSize: "var(--step--1)" }}
        >
          <Pencil className="h-4 w-4" /> Edit my preferences
        </button>
      </div>
    </motion.div>
  );
}
