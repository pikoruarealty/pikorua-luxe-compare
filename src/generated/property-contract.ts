// GENERATED from schemas/property.v1.json. Do not edit.
import { z } from "zod";

export const PROPERTY_SCHEMA_VERSION = 1 as const;
export const fieldStateSchema = z.enum([
  "stated",
  "not_stated",
  "explicitly_not_offered",
  "not_applicable",
  "pending_review",
]);
export const configurationKindSchema = z.enum([
  "2_bhk",
  "3_bhk",
  "4_bhk",
  "5_bhk",
  "6_bhk",
  "7_bhk",
  "penthouse",
  "duplex",
  "villa",
  "bungalow",
  "plot",
]);
export const propertyTypeSchema = z.enum(["apartment", "villa", "bungalow", "plot"]);
export const areaBasisSchema = z.enum([
  "carpet",
  "rera_carpet",
  "built_up",
  "super_built_up",
  "plot",
  "not_stated",
]);
export const areaUnitSchema = z.enum(["sq_ft", "sq_m", "sq_yd", "acre", "gaj"]);
export const ceilingHeightBasisSchema = z.enum(["clear", "slab_to_slab", "not_stated"]);

export const canonicalPublicPropertySchema = z
  .object({
    name: z.string().trim().max(200),
    developerName: z.string().trim().max(200).nullable(),
    propertyType: propertyTypeSchema,
    addressLine: z.string().trim().max(500).nullable(),
    locality: z.string().trim().max(200).nullable(),
    stateCode: z.string().trim().max(10),
    cityCode: z.string().trim().max(50),
    reraRegistration: z.string().trim().max(100).nullable(),
    possessionDate: z.string().date().nullable(),
    configurationKind: configurationKindSchema,
    areaValue: z.number().finite().min(0).nullable(),
    areaBasis: areaBasisSchema.nullable(),
    areaUnit: areaUnitSchema.nullable(),
    amenitiesOther: z.string().trim().max(2000).nullable(),
    totalTowers: z.number().int().min(0).nullable(),
    totalFloors: z.number().int().min(0).nullable(),
    unitsPerFloor: z.number().int().min(0).nullable(),
    totalUnits: z.number().int().min(0).nullable(),
  })
  .strict();

export const canonicalCommercialTermsSchema = z
  .object({
    baseSalePriceRupees: z.number().int().min(0).nullable(),
    rateRupeesPerSqFt: z.number().finite().min(0).nullable(),
    rateAreaBasis: areaBasisSchema.nullable(),
  })
  .strict();

export const canonicalGatedPropertySchema = z
  .object({
    plotSizeValue: z.number().finite().min(0).nullable(),
    plotSizeUnit: areaUnitSchema.nullable(),
    unitsPerAcre: z.number().finite().min(0).nullable(),
    openSpacePercent: z.number().finite().min(0).nullable(),
    parkingLevels: z.number().int().min(0).nullable(),
    podiumStructure: z.string().trim().max(200).nullable(),
    liftsPerTower: z.number().int().min(0).nullable(),
    clubhouseSizeSqFt: z.number().finite().min(0).nullable(),
    internalCeilingHeightFt: z.number().finite().min(0).nullable(),
    ceilingHeightBasis: ceilingHeightBasisSchema.nullable(),
    constructionQuality: z.string().trim().max(200).nullable(),
    flooringType: z.string().trim().max(200).nullable(),
    windowGlazing: z.string().trim().max(200).nullable(),
    bathSanitaryFittings: z.string().trim().max(200).nullable(),
    vrvAcProvision: z.string().trim().max(200).nullable(),
    geyserProvision: z.string().trim().max(200).nullable(),
    experienceYears: z.number().int().min(0).nullable(),
    deliveredProjects: z.number().int().min(0).nullable(),
    ongoingProjects: z.number().int().min(0).nullable(),
    notableDeliveredProjects: z.array(z.string().trim().max(200)).max(100).nullable(),
    background: z.string().trim().max(2000).nullable(),
    proposedStartDateRera: z.string().date().nullable(),
    possessionConfirmedAsOf: z.string().date().nullable(),
    bathrooms: z.number().int().min(0).nullable(),
    balconies: z.number().int().min(0).nullable(),
    servantRoom: z.boolean().nullable(),
    floorPlanPage: z.number().int().min(0).nullable(),
  })
  .strict();

export type FieldState = z.infer<typeof fieldStateSchema>;
export type ConfigurationKind = z.infer<typeof configurationKindSchema>;
export type AreaUnit = z.infer<typeof areaUnitSchema>;
export type CanonicalPublicProperty = z.infer<typeof canonicalPublicPropertySchema>;
export type CanonicalCommercialTerms = z.infer<typeof canonicalCommercialTermsSchema>;
export type CanonicalGatedProperty = z.infer<typeof canonicalGatedPropertySchema>;

