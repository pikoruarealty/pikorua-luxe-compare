import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Home as HomeIcon, Building, Building2, Layers, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";
import { useOnboarding, type QuizAnswers } from "@/context/OnboardingContext";
import { useProperties } from "@/context/PropertiesContext";
import { getAvailableLocations } from "@/lib/locations";

// Full BHK range shown to the visitor. Only 4/5 BHK exist in the current
// catalogue, so picking 2, 3, 6, or 7 won't narrow results yet — it's a
// no-op filter until matching inventory is added (see preference-filter.ts).
const BHK_OPTIONS = ["2", "3", "4", "5", "6", "7"];
const MAX_BHK = 2;
const PROPERTY_TYPES: Array<{ label: string; Icon: typeof HomeIcon }> = [
  { label: "Bungalow", Icon: HomeIcon },
  { label: "Apartment", Icon: Building },
  { label: "Penthouse", Icon: Building2 },
  { label: "Duplex", Icon: Layers },
  { label: "Plots", Icon: MapIcon },
];
const BUDGET_RANGES = ["₹ 1 – 5 Cr", "₹ 6 – 10 Cr", "₹ 11 – 15 Cr", "₹ 16 – 20 Cr", "₹ 21 Cr +"];
// Sub-ranges step in ~2 Cr bands. Properties round to the nearest band:
// e.g. 2.5 Cr → "₹ 1 – 2 Cr" band, 2.6 Cr → "₹ 3 – 4 Cr" band.
const SUB_RANGES: Record<string, string[]> = {
  "₹ 1 – 5 Cr": ["₹ 1 – 2 Cr", "₹ 3 – 4 Cr", "₹ 5 Cr"],
  "₹ 6 – 10 Cr": ["₹ 6 – 7 Cr", "₹ 8 – 9 Cr", "₹ 10 Cr"],
  "₹ 11 – 15 Cr": ["₹ 11 – 12 Cr", "₹ 13 – 14 Cr", "₹ 15 Cr"],
  "₹ 16 – 20 Cr": ["₹ 16 – 17 Cr", "₹ 18 – 19 Cr", "₹ 20 Cr"],
};

const transition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const };

