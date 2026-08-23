import {
  CONFIG_BUCKETS,
  emptyConfigDetail,
  VARIANT_FIELDS,
  type ConfigDetailInput,
  type PropertyFormValues,
} from "@/lib/property-schema";

/** The form groups variants under bhk2…bhk7/penthouse/duplex, which is not the
 *  same as ConfigKey ("3 BHK", "4 BHK", …) used by the public property type. */
type ConfigBucket = keyof PropertyFormValues["configs"];

/** Every scalar the OCR service returns is wrapped like this, never a bare
 *  value — `found: false` means it genuinely wasn't in the document, which is
 *  different from "extraction failed". `verified` is always false on arrival;
 *  only a human ticking the review checkbox flips it. */
export interface ExtractedField {
  value: string | number | boolean | null;
  found: boolean;
  confidence: number;
  source_file: string | null;
  source_page: number | null;
  evidence: string | null;
  verified: boolean;
  /** Set only when a cross-field consistency check (room size vs. the plan's
   *  own text layer, area-ratio sanity) actively caught this value looking
   *  wrong — distinct from a plain low confidence, which just means the OCR
   *  itself wasn't sure. Null on every field a check didn't touch. */
  validation_warning: string | null;
}

interface RoomDimension {
  room_name: ExtractedField;
  dimension: ExtractedField;
}

interface ConfigVariant {
  bhk_type: ExtractedField;
  variant_label: ExtractedField;
  floor_range: ExtractedField;
  carpet_area: ExtractedField;
  built_up_area: ExtractedField;
  super_built_up_area: ExtractedField;
  price: ExtractedField;
  rate_per_sqft: ExtractedField;
  rooms: RoomDimension[];
}

type Section = Record<string, ExtractedField>;

/** Mirrors backend/app/schema.py — that file is the source of truth. */
export interface PropertyExtraction {
  basics: Section;
  project_structure: Section;
  rera: Section;
  construction_amenities: Section;
  developer: Section & { notable_delivered_projects?: ExtractedField[] };
  configurations: ConfigVariant[];
  amenities: ExtractedField[];
  highlights: ExtractedField[];
  image_candidates: {
    source_file: string;
    source_page: number;
    image_path: string;
    width: number;
    height: number;
  }[];
  images: Record<string, string | null>;
  source_files: string[];
  warnings: string[];
}

export interface ExtractionResponse {
  job_id: string;
  extraction: PropertyExtraction;
  /** Set by getBrochureExtraction, alongside imageTicket, so the review UI can
   *  build /page-image URLs for arbitrary (file, page) citations itself rather
   *  than the server pre-resolving every one — most never get opened. Absent
   *  for any caller that constructs an ExtractionResponse without going
   *  through that server function (there currently are none, but nothing
   *  else should assume it's always present). */
  imageBaseUrl?: string;
  imageTicket?: string;
}

/** `<section>.<field>` in the service's payload -> our form field. */
const FIELD_MAP: Record<string, keyof PropertyFormValues> = {
  "basics.property_name": "name",
  "basics.developer": "developer",
  "basics.category": "category",
  "basics.status": "status",
  "basics.possession": "possession",
  // Its namesake, not `possessionAsOf`. The two form fields are genuinely
  // distinct: `possessionAsOf` records when the free-text duration string
  // ("9 Months") was last checked and drives the v1 countdown, while
  // `possessionConfirmedAsOf` records when the possession estimate itself was
  // confirmed and is what the v2 publication and PropScore's possession
  // evidence read. Brochures essentially never print this — it is found in 0 of
  // the 29 extracted jobs — because the real source is the RERA record, which
  // `scripts/rera-enrich.ts` fills in. Routing it to `possessionAsOf` meant
  // that enrichment had nowhere to land.
  "basics.possession_confirmed_as_of": "possessionConfirmedAsOf",
  "basics.location": "location",
  "basics.city": "city",
  "basics.state": "state",
  "basics.tagline": "tagline",
  "basics.expert_note": "expertNote",

  "project_structure.plot_size": "plotSize",
  "project_structure.available_bhk_types": "availableBhkTypes",
  "project_structure.total_towers": "totalTowers",
  "project_structure.total_floors": "totalFloors",
  "project_structure.units_per_floor": "unitsPerFloor",
  "project_structure.total_units": "totalUnits",

  "rera.rera_id": "reraId",
  "rera.rera_link": "reraUrl",
  "rera.proposed_start_date": "proposedStartDateRera",

  "construction_amenities.parking_levels": "parkingLevels",
  "construction_amenities.podium_structure": "podiumStructure",
  "construction_amenities.lifts_per_tower": "liftsPerTower",
  "construction_amenities.open_space": "openSpace",
  "construction_amenities.geyser_heat_pump": "geyserHeatPumpProvided",
  "construction_amenities.vrv_ac_provided": "vrvAcProvided",
  "construction_amenities.window_glasses": "windowGlazing",
  "construction_amenities.bath_sanitary_fittings": "bathSanitaryFittings",
  "construction_amenities.flooring": "flooringType",
  "construction_amenities.density_units_per_acre": "unitsPerAcre",
  "construction_amenities.construction_quality": "constructionQuality",
  "construction_amenities.internal_ceiling_height": "internalCeilingHeight",
  "construction_amenities.clubhouse_size": "clubhouseSize",

  "developer.experience_years": "developerExperienceYears",
  "developer.total_delivered_projects": "totalDeliveredProjects",
  "developer.ongoing_projects": "ongoingProjects",
  "developer.background": "developerBackground",
};

/** A few form fields are typed narrower than the free text a brochure prints
 *  into them, so the raw extracted string can't be written through unchanged.
 *  These normalise the printed value onto what the field can hold; returning
 *  "" means the brochure said nothing the field can represent, which the form
 *  then leaves blank rather than filling with something unusable. Nothing here
 *  invents a value — each one only reshapes what the brochure already stated. */
const COERCE: Partial<Record<keyof PropertyFormValues, (raw: string) => string>> = {
  // OCR reads the category off the cover, where it is prose ("4 BHK Apartment",
  // "Luxurious Villa Community"), not one of the form's three enum values.
  // Written through raw it fails enum validation with the brochure long out of
  // sight, so it is classified here against the same words a reader would use.
  category: (raw) => {
    const t = raw.toLowerCase();
    if (/\b(plot|land|parcel)\b/.test(t)) return "Plots";
    if (/\b(villa|bungalow|row\s*house|independent\s*hous)/.test(t)) return "Bungalow";
    if (/\b(apartment|flat|residence|tower|high\s*rise)/.test(t)) return "Apartment";
    // Says nothing about the built form — let the form's own default stand
    // rather than guessing a category the brochure never claimed.
    return "";
  },
  // Brochures print the RERA site as a bare domain ("www.gujrera.gujarat.gov.in").
  // Adding the scheme is a formatting fix to a URL the brochure did state; a
  // value that isn't a domain at all is left out rather than coerced.
  reraUrl: (raw) => {
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(raw)) return `https://${raw}`;
    return "";
  },
};

