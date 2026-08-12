import assert from "node:assert/strict";
import {
  mapExtractedPayload,
  buildApprovalSections,
  buildMergeRows,
  findMappingGaps,
  type PropertyExtraction,
} from "@/lib/brochure-field-mapping";
import { emptyConfigDetail, emptyPropertyForm } from "@/lib/property-schema";

const f = (value: unknown) => ({
  value,
  found: value !== null && value !== undefined,
  confidence: 0.9,
  source_file: "brochure.pdf",
  source_page: 13,
  evidence: String(value),
  verified: false,
});
const blank = () => ({ ...f(null), found: false });

const room = (name: string, dimension: string | null) => ({
  room_name: f(name),
  dimension: dimension === null ? blank() : f(dimension),
});

// A 4 BHK plan the way brochures actually print one: master drawn last,
// toilets and balconies labelled, a servant room, and a dining room.
const extraction = {
  basics: { property_name: f("Godrej Altus") },
  project_structure: {},
  rera: {},
  construction_amenities: {},
  developer: {},
  configurations: [
    {
      bhk_type: f("4 BHK"),
      variant_label: f("Unit - A"),
      floor_range: f("101 to 1101"),
      carpet_area: f("3358"),
      built_up_area: f("4200"),
      super_built_up_area: f("7300"),
      price: f("6.57cr+"),
      rate_per_sqft: f("9800"),
      rooms: [
        room("DRAWING", "18'0\" X 22'0\""),
        room("DINING", "12'0\" X 14'0\""),
        room("KITCHEN", "10'0\" X 14'0\""),
        room("BEDROOM", "12'0\" X 17'0\""),
        room("BEDROOM", "11'9\" X 14'0\""),
        room("BEDROOM", "11'0\" X 13'0\""),
        room("MASTER BEDROOM", "14'0\" X 18'0\""),
        room("TOILET", "4'3\" X 5'0\""),
        room("TOILET/DRESS", null),
        room("POWDER ROOM", "4'0\" X 5'0\""),
        room("BALCONY", "6'0\" X 12'0\""),
        room("SIT OUT", null),
        room("SERVANT ROOM", "7'0\" X 8'0\""),
      ],
    },
  ],
  amenities: [f("Infinity Pool")],
  highlights: [],
  image_candidates: [],
  images: {},
  source_files: ["brochure.pdf"],
  warnings: [],
} as unknown as PropertyExtraction;

const mapped = mapExtractedPayload(extraction);
const v = mapped.configs!.bhk4[0];
console.log("mapped variant:", JSON.stringify(v, null, 1));

// Areas + rate now come through instead of being dropped on the floor.
assert.equal(v.area, "7300", "super built-up should reach `area`");
assert.equal(v.carpet, "3358");
assert.equal(v.builtUpArea, "4200");
assert.equal(v.price, "6.57cr+");
assert.equal(v.rate, "9800", "rate per sq ft should reach `rate`");

// Master leads, then the rest in plan order — each with its computed area.
assert.equal(v.bedroom1, "252 sq ft (14'0\" × 18'0\")", "master should be bedroom1");
assert.equal(v.bedroom2, "204 sq ft (12'0\" × 17'0\")");
assert.equal(v.bedroom5, null, "a 4 BHK must not invent a fifth bedroom");

// Drawing and dining share one form field, so both are kept side by side.
assert.equal(
  v.livingArea,
  "Drawing 396 sq ft (18'0\" × 22'0\") + Dining 168 sq ft (12'0\" × 14'0\")",
);
assert.equal(v.kitchen, "140 sq ft (10'0\" × 14'0\")");

// Counted rooms are tallied even when the plan prints no size for them.
assert.equal(v.bathrooms, "3", "TOILET + TOILET/DRESS + POWDER ROOM = 3");
assert.equal(v.balconies, "2", "BALCONY + SIT OUT = 2");
assert.equal(v.servantRoom, "Yes");

