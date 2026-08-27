import { createServerFn } from "@tanstack/react-start";
import { requireOwnerAuth } from "@/lib/auth/admin-auth-middleware";
import { propertyFormSchema, type PropertyFormValues } from "@/lib/property-schema";
import type { AdminProperty } from "./properties.functions";

/** Resolves the enabled market a form's state/city names belong to, and loads
 *  the canonical configuration-option taxonomy — both required by
 *  `buildPublicationRevision`. Shared by create and update below; mirrors the
 *  identical lookup in `submitV2PropertyUpdate`
 *  (developer-properties.functions.ts) and the now-retired
 *  `publishV2Catalogue`. */
async function resolveRevisionContext(values: PropertyFormValues) {
  const { eq, and, ilike } = await import("drizzle-orm");
  const { getDatabase } = await import("@/db/client.server");
  const { configurationOptions, markets } = await import("@/db/schema");

  const db = getDatabase();
  const [market] = await db
    .select({ id: markets.id, stateCode: markets.stateCode, cityCode: markets.cityCode })
    .from(markets)
    .where(
      and(
        eq(markets.isEnabled, true),
        ilike(markets.stateName, values.state.trim()),
        ilike(markets.cityName, values.city.trim()),
      ),
    )
    .limit(1);
  if (!market) {
    throw new Error(`No enabled market matches "${values.city}, ${values.state}"`);
  }

  const optionRows = await db
    .select({ id: configurationOptions.id, kind: configurationOptions.kind })
    .from(configurationOptions);
  const configurationOptionsByKind = new Map(optionRows.map((row) => [row.kind, row.id]));
  return { market, configurationOptionsByKind };
}

/** Publishes `values` straight through the review workflow in one call — an
 *  owner action is already the approval, same as `approveSubmission`'s
 *  `v2:`-prefixed branch. `propertyId` undefined creates a brand-new property
 *  via `publishWorkflow`'s `createPropertyIdentity` branch; set, it publishes
 *  a new version onto an existing one. */
async function publishV2Revision(
  values: PropertyFormValues,
  ownerId: string,
  propertyId?: string,
  brochureJobId?: string,
): Promise<{ propertyId: string; publicationVersionId: string }> {
  const { buildPublicationRevision } = await import("@/domain/publication-mapping.server");
  const { saveDeveloperRevision, submitDeveloperWorkflow } =
    await import("@/repositories/submission-workflow.repository.server");
  const { publishWorkflow } = await import("@/repositories/publication.repository.server");

  const { market, configurationOptionsByKind } = await resolveRevisionContext(values);
  const revision = buildPublicationRevision(values, {
    configurationOptionsByKind,
    marketId: market.id,
    stateCode: market.stateCode,
    cityCode: market.cityCode,
  });

  const { workflowId } = await saveDeveloperRevision(
    ownerId,
    revision,
    undefined,
    propertyId,
    brochureJobId,
  );
  await submitDeveloperWorkflow(workflowId, ownerId);
  return publishWorkflow(workflowId, ownerId);
}

/** Owner-only: publish a brand-new V2 property from nothing, reusing the exact
 *  create-from-scratch path `publishWorkflow` already supports (a null
 *  `workflow.propertyId`) — this is the V2-native replacement for
 *  `createProperty` in `property-crud.functions.ts`. */
export const createV2Property = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: PropertyFormValues) => propertyFormSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { propertyId } = await publishV2Revision(data, context.adminProfile.id);
    const { eq } = await import("drizzle-orm");
    const { getDatabase } = await import("@/db/client.server");
    const { properties } = await import("@/db/schema");
    const db = getDatabase();
    // publishWorkflow always brings a property live (isPublished: true) — the
    // form's own checkbox is the one place that can ask for it to start hidden.
    if (!data.isPublished) {
      await db.update(properties).set({ isPublished: false }).where(eq(properties.id, propertyId));
    }
    const [row] = await db
      .select({ slug: properties.slug })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    return { id: propertyId, slug: row?.slug ?? "" };
  });