const LABELS: Partial<Record<keyof PropertyFormValues, string>> = {
  name: "Property name",
  developer: "Developer",
  category: "Category",
  status: "Status",
  possession: "Possession",
  possessionAsOf: "Possession duration confirmed as of",
  possessionConfirmedAsOf: "Possession date confirmed as of",
  location: "Location",
  city: "City",
  state: "State",
  tagline: "Tagline",
  expertNote: "Expert note",
  plotSize: "Plot size",
  availableBhkTypes: "Available BHK types",
  totalTowers: "Total towers",
  totalFloors: "Total floors",
  unitsPerFloor: "Units per floor",
  totalUnits: "Total units",
  reraId: "RERA ID",
  reraUrl: "RERA link",
  proposedStartDateRera: "Proposed start date (RERA)",
  parkingLevels: "Parking levels",
  podiumStructure: "Podium structure",
  liftsPerTower: "Lifts per tower",
  openSpace: "Open space",
  geyserHeatPumpProvided: "Geyser / heat pump",
  vrvAcProvided: "VRV / AC",
  windowGlazing: "Window glasses",
  bathSanitaryFittings: "Bath & sanitary fittings",
  flooringType: "Flooring",
  unitsPerAcre: "Density (units per acre)",
  constructionQuality: "Construction quality",
  internalCeilingHeight: "Internal ceiling height",
  clubhouseSize: "Clubhouse size",
  developerExperienceYears: "Developer experience (years)",
  totalDeliveredProjects: "Total delivered projects",
  ongoingProjects: "Ongoing projects",
  developerBackground: "Developer background",
};

export interface ExtractedFieldInfo {
  formField: keyof PropertyFormValues;
  label: string;
  value: string;
  confidence: number;
  snippet: string | null;
  sourceFile: string | null;
  sourcePage: number | null;
  /** Non-null when a backend consistency check flagged this specific value —
   *  see `ExtractedField.validation_warning`. */
  validationWarning: string | null;
}

/** Plan books name layouts however they like — "TYPE - 4 SUB UNIT TYPE - 4.2",
 *  "SUB UNIT TYPE - 1.1" — which is meaningless to a buyer comparing homes.
 *  Inside a BHK the layouts are simply the first, second, third: Type A, B, C.
 *  The brochure's own wording is kept alongside so a reviewer can still check
 *  a row against the page it came from. */
function sequentialLabel(position: number): string {
  if (position < 26) return `Type ${String.fromCharCode(65 + position)}`;
  return `Type ${position + 1}`;
}

/** The service returns whatever the brochure printed, so match loosely on the
 *  digit / keyword rather than requiring an exact "4 BHK".
 *
 *  Both fields are read because brochures put the unit's kind wherever they
 *  like: a sheet titled "5 BHK PENTHOUSE LOWER FLOOR PLAN" reports a bhk_type
 *  of plain "5 BHK", so reading only that filed every penthouse and duplex in
 *  the building under 5 BHK. The specific kind wins over the bedroom count. */
function bucketFor(
  bhkType: string,
  variantLabel = "",
  rooms: RoomDimension[] = [],
): ConfigBucket | null {
  const t = `${bhkType} ${variantLabel}`.toLowerCase();
  // "PENT HOUSE" and "PENT-HOUSE" are as common in plan books as "PENTHOUSE",
  // and matching only the closed spelling filed both levels of one penthouse
  // as ordinary flats — the lower one was dropped outright.
  if (/pent\s*-?\s*house/.test(t)) return "penthouse";
  if (t.includes("duplex")) return "duplex";

  // Largest first throughout: a sheet titled "3 BHK & 4 BHK TYPICAL PLAN"
  // describes the bigger home, and reading the smaller digit would file it a
  // tier too low.
  //
  // 6, 7 and 2 BHK require the literal "N BHK" wording, while 3/4/5 still match
  // a bare digit. That asymmetry is deliberate. A bare digit is safe for the
  // middle sizes because a plan sheet that mentions "4" at all is almost always
  // naming the home, but it is not safe at the edges: plan books label layouts
  // and towers "Type 2", "Wing 2", "Block 6", and a bare-digit rule would file
  // every one of those as a 2 or 6 BHK home the brochure never claimed. Every
  // 2/6/7 BHK layout actually seen in the corpus is printed in the "N BHK"
  // form, so requiring it costs nothing and closes that hole.
  if (/\b7\s*bhk\b/.test(t)) return "bhk7";
  if (/\b6\s*bhk\b/.test(t)) return "bhk6";
  if (/\b5\b/.test(t)) return "bhk5";
  if (/\b4\b/.test(t)) return "bhk4";
  if (/\b3\b/.test(t)) return "bhk3";
  if (/\b2\s*bhk\b/.test(t)) return "bhk2";

  // A sheet that states a size with no bucket behind it — "1 BHK", "10 BHK" —
  // is still telling the truth. Counting bedrooms instead would file it under a
  // size the brochure never claimed, so report it as dropped and let a human
  // decide. (1 BHK has no canonical `configuration_kind`, and a "10 BHK" villa
  // sheet is far more likely a mis-read room count than a real claim.)
  if (/\b\d+\s*bhk\b/.test(t)) return null;

  // Nothing on the sheet says what size this home is. Plan books routinely
  // identify a unit only by its floor series — "A 101 - 901", "B 102 - 1002" —
  // and one such book had all eight of its layouts dropped for want of the
  // words "4 BHK" anywhere on the page. So count the bedrooms the plan draws,
  // which is what a human reads off the same drawing.
  //
  // The floor stays at 3. Counting is known to undercount — that is what
  // `bedroomShortfall` reports — so letting it reach down to a 2 BHK verdict
  // would turn a half-read 3 BHK plan into a confidently mis-filed smaller
  // home. Below 3 the honest answer is still "dropped, ask a human".
  const beds = countBedrooms(rooms);
  if (beds >= 7) return "bhk7";
  if (beds === 6) return "bhk6";
  if (beds === 5) return "bhk5";
  if (beds === 4) return "bhk4";
  if (beds === 3) return "bhk3";
  return null;
}

/** How many bedrooms a plan actually draws. A numbered label ("M.BED-3") gives
 *  the count directly and survives a drawing that lists them out of order;
 *  otherwise the drawn bedrooms are simply counted. */
function countBedrooms(rooms: RoomDimension[]): number {
  let highest = 0;
  let drawn = 0;
  for (const room of rooms) {
    const raw = text(room.room_name);
    if (!raw) continue;
    const name = raw.toLowerCase();
    // Bathrooms first, so "BED ROOM TOILET" is not counted as a bedroom.
    if (ROOM_PATTERNS.bathroom.test(name) || !ROOM_PATTERNS.bedroom.test(name)) continue;
    drawn += 1;
    const numbered = BEDROOM_NUMBER_RE.exec(raw);
    if (numbered) highest = Math.max(highest, Number(numbered[1]));
  }
  // A plan numbering to 4 has four bedrooms even if it drew one of them twice.
  return highest || drawn;
}

