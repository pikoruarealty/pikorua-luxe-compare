import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const migrationFiles = [
  "20260816120000_v2_canonical_foundation.sql",
  "20260816130000_atomic_publication.sql",
  "20260816140000_durable_ocr_uploads.sql",
  "20260816150000_reviews_enquiries_runtime.sql",
  "20260816170000_saved_google_locations.sql",
  "20260817140000_phase5_verification_propscore.sql",
  "20260818120000_canonical_dictionary.sql",
  "20260821120000_phase7_developer_intelligence.sql",
  "20260823120000_rera_registered_completion_progress.sql",
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
  "saved_locations",
  "property_reviews",
  "property_review_versions",
  "developer_review_responses",
  "review_reports",
  "property_enquiries",
  "ocr_jobs",
  "property_assets",
  "source_documents",
  "publication_assets",
  "review_actions",
  "audit_events",
  "cache_invalidation_outbox",
  "ocr_extraction_revisions",
  "configuration_variant_areas",
  "configuration_variant_rooms",
  "property_publication_details",
  "amenity_catalog",
  "specification_catalog",
  "field_synonyms",
  "property_rera_verifications",
  "property_rera_area_checks",
  "property_score_versions",
  "property_score_dimensions",
  "market_landmarks",
  "property_verified_locations",
  "property_connectivity_snapshots",
  "developer_intelligence_entitlements",
] as const;

const missing = mirroredTables.filter(
  (table) => !migration.includes(`${table} (`) || !drizzle.includes(`"${table}"`),
);

if (missing.length) {
  throw new Error(`Drizzle/Supabase schema mirror is incomplete: ${missing.join(", ")}`);
}

console.log(`Checked ${mirroredTables.length} mirrored canonical tables.`);
