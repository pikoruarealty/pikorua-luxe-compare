import { z } from "zod";
import { ceilingHeightBasisSchema } from "@/generated/property-contract";
import { safeHttpUrl } from "./utils";

const MAX_SHORT_TEXT = 200;
// A handful of specification fields are not short labels at all — brochures
// print them as a sentence or a semicolon-separated list ("Imported marble in
// the living and dining, vitrified tile in bedrooms, anti-skid ceramic in
// bathrooms and utility, …"). Four brochures in the corpus ran 204–488
// characters and were rejected outright at 200. The database columns behind
// these are unconstrained `text`, so this is a validation ceiling only, raised
// to fit what developers actually print rather than truncating their words.
const MAX_SPEC_TEXT = 600;
const MAX_LONG_TEXT = 5_000;
const MAX_URL_LENGTH = 2_048;
const MAX_LIST_ITEMS = 100;
const MAX_CONFIGS_PER_BUCKET = 20;
const MAX_SUBMISSION_PAYLOAD_BYTES = 256_000;

const shortText = () => z.string().trim().max(MAX_SHORT_TEXT);
const specText = () => z.string().trim().max(MAX_SPEC_TEXT).optional().default("");
const nullableRoomText = () =>
  z.string().trim().max(MAX_SPEC_TEXT).nullable().optional().default(null);
const optionalShortText = () => shortText().optional().default("");
const nullableShortText = () => shortText().nullable().optional().default(null);
const longText = () => z.string().trim().max(MAX_LONG_TEXT).optional().default("");
const publicUrl = () =>
  z
    .string()
    .trim()
    .max(MAX_URL_LENGTH)
    .refine((value) => value === "" || safeHttpUrl(value) !== null, "Enter a valid http(s) URL")
    .optional()
    .default("");

// Mirrors ConfigDetail from src/types/property.ts — the admin-editable shape of
// one layout variant within a BHK bucket.
export const configDetailSchema = z.object({
  type: shortText().optional(),
  area: nullableShortText(),
  carpet: nullableShortText(),
  builtUpArea: nullableShortText(),
  price: nullableShortText(),
  rate: nullableShortText(),
  bathrooms: nullableShortText(),
  balconies: nullableShortText(),
  servantRoom: nullableShortText(),
  // Distinct from the project-level plotSize field — villas/plots within the
  // same project routinely carry different plot sizes per variant.
  plotSize: nullableShortText(),
  // Room slots hold more than one dimension. A plan that draws a family lounge,
  // a formal living, a family living, a family room and a formal dining has
  // five living spaces and the form has one slot, so the mapping joins them —
  // "Family Lounge 256 sq ft (16'0" x 16'0") + Formal Living 238 sq ft (…)".
  // That is the brochure's own content, not noise, and 200 characters cut it
  // off mid-room.
  livingArea: nullableRoomText(),
  kitchen: nullableRoomText(),
  bedroom1: nullableRoomText(),
  bedroom2: nullableRoomText(),
  bedroom3: nullableRoomText(),
  bedroom4: nullableRoomText(),
  bedroom5: nullableRoomText(),
});

export type ConfigDetailInput = z.infer<typeof configDetailSchema>;

/** Every editable measurement on one layout variant, in the order a human
 *  reads them. Shared so the admin form's inputs and the brochure merge panel
 *  can never drift apart on which fields exist or what they're called. */
export const VARIANT_FIELDS = [
  { name: "area", label: "Super built-up (sq ft)" },
  { name: "carpet", label: "Carpet (sq ft)" },
  { name: "builtUpArea", label: "Built-up (sq ft)" },
  { name: "price", label: "Price (Cr)" },
  { name: "rate", label: "Rate (per sq ft)" },
  { name: "bathrooms", label: "Bathrooms" },
  { name: "balconies", label: "Balconies" },
  { name: "servantRoom", label: "Servant room" },
  { name: "plotSize", label: "Plot size (this variant)" },
  { name: "livingArea", label: "Drawing / Living / Dining" },
  { name: "kitchen", label: "Kitchen" },
  { name: "bedroom1", label: "Bedroom 1" },
  { name: "bedroom2", label: "Bedroom 2" },
  { name: "bedroom3", label: "Bedroom 3" },
  { name: "bedroom4", label: "Bedroom 4" },
  { name: "bedroom5", label: "Bedroom 5" },
] as const;

