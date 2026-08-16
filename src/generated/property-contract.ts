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
export const areaUnitSchema = z.enum(["sq_ft", "sq_m", "sq_yd"]);

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
  })
  .strict();

export const canonicalCommercialTermsSchema = z
  .object({
    baseSalePriceRupees: z.number().int().min(0).nullable(),
    rateRupeesPerSqFt: z.number().finite().min(0).nullable(),
    rateAreaBasis: areaBasisSchema.nullable(),
  })
  .strict();

export type FieldState = z.infer<typeof fieldStateSchema>;
export type ConfigurationKind = z.infer<typeof configurationKindSchema>;
export type CanonicalPublicProperty = z.infer<typeof canonicalPublicPropertySchema>;
export type CanonicalCommercialTerms = z.infer<typeof canonicalCommercialTermsSchema>;

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
] as const;