export function PropertyQuiz({
  initialAnswers,
  editMode = false,
}: {
  initialAnswers?: QuizAnswers;
  editMode?: boolean;
} = {}) {
  const { completeOnboarding } = useOnboarding();
  const properties = useProperties();
  const [q, setQ] = useState<1 | 2 | 3 | 4>(1);

  // Derived from the property catalog — grows automatically as new
  // states/cities are added, no hardcoded list.
  const locationGroups = getAvailableLocations(properties);
  const [selectedState, setSelectedState] = useState<string>(
    () => initialAnswers?.state || (locationGroups.length === 1 ? locationGroups[0].state : ""),
  );
  const citiesForState = locationGroups.find((g) => g.state === selectedState)?.cities ?? [];
  const [selectedCity, setSelectedCity] = useState<string>(
    () => initialAnswers?.city || (citiesForState.length === 1 ? citiesForState[0] : ""),
  );

  const selectState = (s: string) => {
    setSelectedState(s);
    const cities = locationGroups.find((g) => g.state === s)?.cities ?? [];
    setSelectedCity(cities.length === 1 ? cities[0] : "");
  };

  const [types, setTypes] = useState<string[]>(initialAnswers?.propertyType ?? []);
  const [bhk, setBhk] = useState<string[]>(
    initialAnswers?.bhk?.map((b) => b.replace(/\s*BHK$/i, "").trim()) ?? [],
  );
  const [budgetRange, setBudgetRange] = useState(initialAnswers?.budgetRange ?? "");
  const [budgetSub, setBudgetSub] = useState(initialAnswers?.budgetSub ?? "");

  const toggleType = (v: string) => {
    setTypes((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));
  };

  const toggleBhk = (v: string) => {
    setBhk((arr) => {
      if (arr.includes(v)) return arr.filter((x) => x !== v);
      if (arr.length >= MAX_BHK) {
        toast.error(`You can choose up to ${MAX_BHK} BHK options.`);
        return arr;
      }
      return [...arr, v];
    });
  };

  const finish = () => {
    const answers: QuizAnswers = {
      state: selectedState,
      city: selectedCity,
      bhk: bhk.map((b) => `${b} BHK`),
      propertyType: types,
      budgetRange,
      budgetSub,
    };
    completeOnboarding(answers);
    // Land straight on the property picker once the overlay unmounts and body
    // scroll unlocks, instead of leaving the visitor wherever the pre-quiz
    // scroll happened to stop. A no-op on routes without a #suite section
    // (e.g. editing preferences from the Account page).
    window.setTimeout(() => {
      document.getElementById("suite")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const showBudgetComplete = budgetRange === "₹ 21 Cr +" || (budgetRange && budgetSub);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <div className="flex w-16 shrink-0 justify-start">
            {q > 1 && <BackBtn onClick={() => setQ((prev) => (prev - 1) as 1 | 2 | 3 | 4)} />}
          </div>
          <p className="flex-1 text-center text-[11px] tracking-[0.22em] text-champagne uppercase">
            Question {q} of 4
          </p>
          {/* Matches the Back button's width so the close (X) button in the
              top-right corner never collides with it — this row used to put
              Back on the right, directly under that button. */}
          <div className="w-16 shrink-0" />
        </div>
        <div className="mt-2 h-px w-full overflow-hidden bg-border">
          <motion.div
            className="h-full bg-champagne"
            initial={false}
            animate={{ width: `${(q / 4) * 100}%` }}
            transition={transition}
          />
        </div>
      </div>

      <div className="relative flex flex-1 flex-col">
        <AnimatePresence mode="wait">
          {q === 1 && (
            <motion.div
              key="q1"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={transition}
              className="flex flex-1 flex-col"
            >
              <h3 className="font-display text-[24px] leading-tight text-foreground">
                Where are you looking?
              </h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">Pick a state, then a city.</p>

              <div className="mt-5">
                <p className="text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
                  State
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {locationGroups.map(({ state }) => {
                    const selected = selectedState === state;
                    return (
                      <button
                        key={state}
                        onClick={() => selectState(state)}
                        className={`rounded-full border px-4 py-2 text-[13px] transition-all ${
                          selected
                            ? "border-champagne bg-champagne/10 text-champagne"
                            : "border-border bg-background text-foreground hover:border-foreground/30"
                        }`}
                      >
                        {state}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedState && (
                <div className="mt-5">
                  <p className="text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
                    City
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {citiesForState.map((city) => {
                      const selected = selectedCity === city;
                      return (
                        <button
                          key={city}
                          onClick={() => setSelectedCity(city)}
                          className={`relative rounded-xl border p-3 text-center transition-all hover:scale-103 ${
                            selected
                              ? "border-champagne bg-champagne/10"
                              : "border-border bg-background hover:border-foreground/30"
                          }`}
                        >
                          {selected && <Checkmark />}
                          <MapIcon className="mx-auto h-5 w-5 text-champagne" />
                          <div className="mt-1.5 text-[13px] text-foreground">{city}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <QuizFooter>
                <NextBtn disabled={!selectedState || !selectedCity} onClick={() => setQ(2)}>
                  Next →
                </NextBtn>
              </QuizFooter>
            </motion.div>
          )}

          {q === 2 && (
            <motion.div
              key="q2"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={transition}
              className="flex flex-1 flex-col"
            >
              <h3 className="font-display text-[24px] leading-tight text-foreground">
                What are you looking for?
              </h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Select all that interest you.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                {PROPERTY_TYPES.map(({ label, Icon }, i) => {
                  const selected = types.includes(label);
                  return (
                    <button
                      key={label}
                      onClick={() => toggleType(label)}
                      className={`relative flex aspect-square flex-col items-center justify-center gap-2.5 rounded-[18px] border text-center transition-all hover:scale-103 ${
                        selected
                          ? "border-champagne bg-champagne/10"
                          : "border-border bg-background hover:border-foreground/30"
                      }`}
                      style={i === 3 ? { gridColumnStart: 1 } : {}}
                    >
                      {selected && <Checkmark />}
                      <Icon className="h-8 w-8 text-champagne" />
                      <div className="text-[13px] text-foreground">{label}</div>
                    </button>
                  );
                })}
              </div>

              <QuizFooter>
                <NextBtn disabled={types.length === 0} onClick={() => setQ(3)}>
                  Next →
                </NextBtn>
              </QuizFooter>
            </motion.div>
          )}

          {q === 3 && (
            <motion.div
              key="q3"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={transition}
              className="flex flex-1 flex-col"
            >
              <h3 className="font-display text-[24px] leading-tight text-foreground">
                What configuration are you looking for?
              </h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Choose up to {MAX_BHK} options.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                {BHK_OPTIONS.map((n) => {
                  const selected = bhk.includes(n);
                  const disabled = !selected && bhk.length >= MAX_BHK;
                  return (
                    <button
                      key={n}
                      onClick={() => toggleBhk(n)}
                      className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-[18px] border text-center transition-all hover:scale-103 ${
                        selected
                          ? "border-champagne bg-champagne/10"
                          : disabled
                            ? "border-border bg-background opacity-40"
                            : "border-border bg-background hover:border-foreground/30"
                      }`}
                    >
                      {selected && <Checkmark />}
                      <div className="font-display text-[36px] leading-none text-champagne">
                        {n}
                      </div>
                      <div className="text-[12px] text-muted-foreground">BHK</div>
                    </button>
                  );
                })}
              </div>

              <QuizFooter>
                <NextBtn disabled={bhk.length === 0} onClick={() => setQ(4)}>
                  Next →
                </NextBtn>
              </QuizFooter>
            </motion.div>
          )}

          {q === 4 && (
            <motion.div
              key="q4"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={transition}
              className="flex flex-1 flex-col"
            >
              <h3 className="font-display text-[22px] leading-tight text-foreground">
                What budget are you comfortable with?
              </h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Choose a range that feels right — we'll refine it in a moment.
              </p>

              <div className="mt-4 space-y-1.5">
                {BUDGET_RANGES.map((r) => {
                  const selected = budgetRange === r;
                  const subs = SUB_RANGES[r];
                  return (
                    <div key={r}>
                      <button
                        onClick={() => {
                          setBudgetRange(r);
                          setBudgetSub("");
                        }}
                        className={`relative flex h-11 w-full items-center justify-center rounded-[14px] border transition-all ${
                          selected
                            ? "border-champagne bg-champagne/10"
                            : "border-border bg-background hover:border-foreground/30"
                        }`}
                      >
                        {selected && <Checkmark />}
                        <span className="font-display text-[16px] text-foreground">{r}</span>
                      </button>
                      <motion.div
                        initial={false}
                        animate={{ height: selected && subs ? "auto" : 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        {subs && (
                          <div className="px-1 pt-2.5">
                            <div className="mb-2 border-t border-border pt-2">
                              <p className="text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
                                Narrow it down:
                              </p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {subs.map((s) => {
                                const subSelected = budgetSub === s;
                                return (
                                  <button
                                    key={s}
                                    onClick={() => setBudgetSub(s)}
                                    className={`rounded-full border px-3 py-1.5 text-[12px] transition-all ${
                                      subSelected
                                        ? "border-champagne bg-champagne/10 text-champagne"
                                        : "border-champagne/30 bg-transparent text-foreground/80 hover:border-champagne/60"
                                    }`}
                                  >
                                    {s}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </div>
                  );
                })}
              </div>

              <QuizFooter>
                {showBudgetComplete ? (
                  <NextBtn onClick={finish}>
                    {editMode ? "Save preferences →" : "Complete →"}
                  </NextBtn>
                ) : null}
              </QuizFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Checkmark() {
  return (
    <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-champagne text-lux-black">
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
  );
}

// Footer holds only the primary action now — Back lives in the header,
// pinned to the same top-right spot on every question.
function QuizFooter({ children }: { children?: React.ReactNode }) {
  return <div className="mt-auto pt-5">{children}</div>;
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      ← Back
    </button>
  );
}

function NextBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-full items-center justify-center rounded-full bg-champagne text-[15px] font-medium tracking-wide text-lux-black transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