// Internal safe keys (no spaces) used as form field-array names; translated to
// the real ConfigKey strings ("4 BHK", etc.) only at submit/load time.
// Ascending, so the form's tabs and every listing built from them read smallest
// home to largest. The set mirrors the canonical `configuration_kind` taxonomy
// (2_bhk–7_bhk, penthouse, duplex) rather than a narrower editorial choice:
// when this held only 3/4/5 BHK, every 2 and 6 BHK layout a brochure printed
// was silently dropped on the way in, so published listings were thinner than
// the document they came from. 1 BHK is deliberately absent — the canonical
// taxonomy has no `1_bhk` option, so there is nowhere for it to land.
export const CONFIG_BUCKETS = [
  { key: "bhk2", label: "2 BHK" },
  { key: "bhk3", label: "3 BHK" },
  { key: "bhk4", label: "4 BHK" },
  { key: "bhk5", label: "5 BHK" },
  { key: "bhk6", label: "6 BHK" },
  { key: "bhk7", label: "7 BHK" },
  { key: "penthouse", label: "Penthouse" },
  { key: "duplex", label: "Duplex" },
] as const;

export const propertyFormSchema = z.object({
  name: shortText().min(1, "Name is required"),
  developer: optionalShortText(),
  category: z.enum(["Apartment", "Villa", "Bungalow", "Plots"]),
  tagline: optionalShortText(),
  location: optionalShortText(),
  state: optionalShortText(),
  city: optionalShortText(),
  status: optionalShortText(),
  possession: optionalShortText(),
  expertNote: longText(),
  imageUrl: publicUrl(),
  gallery: z
    .object({
      livingRoom: publicUrl(),
      pool: publicUrl(),
      clubhouse: publicUrl(),
      masterBedroom: publicUrl(),
    })
    .optional()
    .default({}),
  // Only meaningful for Bungalow / Plots categories.
  plotSuperArea: optionalShortText(),
  plotCarpetArea: optionalShortText(),
  amenities: z.array(shortText().min(1)).max(MAX_LIST_ITEMS).default([]),
  advantages: z.array(shortText().min(1)).max(MAX_LIST_ITEMS).default([]),
  // Date the `possession` duration was last confirmed accurate — lets the
  // public site count it down live instead of it staying frozen.
  possessionAsOf: optionalShortText(),
  // Project structure
  plotSize: optionalShortText(),
  totalTowers: optionalShortText(),
  totalFloors: optionalShortText(),
  unitsPerFloor: optionalShortText(),
  totalUnits: optionalShortText(),
  availableBhkTypes: optionalShortText(),
  // RERA registration
  reraId: optionalShortText(),
  reraUrl: publicUrl(),
  proposedStartDateRera: optionalShortText(),
  registeredCompletionDateRera: optionalShortText(),
  constructionProgressRera: optionalShortText(),
  // Construction & amenities
  parkingLevels: optionalShortText(),
  podiumStructure: optionalShortText(),
  liftsPerTower: optionalShortText(),
  openSpace: optionalShortText(),
  geyserHeatPumpProvided: optionalShortText(),
  vrvAcProvided: optionalShortText(),
  windowGlazing: optionalShortText(),
  bathSanitaryFittings: specText(),
  flooringType: specText(),
  unitsPerAcre: optionalShortText(),
  constructionQuality: specText(),
  internalCeilingHeight: optionalShortText(),
  ceilingHeightBasis: ceilingHeightBasisSchema.default("not_stated"),
  clubhouseSize: optionalShortText(),
  // Date the possession estimate itself was last confirmed with the
  // developer — distinct from `possessionAsOf`, which only tracks when the
  // free-text `possession` duration string was last checked.
  possessionConfirmedAsOf: optionalShortText(),
  amenitiesOther: optionalShortText(),
  // Developer track record
  developerBackground: longText(),
  developerExperienceYears: optionalShortText(),
  totalDeliveredProjects: optionalShortText(),
  ongoingProjects: optionalShortText(),
  notableDeliveredProjects: z.array(shortText().min(1)).max(MAX_LIST_ITEMS).default([]),
  configs: z.object({
    bhk2: z.array(configDetailSchema).max(MAX_CONFIGS_PER_BUCKET).default([]),
    bhk3: z.array(configDetailSchema).max(MAX_CONFIGS_PER_BUCKET).default([]),
    bhk4: z.array(configDetailSchema).max(MAX_CONFIGS_PER_BUCKET).default([]),
    bhk5: z.array(configDetailSchema).max(MAX_CONFIGS_PER_BUCKET).default([]),
    bhk6: z.array(configDetailSchema).max(MAX_CONFIGS_PER_BUCKET).default([]),
    bhk7: z.array(configDetailSchema).max(MAX_CONFIGS_PER_BUCKET).default([]),
    penthouse: z.array(configDetailSchema).max(MAX_CONFIGS_PER_BUCKET).default([]),
    duplex: z.array(configDetailSchema).max(MAX_CONFIGS_PER_BUCKET).default([]),
  }),
  isPublished: z.boolean().default(true),
});

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;

