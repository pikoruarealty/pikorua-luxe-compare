/**
 * Phase C, sub-phase C2: copy `brochure_jobs` ownership rows from hosted
 * Supabase into local Postgres.
 *
 * The table already exists in local Postgres — every migration in
 * supabase/migrations replays there, 20260814120000_brochure_job_ownership.sql
 * included — but the rows only ever accumulated on the Supabase side, because
 * that's where brochure-extract.functions.ts wrote them until this sub-phase.
 * Without this backfill, the "resume an extraction" picker goes empty and
 * every in-flight job id fails its ownership check the moment the swap
 * deploys.
 *
 * Keyed on `job_id` (the primary key), so re-running is a no-op. Rows whose
 * `admin_profile_id` has no local `admin_profiles` row are skipped and
 * reported rather than inserted — that FK is real, and a missing owner means
 * Phase A's identity backfill didn't cover that account.
 *
 * `property_id` is deliberately left NULL for every row: nothing in either
 * database records which extraction became which property, and inventing that
 * link would silently hide real jobs from the resume list. The column starts
 * being populated by new submissions once C3/C4 land.
 *
 * WARNING: `DATABASE_URL` locally is a native Postgres on 127.0.0.1:5433, not
 * a tunnel into the VM. Reaching real production data requires running this on
 * the VM itself.
 *
 *   bun scripts/backfill-brochure-jobs.ts           # dry run
 *   bun scripts/backfill-brochure-jobs.ts --apply   # writes
 */
import { sql } from "drizzle-orm";
import { getDatabase } from "@/db/client.server";
import { brochureJobs } from "@/db/schema";

const APPLY = process.argv.includes("--apply");

interface SupabaseJobRow {
  job_id: string;
  admin_profile_id: string;
  created_at: string;
}

async function main() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("brochure_jobs")
    .select("job_id, admin_profile_id, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Couldn't read Supabase brochure_jobs: ${error.message}`);

  const rows = (data ?? []) as unknown as SupabaseJobRow[];
  console.log(`Supabase brochure_jobs: ${rows.length} row(s)`);
  if (rows.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const db = getDatabase();

  // The admin_profile_id FK is ON DELETE CASCADE and NOT NULL — an insert for
  // an owner that doesn't exist locally would fail the whole batch, so check
  // up front and report instead.
  const ownerIds = [...new Set(rows.map((row) => row.admin_profile_id))];
  const localOwners = (await db.execute(
    sql`select id from admin_profiles where id = any(${ownerIds})`,
  )) as unknown as { id: string }[];
  const known = new Set(localOwners.map((row) => row.id));

  const insertable = rows.filter((row) => known.has(row.admin_profile_id));
  const orphaned = rows.filter((row) => !known.has(row.admin_profile_id));

  const existing = (await db.execute(sql`select job_id from brochure_jobs`)) as unknown as {
    job_id: string;
  }[];
  const alreadyLocal = new Set(existing.map((row) => row.job_id));
  const fresh = insertable.filter((row) => !alreadyLocal.has(row.job_id));

  console.log(
    `  already in local Postgres: ${insertable.length - fresh.length}\n` +
      `  to insert:                 ${fresh.length}\n` +
      `  skipped (unknown owner):   ${orphaned.length}`,
  );
  for (const row of orphaned) {
    console.warn(
      `  ! ${row.job_id} — owner ${row.admin_profile_id} has no local admin_profiles row`,
    );
  }

  if (!APPLY) {
    console.log(
      `\nDry run — no writes made. Re-run with --apply to insert ${fresh.length} row(s).`,
    );
    return;
  }
  if (fresh.length === 0) {
    console.log("\nNothing new to insert.");
    return;
  }

  await db
    .insert(brochureJobs)
    .values(
      fresh.map((row) => ({
        jobId: row.job_id,
        adminProfileId: row.admin_profile_id,
        createdAt: new Date(row.created_at),
      })),
    )
    .onConflictDoNothing();

  const [after] = (await db.execute(
    sql`select count(*)::int as total from brochure_jobs`,
  )) as unknown as { total: number }[];
  console.log(`\nInserted ${fresh.length} row(s). Local brochure_jobs now holds ${after.total}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
