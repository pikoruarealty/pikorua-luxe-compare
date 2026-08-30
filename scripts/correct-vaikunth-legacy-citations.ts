/**
 * Corrects the known page-folio mismatch in Vaikunth's pre-durable OCR JSON.
 *
 * The extractor recorded the brochure's printed folios (10/13) instead of
 * physical PDF pages (8/11) for these two list sections. This changes only
 * those confirmed citations; it never changes extracted values or any other
 * page references. It is dry-run by default.
 *
 *   bun scripts/correct-vaikunth-legacy-citations.ts
 *   bun scripts/correct-vaikunth-legacy-citations.ts --apply
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.argv.includes("--apply");
const JOB_ID = "e476555862d8";
const JOB_PATH = resolve(`property-ocr-suite/backend/storage/jobs/${JOB_ID}.json`);

type CitedValue = { source_page?: number | null };
type ArchivedExtraction = {
  amenities?: CitedValue[];
  highlights?: CitedValue[];
};

function rewritePages(values: CitedValue[] | undefined, from: number, to: number): number {
  let changed = 0;
  for (const value of values ?? []) {
    if (value.source_page !== from) continue;
    changed += 1;
    if (APPLY) value.source_page = to;
  }
  return changed;
}

function main() {
  const extraction = JSON.parse(readFileSync(JOB_PATH, "utf8")) as ArchivedExtraction;
  const amenityChanges = rewritePages(extraction.amenities, 10, 8);
  const highlightChanges = rewritePages(extraction.highlights, 13, 11);

  // These counts come from the manually verified brochure pages. Refuse to
  // touch a changed or unexpected archive rather than guessing at a repair.
  if (amenityChanges !== 18 || highlightChanges !== 9) {
    throw new Error(
      `Refusing to modify ${JOB_ID}: expected 18 amenity and 9 highlight citations, found ${amenityChanges} and ${highlightChanges}.`,
    );
  }

  console.log(`Vaikunth amenities: p.10 -> p.8 (${amenityChanges} citations)`);
  console.log(`Vaikunth highlights: p.13 -> p.11 (${highlightChanges} citations)`);
  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply after confirming the counts.");
    return;
  }

  writeFileSync(JOB_PATH, `${JSON.stringify(extraction, null, 2)}\n`, "utf8");
  console.log("Corrected Vaikunth's archived citation pages.");
}

main();
