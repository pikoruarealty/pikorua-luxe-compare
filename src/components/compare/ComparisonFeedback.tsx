import { useMemo, useState } from "react";
import { Check, MessageSquareMore } from "lucide-react";
import { toast } from "sonner";

import { COMPARISON_REASON_CODES, type ActivityEvent } from "@/api/functions/activity.functions";
import { INTELLIGENCE_REASON_LABELS } from "@/domain/developer-intelligence";
import { useActivityLog } from "@/hooks/use-activity-log";

const STORAGE_PREFIX = "propcompare:comparison-feedback:";

type Choice = string | "undecided";

function feedbackIdFor(slugs: string[]) {
  const key = `${STORAGE_PREFIX}${[...slugs].sort().join("|")}`;
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function ComparisonFeedback({
  properties,
}: {
  properties: Array<{ slug: string; name: string }>;
}) {
  const logActivity = useActivityLog();
  const propertySlugs = useMemo(
    () => properties.map((property) => property.slug).sort(),
    [properties],
  );
  const [choice, setChoice] = useState<Choice>("undecided");
  const [reasons, setReasons] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const toggleReason = (code: string) => {
    setReasons((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : current.length < 3
          ? [...current, code]
          : current,
    );
    setSubmitted(false);
  };

  const submit = () => {
    logActivity("comparison_feedback" satisfies ActivityEvent, null, {
      feedbackId: feedbackIdFor(propertySlugs),
      propertySlugs,
      selectedPropertySlug: choice === "undecided" ? null : choice,
      reasonCodes: reasons,
    });
    setSubmitted(true);
    toast.success("Decision feedback saved");
  };

  return (
    <section
      aria-labelledby="comparison-feedback-title"
      className="mt-12 overflow-hidden rounded-[1.75rem] bg-foreground/[0.035]"
    >
      <div className="grid gap-0 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="border-b border-(--rule) p-6 sm:p-8 lg:border-r lg:border-b-0">
          <MessageSquareMore className="h-5 w-5 text-champagne" aria-hidden="true" />
          <p className="mt-8 text-xs tracking-[0.16em] text-muted-foreground">Optional research</p>
          <h2
            id="comparison-feedback-title"
            className="mt-2 max-w-sm font-display text-2xl font-semibold tracking-tight"
          >
            What is shaping your decision?
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            Your answer becomes anonymous, aggregate market context. It never changes project
            ranking or PropScore.
          </p>
        </div>
        <div className="p-6 sm:p-8">
          <fieldset>
            <legend className="text-sm font-semibold">Which project is leading?</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {properties.map((property) => (
                <ChoiceButton
                  key={property.slug}
                  active={choice === property.slug}
                  onClick={() => {
                    setChoice(property.slug);
                    setSubmitted(false);
                  }}
                >
                  {property.name}
                </ChoiceButton>
              ))}
              <ChoiceButton
                active={choice === "undecided"}
                onClick={() => {
                  setChoice("undecided");
                  setSubmitted(false);
                }}
              >
                Still deciding
              </ChoiceButton>
            </div>
          </fieldset>
          <fieldset className="mt-7">
            <legend className="text-sm font-semibold">
              What made the difference? Pick up to three.
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {COMPARISON_REASON_CODES.map((code) => (
                <ChoiceButton
                  key={code}
                  active={reasons.includes(code)}
                  disabled={!reasons.includes(code) && reasons.length >= 3}
                  onClick={() => toggleReason(code)}
                >
                  {INTELLIGENCE_REASON_LABELS[code]}
                </ChoiceButton>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={submit}
            className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-champagne px-5 text-sm font-semibold text-lux-black transition duration-200 hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {submitted && <Check className="h-4 w-4" aria-hidden="true" />}
            {submitted ? "Saved — update anytime" : "Save feedback"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ChoiceButton({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition duration-200 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "border-champagne bg-champagne/12 text-champagne"
          : "border-(--rule-strong) bg-background/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
