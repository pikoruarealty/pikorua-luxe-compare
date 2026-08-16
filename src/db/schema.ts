import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const fieldState = pgEnum("field_state", [
  "stated",
  "not_stated",
  "explicitly_not_offered",
  "not_applicable",
  "pending_review",
]);
export const configurationKind = pgEnum("configuration_kind", [
  "2_bhk",
  "3_bhk",
  "4_bhk",
  "5_bhk",
  "6_bhk",
  "7_bhk",
  "penthouse",
  "duplex",
  "villa",
  "bungalow",
  "plot",
]);
export const areaBasis = pgEnum("area_basis", [
  "carpet",
  "rera_carpet",
  "built_up",
  "super_built_up",
  "plot",
  "not_stated",
]);
export const areaUnit = pgEnum("area_unit", ["sq_ft", "sq_m", "sq_yd"]);
export const submissionState = pgEnum("submission_state", [
  "draft",
  "submitted",
  "validating",
  "in_review",
  "changes_requested",
  "rejected",
  "approved",
  "published",
  "superseded",
]);
export const reviewVisibility = pgEnum("review_visibility", [
  "published",
  "held",
  "hidden",
  "deleted",
]);
export const enquiryStatus = pgEnum("enquiry_status", ["new", "viewed", "contacted", "closed"]);
export const ocrJobState = pgEnum("ocr_job_state", [
  "queued",
  "processing",
  "needs_correction",
  "ready_for_review",
  "completed",
  "failed",
  "cancelled",
]);

// Legacy identity tables are declared only for typed foreign keys. Their SQL
// remains in the earlier Supabase migrations.
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull(),
  currentPublicationVersionId: uuid("current_publication_version_id"),
});
export const adminProfiles = pgTable("admin_profiles", {
  id: uuid("id").primaryKey(),
  role: text("role").notNull(),
});
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  phone: text("phone").notNull(),
});

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateCode: text("state_code").notNull(),
    stateName: text("state_name").notNull(),
    cityCode: text("city_code").notNull(),
    cityName: text("city_name").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.stateCode, table.cityCode)],
);

export const configurationOptions = pgTable("configuration_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: configurationKind("kind").notNull().unique(),
  displayName: text("display_name").notNull(),
  sortOrder: smallint("sort_order").notNull(),
  createdAt: createdAt(),
});

export const marketConfigurationOptions = pgTable(
  "market_configuration_options",
  {
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    configurationOptionId: uuid("configuration_option_id")
      .notNull()
      .references(() => configurationOptions.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull().default(true),
  },
  (table) => [unique().on(table.marketId, table.configurationOptionId)],
);

export const propertyPublicationVersions = pgTable(
  "property_publication_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "restrict" }),
    publicSnapshot: jsonb("public_snapshot").notNull().$type<Record<string, unknown>>(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    verifiedBy: uuid("verified_by")
      .notNull()
      .references(() => adminProfiles.id, { onDelete: "restrict" }),
    previousVersionId: uuid("previous_version_id"),
    sourceRevisionId: uuid("source_revision_id"),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.propertyId, table.version),
    check("publication_version_positive", sql`${table.version} > 0`),
  ],
);

export const configurationVariants = pgTable("configuration_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicationVersionId: uuid("publication_version_id")
    .notNull()
    .references(() => propertyPublicationVersions.id, { onDelete: "cascade" }),
  configurationOptionId: uuid("configuration_option_id")
    .notNull()
    .references(() => configurationOptions.id, { onDelete: "restrict" }),
  variantName: text("variant_name"),
  areaValue: numeric("area_value", { precision: 14, scale: 3 }),
  areaBasis: areaBasis("area_basis"),
  areaUnit: areaUnit("area_unit"),
  areaState: fieldState("area_state").notNull().default("not_stated"),
  bathrooms: smallint("bathrooms"),
  bathroomsState: fieldState("bathrooms_state").notNull().default("not_stated"),
  balconies: smallint("balconies"),
  balconiesState: fieldState("balconies_state").notNull().default("not_stated"),
  publicFacts: jsonb("public_facts").notNull().default({}).$type<Record<string, unknown>>(),
  sortOrder: smallint("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const privateSchema = pgSchema("private");
export const commercialTerms = privateSchema.table(
  "commercial_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configurationVariantId: uuid("configuration_variant_id")
      .notNull()
      .references(() => configurationVariants.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    baseSalePriceRupees: bigint("base_sale_price_rupees", { mode: "number" }),
    rateRupeesPerSqFt: numeric("rate_rupees_per_sq_ft", { precision: 14, scale: 2 }),
    rateAreaBasis: areaBasis("rate_area_basis"),
    privateLowerBoundRupees: bigint("private_lower_bound_rupees", { mode: "number" }),
    privateUpperBoundRupees: bigint("private_upper_bound_rupees", { mode: "number" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => adminProfiles.id, {
      onDelete: "restrict",
    }),
    staleAfter: timestamp("stale_after", { withTimezone: true }),
    sourceRevisionId: uuid("source_revision_id"),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.configurationVariantId, table.revision)],
);

export const propertySubmissionWorkflows = pgTable("property_submission_workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "restrict" }),
  developerId: uuid("developer_id")
    .notNull()
    .references(() => adminProfiles.id, { onDelete: "restrict" }),
  state: submissionState("state").notNull().default("draft"),
  currentRevision: integer("current_revision").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const propertySubmissionRevisions = pgTable(
  "property_submission_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => propertySubmissionWorkflows.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    submittedPayload: jsonb("submitted_payload").notNull().$type<Record<string, unknown>>(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => adminProfiles.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.workflowId, table.revision)],
);

export const customerPreferences = pgTable("customer_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" })
    .unique(),
  marketId: uuid("market_id")
    .notNull()
    .references(() => markets.id, { onDelete: "restrict" }),
  configurationOptionIds: uuid("configuration_option_ids").array().notNull(),
  budgetBandId: text("budget_band_id").notNull(),
  budgetMinRupees: bigint("budget_min_rupees", { mode: "number" }),
  budgetMaxRupees: bigint("budget_max_rupees", { mode: "number" }),
  propertyTypeIds: text("property_type_ids").array().notNull().default([]),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const propertyReviews = pgTable("property_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  publicName: text("public_name").notNull(),
  rating: smallint("rating").notNull(),
  reviewText: text("review_text"),
  visibility: reviewVisibility("visibility").notNull().default("published"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const propertyRatingAggregates = pgTable("property_rating_aggregates", {
  propertyId: uuid("property_id")
    .primaryKey()
    .references(() => properties.id, { onDelete: "cascade" }),
  averageRating: numeric("average_rating", { precision: 3, scale: 2 }).notNull().default("0"),
  publishedReviewCount: integer("published_review_count").notNull().default(0),
  updatedAt: updatedAt(),
});

export const propertyEnquiries = pgTable("property_enquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
  configurationVariantId: uuid("configuration_variant_id").references(
    () => configurationVariants.id,
    { onDelete: "set null" },
  ),
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  developerId: uuid("developer_id")
    .notNull()
    .references(() => adminProfiles.id, { onDelete: "restrict" }),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  message: text("message"),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
  consentTextVersion: text("consent_text_version").notNull(),
  deduplicationHash: text("deduplication_hash").notNull(),
  status: enquiryStatus("status").notNull().default("new"),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ocrJobs = pgTable("ocr_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceDocumentId: uuid("source_document_id").notNull().unique(),
  developerId: uuid("developer_id")
    .notNull()
    .references(() => adminProfiles.id, { onDelete: "restrict" }),
  state: ocrJobState("state").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  progress: smallint("progress").notNull().default(0),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
