import { useOnboarding } from "@/context/OnboardingContext";
import { useServerFn } from "@tanstack/react-start";
import { saveQuizAnswers as saveQuizAnswersFn } from "@/api/functions/profile.functions";

export function PreferenceBanner() {
  const { quizAnswers, openQuizForEdit, setQuizAnswers } = useOnboarding();
  const saveQuiz = useServerFn(saveQuizAnswersFn);

  const clearAll = () => {
    setQuizAnswers(null);
    try {
      window.localStorage.removeItem("pikorua:quiz-answers");
    } catch {
      // ignore
    }
    saveQuiz({ data: { answers: null } }).catch(() => {});
  };

  if (!quizAnswers) return null;

  const bhkLabel = quizAnswers.bhk.length ? quizAnswers.bhk.join(", ") : null;
  const typeLabel = quizAnswers.propertyType.length ? quizAnswers.propertyType.join(" · ") : null;
  const budgetLabel = quizAnswers.budgetSub || quizAnswers.budgetRange || null;

  const chips = [bhkLabel, typeLabel, budgetLabel].filter(Boolean) as string[];
  if (chips.length === 0) return null;

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--rule)] bg-card/90 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-luxury text-muted-foreground">
          Your preferences
        </span>
        <span className="hidden h-4 w-px bg-[var(--rule)] sm:block" aria-hidden />
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-full border border-champagne/30 bg-champagne/10 px-3 py-1 text-xs font-medium text-champagne"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={clearAll}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear all
        </button>
        <span className="h-4 w-px bg-[var(--rule)]" aria-hidden />
        <button
          type="button"
          onClick={openQuizForEdit}
          className="text-xs font-medium text-champagne transition-colors hover:text-champagne/80"
        >
          Edit preferences
        </button>
      </div>
    </div>
  );
}