/** Reads a wrapped field, returning "" for anything the OCR didn't find. */
function text(field: ExtractedField | undefined): string {
  if (!field?.found || field.value === null || field.value === undefined) return "";
  return String(field.value).trim();
}

/** Null rather than "" — ConfigDetail distinguishes absent from empty. */
function textOrNull(field: ExtractedField | undefined): string | null {
  const value = text(field);
  return value === "" ? null : value;
}

function section(extraction: PropertyExtraction, name: string): Section {
  return (extraction as unknown as Record<string, Section>)[name] ?? {};
}

/** Plans label rooms in the brochure's own words, not ours — "DRAWING",
 *  "TOILET/DRESS", "SIT OUT" — so each slot matches on a family of wordings.
 *  Bathrooms are checked before bedrooms so "BED ROOM TOILET" lands as a
 *  bathroom rather than swallowing a bedroom slot. */
const ROOM_PATTERNS = {
  // Plans abbreviate relentlessly: TOILET, TOIL, M.TOIL-1, P TOL. Missing the
  // short forms meant a five-bathroom home reported two.
  // TOILET, TOIL, TOI, TOL and the routine misprint TOLET all mean the same
  // thing; a five-bathroom home was reporting two.
  bathroom: /\btoi|\btol|bathroom|washroom|powder|\bbath\b|\bw\.?c\.?\b/,
  // "Zarukho" is the Gujarati verandah, and these are Ahmedabad plan books.
  balcony: /balcon|deck|sit[\s-]?out|terrace|verandah?|zarukho|otla/,
  // "S. ROOM" / "S ROOM" is how most plan books label the servant room.
  servant: /servant|maid|house\s*help|\bs\.?\s*room\b/,
  // A wet kitchen is often just "WET K" beside the main one.
  kitchen: /kitchen|\bwet\s*k\b/,
  living: /living|drawing|dining|lounge|family\s*room/,
  bedroom: /bed\s*room|\bbed\b|\bmbr\b/,
  /** Circulation and service spaces the form deliberately has no field for.
   *  Listed explicitly so that anything NOT here and not matched above is a
   *  genuine gap worth reporting, rather than noise a reviewer learns to
   *  ignore. */
  ignorable:
    /lift|passage|corridor|vestibule|foyer|entrance|lobby|staircase|stair|shaft|duct|niche|\bdress\b|dressing|wardrobe|closet|\bw\/w\b|store|storage|wash|yard|utility|pantry|puja|pooja|temple|mandir|shoe|service|refuge|\bpower\b|meter|electric|terrace|garden|deck|pool|gym|parking|porch|entry|exit|open\s*to\s*sky|void|ledge|sit\s*area|planter/,
};

/** A size as printed on a plan. Drawings are wildly inconsistent — one brochure
 *  mixes several styles on a single sheet, and each new plan book brings
 *  another. All of these are the same measurement:
 *
 *    12'0" X 10'0"    6'3"X8'8"      15'-9" X 22'-0"
 *    12'0'' X 10'0''  7’3” x 6’3”    7′3″ × 6′3″
 *
 *  Feet are marked with a straight quote, a curly one, or a prime; inches with
 *  a double of any of those, or doubled feet marks, or nothing at all; feet may
 *  be joined to inches by a dash; and the separator is X, x, × or *.
 *
 *  Getting this wrong is expensive and silent: one plan book printed every one
 *  of its 199 sizes with curly quotes, and the whole book came through with no
 *  area computed for any room. */
const FEET_MARK = "['’′]";
const INCH_MARK = "(?:''|’’|[\"”″])";
const ONE_SIDE = `(\\d+)\\s*${FEET_MARK}\\s*[-–—]?\\s*(\\d+)?\\s*${INCH_MARK}?`;
const DIMENSION_RE = new RegExp(`${ONE_SIDE}\\s*[xX×*]\\s*${ONE_SIDE}`);

/** "M.BED-3", "BEDROOM 2" — a plan that numbers its bedrooms is telling us
 *  which slot each belongs in, and that is not the order they were drawn. */
const BEDROOM_NUMBER_RE = /(\d+)\s*$/;

/** Some plan books are drawn in metres — "3.0 X 3.35", "6.45 X 6.18 m". A
 *  decimal point and no feet mark is the tell: no bedroom is three FEET across,
 *  and every such plan seen so far reads correctly as metres. Bare integers
 *  ("12 X 14") stay unparsed rather than guessed at, since those genuinely
 *  could be either. */
const METRE_UNIT = "(?:\\s*(?:m|mt|mtr|meters?|metres?)\\b\\.?)?";
const METRIC_RE = new RegExp(
  `^\\D*(\\d+\\.\\d+|\\d+)${METRE_UNIT}\\s*[xX×*]\\s*(\\d+\\.\\d+|\\d+)${METRE_UNIT}\\s*$`,
);
const SQ_FT_PER_SQ_M = 10.7639;

type Measured =
  | { unit: "ft"; feetA: number; inchA: number; feetB: number; inchB: number }
  | { unit: "m"; a: number; b: number };

function parseDimension(raw: string): Measured | null {
  const m = DIMENSION_RE.exec(raw);
  if (m) {
    const measured = {
      unit: "ft" as const,
      feetA: Number(m[1]),
      inchA: Number(m[2] ?? 0),
      feetB: Number(m[3]),
      inchB: Number(m[4] ?? 0),
    };
    // Guard against OCR slips — one plan came back with a 120-foot bedroom
    // ("120' X 148''"). Turning that into "17760 sq ft" would launder a misread
    // into a confident-looking number, so leave such a value verbatim instead.
    if (measured.inchA > 11 || measured.inchB > 11) return null;
    if (measured.feetA > 100 || measured.feetB > 100) return null;
    if (!measured.feetA || !measured.feetB) return null;
    return measured;
  }

  const metric = METRIC_RE.exec(raw);
  if (!metric) return null;
  const a = Number(metric[1]);
  const b = Number(metric[2]);
  // Only trust this when a decimal is actually present; "12 X 14" is as likely
  // to be feet. And a 40-metre room is a misread, not a room.
  if (!/\./.test(raw) && !/\b(?:m|mt|mtr|meters?|metres?)\b/i.test(raw)) return null;
  if (!a || !b || a > 40 || b > 40) return null;
  return { unit: "m", a, b };
}

function squareFeet(m: Measured): number {
  if (m.unit === "m") return Math.round(m.a * m.b * SQ_FT_PER_SQ_M);
  return Math.round((m.feetA + m.inchA / 12) * (m.feetB + m.inchB / 12));
}

/** The drawing's own numbers, never converted — a buyer holding the plan has
 *  to read the same figures off the screen. Only the area is computed. */
function printedDimensions(m: Measured): string {
  if (m.unit === "m") return `${m.a} m × ${m.b} m`;
  return `${m.feetA}'${m.inchA}" × ${m.feetB}'${m.inchB}"`;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** How the listing has always written a room: the computed area first, the
 *  drawing's own feet-and-inches in brackets — "280 sq ft (20'0" × 14'0")".
 *  A size we can't parse is passed through untouched rather than dropped. */
