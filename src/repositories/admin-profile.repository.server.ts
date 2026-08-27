import { and, desc, eq } from "drizzle-orm";

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

/** Creates the developer's local authorization profile after its matching
 * better-auth user/account pair has been created with the same id. */
export async function insertDeveloperProfile(input: {
  id: string;
  email: string;
  fullName: string | null;
  createdBy: string;
}): Promise<void> {
  await getDatabase().insert(adminProfiles).values({
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