export function parsePropertySubmission(values: PropertyFormValues): PropertyFormValues {
  const parsed = propertyFormSchema.parse(values);
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > MAX_SUBMISSION_PAYLOAD_BYTES) {
    throw new Error("Property submission is too large");
  }
  return parsed;
}

export function emptyConfigDetail(): ConfigDetailInput {
  return {
    type: "",
    area: null,
    carpet: null,
    builtUpArea: null,
    price: null,
    rate: null,
    bathrooms: null,
    balconies: null,
    servantRoom: null,
    plotSize: null,
    livingArea: null,
    kitchen: null,
    bedroom1: null,
    bedroom2: null,
    bedroom3: null,
    bedroom4: null,
    bedroom5: null,
  };
}

export function emptyPropertyForm(): PropertyFormValues {
  return {
    name: "",
    developer: "",
    category: "Apartment",
    tagline: "",
    location: "",
    state: "Gujarat",
    city: "Ahmedabad",
    status: "",
    possession: "",
    expertNote: "",
    imageUrl: "",
    gallery: { livingRoom: "", pool: "", clubhouse: "", masterBedroom: "" },
    plotSuperArea: "",
    plotCarpetArea: "",
    amenities: [],
    advantages: [],
    possessionAsOf: "",
    plotSize: "",
    totalTowers: "",
    totalFloors: "",
    unitsPerFloor: "",
    totalUnits: "",
    availableBhkTypes: "",
    reraId: "",
    reraUrl: "",
    proposedStartDateRera: "",
    registeredCompletionDateRera: "",
    constructionProgressRera: "",
    parkingLevels: "",
    podiumStructure: "",
    liftsPerTower: "",
    openSpace: "",
    geyserHeatPumpProvided: "",
    vrvAcProvided: "",
    windowGlazing: "",
    bathSanitaryFittings: "",
    flooringType: "",
    unitsPerAcre: "",
    constructionQuality: "",
    internalCeilingHeight: "",
    ceilingHeightBasis: "not_stated",
    clubhouseSize: "",
    possessionConfirmedAsOf: "",
    amenitiesOther: "",
    developerBackground: "",
    developerExperienceYears: "",
    totalDeliveredProjects: "",
    ongoingProjects: "",
    notableDeliveredProjects: [],
    configs: {
      bhk2: [],
      bhk3: [],
      bhk4: [],
      bhk5: [],
      bhk6: [],
      bhk7: [],
      penthouse: [],
      duplex: [],
    },
    isPublished: true,
  };
}
