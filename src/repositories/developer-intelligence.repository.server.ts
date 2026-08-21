import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import {
  commercialTerms,
  configurationVariants,
  adminProfiles,
  developerIntelligenceEntitlements,
  properties,
  propertyReviewDimensions,
  propertyReviews,
} from "@/db/schema";
import { BUDGET_BANDS } from "@/domain/budget";
import {
  aggregateSentiment,
  isEntitlementActive,
  reportingPeriods,
  type SentimentRow,
} from "@/domain/developer-intelligence";

export async function findEntitlement(developerId: string) {
  const [row] = await getDatabase()
    .select()
    .from(developerIntelligenceEntitlements)
    .where(eq(developerIntelligenceEntitlements.developerId, developerId))
    .limit(1);
  return row ?? null;
}

export function entitlementView(
  entitlement: Awaited<ReturnType<typeof findEntitlement>>,
  now = new Date(),
) {
  return {
    active: isEntitlementActive(entitlement, now),
    accessLevel:
      entitlement?.accessLevel === "paid"
        ? ("paid" as const)
        : entitlement
          ? ("trial" as const)
          : null,
    status:
      entitlement?.status === "suspended"
        ? ("suspended" as const)
        : entitlement
          ? ("active" as const)
          : ("missing" as const),
    startsAt: entitlement?.startsAt.toISOString() ?? null,
    endsAt: entitlement?.endsAt?.toISOString() ?? null,
  };
}

export async function listOwnedPublishedProperties(developerId: string) {
  return getDatabase()
    .select({
      id: properties.id,
      slug: properties.slug,
      name: properties.name,
      currentPublicationVersionId: properties.currentPublicationVersionId,
    })
    .from(properties)
    .where(and(eq(properties.createdBy, developerId), eq(properties.isPublished, true)))
    .orderBy(properties.name);
}

export async function findOwnedPublishedProperty(developerId: string, propertyId: string) {
  const [property] = await getDatabase()
    .select({
      id: properties.id,
      slug: properties.slug,
      name: properties.name,
      currentPublicationVersionId: properties.currentPublicationVersionId,
    })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.createdBy, developerId),
        eq(properties.isPublished, true),
      ),
    )
    .limit(1);
  if (!property) throw new Error("Project not found");
  return property;
}

export async function propertyBudgetBandId(publicationVersionId: string | null) {
  if (!publicationVersionId) return null;
  const rows = await getDatabase()
    .select({
      variantId: configurationVariants.id,
      revision: commercialTerms.revision,
      upper: commercialTerms.privateUpperBoundRupees,
    })
    .from(configurationVariants)
    .innerJoin(
      commercialTerms,
      eq(commercialTerms.configurationVariantId, configurationVariants.id),
    )
    .where(eq(configurationVariants.publicationVersionId, publicationVersionId))
    .orderBy(configurationVariants.id, desc(commercialTerms.revision));
  const latest = new Map<string, number | null>();
  for (const row of rows) if (!latest.has(row.variantId)) latest.set(row.variantId, row.upper);
  const values = [...latest.values()].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (!values.length) return null;
  const upper = Math.min(...values);
  return (
    BUDGET_BANDS.find(
      (band) =>
        upper >= band.minimumRupees && (band.maximumRupees === null || upper < band.maximumRupees),
    )?.id ?? null
  );
}

export async function projectSentiment(propertyId: string, now = new Date()) {
  const { previousStart } = reportingPeriods(now);
  const rows = await getDatabase()
    .select({
      reviewId: propertyReviews.id,
      dimension: propertyReviewDimensions.dimension,
      rating: propertyReviewDimensions.rating,
      publishedAt: propertyReviews.publishedAt,
    })
    .from(propertyReviews)
    .innerJoin(propertyReviewDimensions, eq(propertyReviewDimensions.reviewId, propertyReviews.id))
    .where(
      and(
        eq(propertyReviews.propertyId, propertyId),
        eq(propertyReviews.visibility, "published"),
        eq(propertyReviewDimensions.experienceState, "experienced"),
        isNotNull(propertyReviewDimensions.rating),
        isNotNull(propertyReviews.publishedAt),
        gte(propertyReviews.publishedAt, previousStart),
      ),
    );
  return aggregateSentiment(
    rows.map(
      (row): SentimentRow => ({
        reviewId: row.reviewId,
        dimension: row.dimension as SentimentRow["dimension"],
        rating: row.rating!,
        publishedAt: row.publishedAt!.toISOString(),
      }),
    ),
    now,
  );
}

export async function propertyNamesBySlugs(slugs: string[]) {
  if (!slugs.length) return new Map<string, string>();
  const rows = await getDatabase()
    .select({ slug: properties.slug, name: properties.name })
    .from(properties)
    .where(and(inArray(properties.slug, slugs), eq(properties.isPublished, true)));
  return new Map(rows.map((row) => [row.slug, row.name]));
}

export async function upsertEntitlement(
  managedBy: string,
  input: {
    developerId: string;
    accessLevel: "trial" | "paid";
    status: "active" | "suspended";
    startsAt: string;
    endsAt: string | null;
    note: string | null;
  },
) {
  const db = getDatabase();
  const [profile] = await db
    .select({ id: adminProfiles.id })
    .from(adminProfiles)
    .where(and(eq(adminProfiles.id, input.developerId), eq(adminProfiles.role, "developer")))
    .limit(1);
  if (!profile) throw new Error("Developer not found");
  const [row] = await db
    .insert(developerIntelligenceEntitlements)
    .values({
      developerId: input.developerId,
      accessLevel: input.accessLevel,
      status: input.status,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      managedBy,
      note: input.note,
    })
    .onConflictDoUpdate({
      target: developerIntelligenceEntitlements.developerId,
      set: {
        accessLevel: input.accessLevel,
        status: input.status,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        managedBy,
        note: input.note,
        updatedAt: new Date(),
      },
    })
    .returning();
  return entitlementView(row);
}