/** Owner-only: publish an edit onto an existing V2 property — same chain as
 *  create, but `propertyId` is passed through so `publishWorkflow` creates a
 *  new version on the existing row rather than a new identity. Replaces
 *  `updateProperty`. */
// Matches insertBrochureJob's generator (crypto.randomUUID, hyphens
// stripped, sliced to 24) — see createBrochureUploadTicket.
const JOB_ID_RE = /^[a-f0-9]{12,32}$/;

export const updateV2Property = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string; jobId?: string; values: PropertyFormValues }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing property id");
    if (data.jobId && !JOB_ID_RE.test(data.jobId)) throw new Error("Invalid job id");
    return { id: data.id, jobId: data.jobId, values: propertyFormSchema.parse(data.values) };
  })
  .handler(async ({ data, context }) => {
    const { eq } = await import("drizzle-orm");
    const { getDatabase } = await import("@/db/client.server");
    const { properties } = await import("@/db/schema");
    const db = getDatabase();
    const [exists] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.id, data.id))
      .limit(1);
    if (!exists) throw new Error("Property not found");

    const { propertyId } = await publishV2Revision(
      data.values,
      context.adminProfile.id,
      data.id,
      data.jobId,
    );
    // publishWorkflow always brings a property live (isPublished: true) — the
    // form's own checkbox is the one place that can ask for it to go back down.
    if (!data.values.isPublished) {
      await db.update(properties).set({ isPublished: false }).where(eq(properties.id, propertyId));
    }
    const [row] = await db
      .select({ slug: properties.slug })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    return { id: propertyId, slug: row?.slug ?? "" };
  });

/** Owner-only: show/hide a V2 property on the public site without touching its
 *  publication history — the recommended way to take a property down.
 *  Replaces `setPropertyPublished`. */
export const setV2PropertyPublished = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string; isPublished: boolean }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing property id");
    return { id: data.id, isPublished: Boolean(data.isPublished) };
  })
  .handler(async ({ data }) => {
    const { eq } = await import("drizzle-orm");
    const { getDatabase } = await import("@/db/client.server");
    const { properties } = await import("@/db/schema");
    const [updated] = await getDatabase()
      .update(properties)
      .set({ isPublished: data.isPublished })
      .where(eq(properties.id, data.id))
      .returning({ id: properties.id });
    if (!updated) throw new Error("Property not found");
    return { ok: true };
  });

/** Owner-only: permanently erase a V2 property. Deliberately narrow —
 *  publication history is immutable by design (see
 *  scripts/cleanup-orphan-properties.ts) and real visitor content (reviews,
 *  enquiries, field visits) must never be destroyed by a single admin click.
 *  Only a property with zero attached reviews/enquiries/field visits can be
 *  hard-deleted; anything else should be unpublished instead via
 *  `setV2PropertyPublished`. Reuses the same trigger-suspend-then-cascade
 *  technique as the orphan cleanup script, generalized to one arbitrary
 *  property id rather than the fixed orphan predicate. */
