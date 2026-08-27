/**
 * Phase D step 6: re-enroll every existing staff/developer account into
 * better-auth. Supabase's password hashes and TOTP secrets are not
 * recoverable, so this issues each account a fresh temporary password —
 * there is no way to carry the old one over. Every affected person needs
 * their new password handed to them out of band, and must re-enroll MFA
 * from scratch on next sign-in (STAFF_MFA_ENFORCE already forces that for
 * any account with twoFactorEnabled: false).
 *
 * DO NOT RUN THIS AGAINST PRODUCTION UNATTENDED. Every account this touches
 * loses its current password immediately. Run it only with the owner live,
 * ready to redistribute new passwords right away — see PROGRESS.md Phase D
 * and the standing rule recorded for this migration.
 *
 * Idempotent in the sense that re-running only touches accounts that still
 * have no better-auth "user" row — an account already migrated is left
 * alone (use admin.developers.tsx's "Reset MFA" for a targeted re-enroll
 * instead of this script). Dry run by default.
 *
 *   bun scripts/reenroll-staff-accounts.ts           # dry run, prints the plan
 *   bun scripts/reenroll-staff-accounts.ts --apply   # writes to $DATABASE_URL
 */
import { getDatabase } from "@/db/client.server";
import { adminProfiles, user as userTable } from "@/db/schema";
import { createStaffCredential } from "@/repositories/auth-credential.repository.server";

const APPLY = process.argv.includes("--apply");

function randomTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Buffer.from(bytes).toString("base64url");
}

async function main() {
  const db = getDatabase();

  const staff = await db
    .select({
      id: adminProfiles.id,
      email: adminProfiles.email,
      fullName: adminProfiles.fullName,
      role: adminProfiles.role,
      isActive: adminProfiles.isActive,
    })
    .from(adminProfiles);

  const existingUserIds = await db.select({ id: userTable.id }).from(userTable);
  const migratedIds = new Set(existingUserIds.map((r) => r.id));
  const pending = staff.filter((s) => !migratedIds.has(s.id));

  if (pending.length === 0) {
    console.log("Every admin_profiles account already has a better-auth login. Nothing to do.");
    return;
  }

  console.log(`${pending.length} account(s) need re-enrollment:`);
  const issued: { email: string; role: string; password: string }[] = [];
  for (const s of pending) {
    const password = randomTempPassword();
    console.log(`  ${s.email} (${s.role}${s.isActive ? "" : ", inactive"})`);
    if (APPLY) {
      await createStaffCredential({
        id: s.id,
        email: s.email,
        fullName: s.fullName,
        password,
      });
      issued.push({ email: s.email, role: s.role, password });
    }
  }

  if (!APPLY) {
    console.log("\nDry run — no changes made. Re-run with --apply to issue new passwords.");
    return;
  }

  console.log("\nNew temporary passwords — hand these to each person now, then clear this output:");
  for (const row of issued) {
    console.log(`  ${row.email}\t${row.password}`);
  }
  console.log(
    "\nEach account must sign in with its new password and will be prompted to set up MFA again.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
