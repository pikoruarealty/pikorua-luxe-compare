import { eq } from "drizzle-orm";

import {
  assertConsumerPayloadSafe,
  publicConfigurationSchema,
  publicPropertySummarySchema,
} from "@/contracts/consumer";
import { getDatabase } from "@/db/client.server";
import {
  configurationOptions,
  configurationVariants,
  markets,
  properties,
  propertyAmenities,
  propertyPublicationVersions,
  propertyRatingAggregates,
  propertySpecifications,
} from "@/db/schema";
import { propertyTypeSchema } from "@/generated/property-contract";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export async function findPublicPropertyDetail(slug: string) {
  const db = getDatabase();
  const rows = await db
    .select({
      propertyId: properties.id,
      slug: properties.slug,
      publicationId: propertyPublicationVersions.id,
      snapshot: propertyPublicationVersions.publicSnapshot,
      verifiedAt: propertyPublicationVersions.verifiedAt,
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
    .where(eq(properties.slug, slug));
  if (!rows.length) return null;
  const first = rows[0];
  const snapshot = first.snapshot as Record<string, unknown>;
  const parsedType = propertyTypeSchema.safeParse(snapshot.propertyType);
  const [amenities, specifications] = await Promise.all([
    db
      .select({
        code: propertyAmenities.amenityCode,
        name: propertyAmenities.displayName,
        state: propertyAmenities.valueState,
        details: propertyAmenities.details,
      })
      .from(propertyAmenities)
      .where(eq(propertyAmenities.publicationVersionId, first.publicationId)),
    db
      .select({
        code: propertySpecifications.specificationCode,
        name: propertySpecifications.displayName,
        value: propertySpecifications.valueText,
        state: propertySpecifications.valueState,
      })
      .from(propertySpecifications)
      .where(eq(propertySpecifications.publicationVersionId, first.publicationId)),
  ]);
  const response = {
    property: publicPropertySummarySchema.parse({
      id: first.propertyId,
      slug: first.slug,
      name: text(snapshot.name) ?? "Not stated",
      developerName: text(snapshot.developerName),
      propertyType: parsedType.success ? parsedType.data : "apartment",
      locality: text(snapshot.locality),
      cityName: text(snapshot.cityName) ?? first.cityName,
      possessionDate: text(snapshot.possessionDate),
      heroImageUrl: text(snapshot.heroImageUrl),
      ratingAverage: first.ratingAverage ? Number(first.ratingAverage) : null,
      publishedReviewCount: first.reviewCount ?? 0,
    }),
    addressLine: text(snapshot.addressLine),
    reraRegistration: text(snapshot.reraRegistration),
    configurations: rows.map((row) =>
      publicConfigurationSchema.parse({
        id: row.variantId,
        optionId: row.optionId,
        kind: row.kind,
        displayName: row.displayName,
        variantName: row.variantName,
        areaValue: row.areaValue === null ? null : Number(row.areaValue),
        areaBasis: row.areaBasis,
        areaUnit: row.areaUnit,
      }),
    ),
    amenities,
    specifications,
    verificationDate: first.verifiedAt.toISOString(),
  };
  // `snapshot` and both catalog tables are jsonb/free-text today, so the zod
  // parse above cannot vouch for what rides inside them. This is the backstop.
  assertConsumerPayloadSafe(response);
  return response;
}
