import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";

import { assertConsumerPayloadSafe } from "@/contracts/consumer";
import { getDatabase } from "@/db/client.server";
import {
  auditEvents,
  configurationVariants,
  developerReviewResponses,
  profiles,
  properties,
  propertyEnquiries,
  propertyPublicationVersions,
  propertyRatingAggregates,
  propertyReviews,
  propertyReviewVersions,
  reviewReports,
} from "@/db/schema";
import { moderateUserText } from "@/domain/review-moderation";

const CONSENT_VERSION = "price-enquiry-v1";

async function publishedPropertyBySlug(slug: string) {
  const db = getDatabase();
  const [property] = await db
    .select({
      id: properties.id,
      slug: properties.slug,
      developerId: properties.createdBy,
      publicationId: properties.currentPublicationVersionId,
    })
    .from(properties)
    .innerJoin(
      propertyPublicationVersions,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .where(eq(properties.slug, slug))
    .limit(1);
  return property ?? null;
}

export async function listPublicReviews(slug: string) {
  const property = await publishedPropertyBySlug(slug);
  if (!property) return null;
  const db = getDatabase();
  const rows = await db
    .select({
      id: propertyReviews.id,
      publicName: propertyReviews.publicName,
      rating: propertyReviews.rating,
      text: propertyReviews.reviewText,
      publishedAt: propertyReviews.publishedAt,
      responseText: developerReviewResponses.responseText,
      responseVisibility: developerReviewResponses.visibility,
    })
    .from(propertyReviews)
    .leftJoin(developerReviewResponses, eq(developerReviewResponses.reviewId, propertyReviews.id))
    .where(
      and(eq(propertyReviews.propertyId, property.id), eq(propertyReviews.visibility, "published")),
    )
    .orderBy(desc(propertyReviews.publishedAt), desc(propertyReviews.createdAt))
    .limit(100);
  const response = rows.map((row) => ({
    id: row.id,
    publicName: row.publicName,
    phoneVerified: true as const,
    rating: row.rating,
    text: row.text,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    developerResponse: row.responseVisibility === "published" ? (row.responseText ?? null) : null,
  }));
  assertConsumerPayloadSafe(response);
  return response;
}

export async function findOwnReview(profileId: string, slug: string) {
  const property = await publishedPropertyBySlug(slug);
  if (!property) return null;
  const db = getDatabase();
  const [review] = await db
    .select({
      id: propertyReviews.id,
      rating: propertyReviews.rating,
      text: propertyReviews.reviewText,
    })
    .from(propertyReviews)
    .where(
      and(
        eq(propertyReviews.propertyId, property.id),
        eq(propertyReviews.profileId, profileId),
        ne(propertyReviews.visibility, "deleted"),
      ),
    )
    .limit(1);
  if (!review) return null;
  assertConsumerPayloadSafe(review);
  return review;
}

async function refreshAggregate(
  tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  propertyId: string,
) {
  const [aggregate] = await tx
    .select({
      average: sql<string>`coalesce(avg(${propertyReviews.rating}), 0)::numeric(3,2)`,
      count: sql<number>`count(*)::integer`,
    })
    .from(propertyReviews)
    .where(
      and(eq(propertyReviews.propertyId, propertyId), eq(propertyReviews.visibility, "published")),
    );
  await tx
    .insert(propertyRatingAggregates)
    .values({
      propertyId,
      averageRating: aggregate.average,
      publishedReviewCount: aggregate.count,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: propertyRatingAggregates.propertyId,
      set: {
        averageRating: aggregate.average,
        publishedReviewCount: aggregate.count,
        updatedAt: new Date(),
      },
    });
}

export async function upsertOwnReview(
  profileId: string,
  input: { slug: string; rating: number; text?: string | null },
) {
  const property = await publishedPropertyBySlug(input.slug);
  if (!property) throw new Error("Property not found");
  const moderation = moderateUserText(input.text);
  if (!moderation.accepted) throw new Error(`Review blocked: ${moderation.codes.join(", ")}`);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    if (!profile) throw new Error("Profile not found");
    const publicName = profile.name?.trim().split(/\s+/)[0] || "Phone verified user";
    const [existing] = await tx
      .select({ id: propertyReviews.id })
      .from(propertyReviews)
      .where(
        and(
          eq(propertyReviews.propertyId, property.id),
          eq(propertyReviews.profileId, profileId),
          ne(propertyReviews.visibility, "deleted"),
        ),
      )
      .for("update")
      .limit(1);
    let reviewId: string;
    if (existing) {
      reviewId = existing.id;
      await tx
        .update(propertyReviews)
        .set({
          rating: input.rating,
          reviewText: input.text?.trim() || null,
          publicName,
          visibility: "published",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(propertyReviews.id, reviewId));
    } else {
      const [created] = await tx
        .insert(propertyReviews)
        .values({
          propertyId: property.id,
          profileId,
          publicName,
          rating: input.rating,
          reviewText: input.text?.trim() || null,
          visibility: "published",
          publishedAt: new Date(),
        })
        .returning({ id: propertyReviews.id });
      reviewId = created.id;
    }
    const [latest] = await tx
      .select({ version: propertyReviewVersions.version })
      .from(propertyReviewVersions)
      .where(eq(propertyReviewVersions.reviewId, reviewId))
      .orderBy(desc(propertyReviewVersions.version))
      .limit(1);
    await tx.insert(propertyReviewVersions).values({
      reviewId,
      version: (latest?.version ?? 0) + 1,
      rating: input.rating,
      reviewText: input.text?.trim() || null,
      moderationResult: moderation,
    });
    await refreshAggregate(tx, property.id);
    return { id: reviewId, visibility: "published" as const };
  });
}

