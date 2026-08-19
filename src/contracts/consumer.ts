import { z } from "zod";

import { budgetBandIdSchema } from "@/domain/budget";
import {
  areaBasisSchema,
  areaUnitSchema,
  ceilingHeightBasisSchema,
  configurationKindSchema,
  fieldStateSchema,
  propertyTypeSchema,
} from "@/generated/property-contract";

export const recommendationRequestSchema = z
  .object({
    marketId: z.string().uuid(),
    configurationOptionIds: z.array(z.string().uuid()).min(1).max(11),
    budgetBandId: budgetBandIdSchema,
    propertyTypeIds: z.array(propertyTypeSchema).max(4).optional(),
  })
  .strict();

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

export interface CatalogueMarket {
  id: string;
  stateCode: string;
  stateName: string;
  cityCode: string;
  cityName: string;
  configurations: Array<{
    id: string;
    kind: string;
    displayName: string;
    sortOrder: number;
  }>;
}

export const budgetFitSchema = z.enum([
  "within",
  "slightly_above",
  "well_above",
  "slightly_below",
  "well_below",
  "unknown",
]);

export const publicPropertySummarySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().regex(/^[a-z0-9-]{1,200}$/),
    name: z.string(),
    developerName: z.string().nullable(),
    propertyType: propertyTypeSchema,
    locality: z.string().nullable(),
    cityName: z.string(),
    possessionDate: z.string().date().nullable(),
    heroImageUrl: z.string().url().nullable(),
    publishedReviewCount: z.number().int().nonnegative(),
    reviewCategorySummaries: z
      .array(
        z
          .object({
            dimension: z.string().min(1).max(100),
            averageRating: z.number().min(1).max(5),
            reviewCount: z.number().int().min(5),
          })
          .strict(),
      )
      .max(7),
    /** Override O2: the band, never the figure. `null` only when no verified
     *  commercial terms exist at all — see D1/D2. */
    priceBandLabel: z.string().min(1).max(20).nullable(),
  })
  .strict();

export type PublicPropertySummary = z.infer<typeof publicPropertySummarySchema>;

export const publicConfigurationSchema = z
  .object({
    id: z.string().uuid(),
    optionId: z.string().uuid(),
    kind: configurationKindSchema,
    displayName: z.string(),
    variantName: z.string().nullable(),
    areaValue: z.number().nonnegative().nullable(),
    areaBasis: z.string().nullable(),
    areaUnit: z.string().nullable(),
    fit: budgetFitSchema.optional(),
    commercialDataStale: z.boolean().optional(),
  })
  .strict();

export const recommendationItemSchema = z
  .object({
    property: publicPropertySummarySchema,
    primaryConfigurationId: z.string().uuid().nullable(),
    availableConfigurationIds: z.array(z.string().uuid()),
    configurations: z.array(publicConfigurationSchema),
    fit: budgetFitSchema,
    commercialDataStale: z.boolean(),
    verificationDate: z.string().datetime(),
    isAlternativeConfiguration: z.boolean(),
  })
  .strict();

export type RecommendationItem = z.infer<typeof recommendationItemSchema>;

const catalogEntrySchema = z
  .object({
    code: z.string().min(1).max(100),
    displayName: z.string().min(1).max(200),
    groupName: z.string().min(1).max(100),
  })
  .strict();

/** Part 2.1 PUBLIC tier: project structure counts and the canonical amenity
 *  vector. Never carries an area, a room dimension, or a price. */
export const publicProjectFactsSchema = z
  .object({
    totalTowers: z.number().int().min(0).nullable(),
    totalFloors: z.number().int().min(0).nullable(),
    unitsPerFloor: z.number().int().min(0).nullable(),
    totalUnits: z.number().int().min(0).nullable(),
    amenities: z.array(catalogEntrySchema).max(60),
    amenitiesOther: z.string().max(2000).nullable(),
  })
  .strict();

/** A dictionary field paired with its honest state — `not_stated` and
 *  `explicitly_not_offered` must stay visibly distinct (Part 8, guardrail 8). */
function gatedField<Value extends z.ZodTypeAny>(value: Value) {
  return z.object({ value, state: fieldStateSchema }).strict();
}

