/**
 * Phase C, sub-phase C1: delete the orphaned duplicate `properties` rows left
 * behind by an unclean double-run of `scripts/load-brochures.ts --publish` on
 * 2026-08-24 (before that script's idempotency fix existed).
 *
 * An orphan is defined structurally, never by name or slug:
 *
 *     is_published = false AND current_publication_version_id IS NULL
 *
 * Verified against production 2026-08-26: 47 rows total = 24 live + 23
 * orphans, every orphan has a live twin by name, and the orphans carry zero
 * reviews / enquiries / field visits / property_assets / publication_assets /
 * rera_verifications / score_versions / verified_locations. No live
 * publication version chains back to an orphan version via
 * `previous_version_id`. Each orphan does drag one `published`-state workflow
 * and one publication version behind it — the double-run published them, and
 * something later reset `is_published`/`current_publication_version_id` on the
 * property row, which is why they read as unpublished today.
 *
 * Every FK onto `properties` is ON DELETE RESTRICT (see src/db/schema.ts), so
 * a bare delete would simply fail rather than silently cascade. This script
 * therefore deletes children explicitly, in dependency order, inside ONE
 * transaction — either the whole set goes or nothing does.
 *
 * Deliberately NOT deleted: `audit_events` rows referencing these workflows.
 * They're an append-only trail with no FK to anything here, and the record
 * that the double-run happened is worth keeping.
 *
 * The orphan set is recomputed inside the transaction rather than taking ids
 * as arguments, but the count is asserted against --expect before any delete
 * runs, so a drifted database aborts instead of deleting something unexpected.
 *
 * WARNING: `DATABASE_URL` locally is a native Postgres on 127.0.0.1:5433, not
 * a tunnel into the VM. Running `--apply` locally only touches local dev data.
 * Reaching real production data requires running this on the VM itself,
 * against the real $DATABASE_URL there.
 *
 *   bun scripts/cleanup-orphan-properties.ts                      # dry run
 *   bun scripts/cleanup-orphan-properties.ts --expect=23 --apply  # writes
 */
import { sql } from "drizzle-orm";
import { getDatabase } from "@/db/client.server";

const APPLY = process.argv.includes("--apply");
const expectArg = process.argv.find((a) => a.startsWith("--expect="));
const EXPECT = expectArg ? Number.parseInt(expectArg.slice("--expect=".length), 10) : null;

if (APPLY && (EXPECT === null || Number.isNaN(EXPECT))) {
  console.error(
    "--apply requires --expect=<n> (the number of orphan rows you have verified).\n" +
      "Run the dry run first, confirm the count, then pass it back explicitly.",
  );
  process.exit(1);
}

interface OrphanRow {
  id: string;
  slug: string;
  name: string;
}