export const deleteV2Property = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing property id");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    const { sql, eq } = await import("drizzle-orm");
    const { getDatabase } = await import("@/db/client.server");
    const { properties } = await import("@/db/schema");
    const db = getDatabase();

    const [exists] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.id, data.id))
      .limit(1);
    if (!exists) throw new Error("Property not found");

    const [attached] = await db.execute(sql`
      select
        (select count(*)::int from property_reviews where property_id = ${data.id}) as reviews,
        (select count(*)::int from property_enquiries where property_id = ${data.id}) as enquiries,
        (select count(*)::int from property_field_visits where property_id = ${data.id}) as field_visits
    `);
    const counts = attached as unknown as {
      reviews: number;
      enquiries: number;
      field_visits: number;
    };
    if (counts.reviews + counts.enquiries + counts.field_visits > 0) {
      throw new Error(
        "This property has real reviews, enquiries, or field visits attached — " +
          "unpublish it instead of deleting, so that visitor content isn't destroyed.",
      );
    }

    await db.transaction(async (tx) => {
      const propertyIdParam = data.id;
      const guarded: [table: string, trigger: string][] = [
        ["public.property_publication_versions", "immutable_publication_versions"],
        ["public.property_submission_revisions", "immutable_submission_revisions"],
        ["private.commercial_terms", "immutable_commercial_terms"],
      ];
      for (const [table, trigger] of guarded) {
        await tx.execute(sql.raw(`alter table ${table} disable trigger ${trigger}`));
      }

      const versionIds = sql`(select id from property_publication_versions where property_id = ${propertyIdParam})`;
      const workflowIds = sql`(select id from property_submission_workflows where property_id = ${propertyIdParam})`;
      const variantIds = sql`(select id from configuration_variants where publication_version_id in ${versionIds})`;
      const reraVerificationIds = sql`(select id from property_rera_verifications where publication_version_id in ${versionIds})`;

      await tx.execute(
        sql`delete from property_rera_area_checks where verification_id in ${reraVerificationIds}`,
      );
      await tx.execute(
        sql`delete from property_rera_verifications where publication_version_id in ${versionIds}`,
      );
      await tx.execute(
        sql`delete from property_score_versions where publication_version_id in ${versionIds}`,
      );
      await tx.execute(
        sql`delete from property_verified_locations where publication_version_id in ${versionIds}`,
      );
      await tx.execute(
        sql`delete from publication_assets where publication_version_id in ${versionIds}`,
      );
      await tx.execute(
        sql`delete from configuration_variant_areas where variant_id in ${variantIds}`,
      );
      await tx.execute(
        sql`delete from configuration_variant_rooms where configuration_variant_id in ${variantIds}`,
      );
      await tx.execute(
        sql`delete from private.commercial_terms where configuration_variant_id in ${variantIds}`,
      );
      await tx.execute(
        sql`delete from configuration_variants where publication_version_id in ${versionIds}`,
      );
      await tx.execute(
        sql`delete from property_publication_details where publication_version_id in ${versionIds}`,
      );
      await tx.execute(
        sql`delete from property_amenities where publication_version_id in ${versionIds}`,
      );
      await tx.execute(
        sql`delete from property_specifications where publication_version_id in ${versionIds}`,
      );
      await tx.execute(sql`delete from review_actions where workflow_id in ${workflowIds}`);
      await tx.execute(
        sql`delete from property_publication_versions where property_id = ${propertyIdParam}`,
      );
      await tx.execute(
        sql`delete from property_submission_revisions where workflow_id in ${workflowIds}`,
      );
      await tx.execute(
        sql`delete from property_submission_workflows where property_id = ${propertyIdParam}`,
      );
      await tx.execute(
        sql`delete from property_rating_aggregates where property_id = ${propertyIdParam}`,
      );
      await tx.execute(
        sql`delete from property_field_verification_shortlist where property_id = ${propertyIdParam}`,
      );
      // property_assets.property_id is a nullable RESTRICT FK — uploaded assets outlive the
      // property they were approved for rather than being destroyed alongside it.
      await tx.execute(
        sql`update property_assets set property_id = null where property_id = ${propertyIdParam}`,
      );
      await tx.execute(sql`delete from properties where id = ${propertyIdParam}`);

      for (const [table, trigger] of guarded) {
        await tx.execute(sql.raw(`alter table ${table} enable trigger ${trigger}`));
      }

      await tx.execute(sql`
        insert into audit_events (actor_type, actor_id, action, entity_type, entity_id, metadata)
        values ('staff', ${context.adminProfile.id}, 'property.hard_deleted', 'property', ${propertyIdParam}, '{}'::jsonb)
      `);
    });

    return { ok: true };
  });

