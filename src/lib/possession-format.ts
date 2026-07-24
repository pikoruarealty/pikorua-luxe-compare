import { differenceInCalendarMonths } from "date-fns";

const DURATION_RE = /^([\d.]+)\s*(year|month)s?$/i;

/** Parses "1.5 Year", "9 Months", "2 YEAR" → whole months. Null for anything
 *  else (e.g. "RTMI", or a future free-form value we don't recognise). */
function parseDurationMonths(raw: string): number | null {
  const m = raw.trim().match(DURATION_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.round(m[2].toLowerCase() === "year" ? n * 12 : n);
}

/** Possession as entered ("1 Year", "RTMI", ...) counts down live once it has
 *  a known anchor date — the same "1 Year" reads as "10 Months" two months
 *  later, "8 Months" two months after that, purely from today's date. With no
 *  anchor (asOf is null — not wired to the DB yet), the raw text passes
 *  through unchanged so nothing regresses before that field exists. */
export function livePossessionLabel(
  raw: string | null | undefined,
  asOfIso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!raw) return raw ?? "";
  if (/^rtmi$/i.test(raw.trim())) return "Ready to Move In";
  if (!asOfIso) return raw;

  const totalMonths = parseDurationMonths(raw);
  if (totalMonths === null) return raw;

  const asOf = new Date(asOfIso);
  if (Number.isNaN(asOf.getTime())) return raw;

  const elapsed = differenceInCalendarMonths(now, asOf);
  const remaining = totalMonths - elapsed;
  if (remaining <= 0) return "Ready to Move In";
  return `${remaining} ${remaining === 1 ? "Month" : "Months"}`;
}