// The add-property review screen must show every one of these to be ticked.
const items = buildApprovalSections({ job_id: "j", extraction })
  .flatMap((s) => s.groups)
  .flatMap((g) => g.items)
  .map((i) => i.label);
for (const label of ["Super built-up area", "Rate (per sq ft)", "Bathrooms", "Balconies"]) {
  assert.ok(items.includes(label), `review screen missing "${label}"`);
}

// --- The reported bug: editing an EXISTING listing to fill in its blanks. ---
// A saved 4 BHK that has its price but no dimensions and no super built-up.
const saved = emptyPropertyForm();
saved.name = "Godrej Altus";
saved.configs.bhk4 = [{ ...emptyConfigDetail(), type: "Type A", price: "6.57cr+" }];

const rows = buildMergeRows(saved, { job_id: "j", extraction });
const byKey = new Map(rows.map((r) => [r.key, r]));

// Previously all of these collapsed into one unticked "Configurations" row.
for (const field of ["area", "bedroom1", "livingArea", "kitchen", "bathrooms", "rate"]) {
  const row = byKey.get(`bhk4-0-${field}`);
  assert.ok(row, `no merge row offered for ${field}`);
  assert.equal(row.conflict, false, `${field} is blank on the listing — should read as a gap`);
}

// A value that already agrees must not be offered at all...
assert.equal(byKey.has("bhk4-0-price"), false, "matching price should not be offered");
// ...and the variant must be matched, not duplicated as a new layout.
assert.equal(
  rows.some((r) => r.key.startsWith("bhk4-new-")),
  false,
  "Type A should match the saved Type A, not be added as a second layout",
);

// Applying only the gaps (what the panel ticks by default) fills the blanks
// and leaves everything already saved untouched.
const merged = structuredClone(saved);
for (const row of rows) if (!row.conflict) row.apply(merged);
const v2 = merged.configs.bhk4[0];
assert.equal(merged.configs.bhk4.length, 1, "must not duplicate the variant");
assert.equal(v2.area, "7300");
assert.equal(v2.bedroom1, "252 sq ft (14'0\" × 18'0\")");
assert.equal(v2.kitchen, "140 sq ft (10'0\" × 14'0\")");
assert.equal(v2.bathrooms, "3");
assert.equal(v2.price, "6.57cr+", "saved price must survive untouched");

// A conflict must stay off by default and never overwrite silently.
const clash = emptyPropertyForm();
clash.configs.bhk4 = [{ ...emptyConfigDetail(), type: "Type A", carpet: "3000" }];
const clashRow = buildMergeRows(clash, { job_id: "j", extraction }).find(
  (r) => r.key === "bhk4-0-carpet",
);
assert.ok(clashRow, "a disagreeing carpet area should still be offered");
assert.equal(clashRow.conflict, true, "disagreeing value must read as a conflict");
assert.equal(clashRow.current, "3000");

console.log(`merge rows offered: ${rows.length} (was 1 all-or-nothing row before)`);

// --- Rooms that share one form field must combine, not overwrite. ---
const split = {
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      rooms: [
        room("LIVING & DINING", "40'0'' X 18'0''"),
        room("DRAWING ROOM", "15'0'' X 18'6''"),
        room("DISPLAY KITCHEN", "12'0'' X 10'0''"),
        room("CORE KITCHEN", "12'0'' X 10'0''"),
        room("BED ROOM", "13'0'' X 20'0''"),
        room("BED ROOM", "120' X 148''"), // an OCR misread
      ],
    },
  ],
} as unknown as PropertyExtraction;

const sv = mapExtractedPayload(split).configs!.bhk4[0];
console.log("\ncombined living :", sv.livingArea);
console.log("combined kitchen:", sv.kitchen);