const gatedVariantAreaSchema = z
  .object({
    basis: areaBasisSchema,
    value: z.number().nonnegative().nullable(),
    unit: areaUnitSchema.nullable(),
    rawText: z.string().max(200).nullable(),
    state: fieldStateSchema,
  })
  .strict();

const gatedRoomSchema = z
  .object({
    roomType: z.string().min(1).max(100),
    dimensionRaw: z.string().max(200).nullable(),
    areaValue: z.number().nonnegative().nullable(),
    areaUnit: areaUnitSchema.nullable(),
    state: fieldStateSchema,
  })
  .strict();

const gatedConfigurationSchema = z
  .object({
    id: z.string().uuid(),
    areas: z.array(gatedVariantAreaSchema).max(10),
    rooms: z.array(gatedRoomSchema).max(20),
    bathrooms: gatedField(z.number().int().min(0).nullable()),
    balconies: gatedField(z.number().int().min(0).nullable()),
    servantRoom: gatedField(z.boolean().nullable()),
    /** O1/D3: the basic valuation rate, gated but visible — never the asking
     *  price. Displayed with its "excludes floor rise…" qualifier by the UI. */
    rateRupeesPerSqFt: z.number().nonnegative().nullable(),
    rateAreaBasis: areaBasisSchema.nullable(),
  })
  .strict();

const specificationEntrySchema = z
  .object({
    code: z.string().min(1).max(100),
    displayName: z.string().min(1).max(200),
    groupName: z.string().min(1).max(100),
    valueText: z.string().max(200).nullable(),
    state: fieldStateSchema,
  })
  .strict();

/** Part 2.1 GATED tier: everything a verified session unlocks. Absent from
 *  the response object entirely when there is no session — never sent blank. */
export const gatedComparisonPropertySchema = z
  .object({
    specifications: z.array(specificationEntrySchema).max(60),
    plotSizeValue: gatedField(z.number().nonnegative().nullable()),
    plotSizeUnit: gatedField(areaUnitSchema.nullable()),
    unitsPerAcre: gatedField(z.number().nonnegative().nullable()),
    openSpacePercent: gatedField(z.number().nonnegative().nullable()),
    parkingLevels: gatedField(z.number().int().min(0).nullable()),
    podiumStructure: gatedField(z.string().max(200).nullable()),
    liftsPerTower: gatedField(z.number().int().min(0).nullable()),
    clubhouseSizeSqFt: gatedField(z.number().nonnegative().nullable()),
    internalCeilingHeightFt: gatedField(z.number().nonnegative().nullable()),
    ceilingHeightBasis: ceilingHeightBasisSchema,
    constructionQuality: gatedField(z.string().max(200).nullable()),
    flooringType: gatedField(z.string().max(200).nullable()),
    windowGlazing: gatedField(z.string().max(200).nullable()),
    bathSanitaryFittings: gatedField(z.string().max(200).nullable()),
    vrvAcProvision: gatedField(z.string().max(200).nullable()),
    geyserProvision: gatedField(z.string().max(200).nullable()),
    experienceYears: gatedField(z.number().int().min(0).nullable()),
    deliveredProjects: gatedField(z.number().int().min(0).nullable()),
    ongoingProjects: gatedField(z.number().int().min(0).nullable()),
    notableDeliveredProjects: gatedField(z.array(z.string().max(200)).max(100).nullable()),
    background: gatedField(z.string().max(2000).nullable()),
    proposedStartDateRera: gatedField(z.string().date().nullable()),
    possessionConfirmedAsOf: gatedField(z.string().date().nullable()),
    configurations: z.array(gatedConfigurationSchema),
  })
  .strict();

export type GatedComparisonProperty = z.infer<typeof gatedComparisonPropertySchema>;

export const consumerComparisonPropertySchema = z
  .object({
    property: publicPropertySummarySchema,
    publicFacts: publicProjectFactsSchema,
    configurations: z.array(publicConfigurationSchema),
    selectedConfigurationId: z.string().uuid().nullable(),
    fit: budgetFitSchema.optional(),
    commercialDataStale: z.boolean().optional(),
    verificationDate: z.string().datetime(),
    /** `null` until the visitor unlocks via phone + OTP (D5). Absent data,
     *  not hidden data — the deep fields are never sent to an anonymous
     *  browser at all. */
    gated: gatedComparisonPropertySchema.nullable(),
  })
  .strict();

