import { desc, eq, isNotNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { profiles } from "@/db/schema";

export interface ProfileRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  profession: string | null;
  businessName: string | null;
  quizAnswers: Record<string, unknown> | null;
  createdAt: Date;
}

const SELECT_COLUMNS = {
  id: profiles.id,
  phone: profiles.phone,
  name: profiles.name,
  email: profiles.email,
  profession: profiles.profession,
  businessName: profiles.businessName,
  quizAnswers: profiles.quizAnswers,
  createdAt: profiles.createdAt,
} as const;

export async function getProfileById(id: string): Promise<ProfileRow | null> {
  const [row] = await getDatabase()
    .select(SELECT_COLUMNS)
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  return (row as ProfileRow | undefined) ?? null;
}

/** Phone is a unique column, but this returns an array (0 or 1 rows) rather
 * than assuming that at the call site — matches how the equivalent email
 * lookup below has to behave, since email is only conditionally unique. */
export async function findProfilesByPhone(phone: string): Promise<ProfileRow[]> {
  const rows = await getDatabase()
    .select(SELECT_COLUMNS)
    .from(profiles)
    .where(eq(profiles.phone, phone));
  return rows as ProfileRow[];
}

export async function findProfilesByEmail(email: string): Promise<ProfileRow[]> {
  const rows = await getDatabase()
    .select(SELECT_COLUMNS)
    .from(profiles)
    .where(eq(profiles.email, email));
  return rows as ProfileRow[];
}

export interface UpsertProfileByPhoneInput {
  phone: string;
  name: string;
  email: string;
  profession: string;
  businessName: string | null;
}

export async function upsertProfileByPhone(input: UpsertProfileByPhoneInput): Promise<ProfileRow> {
  const [row] = await getDatabase()
    .insert(profiles)
    .values(input)
    .onConflictDoUpdate({
      target: profiles.phone,
      set: {
        name: input.name,
        email: input.email,
        profession: input.profession,
        businessName: input.businessName,
      },
    })
    .returning(SELECT_COLUMNS);
  return row as ProfileRow;
}

export interface InsertProfileInput {
  phone: string;
  name: string;
  email: string | null;
  profession: string | null;
}

export async function insertProfile(input: InsertProfileInput): Promise<ProfileRow> {
  const [row] = await getDatabase().insert(profiles).values(input).returning(SELECT_COLUMNS);
  return row as ProfileRow;
}

export async function updateQuizAnswers(
  id: string,
  answers: Record<string, unknown> | null,
): Promise<void> {
  await getDatabase().update(profiles).set({ quizAnswers: answers }).where(eq(profiles.id, id));
}

export interface UpdateProfileInput {
  name: string;
  email: string | null;
  profession: string;
  businessName: string | null;
}

export async function updateProfile(
  id: string,
  input: UpdateProfileInput,
): Promise<ProfileRow | null> {
  const [row] = await getDatabase()
    .update(profiles)
    .set(input)
    .where(eq(profiles.id, id))
    .returning(SELECT_COLUMNS);
  return (row as ProfileRow | undefined) ?? null;
}

export async function getAnalyticsOptOut(id: string): Promise<boolean | null> {
  const [row] = await getDatabase()
    .select({ analyticsOptOut: profiles.analyticsOptOut })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  return row ? row.analyticsOptOut : null;
}

/** Owner-only admin customer list: every signed-up profile, newest first. */
export async function listAllProfiles(): Promise<ProfileRow[]> {
  return getDatabase()
    .select(SELECT_COLUMNS)
    .from(profiles)
    .orderBy(desc(profiles.createdAt)) as Promise<ProfileRow[]>;
}

export async function countProfiles(): Promise<number> {
  const [row] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles);
  return Number(row?.count ?? 0);
}

export async function countProfilesWithQuiz(): Promise<number> {
  const [row] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(isNotNull(profiles.quizAnswers));
  return Number(row?.count ?? 0);
}
