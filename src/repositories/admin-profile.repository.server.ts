import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { adminProfiles } from "@/db/schema";

export interface AdminProfileRow {
  id: string;
  role: string;
  email: string;
  isActive: boolean;
}

/** Role lookup for the admin-auth middleware. Token verification (who this
 * request is) stays on Supabase Auth until the auth rebuild; this only
 * answers what that verified id is allowed to do. */
export async function getAdminProfileById(id: string): Promise<AdminProfileRow | null> {
  const [row] = await getDatabase()
    .select({
      id: adminProfiles.id,
      role: adminProfiles.role,
      email: adminProfiles.email,
      isActive: adminProfiles.isActive,
    })
    .from(adminProfiles)
    .where(eq(adminProfiles.id, id))
    .limit(1);
  return row ?? null;
}
