/**
 * One-time: create the owner admin account (Supabase Auth user + admin_profiles row).
 * Idempotent — re-running updates the password and re-asserts the owner profile.
 *
 *   bun scripts/seed-owner.ts <email> <password>
 *   bun scripts/seed-owner.ts <password>            # email defaults to the owner address
 */
import { createClient } from "@supabase/supabase-js";

const DEFAULT_EMAIL = "pikorua.luxury.properties@gmail.com";

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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (.env).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(target: string): Promise<string | null> {
  // Paginate through auth users to find an existing account with this email.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  console.log(`Seeding owner account for ${email} …`);

  let userId = await findUserByEmail(email);
  if (userId) {
    console.log(`  Auth user already exists (${userId}); updating password.`);
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`  Created auth user ${userId}.`);
  }

  const { error: profileError } = await supabase.from("admin_profiles").upsert(
    {
      id: userId,
      role: "owner",
      email,
      full_name: "Pikorua Owner",
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  console.log("Done. Owner can now sign in at /admin/login.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