// Exactly how the saved listings already write it — largest space first.
assert.equal(
  sv.livingArea,
  "Living & Dining 720 sq ft (40'0\" × 18'0\") + Drawing Room 278 sq ft (15'0\" × 18'6\")",
);
// "KITCHEN" is dropped from each part — the field is already the kitchen.
assert.equal(sv.kitchen, "Display 120 sq ft (12'0\" × 10'0\") + Core 120 sq ft (12'0\" × 10'0\")");
// A single room carries no name, just the measurement.
assert.equal(sv.bedroom1, "260 sq ft (13'0\" × 20'0\")");
// A misread is passed through verbatim rather than becoming "17760 sq ft".
assert.equal(sv.bedroom2, "120' X 148''");

// A value that now matches what's saved must stop being offered at all.
const already = emptyPropertyForm();
already.configs.bhk4 = [
  {
    ...emptyConfigDetail(),
    type: "Type A",
    livingArea:
      "Living & Dining 720 sq ft (40'0\" × 18'0\") + Drawing Room 278 sq ft (15'0\" × 18'6\")",
  },
];
assert.equal(
  buildMergeRows(already, { job_id: "j", extraction: split }).some(
    (r) => r.key === "bhk4-0-livingArea",
  ),
  false,
  "a living area that already matches must not be offered as a conflict",
);

// --- A layout the listing doesn't have yet: detailed, not one opaque row. ---
const twoLayouts = {
  ...extraction,
  configurations: [
    extraction.configurations[0],
    {
      ...extraction.configurations[0],
      variant_label: f("Unit - B"),
      super_built_up_area: f("5265 Sq.Ft."),
      carpet_area: f("2896 Sq. Ft."),
    },
  ],
} as unknown as PropertyExtraction;

const oneSaved = emptyPropertyForm();
oneSaved.configs.bhk4 = [{ ...emptyConfigDetail(), type: "Type A" }];
const newRows = buildMergeRows(oneSaved, { job_id: "j", extraction: twoLayouts }).filter((r) =>
  r.key.startsWith("bhk4-new1-"),
);
console.log(`\nrows for the unsaved Type B: ${newRows.length}`);
assert.ok(newRows.length > 8, "a new layout must be itemised, not summarised in one row");
for (const field of ["area", "carpet", "bedroom1", "kitchen", "livingArea", "bathrooms"]) {
  assert.ok(
    newRows.some((r) => r.key === `bhk4-new1-${field}`),
    `new layout missing a row for ${field}`,
  );
}

// Ticking a subset must build exactly one new variant, not one per field.
const built = structuredClone(oneSaved);
for (const r of newRows) r.apply(built);
assert.equal(built.configs.bhk4.length, 2, "the new layout must be added exactly once");
assert.equal(built.configs.bhk4[1].type, "Type B");
assert.equal(built.configs.bhk4[1].area, "5265 Sq.Ft.");
assert.equal(built.configs.bhk4[1].bedroom1, "252 sq ft (14'0\" × 18'0\")");
assert.equal(built.configs.bhk4[0].area, null, "the saved layout must be left alone");

// --- Plans print sizes in whatever style they like. ---
const styles = {
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      bhk_type: f("4 BHK"),
      variant_label: f("4 BHK - A BLOCK"),
      rooms: [
        // Hyphenated feet-inches: one brochure writes every size this way, and
        // failing to parse it meant no area was ever computed for that project.
        room("M.BED-2", "16'-4\" X 13'-0\""),
        room("M.BED-1", "13'0\" X 21'11\""),
        room("M.BED-3", "15'-7\" X 12'-10\""),
        room("STORE", "7'-0\"X5'-8\""),
      ],
    },
  ],
} as unknown as PropertyExtraction;

const styled = mapExtractedPayload(styles).configs!.bhk4[0];
assert.equal(styled.bedroom1, "285 sq ft (13'0\" × 21'11\")", "hyphenated sizes must parse");
// The plan drew M.BED-2 first, but its printed number decides the slot.
assert.equal(styled.bedroom2, "212 sq ft (16'4\" × 13'0\")", "numbered bedrooms keep their slot");
assert.equal(styled.bedroom3, "200 sq ft (15'7\" × 12'10\")");
console.log("\nhyphenated sizes  :", styled.bedroom1);
console.log("out-of-order beds :", `bedroom2 = ${styled.bedroom2}`);

