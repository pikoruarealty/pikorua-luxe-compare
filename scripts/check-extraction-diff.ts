import assert from "node:assert/strict";
import { buildReviewReport, classifyDiffs } from "@/lib/extraction-diff";
import type { PropertyExtraction } from "@/lib/brochure-field-mapping";
import { emptyConfigDetail, emptyPropertyForm } from "@/lib/property-schema";

const f = (value: unknown, confidence = 0.9) => ({
  value,
  found: value !== null && value !== undefined,
  confidence,
  source_file: "brochure.pdf",
  source_page: 4,
  evidence: String(value),
  verified: false,
});
const blank = () => ({ ...f(null), found: false });
const room = (name: string, dimension: string | null) => ({
  room_name: f(name),
  dimension: dimension === null ? blank() : f(dimension),
});

const extraction = {
  basics: {
    property_name: f("Godrej Altus", 0.97), // high confidence, current is blank -> silent accept
    tagline: f("Views that don't repeat themselves", 0.4), // low confidence gap -> needs review
    developer: f("Designers Group"), // saved as "designers group" -> case-only, cosmetic
  },
  project_structure: {},
  rera: {},
  construction_amenities: {},
  developer: {},
  configurations: [
    {
      bhk_type: f("4 BHK"),
      variant_label: f("Unit - A"),
      floor_range: blank(),
      carpet_area: f("3358"), // disagrees with saved 3000 -> conflict
      built_up_area: blank(),
      super_built_up_area: f("7300 "), // saved "7300" -> cosmetic (whitespace only)
      price: blank(),
      rate_per_sqft: blank(),
      rooms: [room("BEDROOM", "12'0\" X 17'0\"")],
    },
  ],
  amenities: [],
  highlights: [],
  image_candidates: [],
  images: {},
  source_files: ["brochure.pdf"],
  warnings: [],
} as unknown as PropertyExtraction;

const current = emptyPropertyForm();
current.developer = "designers group";
current.configs.bhk4 = [{ ...emptyConfigDetail(), type: "Type A", carpet: "3000", area: "7300" }];

const diffs = classifyDiffs(current, { job_id: "j", extraction });
const byKey = new Map(diffs.map((d) => [d.row.key, d]));

// A high-confidence fill for a genuinely blank field never needed a human.
assert.equal(byKey.get("name")?.category, "silent_accept", "confident gap fill should auto-accept");
// A low-confidence fill for a blank field still needs a look.
assert.equal(
  byKey.get("tagline")?.category,
  "gap_fill",
  "low-confidence gap must not silently apply",
);
// A disagreeing carpet area is a conflict, not an assumed correction.
assert.equal(
  byKey.get("bhk4-0-carpet")?.category,
  "conflict",
  "disagreeing value must be a conflict",
);
// A case-only difference is deprioritised, not treated as a real conflict.
assert.equal(
  byKey.get("developer")?.category,
  "cosmetic",
  "a formatting-only difference must not read as a real conflict",
);
// Configuration-variant rows never trace back to a single ExtractedField, so
// they can never silently auto-accept even when found — a new bedroom row
// with no matching field confidence must still be reviewed.
assert.equal(byKey.get("bhk4-0-bedroom1")?.confidence, null);
assert.notEqual(byKey.get("bhk4-0-bedroom1")?.category, "silent_accept");

// A predicate for a field that fails a (future Phase 4) cross-field check
// sorts first regardless of confidence, ahead of an ordinary conflict.
const withValidation = classifyDiffs(
  current,
  { job_id: "j", extraction },
  (row) => row.key === "bhk4-0-carpet",
);
const report = buildReviewReport(withValidation);
assert.equal(report.needsReview[0]?.row.key, "bhk4-0-carpet", "a failing field must sort first");
assert.equal(report.needsReview[0]?.category, "failing");

// The report card is what a reviewer actually sees closing out a brochure.
const plainReport = buildReviewReport(diffs);
console.log("review report     :", plainReport.summary);
assert.ok(
  plainReport.autoAccepted.length >= 1,
  "at least the confident gap fill should auto-accept",
);
assert.ok(
  plainReport.needsReview.every((d) => d.category !== "silent_accept"),
  "auto-accepted rows must never also appear in the review queue",
);

console.log("\nOK — all extraction-diff classification assertions passed");