async function main() {
  const db = getDatabase();

  const orphans = (await db.execute(
    sql`select id, slug, name from properties
        where is_published = false and current_publication_version_id is null
        order by slug`,
  )) as unknown as OrphanRow[];

  if (orphans.length === 0) {
    console.log("No orphan properties found — nothing to do.");
    return;
  }

  // Every orphan must have a live twin by name. An orphan without one would
  // mean a real property is about to be deleted, not a duplicate.
  const twinless = (await db.execute(
    sql`select o.id, o.slug, o.name from properties o
        where o.is_published = false and o.current_publication_version_id is null
          and not exists (
            select 1 from properties l
            where l.is_published = true
              and l.current_publication_version_id is not null
              and l.name = o.name
          )
        order by o.slug`,
  )) as unknown as OrphanRow[];

  // Any of these being non-zero means real user data hangs off an orphan.
  const [attached] = (await db.execute(
    sql`with o as (
          select id from properties
          where is_published = false and current_publication_version_id is null
        )
        select
          (select count(*)::int from property_reviews      where property_id in (select id from o)) as reviews,
          (select count(*)::int from property_enquiries    where property_id in (select id from o)) as enquiries,
          (select count(*)::int from property_field_visits where property_id in (select id from o)) as field_visits,
          (select count(*)::int from property_assets       where property_id in (select id from o)) as property_assets`,
  )) as unknown as {
    reviews: number;
    enquiries: number;
    field_visits: number;
    property_assets: number;
  }[];

  console.log(`Orphan properties found: ${orphans.length}`);
  for (const row of orphans) {
    console.log(`  - ${row.slug}  (${row.name})  ${row.id}`);
  }
  console.log(
    `\nAttached user data — reviews: ${attached.reviews}, enquiries: ${attached.enquiries}, ` +
      `field visits: ${attached.field_visits}, property assets: ${attached.property_assets}`,
  );

  if (twinless.length > 0) {
    console.error(
      `\nABORT: ${twinless.length} orphan(s) have no live twin by name — these may be real ` +
        `properties, not duplicates:`,
    );
    for (const row of twinless) console.error(`  - ${row.slug} (${row.name}) ${row.id}`);
    process.exit(1);
  }
  const attachedTotal =
    attached.reviews + attached.enquiries + attached.field_visits + attached.property_assets;
  if (attachedTotal > 0) {
    console.error(
      `\nABORT: ${attachedTotal} row(s) of real user data are attached to orphan properties. ` +
        `Deleting would destroy them. Investigate before re-running.`,
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log(
      `\nDry run — no writes made.\n` +
        `Re-run with --expect=${orphans.length} --apply to delete the ${orphans.length} row(s) ` +
        `above and their workflows, revisions, review actions and publication versions.`,
    );
    return;
  }

  if (orphans.length !== EXPECT) {
    console.error(
      `\nABORT: found ${orphans.length} orphan(s) but --expect=${EXPECT}. ` +
        `The database is not in the state you verified. Nothing deleted.`,
    );
    process.exit(1);
  }

  const deleted = await db.transaction(async (tx) => {
    // Recomputed inside the transaction so the delete set and the assertion
    // below describe the same rows even under concurrent writes.
    const ids = sql`(
      select id from properties
      where is_published = false and current_publication_version_id is null
    )`;
    const versionIds = sql`(select id from property_publication_versions where property_id in ${ids})`;
    const workflowIds = sql`(select id from property_submission_workflows where property_id in ${ids})`;

    const counts: Record<string, number> = {};
    // postgres-js (not node-postgres) is the driver here — see
    // src/db/client.server.ts. Its result is an *array* carrying the affected
    // row count on `.count`; `.rowCount` is node-postgres's spelling and is
    // simply undefined, which read as "0 rows deleted" and tripped the
    // assertion below on the first real run. Both are accepted so this can't
    // silently under-report again if the driver is ever swapped.
    const affected = (result: unknown): number => {
      const r = result as { count?: unknown; rowCount?: unknown };
      if (typeof r.count === "number") return r.count;
      if (typeof r.rowCount === "number") return r.rowCount;
      throw new Error("Could not read affected row count from the database driver");
    };
    const run = async (label: string, statement: ReturnType<typeof sql>) => {
      counts[label] = affected(await tx.execute(statement));
    };

    // 20260816130000_atomic_publication.sql puts a BEFORE UPDATE OR DELETE
    // immutability trigger on three of the tables below, so published
    // versions can never be altered or erased. That guarantee is deliberate
    // and stays in force for the application — this script suspends it for
    // exactly one transaction, by name, because these particular rows record
    // an accidental double-run rather than real editorial history. The
    // matching `audit_events` rows are deliberately left in place, so the
    // permanent record that the double-run happened survives the cleanup.
    //
    // ALTER TABLE is transactional in Postgres: if anything below throws, the
    // rollback restores these triggers along with the data. They are also
    // re-enabled explicitly before the transaction returns.
    const guarded: [table: string, trigger: string][] = [
      ["public.property_publication_versions", "immutable_publication_versions"],
      ["public.property_submission_revisions", "immutable_submission_revisions"],
      ["private.commercial_terms", "immutable_commercial_terms"],
    ];
    for (const [table, trigger] of guarded) {
      await tx.execute(sql.raw(`alter table ${table} disable trigger ${trigger}`));
    }

    // Depth-first: grandchildren of configuration_variants, then variants,
    // then the publication version's own detail rows, then the versions, then
    // the workflow's revisions/review actions, then the workflows, then the
    // property rows themselves.
    const variantIds = sql`(
      select id from configuration_variants where publication_version_id in ${versionIds}
    )`;
    await run(
      "configuration_variant_areas",
      sql`delete from configuration_variant_areas where variant_id in ${variantIds}`,
    );
    await run(
      "configuration_variant_rooms",
      sql`delete from configuration_variant_rooms where configuration_variant_id in ${variantIds}`,
    );
    // commercial_terms lives in the `private` schema, not `public`
    // (privateSchema.table in src/db/schema.ts) — unqualified would resolve
    // to a non-existent public.commercial_terms.
    await run(
      "private.commercial_terms",
      sql`delete from private.commercial_terms where configuration_variant_id in ${variantIds}`,
    );
    await run(
      "configuration_variants",
      sql`delete from configuration_variants where publication_version_id in ${versionIds}`,
    );
    await run(
      "property_publication_details",
      sql`delete from property_publication_details where publication_version_id in ${versionIds}`,
    );
    await run(
      "publication_assets",
      sql`delete from publication_assets where publication_version_id in ${versionIds}`,
    );
    await run(
      "review_actions",
      sql`delete from review_actions where workflow_id in ${workflowIds}`,
    );
    await run(
      "property_publication_versions",
      sql`delete from property_publication_versions where property_id in ${ids}`,
    );
    await run(
      "property_submission_revisions",
      sql`delete from property_submission_revisions where workflow_id in ${workflowIds}`,
    );
    await run(
      "property_submission_workflows",
      sql`delete from property_submission_workflows where property_id in ${ids}`,
    );
    await run(
      "properties",
      sql`delete from properties
          where is_published = false and current_publication_version_id is null`,
    );

    if (counts.properties !== EXPECT) {
      throw new Error(
        `Deleted ${counts.properties} properties but expected ${EXPECT} — rolling back.`,
      );
    }

    for (const [table, trigger] of guarded) {
      await tx.execute(sql.raw(`alter table ${table} enable trigger ${trigger}`));
    }
    return counts;
  });

  console.log("\nDeleted:");
  for (const [table, count] of Object.entries(deleted)) {
    console.log(`  ${String(count).padStart(4)}  ${table}`);
  }

  const [remaining] = (await db.execute(
    sql`select
          count(*)::int as total,
          count(*) filter (where is_published and current_publication_version_id is not null)::int as live,
          count(*) filter (where not is_published and current_publication_version_id is null)::int as orphans
        from properties`,
  )) as unknown as { total: number; live: number; orphans: number }[];
  console.log(
    `\nAfter cleanup — properties: ${remaining.total} total, ${remaining.live} live, ` +
      `${remaining.orphans} orphan.`,
  );

  // The immutability guarantee must be back in force. 'O' is Postgres's
  // "enabled, origin" state (the normal one); 'D' means still disabled.
  const triggerStates = (await db.execute(
    sql`select tgname, tgenabled from pg_trigger
        where tgname in (
          'immutable_publication_versions',
          'immutable_submission_revisions',
          'immutable_commercial_terms'
        )
        order by tgname`,
  )) as unknown as { tgname: string; tgenabled: string }[];
  console.log("\nImmutability triggers:");
  for (const row of triggerStates) {
    console.log(
      `  ${row.tgenabled === "O" ? "enabled " : `DISABLED (${row.tgenabled})`}  ${row.tgname}`,
    );
  }
  const stillDisabled = triggerStates.filter((row) => row.tgenabled !== "O");
  if (stillDisabled.length > 0) {
    console.error(
      `\nWARNING: ${stillDisabled.length} immutability trigger(s) did not come back enabled. ` +
        `Re-enable them by hand before anything else writes to this database.`,
    );
    process.exit(1);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