// Unnumbered bedrooms still fall back to the order they were drawn.
const unnumbered = {
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      rooms: [room("BED ROOM", "12'0\" X 18'0\""), room("MASTER BEDROOM", "14'0\" X 18'0\"")],
    },
  ],
} as unknown as PropertyExtraction;
const fallback = mapExtractedPayload(unnumbered).configs!.bhk4[0];
assert.equal(
  fallback.bedroom1,
  "252 sq ft (14'0\" × 18'0\")",
  "master still leads when unnumbered",
);
assert.equal(fallback.bedroom2, "216 sq ft (12'0\" × 18'0\")");

// --- A penthouse names itself on the plan title, not in bhk_type. ---
const penthouse = {
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      bhk_type: f("5 BHK"),
      variant_label: f("5 BHK PENTHOUSE LOWER FLOOR PLAN"),
    },
    {
      ...extraction.configurations[0],
      bhk_type: f("5 BHK"),
      variant_label: f("5 BHK DUPLEX LOWER FLOOR PLAN"),
    },
    { ...extraction.configurations[0], bhk_type: f("2 BHK"), variant_label: f("5 BHK TYPICAL") },
  ],
} as unknown as PropertyExtraction;
const buckets = mapExtractedPayload(penthouse).configs!;
assert.equal(buckets.penthouse.length, 1, "a penthouse belongs in the penthouse bucket");
assert.equal(buckets.duplex.length, 1, "a duplex belongs in the duplex bucket");
// The label rescues a bhk_type the OCR misread as "2 BHK".
assert.equal(buckets.bhk5.length, 1, "the plan title decides when bhk_type disagrees");
assert.equal(buckets.bhk4.length, 0);
console.log("penthouse/duplex  : filed under their own buckets, not 5 BHK");

// --- 3 BHK, added because a brochure carried one and it was being dropped. ---
const threes = {
  ...extraction,
  configurations: [
    { ...extraction.configurations[0], bhk_type: f("3 BHK PREMIUM"), variant_label: f("Type 1") },
    // A duplex is a duplex whatever its bedroom count.
    { ...extraction.configurations[0], bhk_type: f("3 BHK"), variant_label: f("3 BHK DUPLEX") },
    // A sheet naming two sizes describes the larger home.
    { ...extraction.configurations[0], bhk_type: f(""), variant_label: f("3 BHK & 4 BHK PLAN") },
  ],
} as unknown as PropertyExtraction;
const threeBuckets = mapExtractedPayload(threes).configs!;
assert.equal(threeBuckets.bhk3.length, 1, "a 3 BHK must now have a bucket of its own");
assert.equal(threeBuckets.duplex.length, 1, "a 3 BHK duplex still belongs with the duplexes");
assert.equal(threeBuckets.bhk4.length, 1, "the larger size wins when a sheet names both");
assert.equal(
  findMappingGaps(threes).droppedVariants.length,
  0,
  "no 3 BHK layout should be dropped any more",
);
console.log("3 BHK             : bucketed, and a 3 BHK duplex still files as duplex");

// --- A plan book that never writes "BHK" anywhere. One labelled its units
// --- only by floor series — "A 101 - 901" — and lost all eight layouts.
const unlabelled = {
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      bhk_type: blank(),
      variant_label: f("A 101 - 901"),
      floor_range: f("101 to 901"),
      rooms: [
        room("M.BED-2", "16'-4\" X 13'-0\""),
        room("M.BED-3", "15'-7\" X 12'-10\""),
        room("M.BED-4", "12'-10\" X 16'-0\""),
        room("M.BED-1", "13'0\" X 21'11\""),
        room("M. TOI 1", "5'0\" X 7'0\""),
      ],
    },
    // Five bedrooms on the drawing, still nothing written on the sheet.
    {
      ...extraction.configurations[0],
      bhk_type: blank(),
      variant_label: f("B 102 - 1002"),
      rooms: [1, 2, 3, 4, 5].map((n) => room(`M.BED-${n}`, "13'0\" X 18'0\"")),
    },
    // But a sheet that DOES state a size the form can't hold must stay dropped
    // rather than be re-filed by its bedroom count.
    { ...extraction.configurations[0], bhk_type: f("2 BHK"), variant_label: f("2 BHK COMPACT") },
  ],
} as unknown as PropertyExtraction;

