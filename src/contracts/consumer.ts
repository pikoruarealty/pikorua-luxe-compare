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

export const budgetFitSchema = z.enum(["within", "slightly_above", "well_above", "unknown"]);

export const publicPropertySummarySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().regex(/^[a-z0-9-]{1,200}$/),
    name: z.string(),
    developerName: z.string().nullable(),
    propertyType: propertyTypeSchema,
    locality: z.string().nullable(),
    cityName: z.string(),
    heroImageUrl: z.string().url().nullable(),
    ratingAverage: z.number().min(1).max(5).nullable(),
    publishedReviewCount: z.number().int().nonnegative(),
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
