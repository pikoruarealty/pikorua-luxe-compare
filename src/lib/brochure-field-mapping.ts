import type { PropertyFormValues } from "./property-schema";
import { CONFIG_BUCKETS, emptyConfigDetail } from "./property-schema";

/** The extractor's flat snake_case `form_payload` keys → our camelCase form
 *  field names. Only fields that exist on both sides are listed — `images`
 *  and the per-configuration extras (bathrooms, balconies, servant_room,
 *  floor_plan_page) have no home in our schema yet, so they're dropped. */
const FIELD_MAP: Record<string, keyof PropertyFormValues> = {
  property_name: "name",
  developer: "developer",
  category: "category",
  status: "status",
  possession: "possession",
  possession_confirmed_as_of: "possessionAsOf",
  location: "location",
  city: "city",
  state: "state",
  tagline: "tagline",
  expert_note: "expertNote",
  plot_size: "plotSize",
  total_towers: "totalTowers",
  total_floors: "totalFloors",
  units_per_floor: "unitsPerFloor",
  total_units: "totalUnits",
  rera_id: "reraId",
  rera_link: "reraUrl",
  proposed_start_date: "proposedStartDateRera",
  parking_levels: "parkingLevels",
  podium_structure: "podiumStructure",
  lifts_per_tower: "liftsPerTower",
  open_space: "openSpace",
  geyser_heat_pump: "geyserHeatPumpProvided",
  vrv_ac: "vrvAcProvided",
  window_glasses: "windowGlazing",
  bath_sanitary_fittings: "bathSanitaryFittings",
  flooring: "flooringType",
  density_units_per_acre: "unitsPerAcre",
  construction_quality: "constructionQuality",
  internal_ceiling_height: "internalCeilingHeight",
  clubhouse_size: "clubhouseSize",
  experience_years: "developerExperienceYears",
  total_delivered_projects: "totalDeliveredProjects",
  ongoing_projects: "ongoingProjects",
  background: "developerBackground",
};

const BHK_TO_BUCKET: Record<string, (typeof CONFIG_BUCKETS)[number]["key"]> = {
  "4 BHK": "bhk4",
  "5 BHK": "bhk5",
  Penthouse: "penthouse",
  Duplex: "duplex",
};

export interface ExtractedFieldInfo {
  /** Our internal field name (matches FIELD_MAP's values). */
  formField: keyof PropertyFormValues;
  label: string;
  value: string;
  confidence: number;
  snippet: string | null;
  sourceFile: string | null;
  sourcePage: number | null;
}

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

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Raw shape returned by the brochure-extractor service — only the parts we
 *  actually use are typed here. Values are `Json` (not `unknown`) so this
 *  return type stays serialisable across the createServerFn boundary. */
export interface ExtractionResponse {
  form_payload: Record<string, Json>;
  field_meta: Record<
    string,
    {
      confidence: number;
      source: { file: string; page: number } | null;
      snippet: string | null;
    }
  >;
  conflicts: { field: string; chosen: Json; rejected: Json[] }[];
  missing_required: string[];
}

/** Turns the extractor's form_payload into a partial PropertyFormValues the
 *  developer's form can be pre-filled with — every value still edited/typed
 *  by a human, this only saves them re-typing what the brochure already said. */
export function mapExtractedPayload(payload: Record<string, Json>): Partial<PropertyFormValues> {
  const out: Partial<PropertyFormValues> = {};
  for (const [snakeKey, ourKey] of Object.entries(FIELD_MAP)) {
    const value = payload[snakeKey];
    if (value === null || value === undefined) continue;
    (out as Record<string, unknown>)[ourKey] = typeof value === "number" ? String(value) : value;
  }

  const bhkTypes = payload.available_bhk_types;
  if (Array.isArray(bhkTypes) && bhkTypes.length) out.availableBhkTypes = bhkTypes.join(", ");

  const notable = payload.notable_delivered_projects;
  if (Array.isArray(notable) && notable.length) out.notableDeliveredProjects = notable as string[];

  const amenities = payload.amenities;
  if (Array.isArray(amenities) && amenities.length) out.amenities = amenities as string[];

  const highlights = payload.highlights;
  if (Array.isArray(highlights) && highlights.length) out.advantages = highlights as string[];

  const configurations = payload.configurations;
  if (Array.isArray(configurations) && configurations.length) {
    const configs = {
      bhk4: [],
      bhk5: [],
      penthouse: [],
      duplex: [],
    } as PropertyFormValues["configs"];
    for (const raw of configurations as Record<string, unknown>[]) {
      const bucket = BHK_TO_BUCKET[String(raw.bhk_type ?? "")];
      if (!bucket) continue;
      configs[bucket].push({
        ...emptyConfigDetail(),
        type: raw.variant_name ? String(raw.variant_name) : "",
        area: raw.super_built_up_area ? String(raw.super_built_up_area) : null,
        carpet: raw.carpet_area ? String(raw.carpet_area) : null,
        builtUpArea: raw.built_up_area ? String(raw.built_up_area) : null,
        price: raw.price ? String(raw.price) : null,
        rate: raw.price_per_sqft ? String(raw.price_per_sqft) : null,
        bathrooms:
          raw.bathrooms !== null && raw.bathrooms !== undefined ? String(raw.bathrooms) : null,
        balconies:
          raw.balconies !== null && raw.balconies !== undefined ? String(raw.balconies) : null,
        servantRoom: raw.servant_room ? String(raw.servant_room) : null,
      });
    }
    out.configs = configs;
  }

  return out;
}

/** Only the top-level fields the extractor actually filled in, paired with
 *  their confidence/evidence — this drives the "approve before continuing"
 *  review screen. Configuration-array fields are intentionally excluded; the
 *  developer reviews those directly in the form's Configurations section. */
export function extractedFieldList(response: ExtractionResponse): ExtractedFieldInfo[] {
  const sections = [
    "basics",
    "project_structure",
    "rera_approvals",
    "construction_amenities",
    "developer_info",
  ];
  const out: ExtractedFieldInfo[] = [];
  for (const [path, meta] of Object.entries(response.field_meta)) {
    const [section, snakeKey] = path.split(".");
    if (!sections.includes(section)) continue;
    const formField = FIELD_MAP[snakeKey];
    if (!formField) continue;
    const value = (response.form_payload as Record<string, unknown>)[snakeKey];
    if (value === null || value === undefined || value === "") continue;
    out.push({
      formField,
      label: LABELS[formField] ?? snakeKey,
      value: Array.isArray(value) ? value.join(", ") : String(value),
      confidence: meta.confidence,
      snippet: meta.snippet,
      sourceFile: meta.source?.file ?? null,
      sourcePage: meta.source?.page ?? null,
    });
  }
  return out;
}
