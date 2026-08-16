import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const migrationFiles = [
  "20260816120000_v2_canonical_foundation.sql",
  "20260816130000_atomic_publication.sql",
  "20260816140000_durable_ocr_uploads.sql",
];
const migration = (
  await Promise.all(
    migrationFiles.map((file) => readFile(resolve(root, "supabase/migrations", file), "utf8")),
  )
).join("\n");
const drizzle = await readFile(resolve(root, "src/db/schema.ts"), "utf8");

const mirroredTables = [
  "markets",
  "configuration_options",
  "market_configuration_options",
  "property_publication_versions",
  "configuration_variants",
  "commercial_terms",
  "property_submission_workflows",
  "property_submission_revisions",
  "customer_preferences",
  "property_reviews",
  "property_enquiries",
  "ocr_jobs",
  "property_assets",
  "source_documents",
  "publication_assets",
  "review_actions",
  "audit_events",
  "cache_invalidation_outbox",
  "ocr_extraction_revisions",
] as const;

const missing = mirroredTables.filter(
  (table) => !migration.includes(`${table} (`) || !drizzle.includes(`"${table}"`),
);

if (missing.length) {
  throw new Error(`Drizzle/Supabase schema mirror is incomplete: ${missing.join(", ")}`);
}

console.log(`Checked ${mirroredTables.length} mirrored canonical tables.`);
