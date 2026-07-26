import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Home,
  Building,
  Building2,
  Layers,
  Compass,
  Coins,
  BedDouble,
  RotateCcw,
} from "lucide-react";
import { useOnboarding, type QuizAnswers } from "@/context/OnboardingContext";
import { saveQuizAnswers as saveQuizAnswersFn } from "@/lib/profile.functions";

const PROPERTY_TYPES: Array<{ label: string; icon: typeof Home }> = [
  { label: "Bungalow", icon: Home },
  { label: "Apartment", icon: Building },
  { label: "Penthouse", icon: Building2 },
  { label: "Duplex", icon: Layers },
  { label: "Plots", icon: Compass },
];

const BHK_OPTIONS = ["2 BHK", "3 BHK", "4 BHK", "5 BHK", "6 BHK", "7 BHK"];
const BUDGETS = ["₹ 1 – 5 Cr", "₹ 6 – 10 Cr", "₹ 11 – 15 Cr", "₹ 16 – 20 Cr", "₹ 21 Cr +"];

export function PreferencePanel({ hideHeader = false }: { hideHeader?: boolean }) {
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

  // Shared chip button styles
  const chipBase =
    "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold tracking-wide transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne";
  const chipActive =
    "border-champagne bg-gradient-to-r from-champagne/25 to-champagne/10 text-foreground ring-1 ring-champagne/35 shadow-sm shadow-champagne/10";
  const chipInactive =
    "border-[var(--rule-strong)] bg-card text-foreground/75 hover:border-champagne/40 hover:text-foreground hover:bg-card/90";

  const optionsContent = (
    <div className="flex flex-col gap-6" role="region" aria-label="Collection filters">
      {/* ── PROPERTY TYPE ── */}
      <section className="space-y-3">
        <SectionLabel title="Property Type" count={current.propertyType.length} />
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPES.map(({ label, icon: Icon }) => {
            const active = current.propertyType.includes(label);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                aria-label={`Filter by ${label}`}
                onClick={() => toggle("propertyType", label)}
                className={`${chipBase} ${active ? chipActive : chipInactive}`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all ${
                    active
                      ? "border-champagne bg-champagne text-lux-black"
                      : "border-champagne/30 bg-champagne/10 text-champagne"
                  }`}
                >
                  <Icon className="h-[10px] w-[10px] stroke-[2.5]" />
                </span>
                {label}
                {active && <Check className="h-3.5 w-3.5 stroke-[3] text-champagne" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── CONFIGURATION ── */}
      <section className="space-y-3">
        <SectionLabel title="Configuration" count={current.bhk.length} />
        <div className="flex flex-wrap gap-2">
          {BHK_OPTIONS.map((b) => {
            const active = current.bhk.includes(b);
            return (
              <button
                key={b}
                type="button"
                aria-pressed={active}
                aria-label={`Filter by ${b} configuration`}
                onClick={() => toggle("bhk", b)}
                className={`${chipBase} ${active ? chipActive : chipInactive}`}
              >
                <BedDouble
                  className={`h-3.5 w-3.5 stroke-[2.2] shrink-0 ${
                    active ? "text-champagne" : "text-champagne/55"
                  }`}
                />
                {b}
                {active && <Check className="h-3.5 w-3.5 stroke-[3] text-champagne" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── PRICE BAND ── */}
      <section className="space-y-3">
        <SectionLabel title="Price Band" count={current.budgetRange ? 1 : 0} />
        <div className="grid grid-cols-2 gap-2">
          {BUDGETS.map((b) => {
            const active = current.budgetRange === b;
            return (
              <button
                key={b}
                type="button"
                aria-pressed={active}
                aria-label={`Filter by budget ${b}`}
                onClick={() => setBudget(b)}
                className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne ${
                  active
                    ? "border-champagne bg-gradient-to-r from-champagne/20 to-champagne/8 ring-1 ring-champagne/35 shadow-sm shadow-champagne/10"
                    : "border-[var(--rule-strong)] bg-card text-foreground/75 hover:border-champagne/40 hover:bg-card/90 hover:text-foreground"
                }`}
              >
                <Coins
                  className={`h-3.5 w-3.5 shrink-0 stroke-[2] ${
                    active ? "text-champagne" : "text-champagne/50"
                  }`}
                />
                <span className="truncate text-[12px] font-semibold tracking-wide">{b}</span>
                {active && (
                  <span className="ml-auto grid h-4 w-4 shrink-0 place-items-center rounded-full bg-champagne text-lux-black">
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );

  if (hideHeader) {
    return optionsContent;
  }

  return (
    <aside className="flex flex-col rounded-2xl border border-[var(--rule)] bg-card shadow-md">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--rule)] bg-gradient-to-b from-champagne/5 to-transparent px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-label tracking-luxury text-[10px] font-bold uppercase text-champagne">
              Your Preferences
            </p>
            {totalSelected > 0 && (
              <span className="rounded-full border border-champagne/30 bg-champagne/15 px-2 py-0.5 text-[9px] font-extrabold text-champagne">
                {totalSelected} active
              </span>
            )}
          </div>
          <h3 className="mt-0.5 font-display text-lg font-bold text-foreground">
            Refine Collection
          </h3>
        </div>
        {totalSelected > 0 && (
          <button
            type="button"
            aria-label="Clear all active preferences"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--rule)] bg-background/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-all hover:border-champagne/40 hover:text-champagne focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne"
          >
            <RotateCcw className="h-2.5 w-2.5 text-champagne" /> Clear
          </button>
        )}
      </div>
      <div className="p-5">{optionsContent}</div>
    </aside>
  );
}

function SectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" />
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/60">
          {title}
        </span>
      </div>
      {count > 0 && (
        <span className="rounded-full border border-champagne/30 bg-champagne/10 px-2 py-0.5 text-[9px] font-extrabold text-champagne">
          {count} selected
        </span>
      )}
    </div>
  );
}
