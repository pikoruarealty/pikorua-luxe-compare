/** Runs the brochure mapping over every extraction this project has on disk.
 *
 *  The point is to stop finding format bugs one brochure at a time. Each new
 *  plan book brings its own conventions — hyphenated sizes, numbered bedrooms,
 *  duplexes drawn one storey per sheet — and until now each was discovered by
 *  a human noticing an empty form. This runs the real mapping over every stored
 *  job and reports what it could not use, so a new convention shows up here
 *  first.
 *
 *  Usage: bun run scripts/check-brochures.ts [--verbose]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  mapExtractedPayload,
  findMappingGaps,
  type PropertyExtraction,
} from "@/lib/brochure-field-mapping";

const JOB_DIR = "property-ocr-suite/backend/storage/jobs";
const VERBOSE = process.argv.includes("--verbose");

/** One job per source brochure — the richest, since re-runs of the same file
 *  differ only in how much the model happened to read that time. */
function newestPerBrochure(): { name: string; extraction: PropertyExtraction }[] {
  // Gitignored runtime storage — never exists on a fresh checkout (CI, a new
  // clone) until someone runs a brochure through the OCR service locally.
  if (!existsSync(JOB_DIR)) return [];
  const best = new Map<string, { score: number; extraction: PropertyExtraction }>();
  for (const file of readdirSync(JOB_DIR)) {
    const path = join(JOB_DIR, file);
    if (!file.endsWith(".json") || statSync(path).size === 0) continue;
    let extraction: PropertyExtraction;
    try {
      extraction = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      continue;
    }
    const name = (extraction.source_files ?? []).join(", ") || file;
    const score = (extraction.configurations ?? []).reduce((n, v) => n + (v.rooms?.length ?? 0), 0);
    if (!best.has(name) || best.get(name)!.score < score) best.set(name, { score, extraction });
  }
  return [...best.entries()].map(([name, v]) => ({ name, extraction: v.extraction }));
}

const brochures = newestPerBrochure();
if (!brochures.length) {
  console.log(`No extractions found in ${JOB_DIR} — run a brochure through the OCR first.`);
  process.exit(0);
}

let totalDropped = 0;
let totalUnparsed = 0;
let totalShortfall = 0;
const unplacedTally = new Map<string, number>();

for (const { name, extraction } of brochures) {
  const configs = mapExtractedPayload(extraction).configs;
  const gaps = findMappingGaps(extraction);
  const filled = Object.entries(configs ?? {}).flatMap(([bucket, vs]) =>
    vs.map((v) => {
      const beds = [v.bedroom1, v.bedroom2, v.bedroom3, v.bedroom4, v.bedroom5].filter(
        Boolean,
      ).length;
      const bits = [
        v.area && "area",
        v.carpet && "carpet",
        v.livingArea && "living",
        v.kitchen && "kitchen",
        beds ? `${beds} bed` : null,
        v.bathrooms && `${v.bathrooms} bath`,
      ].filter(Boolean);
      return `    ${bucket}/${v.type}: ${bits.join(", ") || "EMPTY"}`;
    }),
  );

  console.log(`\n─── ${name}`);
  console.log(`  ${(extraction.configurations ?? []).length} extracted → ${filled.length} mapped`);
  if (VERBOSE) filled.forEach((line) => console.log(line));

  // A sheet that names a size this product doesn't list ("2 BHK") is a product
  // decision, not a bug. A sheet we simply could not identify is the bug.
  const unidentified = gaps.droppedVariants.filter((d) => !d.stated && !d.notAResidence);
  const unsupported = gaps.droppedVariants.filter((d) => d.stated);
  for (const d of gaps.droppedVariants.filter((d) => d.notAResidence && !d.stated)) {
    console.log(`  · "${d.label}" is not a home — no measured room, no area, no price`);
  }
  if (unidentified.length) {
    totalDropped += unidentified.length;
    console.log(`  ⚠ ${unidentified.length} layout(s) could not be identified at all:`);
    for (const d of unidentified) {
      console.log(`      "${d.label}" (bhk_type=${d.bhkType || "—"}, ${d.rooms} rooms) — DROPPED`);
    }
  }
  for (const d of unsupported) {
    console.log(`  · "${d.label}" is a ${d.bhkType} — a size this form doesn't list`);
  }
  for (const s of gaps.bedroomShortfall) {
    totalShortfall += 1;
    console.log(`  ⚠ "${s.variant}" says ${s.stated} BHK but only ${s.found} bedroom(s) were read`);
  }
  if (gaps.unparsedDimensions.length) {
    totalUnparsed += gaps.unparsedDimensions.length;
    const sample = gaps.unparsedDimensions.slice(0, 5);
    console.log(`  ⚠ ${gaps.unparsedDimensions.length} size(s) not parsed as feet-and-inches:`);
    for (const u of sample) console.log(`      ${u.name}: ${JSON.stringify(u.dimension)}`);
  }
  for (const room of gaps.unplacedRooms) {
    const key = room.name
      .toLowerCase()
      .replace(/[\s.\-–]+/g, " ")
      .trim();
    unplacedTally.set(key, (unplacedTally.get(key) ?? 0) + 1);
  }
  if (gaps.unplacedRooms.length) {
    console.log(`  · ${gaps.unplacedRooms.length} room(s) with no form field`);
  }
}

console.log("\n══════════ SUMMARY ══════════");
console.log(`brochures            : ${brochures.length}`);
console.log(`unidentified layouts : ${totalDropped}`);
console.log(`unparsed sizes       : ${totalUnparsed}`);
console.log(
  `bedroom shortfalls   : ${totalShortfall}  (extraction missed rooms, not a mapping bug)`,
);
const ranked = [...unplacedTally.entries()].sort((a, b) => b[1] - a[1]);
if (ranked.length) {
  console.log(`\nroom labels with no form field, most common first:`);
  for (const [name, count] of ranked.slice(0, 25)) {
    console.log(`  ${String(count).padStart(4)}x  ${name}`);
  }
}

// Measured against a committed baseline rather than against zero. The corpus
// carries real brochure ambiguities a human has to settle one page at a time —
// a bungalow's basement sheet, an unlabelled "Type : A ( 201 )", a clubhouse
// "Reception" — so demanding zero here only ever produced a red check nobody
// could act on. What this must catch is a REGRESSION: a new plan-book
// convention the mapping stops handling. That is an increase, and an increase
// fails.
const baseline = JSON.parse(
  readFileSync(join(import.meta.dirname, "brochure-gaps.baseline.json"), "utf-8"),
) as { unidentifiedLayouts: number; unparsedSizes: number };

const regressions = [
  { what: "unidentified layouts", now: totalDropped, was: baseline.unidentifiedLayouts },
  { what: "unparsed sizes", now: totalUnparsed, was: baseline.unparsedSizes },
];

const worse = regressions.filter((r) => r.now > r.was);
if (worse.length) {
  for (const r of worse) {
    console.log(`\nFAIL — ${r.what}: ${r.now}, up from ${r.was}.`);
  }
  console.log("A layout or a printed size the mapping used to handle is being lost.");
  process.exit(1);
}

const better = regressions.filter((r) => r.now < r.was);
if (better.length) {
  for (const r of better) {
    console.log(`\n${r.what}: ${r.now}, down from ${r.was} — lower the baseline to hold the gain.`);
  }
  console.log("scripts/brochure-gaps.baseline.json");
  process.exit(1);
}

console.log("\nOK — no layout or printed size lost beyond the recorded baseline.");