export const propertyFormMetadata = [
  {
    name: "name",
    label: "Project name",
    required: true,
    visibility: "public",
  },
  {
    name: "developerName",
    label: "Developer",
    required: false,
    visibility: "public",
  },
  {
    name: "propertyType",
    label: "Property type",
    required: true,
    visibility: "public",
  },
  {
    name: "addressLine",
    label: "Address",
    required: false,
    visibility: "public",
  },
  {
    name: "locality",
    label: "Locality",
    required: false,
    visibility: "public",
  },
  {
    name: "stateCode",
    label: "State code",
    required: true,
    visibility: "public",
  },
  {
    name: "cityCode",
    label: "City code",
    required: true,
    visibility: "public",
  },
  {
    name: "reraRegistration",
    label: "RERA registration",
    required: false,
    visibility: "public",
  },
  {
    name: "possessionDate",
    label: "Verified possession date",
    required: false,
    visibility: "public",
  },
  {
    name: "configurationKind",
    label: "Configuration",
    required: true,
    visibility: "public",
  },
  {
    name: "areaValue",
    label: "Area",
    required: false,
    visibility: "public",
  },
  {
    name: "areaBasis",
    label: "Area basis",
    required: false,
    visibility: "public",
  },
  {
    name: "areaUnit",
    label: "Area unit",
    required: false,
    visibility: "public",
  },
  {
    name: "baseSalePriceRupees",
    label: "Base sale price",
    required: false,
    visibility: "private_commercial",
  },
  {
    name: "rateRupeesPerSqFt",
    label: "Rate per square foot",
    required: false,
    visibility: "private_commercial",
  },
  {
    name: "rateAreaBasis",
    label: "Rate area basis",
    required: false,
    visibility: "private_commercial",
  },
  {
    name: "amenitiesOther",
    label: "Other amenities (uncatalogued)",
    required: false,
    visibility: "public",
  },
  {
    name: "totalTowers",
    label: "Total towers",
    required: false,
    visibility: "public",
  },
  {
    name: "totalFloors",
    label: "Total floors",
    required: false,
    visibility: "public",
  },
  {
    name: "unitsPerFloor",
    label: "Units per floor",
    required: false,
    visibility: "public",
  },
  {
    name: "totalUnits",
    label: "Total units",
    required: false,
    visibility: "public",
  },
  {
    name: "plotSizeValue",
    label: "Plot size",
    required: false,
    visibility: "gated",
  },
  {
    name: "plotSizeUnit",
    label: "Plot size unit",
    required: false,
    visibility: "gated",
  },
  {
    name: "unitsPerAcre",
    label: "Units per acre",
    required: false,
    visibility: "gated",
  },
  {
    name: "openSpacePercent",
    label: "Open space (%)",
    required: false,
    visibility: "gated",
  },
  {
    name: "parkingLevels",
    label: "Parking levels",
    required: false,
    visibility: "gated",
  },
  {
    name: "podiumStructure",
    label: "Podium structure",
    required: false,
    visibility: "gated",
  },
  {
    name: "liftsPerTower",
    label: "Lifts per tower",
    required: false,
    visibility: "gated",
  },
  {
    name: "clubhouseSizeSqFt",
    label: "Clubhouse size (sq ft)",
    required: false,
    visibility: "gated",
  },
  {
    name: "internalCeilingHeightFt",
    label: "Internal ceiling height (ft)",
    required: false,
    visibility: "gated",
  },
  {
    name: "ceilingHeightBasis",
    label: "Ceiling height basis",
    required: false,
    visibility: "gated",
  },
  {
    name: "constructionQuality",
    label: "Construction quality",
    required: false,
    visibility: "gated",
  },
  {
    name: "flooringType",
    label: "Flooring type",
    required: false,
    visibility: "gated",
  },
  {
    name: "windowGlazing",
    label: "Window glazing",
    required: false,
    visibility: "gated",
  },
  {
    name: "bathSanitaryFittings",
    label: "Bath & sanitary fittings",
    required: false,
    visibility: "gated",
  },
  {
    name: "vrvAcProvision",
    label: "VRV/AC provision",
    required: false,
    visibility: "gated",
  },
  {
    name: "geyserProvision",
    label: "Geyser provision",
    required: false,
    visibility: "gated",
  },
  {
    name: "experienceYears",
    label: "Developer experience (years)",
    required: false,
    visibility: "gated",
  },
  {
    name: "deliveredProjects",
    label: "Delivered projects",
    required: false,
    visibility: "gated",
  },
  {
    name: "ongoingProjects",
    label: "Ongoing projects",
    required: false,
    visibility: "gated",
  },
  {
    name: "notableDeliveredProjects",
    label: "Notable delivered projects",
    required: false,
    visibility: "gated",
  },
  {
    name: "background",
    label: "Developer background",
    required: false,
    visibility: "gated",
  },
  {
    name: "proposedStartDateRera",
    label: "Proposed start date (RERA)",
    required: false,
    visibility: "gated",
  },
  {
    name: "possessionConfirmedAsOf",
    label: "Possession confirmed as of",
    required: false,
    visibility: "gated",
  },
  {
    name: "bathrooms",
    label: "Bathrooms",
    required: false,
    visibility: "gated",
  },
  {
    name: "balconies",
    label: "Balconies",
    required: false,
    visibility: "gated",
  },
  {
    name: "servantRoom",
    label: "Servant room",
    required: false,
    visibility: "gated",
  },
  {
    name: "floorPlanPage",
    label: "Floor plan page",
    required: false,
    visibility: "gated",
  },
] as const;
