import { z } from "zod";

// Mirrors ConfigDetail from src/types/property.ts — the admin-editable shape of
// one layout variant within a BHK bucket.
export const configDetailSchema = z.object({
  type: z.string().optional(),
  area: z.string().nullable().optional().default(null),
  carpet: z.string().nullable().optional().default(null),
  builtUpArea: z.string().nullable().optional().default(null),
  price: z.string().nullable().optional().default(null),
  rate: z.string().nullable().optional().default(null),
  bathrooms: z.string().nullable().optional().default(null),
  balconies: z.string().nullable().optional().default(null),
  servantRoom: z.string().nullable().optional().default(null),
  livingArea: z.string().nullable().optional().default(null),
  kitchen: z.string().nullable().optional().default(null),
  bedroom1: z.string().nullable().optional().default(null),
  bedroom2: z.string().nullable().optional().default(null),
  bedroom3: z.string().nullable().optional().default(null),
  bedroom4: z.string().nullable().optional().default(null),
  bedroom5: z.string().nullable().optional().default(null),
});

export type ConfigDetailInput = z.infer<typeof configDetailSchema>;

// Internal safe keys (no spaces) used as form field-array names; translated to
// the real ConfigKey strings ("4 BHK", etc.) only at submit/load time.
export const CONFIG_BUCKETS = [
  { key: "bhk4", label: "4 BHK" },
  { key: "bhk5", label: "5 BHK" },
  { key: "penthouse", label: "Penthouse" },
  { key: "duplex", label: "Duplex" },
] as const;

export const propertyFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  developer: z.string().trim().optional().default(""),
  category: z.enum(["Apartment", "Bungalow", "Plots"]),
  tagline: z.string().trim().optional().default(""),
  location: z.string().trim().optional().default(""),
  state: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  status: z.string().trim().optional().default(""),
  possession: z.string().trim().optional().default(""),
  expertNote: z.string().trim().optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  gallery: z
    .object({
      livingRoom: z.string().trim().optional().default(""),
      pool: z.string().trim().optional().default(""),
      clubhouse: z.string().trim().optional().default(""),
      masterBedroom: z.string().trim().optional().default(""),
    })
    .optional()
    .default({}),
  // Only meaningful for Bungalow / Plots categories.
  plotSuperArea: z.string().trim().optional().default(""),
  plotCarpetArea: z.string().trim().optional().default(""),
  amenities: z.array(z.string().trim().min(1)).default([]),
  advantages: z.array(z.string().trim().min(1)).default([]),
  // Date the `possession` duration was last confirmed accurate — lets the
  // public site count it down live instead of it staying frozen.
  possessionAsOf: z.string().trim().optional().default(""),
  // Project structure
  plotSize: z.string().trim().optional().default(""),
  totalTowers: z.string().trim().optional().default(""),
  totalFloors: z.string().trim().optional().default(""),
  unitsPerFloor: z.string().trim().optional().default(""),
  totalUnits: z.string().trim().optional().default(""),
  availableBhkTypes: z.string().trim().optional().default(""),
  // RERA registration
  reraId: z.string().trim().optional().default(""),
  reraUrl: z.string().trim().optional().default(""),
  proposedStartDateRera: z.string().trim().optional().default(""),
  // Construction & amenities
  parkingLevels: z.string().trim().optional().default(""),
  podiumStructure: z.string().trim().optional().default(""),
  liftsPerTower: z.string().trim().optional().default(""),
  openSpace: z.string().trim().optional().default(""),
  geyserHeatPumpProvided: z.string().trim().optional().default(""),
  vrvAcProvided: z.string().trim().optional().default(""),
  windowGlazing: z.string().trim().optional().default(""),
  bathSanitaryFittings: z.string().trim().optional().default(""),
  flooringType: z.string().trim().optional().default(""),
  unitsPerAcre: z.string().trim().optional().default(""),
  constructionQuality: z.string().trim().optional().default(""),
  internalCeilingHeight: z.string().trim().optional().default(""),
  clubhouseSize: z.string().trim().optional().default(""),
  // Developer track record
  developerBackground: z.string().trim().optional().default(""),
  developerExperienceYears: z.string().trim().optional().default(""),
  totalDeliveredProjects: z.string().trim().optional().default(""),
  ongoingProjects: z.string().trim().optional().default(""),
  notableDeliveredProjects: z.array(z.string().trim().min(1)).default([]),
  configs: z.object({
    bhk4: z.array(configDetailSchema).default([]),
    bhk5: z.array(configDetailSchema).default([]),
    penthouse: z.array(configDetailSchema).default([]),
    duplex: z.array(configDetailSchema).default([]),
  }),
  isPublished: z.boolean().default(true),
});

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;

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
    clubhouseSize: "",
    developerBackground: "",
    developerExperienceYears: "",
    totalDeliveredProjects: "",
    ongoingProjects: "",
    notableDeliveredProjects: [],
    configs: { bhk4: [], bhk5: [], penthouse: [], duplex: [] },
    isPublished: true,
  };
}
