import type { QuizAnswers } from "@/context/OnboardingContext";
import type { ConfigKey, Property, PropertyCategory } from "@/types/property";
import { CONFIG_KEYS } from "@/types/property";

/** Parse a price string like "12.5 Cr" → 12.5. Returns null if unparsable. */
const parsePrice = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const m = String(s).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
};

/** Parse a budget label (range or sub) like "₹ 6 – 10 Cr", "₹ 1 – 2 Cr", "₹ 21 Cr +" → [min, max]. */
export function parseBudget(label: string | undefined): [number, number] | null {
  if (!label) return null;
  const clean = label.replace(/[₹\s,]/g, "");
  if (/\+$/.test(clean)) {
    const n = parseFloat(clean.match(/[\d.]+/)?.[0] ?? "");
    return isNaN(n) ? null : [n, Infinity];
  }
  const nums = clean.match(/[\d.]+/g)?.map(parseFloat) ?? [];
  if (nums.length === 0) return null;
  // A single-value sub-budget ("₹ 5 Cr", "₹ 10 Cr") is a rough target, not an
  // exact price — real listings almost never land on a round number. Treat it
  // as a fixed ±Cr window instead of requiring an exact match: 5 Cr becomes
  // 4-5.5 Cr, 10 Cr becomes 9-10.5, same flat offset at any budget level.
  if (nums.length === 1) return [Math.max(0, nums[0] - 1), nums[0] + 0.5];
  return [Math.min(...nums), Math.max(...nums)];
}

/** Config keys the user explicitly asked for. Empty array → no restriction. */
export function allowedConfigKeys(answers: QuizAnswers | null | undefined): ConfigKey[] {
  if (!answers) return [];
  const allow = new Set<ConfigKey>();
  for (const b of answers.bhk ?? []) {
    const k = b.trim() as ConfigKey;
    if ((CONFIG_KEYS as string[]).includes(k)) allow.add(k);
  }
  for (const t of answers.propertyType ?? []) {
    if (t === "Penthouse" || t === "Duplex") allow.add(t as ConfigKey);
  }
  return Array.from(allow);
}

/** Category-level filter from the property-type quiz selection.
 *  OR semantics: "Apartment + Penthouse" = apartments, or anything
 *  offering a penthouse. */
function categoryAllowed(p: Property, answers: QuizAnswers): boolean {
  const types = answers.propertyType ?? [];
  if (types.length === 0) return true;
  const cats = types.filter((t) =>
    ["Apartment", "Bungalow", "Plots"].includes(t),
  ) as PropertyCategory[];
  const configTypes = types.filter((t) => t === "Penthouse" || t === "Duplex") as ConfigKey[];
  const catHit = cats.includes(p.category);
  const cfgHit = configTypes.some((k) => Boolean(p.configurations[k]?.length));
  return catHit || cfgHit;
}

/** True when the user has actually selected at least one filter. */
export function hasActiveFilters(answers: QuizAnswers | null | undefined): boolean {
  if (!answers) return false;
  return (
    Boolean(answers.city) ||
    (answers.propertyType?.length ?? 0) > 0 ||
    (answers.bhk?.length ?? 0) > 0 ||
    Boolean(answers.budgetRange) ||
    Boolean(answers.budgetSub)
  );
}

/** Does property satisfy quiz filters? Used to show only matching residences. */
export function matchesPreferences(p: Property, answers: QuizAnswers | null | undefined): boolean {
  if (!answers) return true;
  // Case-folded: the catalog holds both "Ahmedabad" and "AHMEDABAD", and an
  // exact match silently dropped every property spelled the other way.
  const sameCity = (a: string | undefined, b: string | undefined) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  if (answers.city && !sameCity(p.city, answers.city)) return false;
  if (!categoryAllowed(p, answers)) return false;

  const wantedKeys = allowedConfigKeys(answers);
  const budget = parseBudget(answers.budgetSub || answers.budgetRange);

  // If a BHK / sub-type is requested, the property must have at least one of them.
  const candidateKeys: ConfigKey[] =
    wantedKeys.length > 0
      ? wantedKeys.filter((k) => Boolean(p.configurations[k]?.length))
      : (CONFIG_KEYS.filter((k) => p.configurations[k]?.length) as ConfigKey[]);

  if (wantedKeys.length > 0 && candidateKeys.length === 0) return false;

  // Budget: strict — at least one candidate config's variant (a BHK can have
  // multiple type/size variants) must have a known price inside the selected
  // range. Unknown prices don't qualify.
  if (budget) {
    const [lo, hi] = budget;
    const inRange = candidateKeys.some((k) =>
      (p.configurations[k] ?? []).some((d) => {
        const price = parsePrice(d.price);
        if (price === null) return false;
        return price >= lo && price <= hi;
      }),
    );
    if (!inRange) return false;
  }

  return true;
}
