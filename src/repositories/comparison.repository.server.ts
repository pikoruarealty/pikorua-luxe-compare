import { eq, inArray } from "drizzle-orm";

import {
  assertConsumerPayloadSafe,
  consumerComparisonSchema,
  type ConsumerComparison,
  type PublicPropertySummary,
} from "@/contracts/consumer";
import { getDatabase } from "@/db/client.server";
import {
  configurationOptions,
  configurationVariants,
  customerPreferences,
  markets,
  properties,
  propertyPublicationVersions,
  propertyRatingAggregates,
} from "@/db/schema";
import { propertyTypeSchema } from "@/generated/property-contract";

import { findRecommendations } from "./recommendation.repository.server";

interface Snapshot {
  name?: unknown;
  developerName?: unknown;
  propertyType?: unknown;
  locality?: unknown;
  cityName?: unknown;
  possessionDate?: unknown;
  heroImageUrl?: unknown;
}

const nullableString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export async function findConsumerComparison(
  profileId: string,
  slugs: string[],
): Promise<ConsumerComparison> {
  const db = getDatabase();
  const [preference] = await db
    .select({
      marketId: customerPreferences.marketId,
      configurationOptionIds: customerPreferences.configurationOptionIds,
      budgetBandId: customerPreferences.budgetBandId,
      propertyTypeIds: customerPreferences.propertyTypeIds,
    })
    .from(customerPreferences)
    .where(eq(customerPreferences.profileId, profileId))
    .limit(1);

  const rows = await db
    .select({
      propertyId: properties.id,
      slug: properties.slug,
      verifiedAt: propertyPublicationVersions.verifiedAt,
      snapshot: propertyPublicationVersions.publicSnapshot,
      cityName: markets.cityName,
      variantId: configurationVariants.id,
      optionId: configurationOptions.id,
      kind: configurationOptions.kind,
      displayName: configurationOptions.displayName,
      variantName: configurationVariants.variantName,
      areaValue: configurationVariants.areaValue,
      areaBasis: configurationVariants.areaBasis,
      areaUnit: configurationVariants.areaUnit,
      ratingAverage: propertyRatingAggregates.averageRating,
      reviewCount: propertyRatingAggregates.publishedReviewCount,
    })
    .from(properties)
    .innerJoin(
      propertyPublicationVersions,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .innerJoin(markets, eq(propertyPublicationVersions.marketId, markets.id))
    .innerJoin(
      configurationVariants,
      eq(configurationVariants.publicationVersionId, propertyPublicationVersions.id),
    )
    .innerJoin(
      configurationOptions,
      eq(configurationVariants.configurationOptionId, configurationOptions.id),
    )
    .leftJoin(propertyRatingAggregates, eq(propertyRatingAggregates.propertyId, properties.id))
    .where(inArray(properties.slug, slugs));

  const recommendationBySlug = new Map(
    preference
      ? (
          await findRecommendations({
            marketId: preference.marketId,
            configurationOptionIds: preference.configurationOptionIds,
            budgetBandId: preference.budgetBandId,
            propertyTypeIds: propertyTypeSchema.array().safeParse(preference.propertyTypeIds)
              .success
              ? propertyTypeSchema.array().parse(preference.propertyTypeIds)
              : undefined,
          })
        ).map((item) => [item.property.slug, item] as const)
      : [],
  );

  const grouped = new Map<
    string,
    {
      property: PublicPropertySummary;
      verificationDate: string;
      configurations: Array<{
        id: string;
        optionId: string;
        kind: (typeof rows)[number]["kind"];
        displayName: string;
        variantName: string | null;
        areaValue: number | null;
        areaBasis: string | null;
        areaUnit: string | null;
      }>;
    }
  >();

  for (const row of rows) {
    const snapshot = row.snapshot as Snapshot;
    let item = grouped.get(row.slug);
    if (!item) {
      const parsedType = propertyTypeSchema.safeParse(snapshot.propertyType);
      item = {
        property: {
          id: row.propertyId,
          slug: row.slug,
          name: nullableString(snapshot.name) ?? "Not stated",
          developerName: nullableString(snapshot.developerName),
          propertyType: parsedType.success ? parsedType.data : "apartment",
          locality: nullableString(snapshot.locality),
          cityName: nullableString(snapshot.cityName) ?? row.cityName,
          possessionDate: nullableString(snapshot.possessionDate),
          heroImageUrl: nullableString(snapshot.heroImageUrl),
          publishedReviewCount: row.reviewCount ?? 0,
          reviewCategorySummaries: [],
        },
        verificationDate: row.verifiedAt.toISOString(),
        configurations: [],
      };
      grouped.set(row.slug, item);
    }
    item.configurations.push({
      id: row.variantId,
      optionId: row.optionId,
      kind: row.kind,
      displayName: row.displayName,
      variantName: row.variantName,
      areaValue: row.areaValue === null ? null : Number(row.areaValue),
      areaBasis: row.areaBasis,
      areaUnit: row.areaUnit,
    });
  }

  const propertiesInRequestedOrder = slugs
    .map((slug) => {
      const item = grouped.get(slug);
      if (!item) return null;
      const recommendation = recommendationBySlug.get(slug);
      return {
        ...item,
        configurations: recommendation?.configurations ?? item.configurations,
        selectedConfigurationId: recommendation?.primaryConfigurationId ?? null,
        ...(recommendation
          ? {
              fit: recommendation.fit,
              commercialDataStale: recommendation.commercialDataStale,
            }
          : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const response = consumerComparisonSchema.parse({
    properties: propertiesInRequestedOrder,
    preferencesApplied: Boolean(preference),
    generatedAt: new Date().toISOString(),
  });
  assertConsumerPayloadSafe(response);
  return response;
}
