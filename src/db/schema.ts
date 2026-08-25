import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
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

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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
export const areaUnit = pgEnum("area_unit", ["sq_ft", "sq_m", "sq_yd", "acre", "gaj"]);
export const ceilingHeightBasis = pgEnum("ceiling_height_basis", [
  "clear",
  "slab_to_slab",
  "not_stated",
]);
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
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  configurations: jsonb("configurations").notNull().default({}),
  priceSummary: text("price_summary"),
  isPublished: boolean("is_published").notNull().default(false),
  createdBy: uuid("created_by"),
  currentPublicationVersionId: uuid("current_publication_version_id"),
});
export const adminProfiles = pgTable(
  "admin_profiles",
  {
    id: uuid("id").primaryKey(),
    role: text("role").notNull(),
    email: text("email").notNull().unique(),
    fullName: text("full_name"),
    isActive: boolean("is_active").notNull().default(true),
    // No .references() here: admin_profiles.created_by is self-referencing,
    // and Drizzle's self-FK typing needs an AnyPgColumn escape hatch the rest
    // of this file already avoids elsewhere (see publication_versions'
    // previousVersionId) — the FK still exists at the SQL level.
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "admin_profiles_role_check",
      sql`${table.role} in ('owner', 'reviewer', 'support', 'developer')`,
    ),
  ],
);

export const developerIntelligenceEntitlements = pgTable(
  "developer_intelligence_entitlements",
  {
    developerId: uuid("developer_id")
      .primaryKey()
      .references(() => adminProfiles.id, { onDelete: "cascade" }),
    accessLevel: text("access_level").notNull(),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    managedBy: uuid("managed_by")
      .notNull()
      .references(() => adminProfiles.id, { onDelete: "restrict" }),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "developer_intelligence_access_level_check",
      sql`${table.accessLevel} in ('trial', 'paid')`,
    ),
    check("developer_intelligence_status_check", sql`${table.status} in ('active', 'suspended')`),
    check(
      "developer_intelligence_dates_check",
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  email: text("email"),
  profession: text("profession"),
  businessName: text("business_name"),
  quizAnswers: jsonb("quiz_answers").$type<Record<string, unknown>>(),
  analyticsOptOut: boolean("analytics_opt_out").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const customerActivity = pgTable(
  "customer_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    sessionKey: text("session_key"),
    eventType: text("event_type").notNull(),
    propertySlug: text("property_slug"),
    metadata: jsonb("metadata").notNull().default({}).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      "customer_activity_event_type_check",
      sql`${table.eventType} in ('signup', 'quiz_completed', 'property_view', 'compare_add', 'compare_open', 'favorite_add', 'contact_click', 'gate_shown', 'gate_unlocked', 'alternative_clicked', 'weighting_changed', 'comparison_feedback')`,
    ),
  ],
);

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
  servantRoomPresent: boolean("servant_room_present"),
  servantRoomState: fieldState("servant_room_state").notNull().default("not_stated"),
  floorPlanPage: integer("floor_plan_page"),
  floorPlanPageState: fieldState("floor_plan_page_state").notNull().default("not_stated"),
  createdAt: createdAt(),
});

// Column is variant_id (not configurationVariantId) to match Phase 5's raw SQL, already
// written against this exact name in src/repositories/propscore.repository.server.ts.
export const configurationVariantAreas = pgTable(
  "configuration_variant_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => configurationVariants.id, { onDelete: "cascade" }),
    basis: areaBasis("basis").notNull(),
    value: numeric("value", { precision: 14, scale: 3 }),
    unit: areaUnit("unit"),
    rawText: text("raw_text"),
    state: fieldState("state").notNull().default("not_stated"),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.variantId, table.basis)],
);

