export const RERA_AREA_MATCH_TOLERANCE_PERCENT = 1;

export type ReraVerificationStatus =
  | "matched"
  | "discrepancy"
  | "unavailable"
  | "invalid_registration";

export type VerificationAreaUnit = "sq_ft" | "sq_m" | "sq_yd" | "gaj" | "acre";

export interface NormalizedArea {
  rawValue: number;
  rawUnit: VerificationAreaUnit;
  rawText: string;
  squareFeet: number;
}

export interface ReraAreaComparison {
  brochure: NormalizedArea;
  rera: NormalizedArea;
  absoluteDifferenceSqFt: number;
  differencePercent: number;
  result: "rounding_equivalent" | "discrepancy";
}

const UNIT_TO_SQ_FT: Record<VerificationAreaUnit, number> = {
  sq_ft: 1,
  sq_m: 10.7639,
  sq_yd: 9,
  gaj: 9,
  acre: 43_560,
};

export function normalizeArea(
  value: number,
  unit: VerificationAreaUnit,
  rawText: string,
): NormalizedArea {
  if (!Number.isFinite(value) || value < 0 || !rawText.trim()) {
    throw new Error("Area evidence must contain a non-negative value and its printed text");
  }
  return {
    rawValue: value,
    rawUnit: unit,
    rawText: rawText.trim(),
    squareFeet: Math.round(value * UNIT_TO_SQ_FT[unit] * 1000) / 1000,
  };
}

export function compareReraArea(
  brochure: NormalizedArea,
  rera: NormalizedArea,
): ReraAreaComparison {
  const absoluteDifferenceSqFt = Math.abs(brochure.squareFeet - rera.squareFeet);
  const denominator = rera.squareFeet;
  const differencePercent =
    denominator === 0
      ? absoluteDifferenceSqFt === 0
        ? 0
        : 100
      : (absoluteDifferenceSqFt / denominator) * 100;
  return {
    brochure,
    rera,
    absoluteDifferenceSqFt: Math.round(absoluteDifferenceSqFt * 1000) / 1000,
    differencePercent: Math.round(differencePercent * 1000) / 1000,
    result:
      differencePercent <= RERA_AREA_MATCH_TOLERANCE_PERCENT
        ? "rounding_equivalent"
        : "discrepancy",
  };
}

export function normalizePromoterName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(private|pvt|limited|ltd|llp|developers?|realtors?|realty)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function promoterNamesMatch(published: string, official: string): boolean {
  const left = normalizePromoterName(published);
  const right = normalizePromoterName(official);
  return Boolean(left && right && left === right);
}

export function completionDifferenceDays(publishedDate: string, officialDate: string): number {
  const published = Date.parse(`${publishedDate}T00:00:00Z`);
  const official = Date.parse(`${officialDate}T00:00:00Z`);
  if (!Number.isFinite(published) || !Number.isFinite(official)) {
    throw new Error("Completion dates must use YYYY-MM-DD");
  }
  return Math.round(Math.abs(published - official) / 86_400_000);
}
