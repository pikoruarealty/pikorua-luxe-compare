import { z } from "zod";

import { budgetBandIdSchema } from "@/domain/budget";
import { configurationKindSchema, propertyTypeSchema } from "@/generated/property-contract";

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

export const consumerComparisonPropertySchema = z
  .object({
    property: publicPropertySummarySchema,
    configurations: z.array(publicConfigurationSchema),
    selectedConfigurationId: z.string().uuid().nullable(),
    fit: budgetFitSchema.optional(),
    commercialDataStale: z.boolean().optional(),
    verificationDate: z.string().datetime(),
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

export function assertConsumerPayloadSafe(value: unknown, path = "response"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertConsumerPayloadSafe(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_\s-]/g, "");
    if (FORBIDDEN_CONSUMER_KEYS.has(normalized)) {
      throw new Error(`Forbidden consumer field at ${path}.${key}`);
    }
    assertConsumerPayloadSafe(nested, `${path}.${key}`);
  }
}
