import { and, eq, inArray } from "drizzle-orm";

import { assertConsumerPayloadSafe } from "@/contracts/consumer";
import { getDatabase } from "@/db/client.server";
import { properties, propertyPublicationVersions, savedLocations } from "@/db/schema";

export async function listSavedLocations(profileId: string) {
  return getDatabase()
    .select({
      id: savedLocations.id,
      label: savedLocations.label,
      placeId: savedLocations.googlePlaceId,
    })
    .from(savedLocations)
    .where(eq(savedLocations.profileId, profileId))
    .limit(20);
}

export async function saveLocation(profileId: string, label: string, placeId: string) {
  const [saved] = await getDatabase()
    .insert(savedLocations)
    .values({ profileId, label, googlePlaceId: placeId, placeIdRefreshedAt: new Date() })
    .onConflictDoUpdate({
      target: [savedLocations.profileId, savedLocations.googlePlaceId],
      set: { label, placeIdRefreshedAt: new Date(), updatedAt: new Date() },
    })
    .returning({
      id: savedLocations.id,
      label: savedLocations.label,
      placeId: savedLocations.googlePlaceId,
    });
  return saved;
}

export async function deleteLocation(profileId: string, id: string) {
  await getDatabase()
    .delete(savedLocations)
    .where(and(eq(savedLocations.id, id), eq(savedLocations.profileId, profileId)));
  return { deleted: true as const };
}

export async function propertyAddressInputs(slugs: string[]) {
  const rows = await getDatabase()
    .select({ slug: properties.slug, snapshot: propertyPublicationVersions.publicSnapshot })
    .from(properties)
    .innerJoin(
      propertyPublicationVersions,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .where(inArray(properties.slug, slugs));
  const response = rows.map((row) => {
    const snapshot = row.snapshot as Record<string, unknown>;
    return {
      slug: row.slug,
      address: [snapshot.addressLine, snapshot.locality, snapshot.cityName]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(", "),
    };
  });
  assertConsumerPayloadSafe(response);
  return response;
}
