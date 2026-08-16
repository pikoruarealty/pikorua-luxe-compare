import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import {
  auditEvents,
  cacheInvalidationOutbox,
  commercialTerms,
  configurationOptions,
  configurationVariants,
  properties,
  propertyAssets,
  propertyPublicationVersions,
  propertySubmissionRevisions,
  propertySubmissionWorkflows,
  publicationAssets,
  reviewActions,
} from "@/db/schema";
import { calculatePrivatePriceBounds } from "@/domain/private-pricing.server";
import {
  assertSubmissionTransition,
  calculateVerifiedCompleteness,
  publicationRevisionSchema,
  type PublicationRevision,
  type SubmissionState,
} from "@/domain/publication";
import { slug as slugify } from "@/lib/slug";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function legacyCategory(type: PublicationRevision["property"]["propertyType"]) {
  if (type === "plot") return "Plots";
  if (type === "bungalow" || type === "villa") return "Bungalow";
  return "Apartment";
}

async function createPropertyIdentity(
  tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  revision: PublicationRevision,
  developerId: string,
): Promise<string> {
  const base = revision.requestedSlug ?? slugify(revision.property.name) ?? "property";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 8)}`;
    const [inserted] = await tx
      .insert(properties)
      .values({
        slug: candidate,
        name: revision.property.name,
        category: legacyCategory(revision.property.propertyType),
        configurations: {},
        priceSummary: "Price on Request",
        isPublished: false,
        createdBy: developerId,
      })
      .onConflictDoNothing({ target: properties.slug })
      .returning({ id: properties.id });
    if (inserted) return inserted.id;
  }
  throw new Error("Could not allocate a unique property slug");
}

export async function publishWorkflow(workflowId: string, reviewerId: string) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from property_submission_workflows where id = ${workflowId} for update`,
    );
    const [workflow] = await tx
      .select()
      .from(propertySubmissionWorkflows)
      .where(eq(propertySubmissionWorkflows.id, workflowId))
      .limit(1);
    if (!workflow) throw new Error("Submission workflow not found");
    if (workflow.state !== "in_review") {
      throw new Error("Only a submission in review can be published");
    }

    const [revisionRow] = await tx
      .select()
      .from(propertySubmissionRevisions)
      .where(
        and(
          eq(propertySubmissionRevisions.workflowId, workflowId),
          eq(propertySubmissionRevisions.revision, workflow.currentRevision),
        ),
      )
      .limit(1);
    if (!revisionRow) throw new Error("Current submission revision not found");
    const revision = publicationRevisionSchema.parse(revisionRow.submittedPayload);

    const optionIds = revision.configurations.map((configuration) => configuration.optionId);
    const optionRows = await tx
      .select({ id: configurationOptions.id, kind: configurationOptions.kind })
      .from(configurationOptions)
      .where(inArray(configurationOptions.id, optionIds));
    const optionKinds = new Map(optionRows.map((option) => [option.id, option.kind]));
    if (
      optionRows.length !== new Set(optionIds).size ||
      revision.configurations.some(
        (configuration) => optionKinds.get(configuration.optionId) !== configuration.kind,
      )
    ) {
      throw new Error("Configuration options do not match the canonical taxonomy");
    }

    let propertyId = workflow.propertyId;
    if (!propertyId) {
      propertyId = await createPropertyIdentity(tx, revision, workflow.developerId);
    } else {
      await tx.execute(sql`select id from properties where id = ${propertyId} for update`);
    }

    const [previous] = await tx
      .select({ id: propertyPublicationVersions.id, version: propertyPublicationVersions.version })
      .from(propertyPublicationVersions)
      .where(eq(propertyPublicationVersions.propertyId, propertyId))
      .orderBy(desc(propertyPublicationVersions.version))
      .limit(1);

    assertSubmissionTransition(workflow.state as SubmissionState, "approved");
    const verifiedAt = new Date();
    const publicSnapshot = {
      ...revision.property,
      verifiedDataCompleteness: calculateVerifiedCompleteness(revision),
      reraManuallyVerified: Boolean(revision.reraVerification),
    };
    const [publication] = await tx
      .insert(propertyPublicationVersions)
      .values({
        propertyId,
        version: (previous?.version ?? 0) + 1,
        schemaVersion: revision.schemaVersion,
        marketId: revision.marketId,
        publicSnapshot,
        verifiedAt,
        verifiedBy: reviewerId,
        previousVersionId: previous?.id ?? null,
        sourceRevisionId: revisionRow.id,
      })
      .returning({ id: propertyPublicationVersions.id });
    if (!publication) throw new Error("Could not create publication version");

    for (const [sortOrder, configuration] of revision.configurations.entries()) {
      const [variant] = await tx
        .insert(configurationVariants)
        .values({
          publicationVersionId: publication.id,
          configurationOptionId: configuration.optionId,
          variantName: configuration.variantName,
          areaValue: configuration.areaValue?.toString() ?? null,
          areaBasis: configuration.areaBasis,
          areaUnit: configuration.areaUnit,
          areaState: configuration.areaState,
          bathrooms: configuration.bathrooms,
          bathroomsState: configuration.bathroomsState,
          balconies: configuration.balconies,
          balconiesState: configuration.balconiesState,
          publicFacts: configuration.publicFacts,
          sortOrder,
        })
        .returning({ id: configurationVariants.id });
      if (!variant) throw new Error("Could not create configuration variant");

      const commercial = configuration.commercial;
      if (commercial.baseSalePriceRupees !== null || commercial.rateRupeesPerSqFt !== null) {
        const bounds =
          commercial.baseSalePriceRupees === null
            ? null
            : calculatePrivatePriceBounds(commercial.baseSalePriceRupees);
        await tx.insert(commercialTerms).values({
          configurationVariantId: variant.id,
          revision: 1,
          baseSalePriceRupees: commercial.baseSalePriceRupees,
          rateRupeesPerSqFt: commercial.rateRupeesPerSqFt?.toString() ?? null,
          rateAreaBasis: commercial.rateAreaBasis,
          privateLowerBoundRupees: bounds?.lowerRupees ?? null,
          privateUpperBoundRupees: bounds?.upperRupees ?? null,
          verifiedAt,
          verifiedBy: reviewerId,
          staleAfter: new Date(verifiedAt.getTime() + NINETY_DAYS_MS),
          sourceRevisionId: revisionRow.id,
        });
      }
    }

    if (revision.assetIds.length) {
      const approvedAssets = await tx
        .update(propertyAssets)
        .set({
          propertyId,
          state: "approved",
          approvedBy: reviewerId,
          approvedAt: verifiedAt,
        })
        .where(
          and(
            inArray(propertyAssets.id, revision.assetIds),
            eq(propertyAssets.ownerDeveloperId, workflow.developerId),
            eq(propertyAssets.state, "pending"),
          ),
        )
        .returning({ id: propertyAssets.id });
      if (approvedAssets.length !== new Set(revision.assetIds).size) {
        throw new Error("One or more assets are missing, unowned, or already reviewed");
      }
      await tx.insert(publicationAssets).values(
        approvedAssets.map((asset, sortOrder) => ({
          publicationVersionId: publication.id,
          assetId: asset.id,
          sortOrder,
        })),
      );
    }

    await tx
      .update(properties)
      .set({ currentPublicationVersionId: publication.id, isPublished: true })
      .where(eq(properties.id, propertyId));
    await tx
      .update(propertySubmissionWorkflows)
      .set({ propertyId, state: "published" })
      .where(eq(propertySubmissionWorkflows.id, workflowId));
    await tx.insert(reviewActions).values({
      workflowId,
      submissionRevisionId: revisionRow.id,
      actorId: reviewerId,
      action: "published",
      reason: "Approved canonical revision",
    });
    await tx.insert(auditEvents).values({
      actorType: "staff",
      actorId: reviewerId,
      action: "property.published",
      entityType: "property_publication_version",
      entityId: publication.id,
      metadata: { workflowId, version: (previous?.version ?? 0) + 1 },
    });
    await tx.insert(cacheInvalidationOutbox).values({
      topic: "property-publication",
      entityId: propertyId,
      payload: { publicationVersionId: publication.id },
    });

    return { propertyId, publicationVersionId: publication.id };
  });
}

