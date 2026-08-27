import { hashPassword } from "better-auth/crypto";

import { getDatabase } from "@/db/client.server";
import { account, user } from "@/db/schema";

// "local:credential" is better-auth's synthetic issuer for the built-in
// email/password provider — verified against createLocalAccountIssuer("credential")
// in node_modules/@better-auth/core/dist/db/schema/account.mjs this session.
// Hardcoded rather than imported: @better-auth/core is better-auth's internal
// dependency, not one of this repo's own, and the value is a stable, documented
// provider id ("credential") under a fixed "local:" prefix.
const CREDENTIAL_ISSUER = "local:credential";

/** Inserts a better-auth `user` + `account` (password) row pair with an
 * explicit, caller-supplied id — bypassing better-auth's own signup API so
 * the new user's id can be made to equal an existing (or freshly minted)
 * admin_profiles.id by construction. Used by both developer creation
 * (admin-developers.functions.ts) and staff re-enrollment
 * (scripts/reenroll-staff-accounts.ts). The password hash is produced by
 * better-auth's own hasher so its sign-in path can verify it directly. */
export async function createStaffCredential(input: {
  id: string;
  email: string;
  fullName: string | null;
  password: string;
}): Promise<void> {
  const passwordHash = await hashPassword(input.password);
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx
      .insert(user)
      .values({
        id: input.id,
        name: input.fullName ?? input.email,
        email: input.email,
        emailVerified: true,
        twoFactorEnabled: false,
      })
      .onConflictDoUpdate({
        target: user.id,
        set: { name: input.fullName ?? input.email, email: input.email },
      });
    await tx
      .insert(account)
      .values({
        id: crypto.randomUUID(),
        userId: input.id,
        providerId: "credential",
        issuer: CREDENTIAL_ISSUER,
        accountId: input.id,
        password: passwordHash,
      })
      .onConflictDoUpdate({
        target: [account.issuer, account.accountId],
        set: { password: passwordHash },
      });
  });
}
