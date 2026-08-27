import { and, desc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { adminProfiles } from "@/db/schema";

export interface AdminProfileRow {
  id: string;
  role: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
}

export interface DeveloperProfileRow {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: Date;
}

/** Role lookup for the admin-auth middleware. Session verification (who this
 * request is) is better-auth's job; this only answers what that verified id
 * is allowed to do. */
export async function getAdminProfileById(id: string): Promise<AdminProfileRow | null> {
  const [row] = await getDatabase()
    .select({
      id: adminProfiles.id,
      role: adminProfiles.role,
      email: adminProfiles.email,
      fullName: adminProfiles.fullName,
      isActive: adminProfiles.isActive,
    })
    .from(adminProfiles)
    .where(eq(adminProfiles.id, id))
    .limit(1);
  return row ?? null;
}

export async function listDeveloperProfiles(): Promise<DeveloperProfileRow[]> {
  return getDatabase()
    .select({
      id: adminProfiles.id,
      email: adminProfiles.email,
      fullName: adminProfiles.fullName,
      isActive: adminProfiles.isActive,
      createdAt: adminProfiles.createdAt,
    })
    .from(adminProfiles)
    .where(eq(adminProfiles.role, "developer"))
    .orderBy(desc(adminProfiles.createdAt));
}

/** Creates the developer's admin_profiles row. `id` must already exist as a
 * Supabase Auth user (login/JWT verification stays there until the auth
 * rebuild) — this also seeds the local auth.users shim admin_profiles has an
 * FK onto (see ops/db/bootstrap.sql), same as load-brochures.ts's
 * ensureAccounts(). */
export async function insertDeveloperProfile(input: {
  id: string;
  email: string;
  fullName: string | null;
  createdBy: string;
}): Promise<void> {
  const db = getDatabase();
  await db.execute(
    sql`insert into auth.users (id, email) values (${input.id}, ${input.email})
        on conflict (id) do update set email = excluded.email`,
  );
  await db.insert(adminProfiles).values({
    id: input.id,
    role: "developer",
    email: input.email,
    fullName: input.fullName,
    isActive: true,
    createdBy: input.createdBy,
  });
}

export async function setDeveloperActive(id: string, isActive: boolean): Promise<void> {
  await getDatabase()
    .update(adminProfiles)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(adminProfiles.id, id), eq(adminProfiles.role, "developer")));
}