const derived = mapExtractedPayload(unlabelled).configs!;
assert.equal(derived.bhk4.length, 1, "four drawn bedrooms means a 4 BHK");
assert.equal(derived.bhk5.length, 1, "five drawn bedrooms means a 5 BHK");
assert.equal(derived.bhk4[0].bedroom1, "285 sq ft (13'0\" × 21'11\")");
assert.equal(derived.bhk4[0].bathrooms, "1", "M. TOI 1 must count as a bathroom, not a bedroom");
const unlabelledGaps = findMappingGaps(unlabelled);
assert.equal(unlabelledGaps.droppedVariants.length, 1, "only the stated 2 BHK should drop");
assert.equal(unlabelledGaps.droppedVariants[0].label, "2 BHK COMPACT");
console.log("unlabelled plans  : BHK counted from the bedrooms drawn");

// --- Spellings and abbreviations each brochure invented for itself. ---
const dialects = {
  ...extraction,
  configurations: [
    // "PENT HOUSE" with a space filed both levels of one penthouse as flats.
    { ...extraction.configurations[0], bhk_type: f("3 BHK"), variant_label: f("PENT HOUSE UPPER") },
    { ...extraction.configurations[0], bhk_type: f("2 BHK"), variant_label: f("Pent-House Lower") },
  ],
} as unknown as PropertyExtraction;
assert.equal(
  mapExtractedPayload(dialects).configs!.penthouse.length,
  2,
  "PENT HOUSE / Pent-House must read as penthouse",
);

const localWords = {
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      rooms: [
        room("KITCHEN", "10'0\" X 14'0\""),
        room("WET K", "6'0\" X 8'0\""),
        room("DRE & TOLET", "5'0\" X 8'0\""),
        room("M. TOI 2", "5'0\" X 7'0\""),
        room("ZARUKHO COVERED", "4'-6\"X7'-6\""),
        room("POWER", "7'-0\"X3'-6\""),
      ],
    },
  ],
} as unknown as PropertyExtraction;
const local = mapExtractedPayload(localWords).configs!.bhk4[0];
// Two kitchen parts, so each is named — same shape as the saved listings'
// "Core 122 sq ft (…) + Display 116 sq ft (…)".
assert.equal(local.kitchen, "Kitchen 140 sq ft (10'0\" × 14'0\") + Wet 48 sq ft (6'0\" × 8'0\")");
assert.equal(local.bathrooms, "2", "TOLET and TOI are both toilets");
assert.equal(local.balconies, "1", "a zarukho is a verandah");
assert.equal(
  findMappingGaps(localWords).unplacedRooms.length,
  0,
  "an electrical POWER room is plumbing, not a gap",
);
console.log("brochure dialects : PENT HOUSE, WET K, TOLET, ZARUKHO all read");

