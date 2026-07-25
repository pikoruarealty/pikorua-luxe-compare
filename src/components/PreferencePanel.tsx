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

  const optionsContent = (
    <div className="space-y-7">
      {/* PROPERTY TYPE */}
      <Group title="Property Type" subtitle="Select architectural styles">
        <div className="flex flex-wrap gap-3 sm:gap-3.5">
          {PROPERTY_TYPES.map(({ label, icon: Icon }) => {
            const active = current.propertyType.includes(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggle("propertyType", label)}
                className={`group inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 ${
                  active
                    ? "bg-gradient-to-r from-champagne via-muted-gold to-champagne text-lux-black shadow-md shadow-champagne/20 ring-2 ring-champagne/40"
                    : "border border-[var(--rule-strong)] bg-card/80 text-foreground/85 hover:border-champagne/60 hover:bg-card hover:text-foreground"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 transition-transform group-hover:scale-110 ${
                    active ? "text-lux-black stroke-[2.5]" : "text-champagne"
                  }`}
                />
                {label}
                {active && <Check className="ml-0.5 h-3.5 w-3.5 stroke-[3]" />}
              </button>
            );
          })}
        </div>
      </Group>

      {/* BHK CONFIGURATION */}
      <Group title="Configuration" subtitle="Bedrooms & layouts">
        <div className="flex flex-wrap gap-3 sm:gap-3.5">
          {BHK_OPTIONS.map((b) => {
            const active = current.bhk.includes(b);
            return (
              <button
                key={b}
                type="button"
                onClick={() => toggle("bhk", b)}
                className={`group inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 ${
                  active
                    ? "bg-gradient-to-r from-champagne via-muted-gold to-champagne text-lux-black shadow-md shadow-champagne/20 ring-2 ring-champagne/40"
                    : "border border-[var(--rule-strong)] bg-card/80 text-foreground/85 hover:border-champagne/60 hover:bg-card hover:text-foreground"
                }`}
              >
                <BedDouble
                  className={`h-3.5 w-3.5 transition-transform group-hover:scale-110 ${
                    active ? "text-lux-black stroke-[2.5]" : "text-champagne"
                  }`}
                />
                {b}
                {active && <Check className="ml-0.5 h-3.5 w-3.5 stroke-[3]" />}
              </button>
            );
          })}
        </div>
      </Group>

      {/* PRICE BAND */}
      <Group title="Price Band" subtitle="Budget spectrum">
        <div className="flex flex-wrap gap-3 sm:gap-3.5">
          {BUDGETS.map((b) => {
            const active = current.budgetRange === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setBudget(b)}
                className={`group inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 ${
                  active
                    ? "bg-gradient-to-r from-champagne via-muted-gold to-champagne text-lux-black shadow-md shadow-champagne/20 ring-2 ring-champagne/40"
                    : "border border-[var(--rule-strong)] bg-card/80 text-foreground/85 hover:border-champagne/60 hover:bg-card hover:text-foreground"
                }`}
              >
                <Coins
                  className={`h-3.5 w-3.5 transition-transform group-hover:scale-110 ${
                    active ? "text-lux-black stroke-[2.5]" : "text-champagne"
                  }`}
                />
                {b}
                {active && <span className="ml-0.5 h-2 w-2 rounded-full bg-lux-black" />}
              </button>
            );
          })}
        </div>
      </Group>
    </div>
  );

  if (hideHeader) {
    return optionsContent;
  }

  return (
    <aside className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-[var(--rule)] bg-card shadow-lg">
      {/* FIXED STATIONARY HEADER */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--rule)] bg-gradient-to-b from-champagne/5 to-transparent p-5 pb-4">
        <div>
          <p className="font-label tracking-luxury text-[11px] font-bold uppercase text-champagne">
            Your Preferences
          </p>
          <h3 className="mt-0.5 font-display text-xl font-bold text-foreground">
            Refine Collection
          </h3>
        </div>
        {totalSelected > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-champagne"
          >
            <RotateCcw className="h-3 w-3 text-champagne" /> Clear all
          </button>
        )}
      </div>

      {/* INTERNAL SCROLLABLE OPTIONS BODY */}
      <div className="pref-scroll flex-1 overflow-y-auto p-6 [webkit-overflow-scrolling:touch]">
        {optionsContent}
      </div>
    </aside>
  );
}

function Group({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-champagne" />
          <h4 className="font-display text-xs font-bold uppercase tracking-widest text-foreground">
            {title}
          </h4>
        </div>
        {subtitle && (
          <p className="mt-0.5 pl-3.5 text-[11px] font-medium text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="pl-1">{children}</div>
    </div>
  );
}
