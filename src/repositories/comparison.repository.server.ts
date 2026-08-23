import { desc, eq, inArray } from "drizzle-orm";

import {
  assertConsumerPayloadSafe,
  assertGatedComparisonPayloadSafe,
  consumerComparisonSchema,
  type ConsumerComparison,
  type GatedComparisonProperty,
  type PublicPropertySummary,
} from "@/contracts/consumer";
import { getDatabase } from "@/db/client.server";
import {
  amenityCatalog,
  commercialTerms,
  configurationOptions,
  configurationVariantAreas,
  configurationVariantRooms,
  configurationVariants,
  customerPreferences,
  markets,
  properties,
  propertyAmenities,
  propertyPublicationDetails,
  propertyPublicationVersions,
  propertyRatingAggregates,
  propertySpecifications,
  specificationCatalog,
} from "@/db/schema";
import { budgetBandIdSchema, priceBandLabelForRupees } from "@/domain/budget";
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

const numericOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

type PublicConfiguration = {
  id: string;
  optionId: string;
  kind: string;
  displayName: string;
  variantName: string | null;
  areaValue: number | null;
  areaBasis: string | null;
  areaUnit: string | null;
};

export async function findConsumerComparison(
  profileId: string | null,
  slugs: string[],
): Promise<ConsumerComparison> {
  const db = getDatabase();
  const [preference] = profileId
    ? await db
        .select({
          marketId: customerPreferences.marketId,
          configurationOptionIds: customerPreferences.configurationOptionIds,
          budgetBandId: customerPreferences.budgetBandId,
          propertyTypeIds: customerPreferences.propertyTypeIds,
        })
        .from(customerPreferences)
        .where(eq(customerPreferences.profileId, profileId))
        .limit(1)
    : [];

  const rows = await db
    .select({
      propertyId: properties.id,
      slug: properties.slug,
      publicationVersionId: propertyPublicationVersions.id,
      verifiedAt: propertyPublicationVersions.verifiedAt,
      snapshot: propertyPublicationVersions.publicSnapshot,
      cityName: markets.cityName,
      variantId: configurationVariants.id,
      optionId: configurationOptions.id,
      kind: configurationOptions.kind,
      displayName: configurationOptions.displayName,
      variantName: configurationVariants.variantName,
      bathrooms: configurationVariants.bathrooms,
      bathroomsState: configurationVariants.bathroomsState,
      balconies: configurationVariants.balconies,
      balconiesState: configurationVariants.balconiesState,
      servantRoomPresent: configurationVariants.servantRoomPresent,
      servantRoomState: configurationVariants.servantRoomState,
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

  const variantIds = [...new Set(rows.map((row) => row.variantId))];
  const publicationVersionIds = [...new Set(rows.map((row) => row.publicationVersionId))];

  const [areaRows, roomRows, termRows, detailRows, amenityRows, specificationRows] =
    await Promise.all([
      variantIds.length
        ? db
            .select({
              variantId: configurationVariantAreas.variantId,
              basis: configurationVariantAreas.basis,
              value: configurationVariantAreas.value,
              unit: configurationVariantAreas.unit,
              rawText: configurationVariantAreas.rawText,
              state: configurationVariantAreas.state,
            })
            .from(configurationVariantAreas)
            .where(inArray(configurationVariantAreas.variantId, variantIds))
        : [],
      variantIds.length
        ? db
            .select({
              variantId: configurationVariantRooms.configurationVariantId,
              roomType: configurationVariantRooms.roomType,
              dimensionRaw: configurationVariantRooms.dimensionRaw,
              areaValue: configurationVariantRooms.areaValue,
              areaUnit: configurationVariantRooms.areaUnit,
              state: configurationVariantRooms.roomState,
              sortOrder: configurationVariantRooms.sortOrder,
            })
            .from(configurationVariantRooms)
            .where(inArray(configurationVariantRooms.configurationVariantId, variantIds))
            .orderBy(configurationVariantRooms.sortOrder)
        : [],
      variantIds.length
        ? db
            .select({
              variantId: commercialTerms.configurationVariantId,
              revision: commercialTerms.revision,
              privateUpperBoundRupees: commercialTerms.privateUpperBoundRupees,
              rateRupeesPerSqFt: commercialTerms.rateRupeesPerSqFt,
              rateAreaBasis: commercialTerms.rateAreaBasis,
            })
            .from(commercialTerms)
            .where(inArray(commercialTerms.configurationVariantId, variantIds))
            .orderBy(desc(commercialTerms.revision))
        : [],
      publicationVersionIds.length
        ? db
            .select()
            .from(propertyPublicationDetails)
            .where(inArray(propertyPublicationDetails.publicationVersionId, publicationVersionIds))
        : [],
      publicationVersionIds.length
        ? db
            .select({
              publicationVersionId: propertyAmenities.publicationVersionId,
              code: propertyAmenities.amenityCode,
              displayName: propertyAmenities.displayName,
              groupName: amenityCatalog.groupName,
              sortOrder: amenityCatalog.sortOrder,
              valueState: propertyAmenities.valueState,
            })
            .from(propertyAmenities)
            .innerJoin(amenityCatalog, eq(amenityCatalog.code, propertyAmenities.amenityCode))
            .where(inArray(propertyAmenities.publicationVersionId, publicationVersionIds))
            .orderBy(amenityCatalog.sortOrder)
        : [],
      publicationVersionIds.length
        ? db
            .select({
              publicationVersionId: propertySpecifications.publicationVersionId,
              code: propertySpecifications.specificationCode,
              displayName: propertySpecifications.displayName,
              groupName: specificationCatalog.groupName,
              sortOrder: specificationCatalog.sortOrder,
              valueText: propertySpecifications.valueText,
              valueState: propertySpecifications.valueState,
            })
            .from(propertySpecifications)
            .innerJoin(
              specificationCatalog,
              eq(specificationCatalog.code, propertySpecifications.specificationCode),
            )
            .where(inArray(propertySpecifications.publicationVersionId, publicationVersionIds))
            .orderBy(specificationCatalog.sortOrder)
        : [],
    ]);

  const areasByVariant = new Map<string, typeof areaRows>();
  for (const row of areaRows) {
    const list = areasByVariant.get(row.variantId) ?? [];
    list.push(row);
    areasByVariant.set(row.variantId, list);
  }
  const roomsByVariant = new Map<string, typeof roomRows>();
  for (const row of roomRows) {
    const list = roomsByVariant.get(row.variantId) ?? [];
    list.push(row);
    roomsByVariant.set(row.variantId, list);
  }
  // First row per variant after ORDER BY revision DESC is the current one.
  const currentTermByVariant = new Map<string, (typeof termRows)[number]>();
  for (const row of termRows) {
    if (!currentTermByVariant.has(row.variantId)) currentTermByVariant.set(row.variantId, row);
  }
  const detailsByPublication = new Map(detailRows.map((row) => [row.publicationVersionId, row]));
  const amenitiesByPublication = new Map<string, typeof amenityRows>();
  for (const row of amenityRows) {
    const list = amenitiesByPublication.get(row.publicationVersionId) ?? [];
    list.push(row);
    amenitiesByPublication.set(row.publicationVersionId, list);
  }
  const specificationsByPublication = new Map<string, typeof specificationRows>();
  for (const row of specificationRows) {
    const list = specificationsByPublication.get(row.publicationVersionId) ?? [];
    list.push(row);
    specificationsByPublication.set(row.publicationVersionId, list);
  }

  const parsedBudgetBandId = preference
    ? budgetBandIdSchema.safeParse(preference.budgetBandId)
    : undefined;

  const recommendationBySlug = new Map(
    preference && parsedBudgetBandId?.success
      ? (
          await findRecommendations({
            marketId: preference.marketId,
            configurationOptionIds: preference.configurationOptionIds,
            budgetBandId: parsedBudgetBandId.data,
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
      publicationVersionId: string;
      property: PublicPropertySummary;
      verificationDate: string;
      configurations: PublicConfiguration[];
      gatedConfigurations: GatedComparisonProperty["configurations"];
    }
  >();

  for (const row of rows) {
    const snapshot = row.snapshot as Snapshot;
    let item = grouped.get(row.slug);
    if (!item) {
      const parsedType = propertyTypeSchema.safeParse(snapshot.propertyType);
      const variantIdsForProperty = rows
        .filter((candidate) => candidate.slug === row.slug)
        .map((candidate) => candidate.variantId);
      const upperBounds = variantIdsForProperty
        .map((id) => currentTermByVariant.get(id)?.privateUpperBoundRupees ?? null)
        .filter((value): value is number => value !== null);
      const startingUpperBound = upperBounds.length ? Math.min(...upperBounds) : null;
      item = {
        publicationVersionId: row.publicationVersionId,
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
          priceBandLabel: priceBandLabelForRupees(startingUpperBound),
        },
        verificationDate: row.verifiedAt.toISOString(),
        configurations: [],
        gatedConfigurations: [],
      };
      grouped.set(row.slug, item);
    }

    const areas = areasByVariant.get(row.variantId) ?? [];
    const superBuiltUp = areas.find((area) => area.basis === "super_built_up");

    item.configurations.push({
      id: row.variantId,
      optionId: row.optionId,
      kind: row.kind,
      displayName: row.displayName,
      variantName: row.variantName,
      areaValue: numericOrNull(superBuiltUp?.value ?? null),
      areaBasis: superBuiltUp?.basis ?? null,
      areaUnit: superBuiltUp?.unit ?? null,
    });

    const rooms = roomsByVariant.get(row.variantId) ?? [];
    const terms = currentTermByVariant.get(row.variantId);
    item.gatedConfigurations.push({
      id: row.variantId,
      areas: areas.map((area) => ({
        basis: area.basis,
        value: numericOrNull(area.value),
        unit: area.unit,
        rawText: area.rawText,
        state: area.state,
      })),
      rooms: rooms.map((room) => ({
        roomType: room.roomType,
        dimensionRaw: room.dimensionRaw,
        areaValue: numericOrNull(room.areaValue),
        areaUnit: room.areaUnit,
        state: room.state,
      })),
      bathrooms: { value: row.bathrooms, state: row.bathroomsState },
      balconies: { value: row.balconies, state: row.balconiesState },
      servantRoom: { value: row.servantRoomPresent, state: row.servantRoomState },
      rateRupeesPerSqFt: numericOrNull(terms?.rateRupeesPerSqFt ?? null),
      rateAreaBasis: terms?.rateAreaBasis ?? null,
    });
  }

  const propertiesInRequestedOrder = slugs
    .map((slug) => {
      const item = grouped.get(slug);
      if (!item) return null;
      const recommendation = recommendationBySlug.get(slug);
      const details = detailsByPublication.get(item.publicationVersionId);
      const amenities = amenitiesByPublication.get(item.publicationVersionId) ?? [];
      const specifications = specificationsByPublication.get(item.publicationVersionId) ?? [];

      const publicFacts = {
        totalTowers: details?.totalTowers ?? null,
        totalFloors: details?.totalFloors ?? null,
        unitsPerFloor: details?.unitsPerFloor ?? null,
        totalUnits: details?.totalUnits ?? null,
        amenities: amenities
          .filter((amenity) => amenity.valueState === "stated")
          .map((amenity) => ({
            code: amenity.code,
            displayName: amenity.displayName,
            groupName: amenity.groupName,
          })),
        amenitiesOther: nullableString(details?.amenitiesOther ?? null),
      };

      const gated = profileId
        ? {
            specifications: specifications.map((specification) => ({
              code: specification.code,
              displayName: specification.displayName,
              groupName: specification.groupName,
              valueText: specification.valueText,
              state: specification.valueState,
            })),
            plotSizeValue: {
              value: numericOrNull(details?.plotSizeValue ?? null),
              state: details?.plotSizeState ?? ("not_stated" as const),
            },
            plotSizeUnit: {
              value: details?.plotSizeUnit ?? null,
              state: details?.plotSizeState ?? ("not_stated" as const),
            },
            unitsPerAcre: {
              value: numericOrNull(details?.unitsPerAcre ?? null),
              state: details?.unitsPerAcreState ?? ("not_stated" as const),
            },
            openSpacePercent: {
              value: numericOrNull(details?.openSpacePercent ?? null),
              state: details?.openSpacePercentState ?? ("not_stated" as const),
            },
            parkingLevels: {
              value: details?.parkingLevels ?? null,
              state: details?.parkingLevelsState ?? ("not_stated" as const),
            },
            podiumStructure: {
              value: details?.podiumStructure ?? null,
              state: details?.podiumStructureState ?? ("not_stated" as const),
            },
            liftsPerTower: {
              value: details?.liftsPerTower ?? null,
              state: details?.liftsPerTowerState ?? ("not_stated" as const),
            },
            clubhouseSizeSqFt: {
              value: numericOrNull(details?.clubhouseSizeSqFt ?? null),
              state: details?.clubhouseSizeSqFtState ?? ("not_stated" as const),
            },
            internalCeilingHeightFt: {
              value: numericOrNull(details?.internalCeilingHeightFt ?? null),
              state: details?.ceilingHeightState ?? ("not_stated" as const),
            },
            ceilingHeightBasis: details?.ceilingHeightBasis ?? ("not_stated" as const),
            constructionQuality: {
              value: details?.constructionQuality ?? null,
              state: details?.constructionQualityState ?? ("not_stated" as const),
            },
            flooringType: {
              value: details?.flooringType ?? null,
              state: details?.flooringTypeState ?? ("not_stated" as const),
            },
            windowGlazing: {
              value: details?.windowGlazing ?? null,
              state: details?.windowGlazingState ?? ("not_stated" as const),
            },
            bathSanitaryFittings: {
              value: details?.bathSanitaryFittings ?? null,
              state: details?.bathSanitaryFittingsState ?? ("not_stated" as const),
            },
            vrvAcProvision: {
              value: details?.vrvAcProvision ?? null,
              state: details?.vrvAcProvisionState ?? ("not_stated" as const),
            },
            geyserProvision: {
              value: details?.geyserProvision ?? null,
              state: details?.geyserProvisionState ?? ("not_stated" as const),
            },
            experienceYears: {
              value: details?.experienceYears ?? null,
              state: details?.experienceYearsState ?? ("not_stated" as const),
            },
            deliveredProjects: {
              value: details?.deliveredProjects ?? null,
              state: details?.deliveredProjectsState ?? ("not_stated" as const),
            },
            ongoingProjects: {
              value: details?.ongoingProjects ?? null,
              state: details?.ongoingProjectsState ?? ("not_stated" as const),
            },
            notableDeliveredProjects: {
              value: details?.notableDeliveredProjects?.length
                ? details.notableDeliveredProjects
                : null,
              state: details?.notableDeliveredProjectsState ?? ("not_stated" as const),
            },
            background: {
              value: details?.background ?? null,
              state: details?.backgroundState ?? ("not_stated" as const),
            },
            proposedStartDateRera: {
              value: details?.proposedStartDateRera ?? null,
              state: details?.proposedStartDateReraState ?? ("not_stated" as const),
            },
            possessionConfirmedAsOf: {
              value: details?.possessionConfirmedAsOf ?? null,
              state: details?.possessionConfirmedAsOfState ?? ("not_stated" as const),
            },
            registeredCompletionDateRera: {
              value: details?.registeredCompletionDateRera ?? null,
              state: details?.registeredCompletionDateReraState ?? ("not_stated" as const),
            },
            constructionProgressRera: {
              value: details?.constructionProgressRera ?? null,
              state: details?.constructionProgressReraState ?? ("not_stated" as const),
            },
            configurations: item.gatedConfigurations,
          }
        : null;

      return {
        property: item.property,
        publicFacts,
        configurations: recommendation?.configurations ?? item.configurations,
        selectedConfigurationId: recommendation?.primaryConfigurationId ?? null,
        ...(recommendation
          ? {
              fit: recommendation.fit,
              commercialDataStale: recommendation.commercialDataStale,
            }
          : {}),
        verificationDate: item.verificationDate,
        gated,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const response = consumerComparisonSchema.parse({
    properties: propertiesInRequestedOrder,
    preferencesApplied: Boolean(preference),
    generatedAt: new Date().toISOString(),
  });
  assertConsumerPayloadSafe({
    ...response,
    properties: response.properties.map((property) => ({ ...property, gated: null })),
  });
  for (const property of response.properties) {
    if (property.gated) assertGatedComparisonPayloadSafe(property.gated);
  }
  return response;
}
