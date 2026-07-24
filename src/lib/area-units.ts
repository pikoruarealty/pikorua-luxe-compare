export type AreaUnit = "sqft" | "sqyd" | "gaj";

export const AREA_UNIT_OPTIONS: { value: AreaUnit; label: string; shortLabel: string }[] = [
  { value: "sqft", label: "Square Feet", shortLabel: "sq ft" },
  // "Var" (vaar) is the everyday Gujarati name for a square yard — shown
  // alongside the formal unit so it reads as something people recognise.
  { value: "sqyd", label: "Square Yards (Var)", shortLabel: "sq yd (Var)" },
  // Gaj is the same 9-sq-ft unit under its North Indian name — offered as its
  // own option since it's the term some visitors search for instead.
  { value: "gaj", label: "Gaj", shortLabel: "gaj" },
];

const SQFT_PER_UNIT: Record<AreaUnit, number> = { sqft: 1, sqyd: 9, gaj: 9 };

export function unitLabel(unit: AreaUnit): string {
  return AREA_UNIT_OPTIONS.find((o) => o.value === unit)?.shortLabel ?? "sq ft";
}

export function convertFromSqFt(sqft: number, unit: AreaUnit): number {
  return sqft / SQFT_PER_UNIT[unit];
}

export function formatAreaNumber(sqft: number, unit: AreaUnit): string {
  const converted = convertFromSqFt(sqft, unit);
  const rounded = unit === "sqft" ? Math.round(converted) : Math.round(converted * 10) / 10;
  return rounded.toLocaleString("en-IN");
}

export function formatArea(sqft: number, unit: AreaUnit): string {
  return `${formatAreaNumber(sqft, unit)} ${unitLabel(unit)}`;
}

/** Parses a bare numeric area string ("3,200" / "3200") — no unit suffix,
 *  caller already knows it's square feet (e.g. ConfigDetail.area/carpet). */
export function parseBareSqFt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