function formatRoom(dimension: string, name: string | null): string {
  const m = parseDimension(dimension);
  if (!m) return name ? `${name} ${dimension.trim()}` : dimension.trim();
  return `${name ? `${name} ` : ""}${squareFeet(m)} sq ft (${printedDimensions(m)})`;
}

/** Plans routinely split one of our slots across two drawn rooms — a display
 *  kitchen beside a core kitchen, a drawing room beside a living & dining.
 *  Both belong in the single field the form offers, so they are joined the way
 *  the listing already records them:
 *
 *    Living & Dining 720 sq ft (40'0" × 18'0") + Drawing Room 278 sq ft (…)
 *
 *  A slot filled by one room needs no name — just the measurement. Largest
 *  space leads, which is how the saved listings read. */
function combineRooms(
  rooms: { name: string; dimension: string; generic: boolean }[],
): string | null {
  // A plan that labels one room twice — "DISPLAY KITCHEN" and a bare "KITCHEN"
  // over the same 10'0" × 11'0" — would otherwise read as two kitchens. The
  // generic label is the redundant one, so it goes; two differently named rooms
  // that genuinely share a size (a display and a core both 12'0" × 10'0") are
  // both real and both stay.
  const named = new Set(rooms.filter((r) => !r.generic).map((r) => r.dimension));
  const kept = rooms.filter((r) => !(r.generic && named.has(r.dimension)));

  if (!kept.length) return null;
  if (kept.length === 1) return formatRoom(kept[0].dimension, null);

  const ordered = kept
    .map((r) => ({
      ...r,
      area: (() => {
        const m = parseDimension(r.dimension);
        return m ? squareFeet(m) : 0;
      })(),
    }))
    // Stable sort, so two equally sized rooms keep the order the plan drew them.
    .sort((a, b) => b.area - a.area);

  return ordered.map((r) => formatRoom(r.dimension, r.name)).join(" + ");
}

/** "DISPLAY KITCHEN" reads as "Display" once it sits in the Kitchen field —
 *  repeating the slot's own name in every part adds nothing. A room left with
 *  no name of its own after that ("KITCHEN") is flagged generic: it carries no
 *  information beyond the slot it's already in. */
function roomLabel(raw: string, slot: "living" | "kitchen"): { name: string; generic: boolean } {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (slot === "kitchen") {
    const stripped = cleaned.replace(/\bkitchens?\b|\bk\b/i, "").trim();
    if (!stripped) return { name: titleCase(cleaned), generic: true };
    return { name: titleCase(stripped), generic: false };
  }
  return { name: titleCase(cleaned), generic: false };
}

export interface RoomCitation {
  sourceFile: string | null;
  sourcePage: number | null;
  snippet: string | null;
  confidence: number | undefined;
}

/** Reads a citation off whichever ExtractedField backed a slot. Room-level
 *  fields (unlike the scalar sections) are never `found: false` placeholders
 *  by the time they get here — assignRooms only calls this on fields it has
 *  already used a printed dimension or name from — but the null check stays
 *  since a citation with no source page is worse than no citation at all. */
function fieldCitation(field: ExtractedField | undefined): RoomCitation | undefined {
  if (!field?.source_file) return undefined;
  return {
    sourceFile: field.source_file,
    sourcePage: field.source_page,
    snippet: field.evidence,
    confidence: field.confidence,
  };
}

/** Matches every room on a plan to the ConfigDetail slot it belongs in.
 *
 *  Two kinds of room live here. Bedrooms, kitchen and the living area are
 *  MEASUREMENTS — without a printed size there is nothing to record. Bathrooms,
 *  balconies and the servant room are COUNTS: the form asks how many, so they
 *  are worth tallying even on a plan that labels them without a dimension. */
export interface RoomMapping {
  values: Partial<ConfigDetailInput>;
  /** One citation per filled slot, for the reviewer to check a dimension
   *  against its source page. A combined slot (two rooms joined into one
   *  "Living / Dining + Drawing Room" value) cites only the first of the
   *  two — both almost always come off the same plan sheet, and a review UI
   *  showing two images for one field would cost more than the edge case
   *  where they don't is worth. */
  citations: Partial<Record<keyof ConfigDetailInput, RoomCitation>>;
  /** Rooms the form has no field for — a study, a home theatre, a puja room.
   *  Reported rather than dropped in silence: a brochure whose labels this
   *  module doesn't recognise used to look identical to a brochure that simply
   *  had fewer rooms, so gaps were only ever found by a human noticing an empty
   *  form weeks later. */
  unplaced: { name: string; dimension: string | null }[];
  /** Sizes that were printed but couldn't be read as feet-and-inches. Each one
   *  is a plan style the parser doesn't handle yet, and the value reaches the
   *  form verbatim with no area computed. */
  unparsed: { name: string; dimension: string }[];
  /** Form slot keys (bedroom1-5, livingArea, kitchen) built from at least one
   *  room whose dimension a backend consistency check actively flagged. A
   *  combined slot (e.g. "Living & Dining + Drawing Room") is failing if
   *  either half is. */
  failingSlots: Set<string>;
}