export const configurationVariantRooms = pgTable("configuration_variant_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  configurationVariantId: uuid("configuration_variant_id")
    .notNull()
    .references(() => configurationVariants.id, { onDelete: "cascade" }),
  roomType: text("room_type").notNull(),
  dimensionRaw: text("dimension_raw"),
  areaValue: numeric("area_value", { precision: 10, scale: 2 }),
  areaUnit: areaUnit("area_unit"),
  roomState: fieldState("room_state").notNull().default("not_stated"),
  sortOrder: smallint("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const propertyPublicationDetails = pgTable("property_publication_details", {
  publicationVersionId: uuid("publication_version_id")
    .primaryKey()
    .references(() => propertyPublicationVersions.id, { onDelete: "cascade" }),

  plotSizeValue: numeric("plot_size_value", { precision: 14, scale: 3 }),
  plotSizeUnit: areaUnit("plot_size_unit"),
  plotSizeState: fieldState("plot_size_state").notNull().default("not_stated"),
  totalTowers: integer("total_towers"),
  totalTowersState: fieldState("total_towers_state").notNull().default("not_stated"),
  totalFloors: integer("total_floors"),
  totalFloorsState: fieldState("total_floors_state").notNull().default("not_stated"),
  unitsPerFloor: integer("units_per_floor"),
  unitsPerFloorState: fieldState("units_per_floor_state").notNull().default("not_stated"),
  totalUnits: integer("total_units"),
  totalUnitsState: fieldState("total_units_state").notNull().default("not_stated"),
  unitsPerAcre: numeric("units_per_acre", { precision: 10, scale: 3 }),
  unitsPerAcreState: fieldState("units_per_acre_state").notNull().default("not_stated"),
  openSpacePercent: numeric("open_space_percent", { precision: 5, scale: 2 }),
  openSpacePercentState: fieldState("open_space_percent_state").notNull().default("not_stated"),
  parkingLevels: integer("parking_levels"),
  parkingLevelsState: fieldState("parking_levels_state").notNull().default("not_stated"),
  podiumStructure: text("podium_structure"),
  podiumStructureState: fieldState("podium_structure_state").notNull().default("not_stated"),
  liftsPerTower: integer("lifts_per_tower"),
  liftsPerTowerState: fieldState("lifts_per_tower_state").notNull().default("not_stated"),
  clubhouseSizeSqFt: numeric("clubhouse_size_sq_ft", { precision: 12, scale: 2 }),
  clubhouseSizeSqFtState: fieldState("clubhouse_size_sq_ft_state").notNull().default("not_stated"),

  internalCeilingHeightFt: numeric("internal_ceiling_height_ft", { precision: 5, scale: 2 }),
  ceilingHeightBasis: ceilingHeightBasis("ceiling_height_basis").notNull().default("not_stated"),
  ceilingHeightState: fieldState("ceiling_height_state").notNull().default("not_stated"),
  constructionQuality: text("construction_quality"),
  constructionQualityState: fieldState("construction_quality_state")
    .notNull()
    .default("not_stated"),
  flooringType: text("flooring_type"),
  flooringTypeState: fieldState("flooring_type_state").notNull().default("not_stated"),
  windowGlazing: text("window_glazing"),
  windowGlazingState: fieldState("window_glazing_state").notNull().default("not_stated"),
  bathSanitaryFittings: text("bath_sanitary_fittings"),
  bathSanitaryFittingsState: fieldState("bath_sanitary_fittings_state")
    .notNull()
    .default("not_stated"),
  vrvAcProvision: text("vrv_ac_provision"),
  vrvAcProvisionState: fieldState("vrv_ac_provision_state").notNull().default("not_stated"),
  geyserProvision: text("geyser_provision"),
  geyserProvisionState: fieldState("geyser_provision_state").notNull().default("not_stated"),

  experienceYears: integer("experience_years"),
  experienceYearsState: fieldState("experience_years_state").notNull().default("not_stated"),
  deliveredProjects: integer("delivered_projects"),
  deliveredProjectsState: fieldState("delivered_projects_state").notNull().default("not_stated"),
  ongoingProjects: integer("ongoing_projects"),
  ongoingProjectsState: fieldState("ongoing_projects_state").notNull().default("not_stated"),
  notableDeliveredProjects: text("notable_delivered_projects").array().notNull().default([]),
  notableDeliveredProjectsState: fieldState("notable_delivered_projects_state")
    .notNull()
    .default("not_stated"),
  background: text("background"),
  backgroundState: fieldState("background_state").notNull().default("not_stated"),

  proposedStartDateRera: date("proposed_start_date_rera"),
  proposedStartDateReraState: fieldState("proposed_start_date_rera_state")
    .notNull()
    .default("not_stated"),
  possessionConfirmedAsOf: date("possession_confirmed_as_of"),
  possessionConfirmedAsOfState: fieldState("possession_confirmed_as_of_state")
    .notNull()
    .default("not_stated"),
  registeredCompletionDateRera: date("registered_completion_date_rera"),
  registeredCompletionDateReraState: fieldState("registered_completion_date_rera_state")
    .notNull()
    .default("not_stated"),
  constructionProgressRera: text("construction_progress_rera"),
  constructionProgressReraState: fieldState("construction_progress_rera_state")
    .notNull()
    .default("not_stated"),

  amenitiesOther: text("amenities_other"),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const amenityCatalog = pgTable("amenity_catalog", {
  code: text("code").primaryKey(),
  displayName: text("display_name").notNull(),
  groupName: text("group_name").notNull(),
  sortOrder: smallint("sort_order").notNull(),
  createdAt: createdAt(),
});

export const specificationCatalog = pgTable("specification_catalog", {
  code: text("code").primaryKey(),
  displayName: text("display_name").notNull(),
  groupName: text("group_name").notNull(),
  sortOrder: smallint("sort_order").notNull(),
  createdAt: createdAt(),
});

export const fieldSynonyms = pgTable(
  "field_synonyms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalField: text("canonical_field").notNull(),
    synonym: text("synonym").notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.canonicalField, table.synonym)],
);