export async function deleteOwnReview(profileId: string, reviewId: string) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [review] = await tx
      .select({ id: propertyReviews.id, propertyId: propertyReviews.propertyId })
      .from(propertyReviews)
      .where(and(eq(propertyReviews.id, reviewId), eq(propertyReviews.profileId, profileId)))
      .for("update")
      .limit(1);
    if (!review) throw new Error("Review not found");
    await tx
      .update(propertyReviews)
      .set({ visibility: "deleted", updatedAt: new Date() })
      .where(eq(propertyReviews.id, review.id));
    await refreshAggregate(tx, review.propertyId);
    return { deleted: true as const };
  });
}

export async function reportReview(profileId: string, reviewId: string, reasonCode: string) {
  const db = getDatabase();
  await db
    .insert(reviewReports)
    .values({ reviewId, reporterProfileId: profileId, reasonCode })
    .onConflictDoNothing();
  return { reported: true as const };
}

export async function createEnquiry(
  profileId: string,
  input: { slug: string; configurationVariantId?: string | null; message?: string | null },
) {
  const property = await publishedPropertyBySlug(input.slug);
  if (!property?.developerId || !property.publicationId) throw new Error("Enquiry unavailable");
  const moderation = moderateUserText(input.message);
  if (!moderation.accepted) throw new Error(`Message blocked: ${moderation.codes.join(", ")}`);
  const db = getDatabase();
  if (input.configurationVariantId) {
    const [variant] = await db
      .select({ id: configurationVariants.id })
      .from(configurationVariants)
      .where(
        and(
          eq(configurationVariants.id, input.configurationVariantId),
          eq(configurationVariants.publicationVersionId, property.publicationId),
        ),
      )
      .limit(1);
    if (!variant) throw new Error("Invalid configuration");
  }
  const [profile] = await db
    .select({ name: profiles.name, phone: profiles.phone })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) throw new Error("Profile not found");
  const normalizedMessage = input.message?.trim() || "";
  const deduplicationHash = createHash("sha256")
    .update(
      [profileId, property.id, input.configurationVariantId ?? "", normalizedMessage].join("|"),
    )
    .digest("hex");
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [duplicate] = await db
    .select({ id: propertyEnquiries.id })
    .from(propertyEnquiries)
    .where(
      and(
        eq(propertyEnquiries.profileId, profileId),
        eq(propertyEnquiries.deduplicationHash, deduplicationHash),
        gt(propertyEnquiries.createdAt, cutoff),
      ),
    )
    .limit(1);
  if (duplicate) return { id: duplicate.id, duplicate: true as const };
  const [created] = await db
    .insert(propertyEnquiries)
    .values({
      propertyId: property.id,
      configurationVariantId: input.configurationVariantId || null,
      profileId,
      developerId: property.developerId,
      contactName: profile.name?.trim() || "Phone verified user",
      contactPhone: profile.phone,
      message: normalizedMessage || null,
      consentedAt: new Date(),
      consentTextVersion: CONSENT_VERSION,
      deduplicationHash,
    })
    .returning({ id: propertyEnquiries.id });
  return { id: created.id, duplicate: false as const };
}

export async function listDeveloperEnquiries(developerId: string) {
  const db = getDatabase();
  return db
    .select({
      id: propertyEnquiries.id,
      propertyName: properties.name,
      contactName: propertyEnquiries.contactName,
      contactPhone: propertyEnquiries.contactPhone,
      message: propertyEnquiries.message,
      status: propertyEnquiries.status,
      createdAt: propertyEnquiries.createdAt,
    })
    .from(propertyEnquiries)
    .innerJoin(properties, eq(properties.id, propertyEnquiries.propertyId))
    .where(eq(propertyEnquiries.developerId, developerId))
    .orderBy(desc(propertyEnquiries.createdAt))
    .limit(100);
}