function assignRooms(rooms: RoomDimension[]): RoomMapping {
  const out: Record<string, string | null> = {};
  const citations: Partial<Record<keyof ConfigDetailInput, RoomCitation>> = {};
  const bedrooms: {
    dimension: string;
    master: boolean;
    slot: number | null;
    failing: boolean;
    field: ExtractedField;
  }[] = [];
  const living: {
    name: string;
    dimension: string;
    generic: boolean;
    failing: boolean;
    field: ExtractedField;
  }[] = [];
  const kitchens: {
    name: string;
    dimension: string;
    generic: boolean;
    failing: boolean;
    field: ExtractedField;
  }[] = [];
  const unplaced: { name: string; dimension: string | null }[] = [];
  const unparsed: { name: string; dimension: string }[] = [];
  const failingSlots = new Set<string>();
  let bathrooms = 0;
  let balconies = 0;
  let hasServant = false;

  for (const room of rooms) {
    const raw = text(room.room_name);
    const name = raw.toLowerCase();
    if (!name) continue;
    const dimension = textOrNull(room.dimension);
    const failing = Boolean(room.dimension?.validation_warning);
    // Only sizes that were going to reach the form matter here. A passage
    // labelled 3'6" WIDE is not a W×H and never had a field to land in, so
    // reporting it would just train the reader to skim past real problems.
    const measured =
      ROOM_PATTERNS.kitchen.test(name) ||
      ROOM_PATTERNS.living.test(name) ||
      ROOM_PATTERNS.bedroom.test(name);
    // A size the regex cannot even shape-match is a plan style we don't handle
    // yet — a real gap. One that matches but fails the plausibility guard (a
    // "120-foot bedroom") is a misread we are deliberately refusing to dress up
    // as an area, which is working as intended and not worth reporting.
    if (measured && dimension && !DIMENSION_RE.test(dimension) && !METRIC_RE.test(dimension)) {
      unparsed.push({ name: raw, dimension });
    }

    if (ROOM_PATTERNS.bathroom.test(name)) {
      bathrooms += 1;
      // A count comes from every "TOILET-N" on the sheet, not one field — the
      // first one read is a representative page to check against, not proof
      // of every one of them.
      if (!citations.bathrooms) citations.bathrooms = fieldCitation(room.room_name);
      continue;
    }
    if (ROOM_PATTERNS.balcony.test(name)) {
      balconies += 1;
      if (!citations.balconies) citations.balconies = fieldCitation(room.room_name);
      continue;
    }
    if (ROOM_PATTERNS.servant.test(name)) {
      hasServant = true;
      if (!citations.servantRoom) citations.servantRoom = fieldCitation(room.room_name);
      continue;
    }

    if (ROOM_PATTERNS.kitchen.test(name)) {
      if (dimension)
        kitchens.push({ ...roomLabel(raw, "kitchen"), dimension, failing, field: room.dimension });
    } else if (ROOM_PATTERNS.living.test(name)) {
      if (dimension)
        living.push({ ...roomLabel(raw, "living"), dimension, failing, field: room.dimension });
    } else if (ROOM_PATTERNS.bedroom.test(name)) {
      if (dimension) {
        const numbered = BEDROOM_NUMBER_RE.exec(raw);
        bedrooms.push({
          dimension,
          master: /master|\bmbr\b/.test(name),
          slot: numbered ? Number(numbered[1]) : null,
          failing,
          field: room.dimension,
        });
      }
    } else if (!ROOM_PATTERNS.ignorable.test(name)) {
      unplaced.push({ name: raw, dimension });
    }
  }

  out.livingArea = combineRooms(living);
  if (living.some((r) => r.failing)) failingSlots.add("livingArea");
  if (living.length) citations.livingArea = fieldCitation(living[0].field);
  out.kitchen = combineRooms(kitchens);
  if (kitchens.some((r) => r.failing)) failingSlots.add("kitchen");
  if (kitchens.length) citations.kitchen = fieldCitation(kitchens[0].field);

  // A plan that numbers its bedrooms decides its own slots — "M.BED-1" is
  // bedroom1 even when the drawing happens to place M.BED-2 first, which is
  // common and used to shift every bedroom on the sheet by one. Only the
  // unnumbered ones fall back to order, master first: bedroom1 is the master
  // on every listing already saved, and plans routinely draw it last.
  const placed = new Map<number, string>();
  const placedField = new Map<number, ExtractedField>();
  const placedFailing = new Set<number>();
  const spare: { dimension: string; failing: boolean; field: ExtractedField }[] = [];
  const ordered = [...bedrooms.filter((b) => b.master), ...bedrooms.filter((b) => !b.master)];
  for (const b of ordered) {
    if (b.slot && b.slot >= 1 && b.slot <= 5 && !placed.has(b.slot)) {
      placed.set(b.slot, b.dimension);
      placedField.set(b.slot, b.field);
      if (b.failing) placedFailing.add(b.slot);
    } else spare.push({ dimension: b.dimension, failing: b.failing, field: b.field });
  }
  let next = 1;
  for (const { dimension, failing, field } of spare) {
    while (next <= 5 && placed.has(next)) next += 1;
    // The form stops at five bedrooms; a sixth has nowhere to go, and saying so
    // is the whole point of `unplaced`.
    if (next > 5) unplaced.push({ name: "Bedroom (no free slot)", dimension });
    else {
      placed.set(next, dimension);
      placedField.set(next, field);
      if (failing) placedFailing.add(next);
    }
  }
  for (const [slot, dimension] of placed) out[`bedroom${slot}`] = formatRoom(dimension, null);
  for (const slot of placedFailing) failingSlots.add(`bedroom${slot}`);
  for (const [slot, field] of placedField) {
    const citation = fieldCitation(field);
    if (citation) citations[`bedroom${slot}` as keyof ConfigDetailInput] = citation;
  }

  if (bathrooms) out.bathrooms = String(bathrooms);
  if (balconies) out.balconies = String(balconies);
  if (hasServant) out.servantRoom = "Yes";

  return { values: out, citations, unplaced, unparsed, failingSlots };
}

/** What an extraction lost on its way into the form.
 *
 *  Exists so a brochure whose conventions this module doesn't handle announces
 *  itself instead of quietly producing a thin listing. Every field here is a
 *  concrete thing the OCR read and the mapping could not use. */
export interface MappingGaps {
  /** Layouts that matched no BHK bucket at all, so they are not in the form.
   *
   *  `stated` separates two very different situations. A sheet that says "2 BHK"
   *  is a size this product deliberately doesn't list — nothing is broken, a
   *  human just has to decide. A sheet that says nothing and whose bedrooms
   *  couldn't be counted is a real gap in this mapping. */
  droppedVariants: {
    label: string;
    bhkType: string;
    rooms: number;
    stated: boolean;
    /** Not a home at all — no measured room, no area, no price. One brochure
     *  reported a "Foyer Block A" of meter room, substation and DG set room.
     *  Dropping that is right; calling it a mapping failure is not. */
    notAResidence: boolean;
  }[];
  /** The sheet says "4 BHK" and only three bedrooms were read off it. Nothing
   *  here can invent the fourth — but quietly filing a three-bedroom 4 BHK is
   *  how a listing goes out wrong, so say so. */
  bedroomShortfall: { variant: string; stated: number; found: number }[];
  unplacedRooms: { variant: string; name: string; dimension: string | null }[];
  unparsedDimensions: { variant: string; name: string; dimension: string }[];
}

export function findMappingGaps(
  extraction: PropertyExtraction,
  overrides: VariantOverrides = {},
): MappingGaps {
  const gaps: MappingGaps = {
    droppedVariants: [],
    bedroomShortfall: [],
    unplacedRooms: [],
    unparsedDimensions: [],
  };

  (extraction.configurations ?? []).forEach((variant, index) => {
    const label = text(variant.variant_label) || `Layout ${index + 1}`;
    const bucket =
      overrides[index]?.bucket ??
      bucketFor(text(variant.bhk_type), text(variant.variant_label), variant.rooms ?? []);
    if (!bucket) {
      const bhkType = text(variant.bhk_type);
      const measured = (variant.rooms ?? []).filter((r) => textOrNull(r.dimension)).length;
      const priced = [
        variant.carpet_area,
        variant.built_up_area,
        variant.super_built_up_area,
        variant.price,
      ].some((f) => text(f));
      gaps.droppedVariants.push({
        label,
        bhkType,
        rooms: (variant.rooms ?? []).length,
        stated: /\b\d+\s*bhk\b/.test(`${bhkType} ${label}`.toLowerCase()),
        notAResidence: measured === 0 && !priced,
      });
      return;
    }
    // "4 BHK" printed on the sheet against the bedrooms actually drawn on it.
    // A plan page the model half-read looks exactly like a smaller home.
    const stated = /\b(\d+)\s*bhk\b/.exec(
      `${text(variant.bhk_type)} ${text(variant.variant_label)}`.toLowerCase(),
    );
    if (stated) {
      const want = Number(stated[1]);
      const found = countBedrooms(variant.rooms ?? []);
      if (want >= 1 && want <= 10 && found < want) {
        gaps.bedroomShortfall.push({ variant: label, stated: want, found });
      }
    }

    const mapping = assignRooms(variant.rooms ?? []);
    for (const room of mapping.unplaced) gaps.unplacedRooms.push({ variant: label, ...room });
    for (const room of mapping.unparsed) gaps.unparsedDimensions.push({ variant: label, ...room });
  });

  return gaps;
}

