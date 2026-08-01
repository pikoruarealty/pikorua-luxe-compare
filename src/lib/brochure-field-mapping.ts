import { emptyConfigDetail, type PropertyFormValues } from "@/lib/property-schema";

/** The form groups variants under bhk4/bhk5/penthouse/duplex, which is not the
 *  same as ConfigKey ("4 BHK", "5 BHK", …) used by the public property type. */
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
  price: ExtractedField;
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
}

/** `<section>.<field>` in the service's payload -> our form field. */
const FIELD_MAP: Record<string, keyof PropertyFormValues> = {
  "basics.property_name": "name",
  "basics.developer": "developer",
  "basics.category": "category",
  "basics.status": "status",
  "basics.possession": "possession",
  "basics.possession_confirmed_as_of": "possessionAsOf",
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

const LABELS: Partial<Record<keyof PropertyFormValues, string>> = {
  name: "Property name",
  developer: "Developer",
  category: "Category",
  status: "Status",
  possession: "Possession",
  possessionAsOf: "Possession confirmed as of",
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
 *  digit / keyword rather than requiring an exact "4 BHK". */
function bucketFor(bhkType: string): ConfigBucket | null {
  const t = bhkType.toLowerCase();
  if (t.includes("penthouse")) return "penthouse";
  if (t.includes("duplex")) return "duplex";
  if (/\b4\b/.test(t)) return "bhk4";
  if (/\b5\b/.test(t)) return "bhk5";
  return null;
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

/** Matches a room name to the specific ConfigDetail slot it belongs in.
 *  Bedrooms are numbered in the order the brochure lists them, since the
 *  document says "Master Bedroom" / "Bedroom 2" rather than our slot names. */
function assignRooms(rooms: RoomDimension[]): Partial<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  let bedroomIndex = 0;
  for (const room of rooms) {
    const name = text(room.room_name).toLowerCase();
    const dimension = textOrNull(room.dimension);
    if (!name || !dimension) continue;

    if (name.includes("living")) out.livingArea ??= dimension;
    else if (name.includes("kitchen")) out.kitchen ??= dimension;
    else if (name.includes("bed")) {
      bedroomIndex += 1;
      if (bedroomIndex <= 5) out[`bedroom${bedroomIndex}`] ??= dimension;
    }
  }
  return out;
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
    if (value) (out as Record<string, unknown>)[ourKey] = value;
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
      bhk4: [],
      bhk5: [],
      penthouse: [],
      duplex: [],
    };
    let matched = false;
    variants.forEach((variant, index) => {
      const bucket = overrides[index]?.bucket ?? bucketFor(text(variant.bhk_type));
      if (!bucket) return;
      matched = true;
      configs[bucket].push({
        ...emptyConfigDetail(),
        // Renamed to Type A/B/C in the order they appear in this BHK — see
        // sequentialLabel. Must match what the review screen showed.
        type: overrides[index]?.label ?? sequentialLabel(configs[bucket].length),
        // The service has no super-built-up field; carpet and built-up are
        // what brochures actually print, so `area` stays for a human to fill.
        area: null,
        carpet: textOrNull(variant.carpet_area),
        builtUpArea: textOrNull(variant.built_up_area),
        price: textOrNull(variant.price),
        rate: null,
        ...assignRooms(variant.rooms ?? []),
      });
    });
    if (matched) out.configs = configs;
  }

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
  /** Present only for values that map onto a form field, which are editable. */
  formField?: keyof PropertyFormValues;
  confidence?: number;
  snippet?: string | null;
  sourceFile?: string | null;
  sourcePage?: number | null;
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
}

/** Reviewer corrections to the OCR's own bucketing, keyed by the variant's
 *  index in `extraction.configurations`. */
export type VariantOverrides = Record<number, { bucket?: ConfigBucket; label?: string }>;

export const CONFIG_BUCKET_OPTIONS = [
  { value: "bhk4", label: "4 BHK" },
  { value: "bhk5", label: "5 BHK" },
  { value: "penthouse", label: "Penthouse" },
  { value: "duplex", label: "Duplex" },
] as const;

export type { ConfigBucket };

export interface ApprovalSection {
  title: string;
  groups: ApprovalGroup[];
}

const BUCKET_LABELS: Record<ConfigBucket, string> = {
  bhk4: "4 BHK",
  bhk5: "5 BHK",
  penthouse: "Penthouse",
  duplex: "Duplex",
};

const ROOM_SLOTS: { key: string; label: string }[] = [
  { key: "livingArea", label: "Living area" },
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
          })),
        },
      ],
    });
  }

  const amenities = (extraction.amenities ?? []).map((f) => text(f)).filter(Boolean);
  const highlights = (extraction.highlights ?? []).map((f) => text(f)).filter(Boolean);
  // Read and ticked as one list. Unlike a carpet area, an amenity name is not
  // a number that can be subtly wrong — checking 37 of them individually is
  // busywork that would train the developer to click through without looking.
  const listItems: ApprovalItem[] = [];
  if (amenities.length) {
    listItems.push({
      key: "amenities",
      label: `Amenities (${amenities.length})`,
      value: amenities.join(" · "),
      values: amenities,
    });
  }
  if (highlights.length) {
    listItems.push({
      key: "highlights",
      label: `Highlights (${highlights.length})`,
      value: highlights.join(" · "),
      values: highlights,
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
    const bucket = overrides[index]?.bucket ?? bucketFor(text(variant.bhk_type));
    if (!bucket) return;

    const items: ApprovalItem[] = [];
    const push = (label: string, value: string) => {
      if (value) items.push({ key: `config-${bucket}-${index}-${items.length}`, label, value });
    };
    push("Carpet area", text(variant.carpet_area));
    push("Built-up area", text(variant.built_up_area));
    push("Price", text(variant.price));
    push("Floor range", text(variant.floor_range));

    const rooms = assignRooms(variant.rooms ?? []);
    for (const slot of ROOM_SLOTS) {
      const value = rooms[slot.key];
      if (value) push(slot.label, value);
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
    });
    byBucket.set(bucket, groups);
  });

  for (const bucket of ["bhk4", "bhk5", "penthouse", "duplex"] as ConfigBucket[]) {
    const groups = byBucket.get(bucket);
    if (groups?.length) sections.push({ title: BUCKET_LABELS[bucket], groups });
  }

  return sections;
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
    });
  }

  return out;
}
