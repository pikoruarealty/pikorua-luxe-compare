/**
 * Follow-up to diagnose-slug-mismatch.ts: "shantigram" and
 * "the-north-park-at-shantigram" are two separate live V2 properties, but V1
 * has only one plausible name match ("northpark" / "The North Park"). Rather
 * than guess which V1 row "shantigram" actually is (or whether it's a
 * duplicate) from names alone, this prints identifying facts — address, RERA
 * ID, developer, configuration areas/prices — for both sides so the match can
 * be confirmed by data. Writes nothing.
 *
 *   bun scripts/diagnose-shantigram.ts
 */
import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { properties, propertyPublicationVersions, propertySubmissionRevisions } from "@/db/schema";
import { publicationRevisionSchema } from "@/domain/publication";

const V2_SLUGS = ["shantigram", "the-north-park-at-shantigram", "the-west-park"];
const V1_SLUGS = ["northpark", "westpark"];

async function main() {
  const db = getDatabase();
  const rows = await db
    .select({
      slug: properties.slug,
      name: properties.name,
      currentVersionId: properties.currentPublicationVersionId,
    })
    .from(properties)
    .where(inArray(properties.slug, V2_SLUGS));

  console.log("=== V2 (local Postgres) ===\n");
  for (const row of rows) {
    console.log(`--- ${row.slug} (${row.name}) ---`);
    if (!row.currentVersionId) {
      console.log("  no current publication version\n");
      continue;
    }
    const [version] = await db
      .select({ sourceRevisionId: propertyPublicationVersions.sourceRevisionId })
      .from(propertyPublicationVersions)
      .where(eq(propertyPublicationVersions.id, row.currentVersionId))
      .limit(1);
    if (!version?.sourceRevisionId) {
      console.log("  publication version has no source_revision_id\n");
      continue;
    }
    const [revisionRow] = await db
      .select({ payload: propertySubmissionRevisions.submittedPayload })
      .from(propertySubmissionRevisions)
      .where(eq(propertySubmissionRevisions.id, version.sourceRevisionId))
      .limit(1);
    if (!revisionRow) {
      console.log("  source revision not found\n");
      continue;
    }
    const revision = publicationRevisionSchema.parse(revisionRow.payload);
    console.log(`  developer:    ${revision.property.developerName ?? "(none)"}`);
    console.log(`  address:      ${revision.property.addressLine ?? "(none)"}`);
    console.log(`  rera:         ${revision.property.reraRegistration ?? "(none)"}`);
    console.log(`  propertyType: ${revision.property.propertyType}`);
    console.log(`  configurations (${revision.configurations.length}):`);
    for (const c of revision.configurations) {
      console.log(
        `    ${c.kind} "${c.variantName ?? ""}" area=${c.areaValue ?? "?"} ${c.areaBasis ?? ""} price=${c.commercial.baseSalePriceRupees ?? "?"}`,
      );
    }
    console.log("");
  }

  console.log("\n=== V1 (Supabase) ===\n");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select(
      "slug, name, developer, location, state, city, rera_id, rera_url, possession, configurations",
    )
    .in("slug", V1_SLUGS);
  if (error) throw new Error(`Couldn't read Supabase properties: ${error.message}`);
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    console.log(`--- ${row.slug} (${row.name}) ---`);
    console.log(`  developer: ${row.developer}`);
    console.log(`  location:  ${row.location}, ${row.city}, ${row.state}`);
    console.log(`  rera:      ${row.rera_id}`);
    console.log(`  rera_url:  ${row.rera_url}`);
    console.log(`  possession:${row.possession}`);
    console.log(`  configurations: ${JSON.stringify(row.configurations).slice(0, 800)}`);
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