/** Which VARIANT_FIELDS slots on one config variant a backend consistency
 *  check flagged — area-ratio checks for carpet/built-up/super-built-up,
 *  the plan-text cross-check for room dimensions (via assignRooms). Kept
 *  separate from the ConfigDetailInput values themselves, which are plain
 *  form-serializable data with no room for provenance flags. */
function variantFailingFields(variant: ConfigVariant): Set<string> {
  const failing = assignRooms(variant.rooms ?? []).failingSlots;
  if (variant.super_built_up_area?.validation_warning) failing.add("area");
  if (variant.carpet_area?.validation_warning) failing.add("carpet");
  if (variant.built_up_area?.validation_warning) failing.add("builtUpArea");
  return failing;
}

/** Turns an extraction into a partial PropertyFormValues the developer's form
 *  is pre-filled with. Nothing here is authoritative — every value is still
 *  reviewed and ticked by a human before it can be submitted. */
export function mapExtractedPayload(
  extraction: PropertyExtraction,
  overrides: VariantOverrides = {},
): Partial<PropertyFormValues> {
  const out: Partial<PropertyFormValues> = {};

  for (const [path, ourKey] of Object.entries(FIELD_MAP)) {
    const [sectionName, fieldName] = path.split(".");
    const value = text(section(extraction, sectionName)[fieldName]);
    if (!value) continue;
    const coerced = COERCE[ourKey]?.(value) ?? value;
    // A value the form can't represent is dropped rather than written through
    // as-is — an unusable value in a typed field fails validation later, far
    // from the brochure that caused it.
    if (coerced) (out as Record<string, unknown>)[ourKey] = coerced;
  }

  const notable = (extraction.developer?.notable_delivered_projects ?? [])
    .map((f) => text(f))
    .filter(Boolean);
  if (notable.length) out.notableDeliveredProjects = notable;

  const amenities = (extraction.amenities ?? []).map((f) => text(f)).filter(Boolean);
  if (amenities.length) out.amenities = amenities;

  const highlights = (extraction.highlights ?? []).map((f) => text(f)).filter(Boolean);
  if (highlights.length) out.advantages = highlights;

  const variants = extraction.configurations ?? [];
  if (variants.length) {
    const configs: PropertyFormValues["configs"] = {
      bhk2: [],
      bhk3: [],
      bhk4: [],
      bhk5: [],
      bhk6: [],
      bhk7: [],
      penthouse: [],
      duplex: [],
    };
    let matched = false;
    variants.forEach((variant, index) => {
      const bucket =
        overrides[index]?.bucket ??
        bucketFor(text(variant.bhk_type), text(variant.variant_label), variant.rooms ?? []);
      if (!bucket) return;
      matched = true;
      configs[bucket].push({
        ...emptyConfigDetail(),
        // Renamed to Type A/B/C in the order they appear in this BHK — see
        // sequentialLabel. Must match what the review screen showed.
        type: overrides[index]?.label ?? sequentialLabel(configs[bucket].length),
        area: textOrNull(variant.super_built_up_area),
        carpet: textOrNull(variant.carpet_area),
        builtUpArea: textOrNull(variant.built_up_area),
        price: textOrNull(variant.price),
        rate: textOrNull(variant.rate_per_sqft),
        ...assignRooms(variant.rooms ?? []).values,
        ...overrides[index]?.fields,
      });
    });
    if (matched) out.configs = configs;
  }

  return out;
}

/** Parallel to mapExtractedPayload's `configs`, index-aligned per bucket:
 *  which VARIANT_FIELDS slots on each pushed variant were flagged by a
 *  backend consistency check. Computed separately so the form values stay
 *  plain data. */
function mapExtractedFailingFields(
  extraction: PropertyExtraction,
  overrides: VariantOverrides = {},
): Partial<Record<ConfigBucket, Set<string>[]>> {
  const out: Partial<Record<ConfigBucket, Set<string>[]>> = {};
  (extraction.configurations ?? []).forEach((variant, index) => {
    const bucket =
      overrides[index]?.bucket ??
      bucketFor(text(variant.bhk_type), text(variant.variant_label), variant.rooms ?? []);
    if (!bucket) return;
    (out[bucket] ??= []).push(variantFailingFields(variant));
  });
  return out;
}

/** One value, one tick. Nothing is ever bundled — a developer confirming a
 *  variant's carpet area should not be silently confirming its four bedroom
 *  dimensions at the same time. Fields that map back to the form stay
 *  editable here; the rest are read-only and edited in the form itself. */
export interface ApprovalItem {
  key: string;
  label: string;
  value: string;
  /** Set for list-style items (amenities) that are read and ticked as one —
   *  a name like "gazebo" carries no measurement worth confirming on its own. */
  values?: string[];
  /** One citation per entry in `values`, same index — lets a reviewer check
   *  where a specific amenity came from without splitting the list into 37
   *  individually-approved rows. */
  valueCitations?: (RoomCitation | undefined)[];
  /** Present only for values that map onto a form field, which are editable. */
  formField?: keyof PropertyFormValues;
  /** Present instead of formField for a config-variant measurement (area,
   *  price, a room dimension) — these don't live on PropertyFormValues
   *  directly, but on configs[bucket][configIndex][configField]. Also
   *  editable; the edit is threaded back through VariantOverrides.fields
   *  rather than the top-level partial. */
  configField?: keyof ConfigDetailInput;
  /** Set alongside configField — which entry in extraction.configurations
   *  this measurement came from, so an edit can be routed back to the right
   *  variant. */
  configIndex?: number;
  confidence?: number;
  snippet?: string | null;
  sourceFile?: string | null;
  sourcePage?: number | null;
  /** Non-null when a backend consistency check flagged this specific value —
   *  see `ExtractedField.validation_warning`. */
  validationWarning?: string | null;
}

/** A titled run of items — e.g. one configuration variant's measurements. */
export interface ApprovalGroup {
  title: string | null;
  items: ApprovalItem[];
  /** Set for configuration variants, so the reviewer can move a variant into a
   *  different BHK or rename it. The OCR guesses the BHK from whatever the
   *  floor plan printed, and plan books are frequently ambiguous. */
  configIndex?: number;
  bucket?: ConfigBucket;
  /** What the brochure itself called this layout, shown so a reviewer can tie
   *  the renamed "Type A" back to the page it was read from. */
  sourceLabel?: string | null;
  /** Set when this variant's own printed label collided with another
   *  variant's in the same file (a mirrored block) — shown once by the
   *  group header rather than repeated per measurement. */
  labelWarning?: string | null;
}

