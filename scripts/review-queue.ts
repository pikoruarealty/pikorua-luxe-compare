/** The exception-only review worklist, per brochure.
 *
 *  §5.1's rule is that a human confirms the exceptions, not the whole
 *  extraction — a field the OCR is confident about and that contradicts
 *  nothing is accepted silently, and only what a consistency check flagged,
 *  what conflicts with a saved value, or what is a genuine but uncertain gap
 *  reaches a person. This runs that same classification (`classifyDiffs` /
 *  `buildReviewReport` — the identical code the review UI uses, so the queue
 *  and the screen can never disagree) over every extraction on disk and prints
 *  what is actually waiting, worst first.
 *
 *  It changes nothing. It exists so the size and the shape of the remaining
 *  human work is known before anyone opens the first brochure, and so the
 *  brochures that need the most attention are opened first.
 *
 *  Usage: bun run scripts/review-queue.ts [--verbose] [--brochure <substring>]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  findMappingGaps,
  type ExtractionResponse,
  type PropertyExtraction,
} from "@/lib/brochure-field-mapping";
import { buildReviewReport, classifyDiffs, type DiffCategory } from "@/lib/extraction-diff";
import { emptyPropertyForm } from "@/lib/property-schema";

const JOB_DIR = "property-ocr-suite/backend/storage/jobs";
const VERBOSE = process.argv.includes("--verbose");
const filterAt = process.argv.indexOf("--brochure");
const FILTER = filterAt === -1 ? null : (process.argv[filterAt + 1] ?? "").toLowerCase();

/** One job per PROPERTY, keeping the richest re-run.
 *
 *  Deliberately keyed on the property name rather than the source filename the
 *  way check-brochures.ts is. That check surveys the mapping and wants every
 *  distinct file; this queue drives a person's time, and one property whose
 *  brochure was run twice — "aatman" and "Godrej Altus" both were — is one
 *  review, not two. It is also what load-brochures.ts dedupes on, so the queue
 *  covers exactly the set that publishes. */
function newestPerProperty(): { name: string; extraction: PropertyExtraction }[] {
  if (!existsSync(JOB_DIR)) return [];
  const best = new Map<string, { score: number; name: string; extraction: PropertyExtraction }>();
  for (const file of readdirSync(JOB_DIR)) {
    const path = join(JOB_DIR, file);
    if (!file.endsWith(".json") || statSync(path).size === 0) continue;
    let extraction: PropertyExtraction;
    try {
      extraction = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      continue;
    }
    if (!extraction?.basics) continue;
    const property = String(extraction.basics?.property_name?.value ?? "").trim();
    if (!property) continue;
    const key = property
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const name = (extraction.source_files ?? []).join(", ") || file;
    const score = (extraction.configurations ?? []).reduce((n, v) => n + (v.rooms?.length ?? 0), 0);
    if (!best.has(key) || best.get(key)!.score < score) best.set(key, { score, name, extraction });
  }
  return [...best.values()]
    .map(({ name, extraction }) => ({ name, extraction }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const brochures = newestPerProperty().filter(
  (b) => !FILTER || b.name.toLowerCase().includes(FILTER),
);
if (!brochures.length) {
  console.log(`No extractions found in ${JOB_DIR} — run a brochure through the OCR first.`);
  process.exit(0);
}

interface Row {
  name: string;
  property: string;
  auto: number;
  review: number;
  byCategory: Record<DiffCategory, number>;
  dropped: number;
  shortfall: number;
  summary: string;
}

const rows: Row[] = [];

for (const { name, extraction } of brochures) {
  // A brochure being loaded for the first time has nothing saved to conflict
  // with, so every proposal is a gap the confidence threshold alone decides.
  // That is exactly the state these 25 are in.
  const response: ExtractionResponse = { job_id: name, extraction };
  const diffs = classifyDiffs(emptyPropertyForm(), response);
  const report = buildReviewReport(diffs);
  const gaps = findMappingGaps(extraction);

  const byCategory = {
    failing: 0,
    conflict: 0,
    gap_fill: 0,
    cosmetic: 0,
    silent_accept: 0,
  } as Record<DiffCategory, number>;
  for (const diff of diffs) byCategory[diff.category] += 1;

  rows.push({
    name,
    property: String(extraction.basics?.property_name?.value ?? "").trim() || "—",
    auto: report.autoAccepted.length,
    review: report.needsReview.length,
    byCategory,
    dropped: gaps.droppedVariants.filter((d) => !d.stated && !d.notAResidence).length,
    shortfall: gaps.bedroomShortfall.length,
    summary: report.summary,
  });

  if (VERBOSE) {
    console.log(`\n─── ${name}`);
    console.log(`  ${report.summary}`);
    for (const diff of report.needsReview) {
      const confidence = diff.confidence === null ? "  — " : diff.confidence.toFixed(2);
      const value = diff.row.incoming.replace(/\s+/g, " ").slice(0, 70);
      console.log(
        `    ${diff.category.padEnd(12)} ${confidence}  ${diff.row.label.padEnd(34)} ${value}`,
      );
    }
  }
}

// Worst first: a flagged value outranks a conflict outranks an unidentified
// layout — the order a person should open these in.
const weight = (r: Row) =>
  r.byCategory.failing * 100 + r.byCategory.conflict * 50 + r.dropped * 10 + r.review;
rows.sort((a, b) => weight(b) - weight(a));

console.log("\n══════════ REVIEW QUEUE ══════════");
console.log(
  `${"property".padEnd(34)} ${"auto".padStart(5)} ${"review".padStart(7)} ` +
    `${"flag".padStart(5)} ${"conflict".padStart(9)} ${"dropped".padStart(8)} ${"short".padStart(6)}`,
);
for (const r of rows) {
  console.log(
    `${r.property.slice(0, 34).padEnd(34)} ${String(r.auto).padStart(5)} ` +
      `${String(r.review).padStart(7)} ${String(r.byCategory.failing).padStart(5)} ` +
      `${String(r.byCategory.conflict).padStart(9)} ${String(r.dropped).padStart(8)} ` +
      `${String(r.shortfall).padStart(6)}`,
  );
}

const total = (pick: (r: Row) => number) => rows.reduce((n, r) => n + pick(r), 0);
console.log("\n══════════ SUMMARY ══════════");
console.log(`brochures              : ${rows.length}`);
console.log(`auto-accepted outright : ${total((r) => r.auto)}`);
console.log(`fields needing a human : ${total((r) => r.review)}`);
console.log(`  · failed a check     : ${total((r) => r.byCategory.failing)}`);
console.log(`  · conflicts          : ${total((r) => r.byCategory.conflict)}`);
console.log(`  · uncertain gaps     : ${total((r) => r.byCategory.gap_fill)}`);
console.log(`unidentified layouts   : ${total((r) => r.dropped)}`);
console.log(`bedroom shortfalls     : ${total((r) => r.shortfall)}`);
console.log("\nOpen them top-down; --verbose lists each waiting field.");