export const propertyAmenities = pgTable("property_amenities", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicationVersionId: uuid("publication_version_id")
    .notNull()
    .references(() => propertyPublicationVersions.id, { onDelete: "cascade" }),
  amenityCode: text("amenity_code")
    .notNull()
    .references(() => amenityCatalog.code, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  valueState: fieldState("value_state").notNull().default("stated"),
  details: text("details"),
});

export const propertySpecifications = pgTable("property_specifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicationVersionId: uuid("publication_version_id")
    .notNull()
    .references(() => propertyPublicationVersions.id, { onDelete: "cascade" }),
  specificationCode: text("specification_code")
    .notNull()
    .references(() => specificationCatalog.code, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  valueText: text("value_text"),
  valueState: fieldState("value_state").notNull().default("not_stated"),
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

export const savedLocations = pgTable(
  "saved_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    googlePlaceId: text("google_place_id").notNull(),
    placeIdRefreshedAt: timestamp("place_id_refreshed_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.profileId, table.googlePlaceId)],
);

export const propertyReviews = pgTable("property_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  publicName: text("public_name").notNull(),
  rating: smallint("rating").notNull(),
  reviewText: text("review_text"),
  verificationTier: text("verification_tier").notNull().default("phone_verified"),
  structuredReviewVersion: integer("structured_review_version").notNull().default(1),
  visibility: reviewVisibility("visibility").notNull().default("published"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const propertyReviewDimensions = pgTable("property_review_dimensions", {
  reviewId: uuid("review_id")
    .notNull()
    .references(() => propertyReviews.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(),
  experienceState: text("experience_state").notNull(),
  rating: smallint("rating"),
  note: text("note"),
});

export const reviewVisitEvidence = pgTable("review_visit_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => propertyReviews.id, { onDelete: "cascade" })
    .unique(),
  visitDate: date("visit_date").notNull(),
  storageBucket: text("storage_bucket").notNull(),
  storageObjectPath: text("storage_object_path").notNull().unique(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  uploadState: text("upload_state").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => adminProfiles.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  decisionReason: text("decision_reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  purgedAt: timestamp("purged_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const propertyFieldVerificationShortlist = pgTable("property_field_verification_shortlist", {
  propertyId: uuid("property_id")
    .primaryKey()
    .references(() => properties.id, { onDelete: "cascade" }),
  selectedBy: uuid("selected_by")
    .notNull()
    .references(() => adminProfiles.id, { onDelete: "restrict" }),
  selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  note: text("note"),
});

export const propertyFieldVisits = pgTable("property_field_visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
  publicationVersionId: uuid("publication_version_id").references(
    () => propertyPublicationVersions.id,
    { onDelete: "restrict" },
  ),
  status: text("status").notNull(),
  visitedOn: date("visited_on"),
  completedBy: uuid("completed_by").references(() => adminProfiles.id, { onDelete: "restrict" }),
  internalEvidenceReference: text("internal_evidence_reference"),
  createdAt: createdAt(),
});

export const propertyFieldVisitObservations = pgTable("property_field_visit_observations", {
  visitId: uuid("visit_id")
    .notNull()
    .references(() => propertyFieldVisits.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(),
  observationState: text("observation_state").notNull(),
  observation: text("observation"),
});

export const propertyReviewVersions = pgTable(
  "property_review_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => propertyReviews.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    rating: smallint("rating").notNull(),
    reviewText: text("review_text"),
    moderationResult: jsonb("moderation_result").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.reviewId, table.version)],
);

export const developerReviewResponses = pgTable("developer_review_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => propertyReviews.id, { onDelete: "cascade" })
    .unique(),
  developerId: uuid("developer_id")
    .notNull()
    .references(() => adminProfiles.id, { onDelete: "restrict" }),
  responseText: text("response_text").notNull(),
  visibility: reviewVisibility("visibility").notNull().default("published"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const reviewReports = pgTable(
  "review_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => propertyReviews.id, { onDelete: "cascade" }),
    reporterProfileId: uuid("reporter_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    reasonCode: text("reason_code").notNull(),
    status: text("status").notNull().default("open"),
    adjudicatedBy: uuid("adjudicated_by").references(() => adminProfiles.id, {
      onDelete: "restrict",
    }),
    adjudicationReason: text("adjudication_reason"),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.reviewId, table.reporterProfileId, table.reasonCode)],
);

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

export const propertyAssets = pgTable("property_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "restrict" }),
  ownerDeveloperId: uuid("owner_developer_id")
    .notNull()
    .references(() => adminProfiles.id, { onDelete: "restrict" }),
  state: text("state").notNull().default("pending"),
  approvedBy: uuid("approved_by").references(() => adminProfiles.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerDeveloperId: uuid("owner_developer_id").references(() => adminProfiles.id, {
      onDelete: "restrict",
    }),
    storageBucket: text("storage_bucket").notNull(),
    storageObjectPath: text("storage_object_path").notNull(),
    originalFilename: text("original_filename").notNull(),
    sha256: text("sha256").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    retentionHold: boolean("retention_hold").notNull().default(false),
    uploadState: text("upload_state").notNull().default("pending"),
    verifiedChecksumAt: timestamp("verified_checksum_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.ownerDeveloperId, table.sha256)],
);

export const publicationAssets = pgTable(
  "publication_assets",
  {
    publicationVersionId: uuid("publication_version_id")
      .notNull()
      .references(() => propertyPublicationVersions.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => propertyAssets.id, { onDelete: "restrict" }),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (table) => [unique().on(table.publicationVersionId, table.assetId)],
);

export const reviewActions = pgTable("review_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => propertySubmissionWorkflows.id, { onDelete: "cascade" }),
  submissionRevisionId: uuid("submission_revision_id").references(
    () => propertySubmissionRevisions.id,
    { onDelete: "restrict" },
  ),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => adminProfiles.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  reason: text("reason"),
  beforeValues: jsonb("before_values"),
  afterValues: jsonb("after_values"),
  createdAt: createdAt(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorType: text("actor_type").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  reason: text("reason"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
});

export const cacheInvalidationOutbox = pgTable("cache_invalidation_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  topic: text("topic").notNull(),
  entityId: uuid("entity_id").notNull(),
  payload: jsonb("payload").notNull().default({}),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: createdAt(),
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

export const ocrExtractionRevisions = pgTable(
  "ocr_extraction_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => ocrJobs.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    modelVersion: text("model_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    parserVersion: text("parser_version").notNull(),
    formulaVersion: text("formula_version").notNull(),
    extractionPayload: jsonb("extraction_payload").notNull().$type<{ [key: string]: JsonValue }>(),
    validationResult: jsonb("validation_result")
      .notNull()
      .default({})
      .$type<{ [key: string]: JsonValue }>(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.jobId, table.revision)],
);

export const propertyReraVerifications = pgTable(
  "property_rera_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationVersionId: uuid("publication_version_id")
      .notNull()
      .references(() => propertyPublicationVersions.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    registrationNumber: text("registration_number").notNull(),
    sourceUrl: text("source_url"),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, {
      onDelete: "restrict",
    }),
    checkedBy: uuid("checked_by")
      .notNull()
      .references(() => adminProfiles.id, { onDelete: "restrict" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    publishedPromoterName: text("published_promoter_name"),
    officialPromoterName: text("official_promoter_name"),
    promoterMatch: boolean("promoter_match"),
    promoterMatchBasis: text("promoter_match_basis"),
    promoterMatchReason: text("promoter_match_reason"),
    publishedCompletionDate: date("published_completion_date"),
    officialCompletionDate: date("official_completion_date"),
    completionDifferenceDays: integer("completion_difference_days"),
    notes: text("notes"),
    supersedesId: uuid("supersedes_id"),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.publicationVersionId, table.revision)],
);

export const propertyReraAreaChecks = pgTable(
  "property_rera_area_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verificationId: uuid("verification_id")
      .notNull()
      .references(() => propertyReraVerifications.id, { onDelete: "cascade" }),
    configurationVariantId: uuid("configuration_variant_id")
      .notNull()
      .references(() => configurationVariants.id, { onDelete: "restrict" }),
    brochureRawValue: numeric("brochure_raw_value", { precision: 14, scale: 3 }).notNull(),
    brochureRawUnit: text("brochure_raw_unit").notNull(),
    brochureRawText: text("brochure_raw_text").notNull(),
    brochureSqFt: numeric("brochure_sq_ft", { precision: 14, scale: 3 }).notNull(),
    reraRawValue: numeric("rera_raw_value", { precision: 14, scale: 3 }).notNull(),
    reraRawUnit: text("rera_raw_unit").notNull(),
    reraRawText: text("rera_raw_text").notNull(),
    reraSqFt: numeric("rera_sq_ft", { precision: 14, scale: 3 }).notNull(),
    absoluteDifferenceSqFt: numeric("absolute_difference_sq_ft", {
      precision: 14,
      scale: 3,
    }).notNull(),
    differencePercent: numeric("difference_percent", { precision: 8, scale: 3 }).notNull(),
    result: text("result").notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.verificationId, table.configurationVariantId)],
);

export const propertyScoreVersions = pgTable(
  "property_score_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationVersionId: uuid("publication_version_id")
      .notNull()
      .references(() => propertyPublicationVersions.id, { onDelete: "restrict" }),
    methodologyVersion: text("methodology_version").notNull(),
    revision: integer("revision").notNull(),
    composite: smallint("composite"),
    status: text("status").notNull(),
    coveragePercent: smallint("coverage_percent").notNull(),
    cohortSnapshot: jsonb("cohort_snapshot").notNull().default({}),
    calculatedBy: uuid("calculated_by")
      .notNull()
      .references(() => adminProfiles.id, { onDelete: "restrict" }),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(),
    supersedesId: uuid("supersedes_id"),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.publicationVersionId, table.methodologyVersion, table.revision)],
);

export const propertyScoreDimensions = pgTable(
  "property_score_dimensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scoreVersionId: uuid("score_version_id")
      .notNull()
      .references(() => propertyScoreVersions.id, { onDelete: "cascade" }),
    dimension: text("dimension").notNull(),
    score: smallint("score"),
    status: text("status").notNull(),
    coveragePercent: smallint("coverage_percent").notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull().default({}),
    publicExplanation: jsonb("public_explanation").notNull().default([]),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.scoreVersionId, table.dimension)],
);

export const marketLandmarks = pgTable(
  "market_landmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    displayName: text("display_name").notNull(),
    googlePlaceId: text("google_place_id").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    verifiedBy: uuid("verified_by")
      .notNull()
      .references(() => adminProfiles.id, { onDelete: "restrict" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.marketId, table.googlePlaceId)],
);

export const propertyVerifiedLocations = pgTable(
  "property_verified_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationVersionId: uuid("publication_version_id")
      .notNull()
      .references(() => propertyPublicationVersions.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    googlePlaceId: text("google_place_id").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    verifiedBy: uuid("verified_by")
      .notNull()
      .references(() => adminProfiles.id, { onDelete: "restrict" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    supersedesId: uuid("supersedes_id"),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.publicationVersionId, table.revision)],
);

export const propertyConnectivitySnapshots = pgTable(
  "property_connectivity_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verifiedLocationId: uuid("verified_location_id")
      .notNull()
      .references(() => propertyVerifiedLocations.id, { onDelete: "restrict" }),
    landmarkId: uuid("landmark_id")
      .notNull()
      .references(() => marketLandmarks.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    status: text("status").notNull(),
    distanceMeters: integer("distance_meters"),
    durationSeconds: integer("duration_seconds"),
    travelMode: text("travel_mode").notNull().default("driving"),
    provider: text("provider").notNull().default("google_routes"),
    calculatedBy: uuid("calculated_by")
      .notNull()
      .references(() => adminProfiles.id, { onDelete: "restrict" }),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.verifiedLocationId, table.landmarkId, table.revision)],
);