/** Owner-only: every V2 property, in the same shape the admin list already
 *  renders for V1 (`AdminProperty`) — see `getAllPropertiesForAdmin` in
 *  properties.functions.ts. Snapshot fields cover identity/editorial content;
 *  `property_publication_details` mirrors V1's flat spec columns closely
 *  enough to fill the rest. V2 has no free-text public price string (pricing
 *  is private/structured, see `commercial_terms`), so `pricePerSqft` always
 *  reads "Price on Request" here, matching how V1 rows already default it
 *  when unset. */
export const getAllV2PropertiesForAdmin = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<AdminProperty[]> => {
    const { eq, inArray } = await import("drizzle-orm");
    const { getDatabase } = await import("@/db/client.server");
    const {
      properties,
      propertyPublicationVersions,
      propertyPublicationDetails,
      markets,
      configurationVariants,
      configurationOptions,
    } = await import("@/db/schema");
    const db = getDatabase();

    const rows = await db
      .select({
        id: properties.id,
        slug: properties.slug,
        category: properties.category,
        isPublished: properties.isPublished,
        publicationVersionId: propertyPublicationVersions.id,
        snapshot: propertyPublicationVersions.publicSnapshot,
        stateName: markets.stateName,
        cityName: markets.cityName,
        details: propertyPublicationDetails,
      })
      .from(properties)
      .innerJoin(
        propertyPublicationVersions,
        eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
      )
      .innerJoin(markets, eq(propertyPublicationVersions.marketId, markets.id))
      .leftJoin(
        propertyPublicationDetails,
        eq(propertyPublicationDetails.publicationVersionId, propertyPublicationVersions.id),
      );
    if (!rows.length) return [];

    const versionIds = rows.map((row) => row.publicationVersionId);
    const variantRows = await db
      .select({
        publicationVersionId: configurationVariants.publicationVersionId,
        displayName: configurationOptions.displayName,
      })
      .from(configurationVariants)
      .innerJoin(
        configurationOptions,
        eq(configurationVariants.configurationOptionId, configurationOptions.id),
      )
      .where(inArray(configurationVariants.publicationVersionId, versionIds));
    const configByVersion = new Map<string, Set<string>>();
    for (const row of variantRows) {
      const set = configByVersion.get(row.publicationVersionId) ?? new Set<string>();
      set.add(row.displayName);
      configByVersion.set(row.publicationVersionId, set);
    }

    const text = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;

    return rows.map((row): AdminProperty => {
      const snapshot = row.snapshot as Record<string, unknown>;
      const d = row.details;
      const gallery = (snapshot.gallery ?? {}) as Record<string, string | null>;
      const configNames = configByVersion.get(row.publicationVersionId);
      return {
        id: row.slug,
        rowId: row.id,
        isPublished: row.isPublished,
        name: text(snapshot.name) ?? "Untitled property",
        developer: text(snapshot.developerName) ?? "-",
        category: (row.category as AdminProperty["category"]) ?? "Apartment",
        tagline: text(snapshot.tagline) ?? "",
        image: text(snapshot.heroImageUrl) ?? "",
        size: "-",
        sizeNumeric: 0,
        superBuiltUpArea: "-",
        carpetArea: "-",
        location: text(snapshot.addressLine) ?? text(snapshot.locality) ?? "-",
        state: row.stateName ?? "",
        city: row.cityName ?? "",
        status: text(snapshot.status) ?? "-",
        configuration: configNames ? [...configNames].sort().join(", ") : "",
        configurations: {},
        pricePerSqft: "Price on Request",
        possession: text(snapshot.possession) ?? "-",
        amenities: (snapshot.amenities as string[] | undefined) ?? [],
        advantages: (snapshot.advantages as string[] | undefined) ?? [],
        gallery: {
          livingRoom: gallery.livingRoom ?? "",
          pool: gallery.pool ?? "",
          clubhouse: gallery.clubhouse ?? "",
          masterBedroom: gallery.masterBedroom ?? "",
        },
        expertNote: text(snapshot.expertNote) ?? "",
        plotSize: d?.plotSizeValue ? `${d.plotSizeValue} ${d.plotSizeUnit ?? ""}`.trim() : null,
        totalTowers: d?.totalTowers ?? null,
        totalFloors: d?.totalFloors ?? null,
        unitsPerFloor: d?.unitsPerFloor ?? null,
        totalUnits: d?.totalUnits ?? null,
        availableBhkTypes: text(snapshot.availableBhkTypes),
        reraId: text(snapshot.reraRegistration),
        reraUrl: text(snapshot.reraUrl),
        parkingLevels: d?.parkingLevels ?? null,
        podiumStructure: d?.podiumStructure ?? null,
        liftsPerTower: d?.liftsPerTower ?? null,
        openSpace: d?.openSpacePercent ? `${d.openSpacePercent}%` : null,
        geyserHeatPumpProvided: d?.geyserProvision ?? null,
        vrvAcProvided: d?.vrvAcProvision ?? null,
        windowGlazing: d?.windowGlazing ?? null,
        bathSanitaryFittings: d?.bathSanitaryFittings ?? null,
        flooringType: d?.flooringType ?? null,
        unitsPerAcre: d?.unitsPerAcre ?? null,
        constructionQuality: d?.constructionQuality ?? null,
        internalCeilingHeight: d?.internalCeilingHeightFt ?? null,
        clubhouseSize: d?.clubhouseSizeSqFt ?? null,
        proposedStartDateRera: d?.proposedStartDateRera ?? null,
        possessionAsOf: text(snapshot.possessionAsOf),
        developerBackground: d?.background ?? null,
        developerExperienceYears: d?.experienceYears ?? null,
        totalDeliveredProjects: d?.deliveredProjects ?? null,
        ongoingProjects: d?.ongoingProjects ?? null,
        notableDeliveredProjects: d?.notableDeliveredProjects ?? [],
      };
    });
  });