export async function createReviewerCorrection(
  workflowId: string,
  reviewerId: string,
  correctedPayload: unknown,
  reason: string,
) {
  const corrected = publicationRevisionSchema.parse(correctedPayload);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from property_submission_workflows where id = ${workflowId} for update`,
    );
    const [workflow] = await tx
      .select()
      .from(propertySubmissionWorkflows)
      .where(eq(propertySubmissionWorkflows.id, workflowId))
      .limit(1);
    if (!workflow || workflow.state !== "in_review") {
      throw new Error("Only a submission in review can be corrected");
    }
    const [current] = await tx
      .select()
      .from(propertySubmissionRevisions)
      .where(
        and(
          eq(propertySubmissionRevisions.workflowId, workflowId),
          eq(propertySubmissionRevisions.revision, workflow.currentRevision),
        ),
      )
      .limit(1);
    if (!current) throw new Error("Current revision not found");

    const nextRevision = workflow.currentRevision + 1;
    const [created] = await tx
      .insert(propertySubmissionRevisions)
      .values({
        workflowId,
        revision: nextRevision,
        schemaVersion: corrected.schemaVersion,
        submittedPayload: corrected,
        createdBy: reviewerId,
      })
      .returning({ id: propertySubmissionRevisions.id });
    await tx
      .update(propertySubmissionWorkflows)
      .set({ currentRevision: nextRevision })
      .where(eq(propertySubmissionWorkflows.id, workflowId));
    await tx.insert(reviewActions).values({
      workflowId,
      submissionRevisionId: created.id,
      actorId: reviewerId,
      action: "reviewer_correction",
      reason,
      beforeValues: current.submittedPayload,
      afterValues: corrected,
    });
    return { revisionId: created.id, revision: nextRevision };
  });
}
