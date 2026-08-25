import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { customerActivity } from "@/db/schema";

export interface RecordActivityInput {
  profileId: string | null;
  sessionKey?: string | null;
  eventType: string;
  propertySlug?: string | null;
  metadata: Record<string, unknown>;
}

export async function recordActivity(input: RecordActivityInput) {
  await getDatabase()
    .insert(customerActivity)
    .values({
      profileId: input.profileId,
      sessionKey: input.sessionKey ?? null,
      eventType: input.eventType,
      propertySlug: input.propertySlug ?? null,
      metadata: input.metadata,
    });
}

export interface ActivityRow {
  id: string;
  eventType: string;
  propertySlug: string | null;
  createdAt: Date;
}

/** Bounded timeline for one customer's admin-panel detail drawer. */
export async function getActivityForProfile(
  profileId: string,
  limit = 500,
): Promise<ActivityRow[]> {
  return getDatabase()
    .select({
      id: customerActivity.id,
      eventType: customerActivity.eventType,
      propertySlug: customerActivity.propertySlug,
      createdAt: customerActivity.createdAt,
    })
    .from(customerActivity)
    .where(eq(customerActivity.profileId, profileId))
    .orderBy(desc(customerActivity.createdAt))
    .limit(limit);
}

export interface ActivitySummary {
  profileId: string;
  activityCount: number;
  lastActiveAt: Date;
}

/** Per-profile count + last-active, for the owner customer list. Replaces
 * the customer_activity_summary view — cheap enough to aggregate directly. */
export async function getActivitySummaries(): Promise<ActivitySummary[]> {
  const rows = await getDatabase()
    .select({
      profileId: customerActivity.profileId,
      activityCount: sql<number>`count(*)::int`,
      lastActiveAt: sql<Date>`max(${customerActivity.createdAt})`,
    })
    .from(customerActivity)
    .where(sql`${customerActivity.profileId} is not null`)
    .groupBy(customerActivity.profileId);
  return rows.map((row) => ({
    profileId: row.profileId as string,
    activityCount: Number(row.activityCount),
    lastActiveAt: row.lastActiveAt,
  }));
}

export async function countActivity(): Promise<number> {
  const [row] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(customerActivity);
  return Number(row?.count ?? 0);
}

export async function countAnonymousActivity(): Promise<number> {
  const [row] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(customerActivity)
    .where(isNull(customerActivity.profileId));
  return Number(row?.count ?? 0);
}

export interface BehaviourEventRow {
  eventType: string;
  profileId: string | null;
  sessionKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** Raw compare/feedback events for the local (non-BigQuery) developer
 * intelligence aggregation path. */
export async function getBehaviourEvents(
  eventTypes: string[],
  from: Date,
  to: Date,
): Promise<BehaviourEventRow[]> {
  return getDatabase()
    .select({
      eventType: customerActivity.eventType,
      profileId: customerActivity.profileId,
      sessionKey: customerActivity.sessionKey,
      metadata: customerActivity.metadata,
      createdAt: customerActivity.createdAt,
    })
    .from(customerActivity)
    .where(
      and(
        inArray(customerActivity.eventType, eventTypes),
        gte(customerActivity.createdAt, from),
        lt(customerActivity.createdAt, to),
      ),
    );
}
