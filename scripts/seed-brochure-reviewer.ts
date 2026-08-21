/**
 * One-time: create a developer account dedicated to reviewing the brochure
 * jobs already sitting in property-ocr-suite/backend/storage/jobs/*.json
 * (extracted locally already — this only touches Supabase, never calls the
 * OCR service, so it costs nothing), and assign every one of those jobs to
 * it in brochure_jobs so the resume-by-job-id flow can fetch them.
 *
 * Idempotent — re-running updates the password and re-assigns any job ids
 * found on disk right now.
 *
 *   bun scripts/seed-brochure-reviewer.ts
 */
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const EMAIL = "brochure-reviewer@pikorua.dev";
const JOBS_DIR = join(
  import.meta.dirname,
  "..",
  "property-ocr-suite",
  "backend",
  "storage",
  "jobs",
);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (.env).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

async function findUserByEmail(target: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

function jobIdsOnDisk(): string[] {
  return readdirSync(JOBS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));
}

async function main() {
  const password = generatePassword();
  console.log(`Seeding brochure-reviewer account for ${EMAIL} …`);

  let userId = await findUserByEmail(EMAIL);
  if (userId) {
    console.log(`  Auth user already exists (${userId}); updating password.`);
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
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
      role: "developer",
      email: EMAIL,
      full_name: "Brochure Reviewer",
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  const jobIds = jobIdsOnDisk();
  console.log(`  Found ${jobIds.length} extracted job(s) on disk.`);

  const rows = jobIds.map((job_id) => ({ job_id, admin_profile_id: userId }));
  if (rows.length > 0) {
    const { error: jobsError } = await supabase
      .from("brochure_jobs")
      .upsert(rows, { onConflict: "job_id" });
    if (jobsError) throw jobsError;
  }

  console.log("\nDone.");
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log(`  Jobs assigned: ${jobIds.length}`);
  console.log("\nSign in at /admin/login (developer role redirects to /developer).");
  console.log("Needs the backend running locally — these job files never left this machine,");
  console.log("so this will not work against the hosted site unless its extractor service");
  console.log("also has these files.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
