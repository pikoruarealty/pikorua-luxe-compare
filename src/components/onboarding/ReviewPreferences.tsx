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
      <h2 className="font-display text-3xl text-foreground">Welcome back, {firstName}.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Here's what you told us last time. Still sounds right?
      </p>

      <div className="mt-8 space-y-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3"
          >
            <span className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              {r.label}
            </span>
            <span className="text-right text-sm font-medium text-foreground">{r.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-3 pt-10">
        <button
          type="button"
          onClick={keepAndContinue}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-champagne text-sm font-medium tracking-wide text-lux-black transition-opacity hover:opacity-95"
        >
          <Check className="h-4 w-4" /> Looks good, continue
        </button>
        <button
          type="button"
          onClick={openQuizForEdit}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-medium tracking-wide text-foreground transition-colors hover:border-foreground/30"
        >
          <Pencil className="h-4 w-4" /> Edit my preferences
        </button>
      </div>
    </motion.div>
  );
}
