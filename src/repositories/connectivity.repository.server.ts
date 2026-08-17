import { and, desc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import {
  auditEvents,
  marketLandmarks,
  properties,
  propertyConnectivitySnapshots,
  propertyPublicationVersions,
  propertyVerifiedLocations,
} from "@/db/schema";

export const LANDMARK_CATEGORIES = [
  "airport",
  "transit",
  "business_district",
  "hospital",
  "school",
  "shopping",
  "highway_access",
] as const;

export type LandmarkCategory = (typeof LANDMARK_CATEGORIES)[number];

export async function saveMarketLandmark(
  input: {
    marketId: string;
    category: LandmarkCategory;
    displayName: string;
    googlePlaceId: string;
    sortOrder: number;
  },
  reviewerId: string,
) {
  return getDatabase().transaction(async (tx) => {
    const [landmark] = await tx
      .insert(marketLandmarks)
      .values({
        ...input,
        verifiedBy: reviewerId,
        verifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [marketLandmarks.marketId, marketLandmarks.googlePlaceId],
        set: {
          category: input.category,
          displayName: input.displayName,
          sortOrder: input.sortOrder,
          isActive: true,
          verifiedBy: reviewerId,
          verifiedAt: new Date(),
        },
      })
      .returning({ id: marketLandmarks.id });
    if (!landmark) throw new Error("Could not save market landmark");
    await tx.insert(auditEvents).values({
      actorType: "staff",
      actorId: reviewerId,
      action: "market_landmark_saved",
      entityType: "market_landmark",
      entityId: landmark.id,
      metadata: { marketId: input.marketId, category: input.category },
    });
    return landmark;
  });
}

export async function listMarketLandmarks(marketId: string) {
  return getDatabase()
    .select()
    .from(marketLandmarks)
    .where(eq(marketLandmarks.marketId, marketId))
    .orderBy(marketLandmarks.sortOrder, marketLandmarks.displayName);
}

export async function verifyPropertyLocation(
  input: {
    publicationVersionId: string;
    googlePlaceId: string;
    latitude: number;
    longitude: number;
  },
  reviewerId: string,
) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [publication] = await tx
      .select({
        id: propertyPublicationVersions.id,
        currentId: properties.currentPublicationVersionId,
      })
      .from(propertyPublicationVersions)
      .innerJoin(properties, eq(propertyPublicationVersions.propertyId, properties.id))
      .where(eq(propertyPublicationVersions.id, input.publicationVersionId))
      .limit(1);
    if (!publication || publication.id !== publication.currentId) {
      throw new Error("Location verification requires the current publication");
    }
    const [previous] = await tx
      .select({ id: propertyVerifiedLocations.id, revision: propertyVerifiedLocations.revision })
      .from(propertyVerifiedLocations)
      .where(eq(propertyVerifiedLocations.publicationVersionId, input.publicationVersionId))
      .orderBy(desc(propertyVerifiedLocations.revision))
      .limit(1);
    const [location] = await tx
      .insert(propertyVerifiedLocations)
      .values({
        publicationVersionId: input.publicationVersionId,
        revision: (previous?.revision ?? 0) + 1,
        googlePlaceId: input.googlePlaceId,
        latitude: input.latitude,
        longitude: input.longitude,
        verifiedBy: reviewerId,
        verifiedAt: new Date(),
        supersedesId: previous?.id ?? null,
      })
      .returning({
        id: propertyVerifiedLocations.id,
        revision: propertyVerifiedLocations.revision,
      });
    if (!location) throw new Error("Could not verify property location");
    await tx.insert(auditEvents).values({
      actorType: "staff",
      actorId: reviewerId,
      action: previous ? "property_location_superseded" : "property_location_verified",
      entityType: "property_verified_location",
      entityId: location.id,
      metadata: { publicationVersionId: input.publicationVersionId, revision: location.revision },
    });
    return location;
  });
}

export async function refreshConnectivitySnapshots(
  publicationVersionId: string,
  reviewerId: string,
) {
  const db = getDatabase();
  const [publication] = await db
    .select({ marketId: propertyPublicationVersions.marketId })
    .from(propertyPublicationVersions)
    .where(eq(propertyPublicationVersions.id, publicationVersionId))
    .limit(1);
  const [location] = await db
    .select()
    .from(propertyVerifiedLocations)
    .where(eq(propertyVerifiedLocations.publicationVersionId, publicationVersionId))
    .orderBy(desc(propertyVerifiedLocations.revision))
    .limit(1);
  if (!publication || !location) throw new Error("Verify the property location first");
  const landmarks = await db
    .select()
    .from(marketLandmarks)
    .where(
      and(eq(marketLandmarks.marketId, publication.marketId), eq(marketLandmarks.isActive, true)),
    )
    .orderBy(marketLandmarks.sortOrder, marketLandmarks.displayName);
  const { calculateDrivingRoute } = await import("@/server/connectivity.server");
  const results: Array<{
    landmarkId: string;
    status: "available" | "unavailable";
    distanceMeters: number | null;
    durationSeconds: number | null;
  }> = [];
  for (const landmark of landmarks) {
    const route = await calculateDrivingRoute(location.googlePlaceId, landmark.googlePlaceId);
    const status = route ? "available" : "unavailable";
    results.push({
      landmarkId: landmark.id,
      status,
      distanceMeters: route?.distanceMeters ?? null,
      durationSeconds: route?.durationSeconds ?? null,
    });
  }
  await db.transaction(async (tx) => {
    for (const result of results) {
      const [previous] = await tx
        .select({ revision: propertyConnectivitySnapshots.revision })
        .from(propertyConnectivitySnapshots)
        .where(
          and(
            eq(propertyConnectivitySnapshots.verifiedLocationId, location.id),
            eq(propertyConnectivitySnapshots.landmarkId, result.landmarkId),
          ),
        )
        .orderBy(desc(propertyConnectivitySnapshots.revision))
        .limit(1);
      await tx.insert(propertyConnectivitySnapshots).values({
        verifiedLocationId: location.id,
        landmarkId: result.landmarkId,
        revision: (previous?.revision ?? 0) + 1,
        status: result.status,
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
        calculatedBy: reviewerId,
        calculatedAt: new Date(),
      });
    }
    await tx.insert(auditEvents).values({
      actorType: "staff",
      actorId: reviewerId,
      action: "connectivity_snapshots_refreshed",
      entityType: "property_publication_version",
      entityId: publicationVersionId,
      metadata: {
        available: results.filter((item) => item.status === "available").length,
        unavailable: results.filter((item) => item.status === "unavailable").length,
      },
    });
  });
  return results.map(({ landmarkId, status }) => ({ landmarkId, status }));
}
