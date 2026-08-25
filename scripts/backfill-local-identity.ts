/**
 * Phase A / 1B: backfill admin_profiles from hosted Supabase into local
 * Postgres, keyed on the same id. `requireAdminAuth` will keep verifying the
 * JWT via Supabase Auth until the Phase D auth rebuild — after 1B it looks up
 * the *role* for that verified id in local Postgres instead of Supabase, so
 * the id here must match exactly what Supabase Auth hands back.
 *
 * Local admin_profiles already has two synthetic rows from
 * `load-brochures.ts`'s `ensureAccounts()` (`brochure-import@propcompare.local`,
 * `owner@propcompare.local`) — different emails, different ids, no overlap
 * with real staff accounts. This script only adds/updates the real ones.
 *
 * Idempotent — safe to re-run; upserts by id. Dry run by default.
 *
 *   bun scripts/backfill-local-identity.ts           # dry run, prints the plan
 *   bun scripts/backfill-local-identity.ts --apply   # writes
 */
import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/db/client.server";
import { adminProfiles } from "@/db/schema";

const APPLY = process.argv.includes("--apply");
const VALID_ROLES = new Set(["owner", "reviewer", "support", "developer"]);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (.env).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface SourceRow {
  id: string;
  role: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function main() {
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("id, role, email, full_name, is_active, created_by, created_at")
    .order("created_at");
  if (error) throw error;
  // Ascending created_at means a row referencing created_by always comes
  // after the row it references, so processing in this order keeps the
  // self-referencing FK satisfied without a second pass.
  const sourceRows = (data ?? []) as SourceRow[];

  const db = getDatabase();
  const localRows = await db
    .select({ id: adminProfiles.id, email: adminProfiles.email })
    .from(adminProfiles);
  const localByEmail = new Map(localRows.map((r) => [r.email, r.id]));
  const localIds = new Set(localRows.map((r) => r.id));

  console.log(`Source (Supabase): ${sourceRows.length} admin_profiles row(s).`);
  console.log(`Local (Postgres):  ${localRows.length} admin_profiles row(s) already present.\n`);

  const conflicts: SourceRow[] = [];
  const invalidRole: SourceRow[] = [];
  const planned: SourceRow[] = [];

  for (const row of sourceRows) {
    if (!VALID_ROLES.has(row.role)) {
      invalidRole.push(row);
      continue;
    }
    const emailOwner = localByEmail.get(row.email);
    if (emailOwner !== undefined && emailOwner !== row.id) {
      conflicts.push(row);
      continue;
    }
    planned.push(row);
  }

  for (const row of planned) {
    const action = localIds.has(row.id) ? "update" : "insert";
    console.log(`  [${action}] ${row.email} (${row.role}) id=${row.id}`);
  }
  if (invalidRole.length) {
    console.log(`\nSkipped — role not allowed by admin_profiles_role_check:`);
    for (const row of invalidRole) console.log(`  ${row.email}: role="${row.role}"`);
  }
  if (conflicts.length) {
    console.log(`\nSkipped — email already used locally by a different id:`);
    for (const row of conflicts) {
      console.log(`  ${row.email}: source id=${row.id}, local id=${localByEmail.get(row.email)}`);
    }
  }

  if (!APPLY) {
    console.log(
      `\nDry run — no writes made. Re-run with --apply to write ${planned.length} row(s).`,
    );
    return;
  }

  for (const row of planned) {
    // admin_profiles.id has an FK onto the local auth.users shim (see
    // ops/db/bootstrap.sql) — that row must exist first, same as
    // load-brochures.ts's ensureAccounts().
    await db.execute(
      sql.raw(
        `insert into auth.users (id, email) values ('${row.id}', '${escapeLiteral(row.email)}')
         on conflict (id) do update set email = excluded.email`,
      ),
    );
    await db
      .insert(adminProfiles)
      .values({
        id: row.id,
        role: row.role,
        email: row.email,
        fullName: row.full_name,
        isActive: row.is_active,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
      })
      .onConflictDoUpdate({
        target: adminProfiles.id,
        set: {
          role: row.role,
          email: row.email,
          fullName: row.full_name,
          isActive: row.is_active,
          createdBy: row.created_by,
        },
      });
    localIds.add(row.id);
  }

  console.log(`\nDone. Wrote ${planned.length} row(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