// A size the form doesn't list is a product decision, not a mapping failure,
// and the two must be told apart or the regression cries wolf forever.
const stated = findMappingGaps({
  ...extraction,
  configurations: [
    { ...extraction.configurations[0], bhk_type: f("2 BHK"), variant_label: f("2201") },
  ],
} as unknown as PropertyExtraction);
assert.equal(stated.droppedVariants[0].stated, true, "an explicit 2 BHK is a stated size");
assert.equal(unlabelledGaps.droppedVariants[0].stated, true);
// Building services are not a home, and calling that a mapping failure would
// leave the regression crying wolf on every brochure that lists a substation.
const services = findMappingGaps({
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      bhk_type: blank(),
      variant_label: f("Foyer Block A"),
      carpet_area: blank(),
      built_up_area: blank(),
      super_built_up_area: blank(),
      price: blank(),
      rooms: [room("Meter Room", null), room("Substation", null), room("DG set room", null)],
    },
  ],
} as unknown as PropertyExtraction);
assert.equal(services.droppedVariants.length, 1);
assert.equal(
  services.droppedVariants[0].notAResidence,
  true,
  "no measured room, no area, no price",
);
// A layout we genuinely failed to identify must NOT be excused the same way.
assert.equal(
  unlabelledGaps.droppedVariants.every((d) => !d.notAResidence || d.stated),
  true,
  "a real home must never be written off as building services",
);
console.log("dropped layouts   : stated sizes and building services told apart from real gaps");

// --- A plan page the model half-read looks exactly like a smaller home. ---
const halfRead = {
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      bhk_type: f("4 BHK"),
      variant_label: f("UNIT PLAN A"),
      // The sheet says 4 BHK; only three bedrooms were read off the drawing.
      rooms: [
        room("BEDROOM", "12'0\" X 14'0\""),
        room("BEDROOM", "12'0\" X 12'0\""),
        room("BEDROOM", "14'0\" X 17'0\""),
        room("TOILET", "7'0\" X 5'0\""),
        room("TOILET", "8'0\" X 5'0\""),
        room("TOILET", "9'0\" X 5'0\""),
      ],
    },
    // A sheet whose count agrees must stay quiet.
    {
      ...extraction.configurations[0],
      bhk_type: f("4 BHK"),
      variant_label: f("UNIT PLAN B"),
      rooms: [1, 2, 3, 4].map((n) => room(`BEDROOM ${n}`, "12'0\" X 14'0\"")),
    },
  ],
} as unknown as PropertyExtraction;

const shortfall = findMappingGaps(halfRead).bedroomShortfall;
assert.equal(shortfall.length, 1, "only the sheet that came up short should be reported");
assert.deepEqual(shortfall[0], { variant: "UNIT PLAN A", stated: 4, found: 3 });
// Nothing is invented to make the count work — three bedrooms stay three.
const half = mapExtractedPayload(halfRead).configs!.bhk4[0];
assert.equal(half.bedroom3, "238 sq ft (14'0\" × 17'0\")");
assert.equal(half.bedroom4, null, "a missing bedroom must never be fabricated");
assert.equal(half.bathrooms, "3", "toilets and bathrooms are one count");
console.log("bedroom shortfall : 4 BHK with 3 bedrooms read is reported, not papered over");

// --- Every size style found across the project's brochures, plus the ones
// --- that broke it. Each line here was a silent failure at some point.
const SIZE_STYLES: [string, string][] = [
  ["12'0\" X 10'0\"", "120 sq ft (12'0\" × 10'0\")"],
  ["6'3\"X8'8\"", "54 sq ft (6'3\" × 8'8\")"],
  ["15'-9\" X 22'-0\"", "347 sq ft (15'9\" × 22'0\")"],
  ["12'0'' X 10'0''", "120 sq ft (12'0\" × 10'0\")"],
  // Curly quotes: one plan book printed all 199 of its sizes this way and the
  // entire book came through with no area on any room.
  ["7’3” x 6’3”", "45 sq ft (7'3\" × 6'3\")"],
  ["7′3″ × 6′3″", "45 sq ft (7'3\" × 6'3\")"],
  ["10'9” x 12'0\"", "129 sq ft (10'9\" × 12'0\")"],
];
for (const [printed, expected] of SIZE_STYLES) {
  const one = {
    ...extraction,
    configurations: [{ ...extraction.configurations[0], rooms: [room("BED ROOM", printed)] }],
  } as unknown as PropertyExtraction;
  const got = mapExtractedPayload(one).configs!.bhk4[0].bedroom1;
  assert.equal(got, expected, `size style ${JSON.stringify(printed)} must parse`);
}
console.log(`\nsize styles parsed: ${SIZE_STYLES.length}/${SIZE_STYLES.length}`);

