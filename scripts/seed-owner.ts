/**
 * One-time: create the owner admin account (better-auth login + admin_profiles row).
 * Idempotent — re-running updates the password and re-asserts the owner profile.
 *
 *   bun scripts/seed-owner.ts <email> <password>
 *   bun scripts/seed-owner.ts <password>            # email defaults to the owner address
 */
import { eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { adminProfiles } from "@/db/schema";
import { createStaffCredential } from "@/repositories/auth-credential.repository.server";

const DEFAULT_EMAIL = "pikorua.luxury.properties@gmail.com";
const OWNER_NAME = "PropCompare Owner";

const args = process.argv.slice(2);
let email: string;
let password: string;
if (args.length >= 2) {
  [email, password] = args;
} else if (args.length === 1) {
  email = DEFAULT_EMAIL;
  password = args[0];
} else {
  console.error("Usage: bun scripts/seed-owner.ts <email?> <password>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

async function main() {
  console.log(`Seeding owner account for ${email} …`);
  const db = getDatabase();

  const [existing] = await db
    .select({ id: adminProfiles.id })
    .from(adminProfiles)
    .where(eq(adminProfiles.email, email))
    .limit(1);
  const id = existing?.id ?? crypto.randomUUID();

  await createStaffCredential({ id, email, fullName: OWNER_NAME, password });

  // admin_profiles.id still FKs onto the auth.users shim (ops/db/bootstrap.sql)
  // until a later migration repoints it at better-auth's "user" table — see
  // supabase/migrations/20260827140000_admin_profiles_fk_to_better_auth.sql.
  await db.execute(
    sql`insert into auth.users (id, email) values (${id}, ${email})
        on conflict (id) do update set email = excluded.email`,
  );

  await db
    .insert(adminProfiles)
    .values({ id, role: "owner", email, fullName: OWNER_NAME, isActive: true })
    .onConflictDoUpdate({
      target: adminProfiles.id,
      set: { role: "owner", email, fullName: OWNER_NAME, isActive: true, updatedAt: new Date() },
    });

  console.log(
    existing ? `  Updated existing owner account (${id}).` : `  Created owner account (${id}).`,
  );
  console.log("Done. Owner can now sign in at /admin/login.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
