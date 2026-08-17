import { eq, sql } from "drizzle-orm";

import { assertConsumerPayloadSafe } from "@/contracts/consumer";
import { getDatabase } from "@/db/client.server";
import { auditEvents, profiles } from "@/db/schema";

export async function setAnalyticsOptOut(profileId: string, optedOut: boolean) {
  const db = getDatabase();
  const [updated] = await db
    .update(profiles)
    .set({ analyticsOptOut: optedOut })
    .where(eq(profiles.id, profileId))
    .returning({ analyticsOptOut: profiles.analyticsOptOut });
  if (!updated) throw new Error("Profile not found");
  if (optedOut) {
    await db.execute(sql`delete from public.customer_activity where profile_id = ${profileId}`);
  }
  assertConsumerPayloadSafe(updated);
  return updated;
}

export async function getPrivacyPreferences(profileId: string) {
  const [profile] = await getDatabase()
    .select({ analyticsOptOut: profiles.analyticsOptOut })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) throw new Error("Profile not found");
  assertConsumerPayloadSafe(profile);
  return profile;
}

export async function deleteConsumerAccount(profileId: string) {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update public.property_reviews
      set profile_id = null, public_name = 'Former user', updated_at = now()
      where profile_id = ${profileId}
    `);
    await tx.execute(sql`
      update public.property_enquiries
      set profile_id = null,
          contact_name = null,
          contact_phone = null,
          anonymized_at = now(),
          updated_at = now()
      where profile_id = ${profileId}
    `);
    await tx.execute(sql`delete from public.customer_activity where profile_id = ${profileId}`);
    await tx.execute(sql`delete from public.profiles where id = ${profileId}`);
    await tx.insert(auditEvents).values({
      actorType: "system",
      action: "consumer.account_deleted",
      entityType: "consumer_account",
      reason: "User-requested account deletion",
      metadata: { personalDataRemoved: true },
    });
  });
  return { deleted: true as const };
}
