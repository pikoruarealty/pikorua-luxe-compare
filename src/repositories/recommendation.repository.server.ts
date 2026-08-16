import { and, eq } from "drizzle-orm";

import {
  assertConsumerPayloadSafe,
  recommendationItemSchema,
  type RecommendationItem,
  type RecommendationRequest,
} from "@/contracts/consumer";
import { getDatabase } from "@/db/client.server";
import {
  commercialTerms,
  configurationOptions,
  configurationVariants,
  markets,
  properties,
  propertyPublicationVersions,
  propertyRatingAggregates,
} from "@/db/schema";
import { getBudgetBand } from "@/domain/budget";
import {
  rankRecommendationProjects,
  type PrivateRecommendationProject,
} from "@/domain/recommendation";
import { propertyTypeSchema } from "@/generated/property-contract";

interface PublicSnapshot {
  name?: unknown;
  developerName?: unknown;
  propertyType?: unknown;
  locality?: unknown;
  cityName?: unknown;
  heroImageUrl?: unknown;
  verifiedDataCompleteness?: unknown;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function findRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationItem[]> {
  const db = getDatabase();
  const rows = await db
    .select({
      propertyId: properties.id,
      slug: properties.slug,
      publicationId: propertyPublicationVersions.id,
      verifiedAt: propertyPublicationVersions.verifiedAt,
      publicSnapshot: propertyPublicationVersions.publicSnapshot,
      variantId: configurationVariants.id,
      optionId: configurationOptions.id,
      kind: configurationOptions.kind,
      displayName: configurationOptions.displayName,
      premiumRank: configurationOptions.sortOrder,
      variantName: configurationVariants.variantName,
      areaValue: configurationVariants.areaValue,
      areaBasis: configurationVariants.areaBasis,
      areaUnit: configurationVariants.areaUnit,
      privateUpperBoundRupees: commercialTerms.privateUpperBoundRupees,
      staleAfter: commercialTerms.staleAfter,
      ratingAverage: propertyRatingAggregates.averageRating,
      publishedReviewCount: propertyRatingAggregates.publishedReviewCount,
      marketCityName: markets.cityName,
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
    .leftJoin(commercialTerms, eq(commercialTerms.configurationVariantId, configurationVariants.id))
    .leftJoin(propertyRatingAggregates, eq(propertyRatingAggregates.propertyId, properties.id))
    .where(
      and(eq(propertyPublicationVersions.marketId, request.marketId), eq(markets.isEnabled, true)),
    );

  const grouped = new Map<
    string,
    PrivateRecommendationProject & {
      slug: string;
      publicationId: string;
      verifiedAt: Date;
      snapshot: PublicSnapshot;
      cityName: string;
      ratingAverage: number | null;
      reviewCount: number;
      publicVariants: Map<
        string,
        {
          id: string;
          optionId: string;
          kind: (typeof rows)[number]["kind"];
          displayName: string;
          variantName: string | null;
          areaValue: number | null;
          areaBasis: string | null;
          areaUnit: string | null;
          staleAfter: Date | null;
        }
      >;
    }
  >();

  for (const row of rows) {
    const snapshot = row.publicSnapshot as PublicSnapshot;
    const name = nullableString(snapshot.name) ?? "Not stated";
    const completeness =
      typeof snapshot.verifiedDataCompleteness === "number" ? snapshot.verifiedDataCompleteness : 0;
    let project = grouped.get(row.propertyId);
    if (!project) {
      project = {
        id: row.propertyId,
        name,
        variants: [],
        verifiedDataCompleteness: completeness,
        slug: row.slug,
        publicationId: row.publicationId,
        verifiedAt: row.verifiedAt,
        snapshot,
        cityName: row.marketCityName,
        ratingAverage: row.ratingAverage ? Number(row.ratingAverage) : null,
        reviewCount: row.publishedReviewCount ?? 0,
        publicVariants: new Map(),
      };
      grouped.set(row.propertyId, project);
    }
    project.variants.push({
      id: row.variantId,
      configurationOptionId: row.optionId,
      privateUpperBoundRupees: row.privateUpperBoundRupees,
      premiumRank: row.premiumRank,
    });
    project.publicVariants.set(row.variantId, {
      id: row.variantId,
      optionId: row.optionId,
      kind: row.kind,
      displayName: row.displayName,
      variantName: row.variantName,
      areaValue: row.areaValue === null ? null : Number(row.areaValue),
      areaBasis: row.areaBasis,
      areaUnit: row.areaUnit,
      staleAfter: row.staleAfter,
    });
  }

  const propertyTypeFilter = new Set(request.propertyTypeIds ?? []);
  const projects = [...grouped.values()].filter((project) => {
    if (!propertyTypeFilter.size) return true;
    const parsed = propertyTypeSchema.safeParse(project.snapshot.propertyType);
    return parsed.success && propertyTypeFilter.has(parsed.data);
  });
  const ranked = rankRecommendationProjects(
    projects,
    request.configurationOptionIds,
    getBudgetBand(request.budgetBandId),
  );

  const now = Date.now();
  const response = ranked.map((project) => {
    const parsedType = propertyTypeSchema.safeParse(project.snapshot.propertyType);
    const primary = project.primaryConfigurationId
      ? project.publicVariants.get(project.primaryConfigurationId)
      : undefined;
    const item = recommendationItemSchema.parse({
      property: {
        id: project.id,
        slug: project.slug,
        name: project.name,
        developerName: nullableString(project.snapshot.developerName),
        propertyType: parsedType.success ? parsedType.data : "apartment",
        locality: nullableString(project.snapshot.locality),
        cityName: nullableString(project.snapshot.cityName) ?? project.cityName,
        heroImageUrl: nullableString(project.snapshot.heroImageUrl),
        ratingAverage: project.ratingAverage,
        publishedReviewCount: project.reviewCount,
      },
      primaryConfigurationId: project.primaryConfigurationId,
      availableConfigurationIds: project.availableConfigurationIds,
      configurations: [...project.publicVariants.values()].map(
        ({ staleAfter: _, ...variant }) => variant,
      ),
      fit: project.fit,
      commercialDataStale: Boolean(primary?.staleAfter && primary.staleAfter.getTime() < now),
      verificationDate: project.verifiedAt.toISOString(),
      isAlternativeConfiguration: project.isAlternativeConfiguration,
    });
    assertConsumerPayloadSafe(item);
    return item;
  });

  return response;
}