export async function listDeveloperReviews(developerId: string) {
  const db = getDatabase();
  return db
    .select({
      id: propertyReviews.id,
      propertyName: properties.name,
      publicName: propertyReviews.publicName,
      rating: propertyReviews.rating,
      reviewText: propertyReviews.reviewText,
      responseText: developerReviewResponses.responseText,
      publishedAt: propertyReviews.publishedAt,
    })
    .from(propertyReviews)
    .innerJoin(properties, eq(properties.id, propertyReviews.propertyId))
    .leftJoin(developerReviewResponses, eq(developerReviewResponses.reviewId, propertyReviews.id))
    .where(and(eq(properties.createdBy, developerId), eq(propertyReviews.visibility, "published")))
    .orderBy(desc(propertyReviews.publishedAt))
    .limit(100);
}

export async function updateDeveloperEnquiryStatus(
  developerId: string,
  enquiryId: string,
  status: "new" | "viewed" | "contacted" | "closed",
) {
  const db = getDatabase();
  const [updated] = await db
    .update(propertyEnquiries)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(propertyEnquiries.id, enquiryId), eq(propertyEnquiries.developerId, developerId)))
    .returning({ id: propertyEnquiries.id });
  if (!updated) throw new Error("Enquiry not found");
  return updated;
}

export async function upsertDeveloperResponse(
  developerId: string,
  reviewId: string,
  responseText: string,
) {
  const moderation = moderateUserText(responseText);
  if (!moderation.accepted) throw new Error(`Response blocked: ${moderation.codes.join(", ")}`);
  const db = getDatabase();
  const [owned] = await db
    .select({ id: propertyReviews.id })
    .from(propertyReviews)
    .innerJoin(properties, eq(properties.id, propertyReviews.propertyId))
    .where(and(eq(propertyReviews.id, reviewId), eq(properties.createdBy, developerId)))
    .limit(1);
  if (!owned) throw new Error("Review not found");
  await db
    .insert(developerReviewResponses)
    .values({ reviewId, developerId, responseText: responseText.trim(), visibility: "published" })
    .onConflictDoUpdate({
      target: developerReviewResponses.reviewId,
      set: { responseText: responseText.trim(), visibility: "published", updatedAt: new Date() },
    });
  return { published: true as const };
}

export async function listModerationQueue() {
  const db = getDatabase();
  return db
    .select({
      reportId: reviewReports.id,
      reviewId: propertyReviews.id,
      propertyName: properties.name,
      publicName: propertyReviews.publicName,
      rating: propertyReviews.rating,
      reviewText: propertyReviews.reviewText,
      visibility: propertyReviews.visibility,
      reasonCode: reviewReports.reasonCode,
      reportStatus: reviewReports.status,
      reportedAt: reviewReports.createdAt,
    })
    .from(reviewReports)
    .innerJoin(propertyReviews, eq(propertyReviews.id, reviewReports.reviewId))
    .innerJoin(properties, eq(properties.id, propertyReviews.propertyId))
    .where(eq(reviewReports.status, "open"))
    .orderBy(desc(reviewReports.createdAt))
    .limit(100);
}

export async function adjudicateReview(
  actorId: string,
  input: { reviewId: string; action: "hide" | "restore"; reason: string },
) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [review] = await tx
      .select({ propertyId: propertyReviews.propertyId, visibility: propertyReviews.visibility })
      .from(propertyReviews)
      .where(eq(propertyReviews.id, input.reviewId))
      .for("update")
      .limit(1);
    if (!review) throw new Error("Review not found");
    const visibility = input.action === "hide" ? "hidden" : "published";
    await tx
      .update(propertyReviews)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(propertyReviews.id, input.reviewId));
    await tx
      .update(reviewReports)
      .set({
        status: input.action === "hide" ? "actioned" : "dismissed",
        adjudicatedBy: actorId,
        adjudicationReason: input.reason,
      })
      .where(and(eq(reviewReports.reviewId, input.reviewId), eq(reviewReports.status, "open")));
    await tx.insert(auditEvents).values({
      actorType: "staff",
      actorId,
      action: `review.${input.action}`,
      entityType: "property_review",
      entityId: input.reviewId,
      reason: input.reason,
      metadata: { beforeVisibility: review.visibility, afterVisibility: visibility },
    });
    await refreshAggregate(tx, review.propertyId);
    return { visibility };
  });
}