/** Owner-only: one V2 property in editable form shape — same reverse mapper
 *  (`buildFormValuesFromRevision`) the developer's own `getMyV2PropertyForEdit`
 *  uses, without the `createdBy` ownership check since the owner can edit any
 *  property. Replaces `getPropertyForEdit` for V2 rows. */
export const getV2PropertyForEdit = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing property id");
    return { id: data.id };
  })
  .handler(async ({ data }): Promise<PropertyFormValues & { id: string }> => {
    const { eq } = await import("drizzle-orm");
    const { getDatabase } = await import("@/db/client.server");
    const { properties, propertyPublicationVersions, propertySubmissionRevisions, markets } =
      await import("@/db/schema");
    const { publicationRevisionSchema } = await import("@/domain/publication");
    const { buildFormValuesFromRevision } = await import("@/domain/publication-to-form.server");

    const db = getDatabase();
    const [row] = await db
      .select({
        sourceRevisionId: propertyPublicationVersions.sourceRevisionId,
        stateName: markets.stateName,
        cityName: markets.cityName,
        isPublished: properties.isPublished,
      })
      .from(properties)
      .innerJoin(
        propertyPublicationVersions,
        eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
      )
      .innerJoin(markets, eq(propertyPublicationVersions.marketId, markets.id))
      .where(eq(properties.id, data.id))
      .limit(1);
    if (!row?.sourceRevisionId) throw new Error("Property not found");

    const [revisionRow] = await db
      .select({ payload: propertySubmissionRevisions.submittedPayload })
      .from(propertySubmissionRevisions)
      .where(eq(propertySubmissionRevisions.id, row.sourceRevisionId))
      .limit(1);
    if (!revisionRow) throw new Error("Property not found");

    const revision = publicationRevisionSchema.parse(revisionRow.payload);
    const values = buildFormValuesFromRevision(revision, {
      stateName: row.stateName,
      cityName: row.cityName,
    });
    // buildFormValuesFromRevision has no isPublished concept of its own (that's a
    // property-level flag, not part of the revision) and defaults it to true —
    // override with the property's real current state so editing a hidden
    // property doesn't silently re-publish it on save.
    return { ...values, isPublished: row.isPublished, id: data.id };
  });
