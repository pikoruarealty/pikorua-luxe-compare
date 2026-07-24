import type { AreaUnit } from "./area-units";
import { formatAreaNumber, unitLabel } from "./area-units";

export interface RoomAreaPart {
  label: string; // "" when the source string had no label, just a size
  sqft: number;
  dims: string; // feet/inches text — never unit-converted
}

/** Splits on " + " only outside parentheses, so a breakdown embedded inside
 *  one dimension group (e.g. "461 sq ft (Drawing 12'0" x 20'0" + Living...")")
 *  isn't mistaken for two separate rooms. */
function splitTopLevel(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && raw.slice(i, i + 3) === " + ") {
      parts.push(raw.slice(start, i).trim());
      i += 2;
      start = i + 1;
    }
  }
  parts.push(raw.slice(start).trim());
  return parts;
}

const SEGMENT_RE = /^(.*?)\s*([\d,]+(?:\.\d+)?)\s*sq\s*ft\s*\(([^()]*)\)\s*$/i;

/** Best-effort parse into aligned {label, area, dims} parts. Returns null the
 *  moment any top-level segment doesn't cleanly match "Label NNN sq ft
 *  (dims)" — admin-entered text has several conventions in the wild, and a
 *  wrong guess here would show a fabricated total, so an unrecognised shape
 *  falls back to the raw string instead of a forced split. */
export function parseRoomAreaParts(raw: string): RoomAreaPart[] | null {
  const segments = splitTopLevel(raw);
  const parsed: RoomAreaPart[] = [];
  for (const seg of segments) {
    const m = seg.match(SEGMENT_RE);
    if (!m) return null;
    const sqft = parseFloat(m[2].replace(/,/g, ""));
    if (!Number.isFinite(sqft)) return null;
    parsed.push({ label: m[1].trim(), sqft, dims: m[3].trim() });
  }
  return parsed;
}

const LEADING_RE = /^\s*([\d,]+(?:\.\d+)?)\s*sq\s*ft\b/i;

/** When full part-parsing fails, still convert a leading "NNN sq ft" total if
 *  the string starts with one, leaving everything after it (parenthetical
 *  breakdowns, notes) as literal text — never touch a number that can't be
 *  confidently isolated. */
export function convertLeadingSqFt(raw: string, unit: AreaUnit): string {
  const m = raw.match(LEADING_RE);
  if (!m) return raw;
  const sqft = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(sqft)) return raw;
  return `${formatAreaNumber(sqft, unit)} ${unitLabel(unit)}${raw.slice(m[0].length)}`;
}
