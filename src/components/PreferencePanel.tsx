import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { useOnboarding, type QuizAnswers } from "@/context/OnboardingContext";
import { saveQuizAnswers as saveQuizAnswersFn } from "@/lib/profile.functions";

const PROPERTY_TYPES = ["Bungalow", "Apartment", "Penthouse", "Duplex", "Plots"];
// Full BHK range shown to the visitor. Only 4/5 BHK exist in the current
// catalogue, so 2/3/6/7 BHK are a no-op filter until matching inventory
// is added (see preference-filter.ts) — kept for consistency with the quiz.
const BHK_OPTIONS = ["2 BHK", "3 BHK", "4 BHK", "5 BHK", "6 BHK", "7 BHK"];
const BUDGETS = ["₹ 1 – 5 Cr", "₹ 6 – 10 Cr", "₹ 11 – 15 Cr", "₹ 16 – 20 Cr", "₹ 21 Cr +"];

export function PreferencePanel() {
  const { quizAnswers, setQuizAnswers } = useOnboarding();
  const saveQuiz = useServerFn(saveQuizAnswersFn);

  const current: QuizAnswers = quizAnswers ?? {
    bhk: [],
    propertyType: [],
    budgetRange: "",
    budgetSub: "",
  };

  const persist = (next: QuizAnswers) => {
    setQuizAnswers(next);
    try {
      window.localStorage.setItem("pikorua:quiz-answers", JSON.stringify(next));
    } catch {
      // ignore
    }
    saveQuiz({ data: { answers: next } }).catch(() => {});
  };

  const toggle = (key: "propertyType" | "bhk", value: string) => {
    const arr = current[key];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    persist({ ...current, [key]: next });
  };

  const setBudget = (b: string) => {
    persist({
      ...current,
      budgetRange: current.budgetRange === b ? "" : b,
      budgetSub: "",
    });
  };

  const clearAll = () => {
    setQuizAnswers(null);
    try {
      window.localStorage.removeItem("pikorua:quiz-answers");
    } catch {
      // ignore
    }
    saveQuiz({ data: { answers: null } }).catch(() => {});
  };

  const totalSelected =
    current.propertyType.length + current.bhk.length + (current.budgetRange ? 1 : 0);

  return (
    <aside className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-glass)">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
            Your preferences
          </p>
          <h3 className="mt-1 font-display text-[20px] text-foreground">Refine</h3>
        </div>
        {totalSelected > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] tracking-[0.18em] uppercase text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      <Group title="Property type">
        {PROPERTY_TYPES.map((t) => (
          <CheckRow
            key={t}
            label={t}
            checked={current.propertyType.includes(t)}
            onChange={() => toggle("propertyType", t)}
          />
        ))}
      </Group>

      <Group title="Configuration">
        {BHK_OPTIONS.map((b) => (
          <CheckRow
            key={b}
            label={b}
            checked={current.bhk.includes(b)}
            onChange={() => toggle("bhk", b)}
          />
        ))}
      </Group>

      <Group title="Budget">
        {BUDGETS.map((b) => (
          <CheckRow
            key={b}
            label={b}
            checked={current.budgetRange === b}
            onChange={() => setBudget(b)}
          />
        ))}
      </Group>
    </aside>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">{title}</p>
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors ${
          checked ? "border-foreground bg-foreground" : "border-border bg-transparent"
        }`}
      >
        {checked && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
      </span>
      <span className={`text-[13px] ${checked ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
    </label>
  );
}
