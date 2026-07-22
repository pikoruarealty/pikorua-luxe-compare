import { useOnboarding } from "@/context/OnboardingContext";
import { useServerFn } from "@tanstack/react-start";
import { saveQuizAnswers as saveQuizAnswersFn } from "@/lib/profile.functions";

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
    <div className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-champagne/20 bg-card/90 px-6 py-3">
      <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
        Your preferences
      </span>
      <span className="h-4 w-px bg-border" aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <span
            key={c}
            className="rounded-full border border-champagne/30 bg-champagne/5 px-3 py-1 text-[12px] text-champagne"
          >
            {c}
          </span>
        ))}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={clearAll}
        className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Clear all
      </button>
      <span className="h-4 w-px bg-border" aria-hidden />
      <button
        type="button"
        onClick={openQuizForEdit}
        className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Edit preferences
      </button>
    </div>
  );
}
