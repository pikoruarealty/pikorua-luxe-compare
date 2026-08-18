import {
  buildMergeRows,
  extractedFieldList,
  type ExtractionResponse,
  type MergeRow,
} from "@/lib/brochure-field-mapping";
import type { PropertyFormValues } from "@/lib/property-schema";

/** Below this the OCR service itself isn't confident enough to trust without
 *  a human look, even when the field it's proposing is a genuine gap. */
const SILENT_ACCEPT_CONFIDENCE = 0.85;

/** §5.1's review order: a failed cross-field validator would sort first, but
 *  Phase 4's validators don't exist yet — `failing` stays reachable via
 *  `classifyDiffs`'s `isFailingValidation` hook for when they land. Conflicts
 *  next (an existing value the brochure disagrees with — never assume which
 *  one is right), then genuine gaps too uncertain to silently fill, cosmetic
 *  differences last. */
export type DiffCategory = "failing" | "conflict" | "gap_fill" | "cosmetic" | "silent_accept";

const REVIEW_ORDER: DiffCategory[] = ["failing", "conflict", "gap_fill", "cosmetic"];

export interface ClassifiedDiff {
  row: MergeRow;
  category: DiffCategory;
  /** null for rows `buildMergeRows` produces that don't trace back to a single
   *  scalar `ExtractedField` — configuration-variant measurements and the
   *  amenities row. Those never silently auto-accept, confidence or not. */
  confidence: number | null;
}

function isCosmeticDifference(current: string, incoming: string): boolean {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return current !== incoming && normalize(current) === normalize(incoming);
}

/**
 * Classifies every difference `buildMergeRows` finds between a saved listing
 * and a fresh re-extraction as a fix candidate or a conflict to review —
 * never assumes the incoming value is correct just because it's newer.
 * `isFailingValidation` is an optional Phase 4 hook: when the cross-field
 * arithmetic validators exist, pass a predicate that flags a row's field as
 * failing one, and it sorts first in the review queue regardless of
 * confidence.
 */
export function classifyDiffs(
  current: PropertyFormValues,
  response: ExtractionResponse,
  isFailingValidation?: (row: MergeRow) => boolean,
): ClassifiedDiff[] {
  const rows = buildMergeRows(current, response);
  const confidenceByField = new Map(
    extractedFieldList(response).map((field) => [field.formField, field.confidence]),
  );

  return rows.map((row) => {
    const confidence = confidenceByField.get(row.key as keyof PropertyFormValues) ?? null;

    if (isFailingValidation?.(row)) {
      return { row, category: "failing", confidence };
    }
    if (!row.conflict) {
      const category =
        confidence !== null && confidence >= SILENT_ACCEPT_CONFIDENCE
          ? "silent_accept"
          : "gap_fill";
      return { row, category, confidence };
    }
    const category = isCosmeticDifference(row.current, row.incoming) ? "cosmetic" : "conflict";
    return { row, category, confidence };
  });
}

export interface ReviewReport {
  autoAccepted: ClassifiedDiff[];
  /** Sorted per §5.1: failing validation, then conflicts, then uncertain
   *  gaps, cosmetic differences last. */
  needsReview: ClassifiedDiff[];
  summary: string;
}

/** Turns a classified diff set into the "N auto-accepted, M need you" report
 *  card §5.1 describes closing a review with. */
export function buildReviewReport(diffs: ClassifiedDiff[]): ReviewReport {
  const autoAccepted = diffs.filter((diff) => diff.category === "silent_accept");
  const needsReview = diffs
    .filter((diff) => diff.category !== "silent_accept")
    .sort((a, b) => REVIEW_ORDER.indexOf(a.category) - REVIEW_ORDER.indexOf(b.category));

  const failing = needsReview.filter((diff) => diff.category === "failing").length;
  const conflicts = needsReview.filter((diff) => diff.category === "conflict").length;

  const parts = [`${autoAccepted.length} auto-accepted`, `${needsReview.length} need you`];
  if (failing) parts.push(`${failing} failed a consistency check`);
  if (conflicts) parts.push(`${conflicts} conflicting with a saved value`);

  return { autoAccepted, needsReview, summary: parts.join(", ") + "." };
}