// --- Abbreviations plan books actually use for counted rooms. ---
const abbreviations = {
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      rooms: [
        room("M. TOIL-1", "5'0\" X 7'0\""),
        room("TOIL 2", "5'0\" X 7'0\""),
        room("P TOL", "4'0\" X 4'0\""),
        room("S. ROOM", "7'0\" X 8'0\""),
      ],
    },
  ],
} as unknown as PropertyExtraction;
const abbrev = mapExtractedPayload(abbreviations).configs!.bhk4[0];
assert.equal(abbrev.bathrooms, "3", "TOIL / TOL abbreviations must count as bathrooms");
assert.equal(abbrev.servantRoom, "Yes", "S. ROOM must be recognised as the servant room");
console.log("abbreviations     : TOIL / TOL / S. ROOM recognised");

// --- Whatever we can't use has to be reported, never swallowed. ---
const unusable = {
  ...extraction,
  configurations: [
    { ...extraction.configurations[0], bhk_type: f("2 BHK"), variant_label: f("2 BHK COMPACT") },
    {
      ...extraction.configurations[0],
      rooms: [room("HOME OFFICE", "10'0\" X 10'0\""), room("BED ROOM", "approx. 300 sqft")],
    },
  ],
} as unknown as PropertyExtraction;
const gaps = findMappingGaps(unusable);
assert.equal(gaps.droppedVariants.length, 1, "a layout with no bucket must be reported");
assert.equal(gaps.droppedVariants[0].label, "2 BHK COMPACT");
assert.ok(
  gaps.unplacedRooms.some((r) => r.name === "HOME OFFICE"),
  "a room with no form field must be reported",
);
assert.ok(
  gaps.unparsedDimensions.some((r) => r.dimension === "approx. 300 sqft"),
  "a size we can't read must be reported",
);

// --- Metric plans. One brochure draws its 3 BHK entirely in metres. ---
const metric = {
  ...extraction,
  configurations: [
    {
      ...extraction.configurations[0],
      rooms: [
        room("M.BEDROOM-1", "3.9 X 3.81"),
        room("LIVING ROOM", "6.45 X 6.18"),
        room("KITCHEN", "3.0 m x 2.4 m"),
        // Bare integers are as likely to be feet, so they stay unread rather
        // than being silently reinterpreted as a room four times its size.
        room("BEDROOM-2", "12 X 14"),
      ],
    },
  ],
} as unknown as PropertyExtraction;
const met = mapExtractedPayload(metric).configs!.bhk4[0];
// The area is computed, but the bracket keeps the plan's own numbers — a buyer
// holding the drawing must read the same figures off the screen.
assert.equal(met.bedroom1, "160 sq ft (3.9 m × 3.81 m)", "metres must convert to sq ft");
assert.equal(met.livingArea, "429 sq ft (6.45 m × 6.18 m)");
assert.equal(met.kitchen, "78 sq ft (3 m × 2.4 m)", "an explicit m unit must be read");
assert.equal(met.bedroom2, "12 X 14", "a bare integer pair must not be guessed at");
console.log("metric plans      :", met.bedroom1);
// Circulation space has no field by design and must not be reported as a gap.
const plumbing = {
  ...extraction,
  configurations: [
    { ...extraction.configurations[0], rooms: [room("PASSAGE", "3'6\" WIDE"), room("LIFT", null)] },
  ],
} as unknown as PropertyExtraction;
const quiet = findMappingGaps(plumbing);
assert.equal(quiet.unplacedRooms.length, 0, "circulation space is not a gap");
assert.equal(quiet.unparsedDimensions.length, 0, "a passage width is not a room size");
console.log("gap reporting     : unusable data surfaced, plumbing stays quiet");

console.log("\nOK — all mapping and merge assertions passed");