/** Reviewer corrections to the OCR's own bucketing — and, via `fields`, to
 *  the measurements themselves — keyed by the variant's index in
 *  `extraction.configurations`. A reviewer's correction always wins over
 *  whatever mapExtractedPayload would otherwise compute. */
export type VariantOverrides = Record<
  number,
  { bucket?: ConfigBucket; label?: string; fields?: Partial<ConfigDetailInput> }
>;

// Kept in step with CONFIG_BUCKETS in property-schema.ts — this is the same set
// of buckets, shaped for a <select> in the review screen.
export const CONFIG_BUCKET_OPTIONS = CONFIG_BUCKETS.map((b) => ({
  value: b.key,
  label: b.label,
}));

export type { ConfigBucket };

export interface ApprovalSection {
  title: string;
  groups: ApprovalGroup[];
}

const BUCKET_LABELS: Record<ConfigBucket, string> = Object.fromEntries(
  CONFIG_BUCKETS.map((b) => [b.key, b.label]),
) as Record<ConfigBucket, string>;

const ROOM_SLOTS: { key: keyof ConfigDetailInput; label: string }[] = [
  { key: "bathrooms", label: "Bathrooms" },
  { key: "balconies", label: "Balconies" },
  { key: "servantRoom", label: "Servant room" },
  { key: "livingArea", label: "Drawing / Living / Dining" },
  { key: "kitchen", label: "Kitchen" },
  { key: "bedroom1", label: "Bedroom 1" },
  { key: "bedroom2", label: "Bedroom 2" },
  { key: "bedroom3", label: "Bedroom 3" },
  { key: "bedroom4", label: "Bedroom 4" },
  { key: "bedroom5", label: "Bedroom 5" },
];

/** Everything the OCR produced, ordered the way a developer reads it:
 *  the property's own details, then amenities, then each configuration
 *  variant one at a time. Nothing reaches the form until all of it is ticked. */
export function buildApprovalSections(
  response: ExtractionResponse,
  overrides: VariantOverrides = {},
): ApprovalSection[] {
  const extraction = response.extraction;
  const sections: ApprovalSection[] = [];

  const scalars = extractedFieldList(response);
  if (scalars.length) {
    sections.push({
      title: "Property details",
      groups: [
        {
          title: null,
          items: scalars.map((f) => ({
            key: f.formField,
            formField: f.formField,
            label: f.label,
            value: f.value,
            confidence: f.confidence,
            snippet: f.snippet,
            sourceFile: f.sourceFile,
            sourcePage: f.sourcePage,
            validationWarning: f.validationWarning,
          })),
        },
      ],
    });
  }

  const amenityFields = (extraction.amenities ?? []).filter((f) => text(f));
  const highlightFields = (extraction.highlights ?? []).filter((f) => text(f));
  const amenities = amenityFields.map((f) => text(f));
  const highlights = highlightFields.map((f) => text(f));
  // Read and ticked as one list. Unlike a carpet area, an amenity name is not
  // a number that can be subtly wrong — checking 37 of them individually is
  // busywork that would train the developer to click through without looking.
  // Each entry still carries its own citation (valueCitations, same index as
  // values) so a reviewer can check a specific one without per-item approval.
  const listItems: ApprovalItem[] = [];
  if (amenities.length) {
    listItems.push({
      key: "amenities",
      label: `Amenities (${amenities.length})`,
      value: amenities.join(" · "),
      values: amenities,
      valueCitations: amenityFields.map((f) => fieldCitation(f)),
      formField: "amenities",
    });
  }
  if (highlights.length) {
    listItems.push({
      key: "highlights",
      label: `Highlights (${highlights.length})`,
      value: highlights.join(" · "),
      values: highlights,
      valueCitations: highlightFields.map((f) => fieldCitation(f)),
      formField: "advantages",
    });
  }
  if (listItems.length) {
    sections.push({ title: "Amenities & highlights", groups: [{ title: null, items: listItems }] });
  }

  // Grouped by BHK so the developer works through 4 BHK's variants, then
  // 5 BHK's, rather than a flat jumble in whatever order the PDF listed them.
  const byBucket = new Map<ConfigBucket, ApprovalGroup[]>();
  (extraction.configurations ?? []).forEach((variant, index) => {
    // A reviewer's correction always wins over what the OCR inferred.
    const bucket =
      overrides[index]?.bucket ??
      bucketFor(text(variant.bhk_type), text(variant.variant_label), variant.rooms ?? []);
    if (!bucket) return;

    const items: ApprovalItem[] = [];
    // Floor range has no configField — the form has nowhere for it to land —
    // so it alone stays read-only here, same as before.
    const push = (
      label: string,
      field: ExtractedField | undefined,
      configField?: keyof ConfigDetailInput,
    ) => {
      const value = text(field);
      if (!value) return;
      items.push({
        key: `config-${bucket}-${index}-${items.length}`,
        label,
        value,
        confidence: field?.confidence,
        snippet: field?.evidence ?? null,
        sourceFile: field?.source_file ?? null,
        sourcePage: field?.source_page ?? null,
        validationWarning: field?.validation_warning ?? null,
        configField,
        configIndex: configField ? index : undefined,
      });
    };
    push("Super built-up area", variant.super_built_up_area, "area");
    push("Carpet area", variant.carpet_area, "carpet");
    push("Built-up area", variant.built_up_area, "builtUpArea");
    push("Price", variant.price, "price");
    push("Rate (per sq ft)", variant.rate_per_sqft, "rate");
    push("Floor range", variant.floor_range);

    const roomMapping = assignRooms(variant.rooms ?? []);
    const rooms = roomMapping.values;
    for (const slot of ROOM_SLOTS) {
      const value = rooms[slot.key];
      if (!value) continue;
      const citation = roomMapping.citations[slot.key];
      items.push({
        key: `config-${bucket}-${index}-${items.length}`,
        label: slot.label,
        value: String(value),
        confidence: citation?.confidence,
        snippet: citation?.snippet ?? null,
        sourceFile: citation?.sourceFile ?? null,
        sourcePage: citation?.sourcePage ?? null,
        validationWarning: roomMapping.failingSlots.has(slot.key)
          ? "This measurement disagrees with a consistency check — verify it against the plan before trusting it."
          : null,
        configField: slot.key,
        configIndex: index,
      });
    }
    if (!items.length) return;

    const groups = byBucket.get(bucket) ?? [];
    const title = overrides[index]?.label ?? sequentialLabel(groups.length);
    groups.push({
      title,
      items,
      configIndex: index,
      bucket,
      sourceLabel: text(variant.variant_label) || null,
      labelWarning: variant.variant_label?.validation_warning ?? null,
    });
    byBucket.set(bucket, groups);
  });

  // Iterated in CONFIG_BUCKETS order so the review screen lists buckets
  // smallest-first, matching the form's own tab order.
  for (const { key: bucket } of CONFIG_BUCKETS) {
    const groups = byBucket.get(bucket);
    if (groups?.length) sections.push({ title: BUCKET_LABELS[bucket], groups });
  }

  return sections;
}