export const consumerComparisonSchema = z
  .object({
    properties: z.array(consumerComparisonPropertySchema).min(2).max(3),
    preferencesApplied: z.boolean(),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type ConsumerComparison = z.infer<typeof consumerComparisonSchema>;

export const scoreDimensionSchema = z.enum([
  "space",
  "privacy",
  "specification",
  "developer",
  "possession",
]);

const gatedScoreReasonSchema = z
  .object({
    label: z.string().min(1).max(200),
    explanation: z.string().min(1).max(1000),
    evidenceAsOf: z.string().date(),
  })
  .strict();

export const gatedPropScoreSchema = z
  .object({
    methodologyVersion: z.string().regex(/^propscore-v\d+\.\d+\.\d+$/),
    calculatedAt: z.string().datetime(),
    composite: z.number().int().min(0).max(100).nullable(),
    status: z.enum(["complete", "insufficient_evidence"]),
    coveragePercent: z.number().int().min(0).max(100),
    dimensions: z
      .array(
        z
          .object({
            key: scoreDimensionSchema,
            score: z.number().int().min(0).max(100).nullable(),
            status: z.enum(["complete", "insufficient_evidence", "invalid"]),
            coveragePercent: z.number().int().min(0).max(100),
            why: z.array(gatedScoreReasonSchema).max(30),
          })
          .strict(),
      )
      .length(5),
    reraCrossCheck: z
      .object({
        status: z.enum([
          "matched",
          "discrepancy",
          "unavailable",
          "invalid_registration",
          "pending",
        ]),
        checkedAt: z.string().datetime().nullable(),
        promoterMatch: z.boolean().nullable(),
        completionDifferenceDays: z.number().int().nonnegative().nullable(),
        areaDiscrepancies: z
          .array(
            z
              .object({
                configurationLabel: z.string().min(1).max(200),
                brochureValue: z.string().min(1).max(200),
                reraValue: z.string().min(1).max(200),
                differencePercent: z.number().nonnegative(),
              })
              .strict(),
          )
          .max(50),
      })
      .strict(),
    connectivity: z
      .array(
        z
          .object({
            category: z.string().min(1).max(100),
            landmark: z.string().min(1).max(200),
            distanceKm: z.number().nonnegative().nullable(),
            durationMinutes: z.number().nonnegative().nullable(),
            calculatedAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export type GatedPropScorePayload = z.infer<typeof gatedPropScoreSchema>;

export const FORBIDDEN_CONSUMER_KEYS = new Set([
  "price",
  "pricesummary",
  "pricepersqft",
  "rate",
  "raterupeespersqft",
  "rateareabasis",
  "basesaleprice",
  "basesalepricerupees",
  "privatelowerboundrupees",
  "privateupperboundrupees",
  "lowerbound",
  "upperbound",
  "commercialrevisionid",
  "reviewernote",
  "sourceevidence",
  "inputsnapshot",
  "cohortsnapshot",
]);

/** Override O1: within the gated tier only, `rate` (basic valuation rate) is
 *  permitted — D3. `baseSalePriceRupees` and the private bounds stay banned
 *  everywhere, gated tier included. */
const GATED_ALLOWED_KEYS = new Set(["rate", "raterupeespersqft", "rateareabasis"]);

export function assertConsumerPayloadSafe(
  value: unknown,
  path = "response",
  allowedKeys: ReadonlySet<string> = new Set(),
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertConsumerPayloadSafe(item, `${path}[${index}]`, allowedKeys),
    );
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_\s-]/g, "");
    if (FORBIDDEN_CONSUMER_KEYS.has(normalized) && !allowedKeys.has(normalized)) {
      throw new Error(`Forbidden consumer field at ${path}.${key}`);
    }
    assertConsumerPayloadSafe(nested, `${path}.${key}`, allowedKeys);
  }
}

/** Guards a `GatedComparisonProperty` payload with `rate`/`rateAreaBasis`
 *  explicitly allowed (O1) — everything else stays banned, including inside
 *  the gated tier. Call on `.gated` only, never on the full response. */
export function assertGatedComparisonPayloadSafe(value: unknown, path = "response.gated"): void {
  assertConsumerPayloadSafe(value, path, GATED_ALLOWED_KEYS);
}