/** One reviewable difference between what's saved and what the brochure says,
 *  as shown on the "Fill from brochure" panel of an existing listing. */
export interface MergeRow {
  key: string;
  label: string;
  current: string;
  incoming: string;
  /** A blank field is a gap to fill; a different value is a conflict to decide. */
  conflict: boolean;
  /** True when a backend consistency check actively flagged this incoming
   *  value (not merely low confidence) — see `ExtractedField.validation_warning`. */
  failing: boolean;
  apply: (into: PropertyFormValues) => void;
}

function cell(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** Ties an incoming layout to the saved one it describes. A brochure and a
 *  saved listing rarely label a layout identically, so match on the label when
 *  they do agree and otherwise fall back to position within the BHK — which is
 *  how these were numbered Type A / B / C to begin with. */
function matchIndex(
  existing: ConfigDetailInput[],
  incoming: ConfigDetailInput,
  position: number,
): number | null {
  const label = cell(incoming.type).toLowerCase();
  if (label) {
    const byLabel = existing.findIndex((e) => cell(e.type).toLowerCase() === label);
    if (byLabel !== -1) return byLabel;
  }
  return position < existing.length ? position : null;
}

/** One row per measurement the brochure can actually contribute, rather than a
 *  single all-or-nothing "replace every configuration" tick. A listing is
 *  edited precisely because most of it is already right: the job is to fill the
 *  handful of blanks — room dimensions, areas — without putting saved variants
 *  at risk. Layouts the listing doesn't have yet are still added whole. */
function configRows(
  current: PropertyFormValues,
  incoming: PropertyFormValues["configs"] | undefined,
  failing: Partial<Record<ConfigBucket, Set<string>[]>> = {},
): MergeRow[] {
  if (!incoming) return [];
  const out: MergeRow[] = [];

  for (const bucket of Object.keys(BUCKET_LABELS) as ConfigBucket[]) {
    const existingVariants = current.configs?.[bucket] ?? [];
    const failingByPosition = failing[bucket] ?? [];

    (incoming[bucket] ?? []).forEach((variant, position) => {
      const index = matchIndex(existingVariants, variant, position);
      const isNew = index === null;
      const label = variant.type || `Layout ${position + 1}`;
      const name = isNew ? label : existingVariants[index].type || label;

      // A layout the listing doesn't have yet still gets a row per measurement
      // rather than one opaque "add this whole variant" tick — the reviewer has
      // to be able to see every figure they are accepting. The variant is
      // created by whichever of its fields is applied first, so ticking any
      // subset works and ticking none adds nothing.
      const reach = (into: PropertyFormValues): ConfigDetailInput | undefined => {
        if (!isNew) return into.configs[bucket]?.[index];
        const list = into.configs[bucket] ?? (into.configs[bucket] = []);
        const found = list.find((v) => cell(v.type).toLowerCase() === label.toLowerCase());
        if (found) return found;
        const created = { ...emptyConfigDetail(), type: label };
        list.push(created);
        return created;
      };

      const variantFailing = failingByPosition[position];
      for (const field of VARIANT_FIELDS) {
        const value = cell(variant[field.name]);
        if (!value) continue;
        const existing = isNew ? "" : cell(existingVariants[index][field.name]);
        if (existing === value) continue;
        out.push({
          key: `${bucket}-${isNew ? `new${position}` : index}-${field.name}`,
          label: `${BUCKET_LABELS[bucket]} · ${name}${isNew ? " (new)" : ""} — ${field.label}`,
          current: isNew ? "not on this listing" : existing,
          incoming: value,
          conflict: existing !== "",
          failing: variantFailing?.has(field.name) ?? false,
          apply: (into) => {
            const target = reach(into);
            if (target) (target as Record<string, unknown>)[field.name] = value;
          },
        });
      }
    });
  }

  return out;
}

/** Everything a brochure can add to a listing that already exists: the scalar
 *  fields, the amenities it names, and each configuration measurement. Kept out
 *  of the panel component so the merge itself can be reasoned about and tested
 *  without rendering anything. */
export function buildMergeRows(
  current: PropertyFormValues,
  response: ExtractionResponse,
): MergeRow[] {
  const out: MergeRow[] = [];

  for (const f of extractedFieldList(response)) {
    const existing = cell((current as unknown as Record<string, unknown>)[f.formField]);
    if (existing === f.value) continue;
    out.push({
      key: f.formField,
      label: f.label,
      current: existing,
      incoming: f.value,
      conflict: existing !== "",
      failing: Boolean(f.validationWarning),
      apply: (into) => {
        (into as unknown as Record<string, unknown>)[f.formField] = f.value;
      },
    });
  }

  const mapped = mapExtractedPayload(response.extraction);
  const mappedFailing = mapExtractedFailingFields(response.extraction);

  const incomingAmenities = mapped.amenities ?? [];
  if (incomingAmenities.length) {
    const existing = current.amenities ?? [];
    const fresh = incomingAmenities.filter((a) => !existing.includes(a));
    if (fresh.length) {
      out.push({
        key: "__amenities",
        label: `Amenities — ${fresh.length} new`,
        current: existing.length ? `${existing.length} already listed` : "none",
        incoming: fresh.join(" · "),
        // Adding to a list never destroys anything, so this is a gap, not a clash.
        conflict: false,
        failing: false,
        apply: (into) => {
          into.amenities = [...existing, ...fresh];
        },
      });
    }
  }

  out.push(...configRows(current, mapped.configs, mappedFailing));

  return out;
}

/** Labels for the fields the OCR looked for and genuinely didn't find, so the
 *  review screen can tell the developer what they still need to type in. The
 *  service reports these as `found: false` rather than omitting them. */
export function missingFieldLabels(response: ExtractionResponse): string[] {
  const out: string[] = [];
  for (const [path, formField] of Object.entries(FIELD_MAP)) {
    const [sectionName, fieldName] = path.split(".");
    if (text(section(response.extraction, sectionName)[fieldName])) continue;
    out.push(LABELS[formField] ?? fieldName);
  }
  return out;
}

/** The scalar fields the OCR actually filled, with their confidence and the
 *  snippet it read them from — this drives the tick-to-approve review screen.
 *  Configurations and amenities are excluded: the developer reviews those
 *  directly in the form, where they can see the whole list at once. */
export function extractedFieldList(response: ExtractionResponse): ExtractedFieldInfo[] {
  const extraction = response.extraction;
  const out: ExtractedFieldInfo[] = [];

  for (const [path, formField] of Object.entries(FIELD_MAP)) {
    const [sectionName, fieldName] = path.split(".");
    const field = section(extraction, sectionName)[fieldName];
    const value = text(field);
    if (!value || !field) continue;
    out.push({
      formField,
      label: LABELS[formField] ?? fieldName,
      value,
      confidence: field.confidence,
      snippet: field.evidence,
      sourceFile: field.source_file,
      sourcePage: field.source_page,
      validationWarning: field.validation_warning,
    });
  }

  return out;
}
