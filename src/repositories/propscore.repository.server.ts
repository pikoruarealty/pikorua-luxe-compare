import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  assertConsumerPayloadSafe,
  gatedPropScoreSchema,
  type GatedPropScorePayload,
} from "@/contracts/consumer";
import { getDatabase } from "@/db/client.server";
import {
  auditEvents,
  configurationOptions,
  configurationVariants,
  marketLandmarks,
  markets,
  properties,
  propertyConnectivitySnapshots,
  propertyPublicationVersions,
  propertyReraAreaChecks,
  propertyReraVerifications,
  propertyScoreDimensions,
  propertyScoreVersions,
  propertySpecifications,
  propertyVerifiedLocations,
} from "@/db/schema";
import {
  calculatePropScore,
  PROPSCORE_METHODOLOGY_VERSION,
  SCORE_DIMENSIONS,
  type CohortMetric,
  type PropScoreInput,
  type PropScoreResult,
  type SpecificationEntryInput,
} from "@/domain/propscore";
import {
  compareReraArea,
  completionDifferenceDays,
  normalizeArea,
  promoterNamesMatch,
  type ReraVerificationStatus,
  type VerificationAreaUnit,
} from "@/domain/rera-verification";

export interface ReraAreaCheckInput {
  configurationVariantId: string;
  brochureValue: number;
  brochureUnit: VerificationAreaUnit;
  brochureRawText: string;
  reraValue: number;
  reraUnit: VerificationAreaUnit;
  reraRawText: string;
}

export interface RecordReraVerificationInput {
  publicationVersionId: string;
  registrationNumber: string;
  sourceUrl?: string;
  sourceDocumentId?: string;
  checkedAt: string;
  status: ReraVerificationStatus;
  publishedPromoterName?: string;
  officialPromoterName?: string;
  promoterMatchBasis?: "exact" | "normalized" | "manual_override" | "unresolved";
  promoterMatchReason?: string;
  publishedCompletionDate?: string;
  officialCompletionDate?: string;
  notes?: string;
  areas: ReraAreaCheckInput[];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function ratio(numerator: unknown, denominator: unknown): number | null {
  const top = numeric(numerator);
  const bottom = numeric(denominator);
  return top !== null && bottom !== null && bottom > 0 ? top / bottom : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function dimensionInputSnapshot(input: PropScoreInput, dimension: string): Record<string, unknown> {
  if (dimension === "space") return { ...input.space };
  if (dimension === "privacy") return { ...input.privacy };
  if (dimension === "specification") return { ...input.specification };
  if (dimension === "developer") return { ...input.developer };
  if (dimension === "possession") return { ...input.possession };
  return {};
}

export async function listVerificationCandidates() {
  const rows = await getDatabase()
    .select({
      propertyId: properties.id,
      publicationVersionId: propertyPublicationVersions.id,
      slug: properties.slug,
      name: properties.name,
      snapshot: propertyPublicationVersions.publicSnapshot,
      verifiedAt: propertyPublicationVersions.verifiedAt,
      marketId: propertyPublicationVersions.marketId,
    })
    .from(properties)
    .innerJoin(
      propertyPublicationVersions,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .orderBy(properties.name);
  const variants = rows.length
    ? await getDatabase()
        .select({
          publicationVersionId: configurationVariants.publicationVersionId,
          id: configurationVariants.id,
          displayName: configurationOptions.displayName,
          variantName: configurationVariants.variantName,
        })
        .from(configurationVariants)
        .innerJoin(
          configurationOptions,
          eq(configurationVariants.configurationOptionId, configurationOptions.id),
        )
        .where(
          inArray(
            configurationVariants.publicationVersionId,
            rows.map((row) => row.publicationVersionId),
          ),
        )
    : [];
  return rows.map((row) => ({
    propertyId: row.propertyId,
    publicationVersionId: row.publicationVersionId,
    slug: row.slug,
    name: text((row.snapshot as Record<string, unknown>).name) ?? row.name,
    reraRegistration: text((row.snapshot as Record<string, unknown>).reraRegistration),
    verifiedAt: row.verifiedAt.toISOString(),
    marketId: row.marketId,
    configurations: variants
      .filter((variant) => variant.publicationVersionId === row.publicationVersionId)
      .map((variant) => ({
        id: variant.id,
        label: [variant.displayName, variant.variantName].filter(Boolean).join(" · "),
      })),
  }));
}

export async function recordReraVerification(
  input: RecordReraVerificationInput,
  reviewerId: string,
) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [publication] = await tx
      .select({
        id: propertyPublicationVersions.id,
        currentId: properties.currentPublicationVersionId,
      })
      .from(propertyPublicationVersions)
      .innerJoin(properties, eq(propertyPublicationVersions.propertyId, properties.id))
      .where(eq(propertyPublicationVersions.id, input.publicationVersionId))
      .limit(1);
    if (!publication || publication.currentId !== publication.id) {
      throw new Error("RERA verification requires the current published version");
    }

    const variantIds = input.areas.map((area) => area.configurationVariantId);
    if (variantIds.length) {
      const owned = await tx
        .select({ id: configurationVariants.id })
        .from(configurationVariants)
        .where(
          and(
            eq(configurationVariants.publicationVersionId, input.publicationVersionId),
            inArray(configurationVariants.id, variantIds),
          ),
        );
      if (new Set(owned.map((row) => row.id)).size !== new Set(variantIds).size) {
        throw new Error("A RERA area check does not belong to this publication");
      }
    }

    const [previous] = await tx
      .select({ id: propertyReraVerifications.id, revision: propertyReraVerifications.revision })
      .from(propertyReraVerifications)
      .where(eq(propertyReraVerifications.publicationVersionId, input.publicationVersionId))
      .orderBy(desc(propertyReraVerifications.revision))
      .limit(1);

    const promoterMatch =
      input.publishedPromoterName && input.officialPromoterName
        ? promoterNamesMatch(input.publishedPromoterName, input.officialPromoterName) ||
          input.promoterMatchBasis === "manual_override"
        : null;
    if (input.promoterMatchBasis === "manual_override" && !input.promoterMatchReason?.trim()) {
      throw new Error("A manual promoter match requires a reason");
    }
    if (input.promoterMatchBasis === "unresolved" && input.status !== "invalid_registration") {
      throw new Error("An unresolved promoter mismatch must invalidate the registration");
    }

    const comparisons = input.areas.map((area) =>
      compareReraArea(
        normalizeArea(area.brochureValue, area.brochureUnit, area.brochureRawText),
        normalizeArea(area.reraValue, area.reraUnit, area.reraRawText),
      ),
    );
    const completionDifference =
      input.publishedCompletionDate && input.officialCompletionDate
        ? completionDifferenceDays(input.publishedCompletionDate, input.officialCompletionDate)
        : null;
    const derivedStatus: ReraVerificationStatus =
      input.status === "unavailable"
        ? "unavailable"
        : promoterMatch === false || input.promoterMatchBasis === "unresolved"
          ? "invalid_registration"
          : comparisons.some((comparison) => comparison.result === "discrepancy") ||
              input.status === "discrepancy"
            ? "discrepancy"
            : "matched";
    if (derivedStatus !== input.status) {
      throw new Error(`RERA status must be ${derivedStatus} for the supplied evidence`);
    }

    const [verification] = await tx
      .insert(propertyReraVerifications)
      .values({
        publicationVersionId: input.publicationVersionId,
        revision: (previous?.revision ?? 0) + 1,
        registrationNumber: input.registrationNumber,
        sourceUrl: input.sourceUrl ?? null,
        sourceDocumentId: input.sourceDocumentId ?? null,
        checkedBy: reviewerId,
        checkedAt: new Date(input.checkedAt),
        status: derivedStatus,
        publishedPromoterName: input.publishedPromoterName ?? null,
        officialPromoterName: input.officialPromoterName ?? null,
        promoterMatch,
        promoterMatchBasis: input.promoterMatchBasis ?? null,
        promoterMatchReason: input.promoterMatchReason ?? null,
        publishedCompletionDate: input.publishedCompletionDate ?? null,
        officialCompletionDate: input.officialCompletionDate ?? null,
        completionDifferenceDays: completionDifference,
        notes: input.notes ?? null,
        supersedesId: previous?.id ?? null,
      })
      .returning({
        id: propertyReraVerifications.id,
        revision: propertyReraVerifications.revision,
      });
    if (!verification) throw new Error("Could not save RERA verification");

    if (comparisons.length) {
      await tx.insert(propertyReraAreaChecks).values(
        comparisons.map((comparison, index) => ({
          verificationId: verification.id,
          configurationVariantId: input.areas[index].configurationVariantId,
          brochureRawValue: comparison.brochure.rawValue.toString(),
          brochureRawUnit: comparison.brochure.rawUnit,
          brochureRawText: comparison.brochure.rawText,
          brochureSqFt: comparison.brochure.squareFeet.toString(),
          reraRawValue: comparison.rera.rawValue.toString(),
          reraRawUnit: comparison.rera.rawUnit,
          reraRawText: comparison.rera.rawText,
          reraSqFt: comparison.rera.squareFeet.toString(),
          absoluteDifferenceSqFt: comparison.absoluteDifferenceSqFt.toString(),
          differencePercent: comparison.differencePercent.toString(),
          result: comparison.result,
        })),
      );
    }
    await tx.insert(auditEvents).values({
      actorType: "staff",
      actorId: reviewerId,
      action: previous ? "rera_verification_superseded" : "rera_verification_created",
      entityType: "property_rera_verification",
      entityId: verification.id,
      reason: input.notes ?? null,
      metadata: {
        publicationVersionId: input.publicationVersionId,
        revision: verification.revision,
        status: derivedStatus,
      },
    });
    return { id: verification.id, revision: verification.revision, status: derivedStatus };
  });
}

interface AreaRow {
  [key: string]: unknown;
  publication_version_id: string;
  variant_id: string;
  kind: string;
  property_type: string;
  basis: string;
  value: string | number | null;
  state: string;
}

function cohortMetric(
  metric: string,
  label: string,
  value: number | null,
  preferred: number[],
  fallback: number[],
  higherIsStronger: boolean,
  publicationId: string,
  verifiedAt: Date,
): CohortMetric | null {
  return value === null
    ? null
    : {
        metric,
        label,
        value,
        preferredCohort: preferred,
        fallbackCohort: fallback,
        preferredCohortLabel: "same configuration, market and property type",
        fallbackCohortLabel: "same market and property type",
        higherIsStronger,
        evidenceReference: `publication:${publicationId}`,
        evidenceAsOf: verifiedAt.toISOString().slice(0, 10),
      };
}

export async function assembleVerifiedPropScoreInput(
  publicationVersionId: string,
  calculatedAt = new Date(),
): Promise<{ input: PropScoreInput; cohortSnapshot: Record<string, unknown> }> {
  calculatedAt = new Date(`${calculatedAt.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const db = getDatabase();
  const [target] = await db
    .select({
      id: propertyPublicationVersions.id,
      marketId: propertyPublicationVersions.marketId,
      snapshot: propertyPublicationVersions.publicSnapshot,
      verifiedAt: propertyPublicationVersions.verifiedAt,
      propertyType: properties.category,
      currentId: properties.currentPublicationVersionId,
    })
    .from(propertyPublicationVersions)
    .innerJoin(properties, eq(propertyPublicationVersions.propertyId, properties.id))
    .where(eq(propertyPublicationVersions.id, publicationVersionId))
    .limit(1);
  if (!target || target.currentId !== target.id) {
    throw new Error("PropScore can only be calculated for the current publication");
  }
  const snapshot = target.snapshot as Record<string, unknown>;
  const propertyType = text(snapshot.propertyType) ?? target.propertyType;
  const cohortRows = await db
    .select({
      id: propertyPublicationVersions.id,
      snapshot: propertyPublicationVersions.publicSnapshot,
      verifiedAt: propertyPublicationVersions.verifiedAt,
    })
    .from(propertyPublicationVersions)
    .innerJoin(
      properties,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .where(eq(propertyPublicationVersions.marketId, target.marketId));
  const cohort = cohortRows.filter(
    (row) =>
      (text((row.snapshot as Record<string, unknown>).propertyType) ?? "apartment") ===
      propertyType,
  );
  const snapshots = cohort.map((row) => row.snapshot as Record<string, unknown>);
  const cohortValues = (read: (item: Record<string, unknown>) => number | null) =>
    snapshots.map(read).filter((value): value is number => value !== null);

  // Phase 1 owns this table. Static SQL lets Phase 5 compile before that PR
  // lands; the feature stays off until the additive migration exists.
  const areaResult = await db.execute<AreaRow>(sql`
    SELECT ppv.id AS publication_version_id, cv.id AS variant_id, co.kind,
           COALESCE(ppv.public_snapshot->>'propertyType', p.category) AS property_type,
           cva.basis, cva.value, cva.state
      FROM property_publication_versions ppv
      JOIN properties p ON p.current_publication_version_id = ppv.id
      JOIN configuration_variants cv ON cv.publication_version_id = ppv.id
      JOIN configuration_options co ON co.id = cv.configuration_option_id
      JOIN configuration_variant_areas cva ON cva.variant_id = cv.id
     WHERE ppv.market_id = ${target.marketId}
       AND COALESCE(ppv.public_snapshot->>'propertyType', p.category) = ${propertyType}
  `);
  const areaRows = Array.from(areaResult);
  const byVariant = new Map<string, AreaRow[]>();
  for (const row of areaRows)
    byVariant.set(row.variant_id, [...(byVariant.get(row.variant_id) ?? []), row]);
  const targetVariants = [...byVariant.entries()].filter(
    ([, rows]) => rows[0]?.publication_version_id === target.id,
  );
  const cohortAreaMetric = (
    kind: string,
    basis: string,
    efficiency = false,
    sameConfiguration = true,
  ) =>
    [...byVariant.values()].flatMap((rows) => {
      if (rows[0]?.property_type !== propertyType || (sameConfiguration && rows[0]?.kind !== kind))
        return [];
      const area = rows.find((row) => row.basis === basis && row.state === "stated");
      if (!area) return [];
      if (!efficiency) return numeric(area.value) ?? [];
      const superArea = rows.find(
        (row) => row.basis === "super_built_up" && row.state === "stated",
      );
      const value = ratio(area.value, superArea?.value);
      return value === null ? [] : [value];
    });

  const [latestRera] = await db
    .select()
    .from(propertyReraVerifications)
    .where(eq(propertyReraVerifications.publicationVersionId, target.id))
    .orderBy(desc(propertyReraVerifications.revision))
    .limit(1);
  const specificationRows = await db
    .select({
      code: propertySpecifications.specificationCode,
      state: propertySpecifications.valueState,
      value: propertySpecifications.valueText,
    })
    .from(propertySpecifications)
    .where(eq(propertySpecifications.publicationVersionId, target.id));
  const catalogResult = await db.execute<{ count: string | number }>(
    sql`SELECT count(*)::integer AS count FROM specification_catalog`,
  );
  const catalogSize = numeric(Array.from(catalogResult)[0]?.count) ?? 0;
  const specifications: SpecificationEntryInput[] = specificationRows.map((row) => ({
    code: row.code,
    state:
      row.state === "stated" ||
      row.state === "explicitly_not_offered" ||
      row.state === "not_stated" ||
      row.state === "pending_review"
        ? row.state
        : "invalid",
    // A capitalized marketing phrase is not a brand. Phase 1 may provide a
    // structured brand later; until then only an explicit `Brand:` value earns
    // the documented bonus.
    namedBrand: Boolean(text(row.value)?.match(/^brand:\s*\S/i)),
    evidenceReference: `publication:${target.id}:specification:${row.code}`,
    evidenceAsOf: target.verifiedAt.toISOString().slice(0, 10),
  }));

  const metricFromSnapshot = (
    key: string,
    label: string,
    higherIsStronger: boolean,
    transform: (item: Record<string, unknown>) => number | null = (item) => numeric(item[key]),
  ) =>
    cohortMetric(
      key,
      label,
      transform(snapshot),
      cohortValues(transform),
      cohortValues(transform),
      higherIsStronger,
      target.id,
      target.verifiedAt,
    );
  const delivery = (item: Record<string, unknown>) =>
    ratio(
      item.deliveredProjects,
      (numeric(item.deliveredProjects) ?? 0) + (numeric(item.ongoingProjects) ?? 0),
    );

  const input: PropScoreInput = {
    calculatedAt: calculatedAt.toISOString(),
    space: {
      variants: targetVariants.map(([variantId, rows]) => {
        const kind = rows[0]?.kind ?? "configuration";
        const rera = rows.find((row) => row.basis === "rera_carpet" && row.state === "stated");
        const superArea = rows.find(
          (row) => row.basis === "super_built_up" && row.state === "stated",
        );
        const areaValue = numeric(rera?.value);
        const efficiencyValue = ratio(rera?.value, superArea?.value);
        return {
          label: kind,
          validationPassed: areaValue !== null && efficiencyValue !== null,
          efficiency: cohortMetric(
            "rera_carpet_efficiency",
            `${kind} RERA carpet efficiency`,
            efficiencyValue,
            cohortAreaMetric(kind, "rera_carpet", true),
            cohortAreaMetric(kind, "rera_carpet", true, false),
            true,
            `publication:${target.id}:variant:${variantId}`,
            target.verifiedAt,
          ),
          reraCarpetArea: cohortMetric(
            "rera_carpet_area",
            `${kind} RERA carpet area`,
            areaValue,
            cohortAreaMetric(kind, "rera_carpet"),
            cohortAreaMetric(kind, "rera_carpet", false, false),
            true,
            `publication:${target.id}:variant:${variantId}`,
            target.verifiedAt,
          ),
        };
      }),
    },
    privacy: {
      unitsPerAcre: metricFromSnapshot("unitsPerAcre", "Units per acre", false),
      liftAdequacy: metricFromSnapshot(
        "liftAdequacy",
        "Lifts per home on a typical floor",
        true,
        (item) => ratio(item.liftsPerTower, item.unitsPerFloor),
      ),
      openSpacePercent: metricFromSnapshot("openSpacePercent", "Open space", true),
      clubhousePerUnit: metricFromSnapshot(
        "clubhousePerUnit",
        "Clubhouse area per home",
        true,
        (item) => ratio(item.clubhouseSizeSqFt, item.totalUnits),
      ),
    },
    specification: { catalogSize, entries: specifications },
    developer: {
      deliveryRatio: metricFromSnapshot(
        "deliveryRatio",
        "Developer delivery ratio",
        true,
        delivery,
      ),
      experienceYears: metricFromSnapshot("experienceYears", "Developer experience", true),
    },
    possession: {
      identityMatch: latestRera?.promoterMatch ?? null,
      brochureCompletionDate: latestRera?.publishedCompletionDate ?? null,
      reraCompletionDate: latestRera?.officialCompletionDate ?? null,
      evidenceVerifiedOn: latestRera?.checkedAt.toISOString().slice(0, 10) ?? null,
      currentStatusEvidence: Boolean(text(snapshot.possessionConfirmedAsOf)),
      evidenceReference: latestRera ? `rera-verification:${latestRera.id}` : null,
    },
  };
  return {
    input,
    cohortSnapshot: {
      marketId: target.marketId,
      propertyType,
      cohortPublicationIds: cohort.map((row) => row.id),
      calculatedAt: calculatedAt.toISOString(),
    },
  };
}

export async function calculateAndPersistPropScore(
  publicationVersionId: string,
  reviewerId: string,
) {
  const assembled = await assembleVerifiedPropScoreInput(publicationVersionId);
  const result = calculatePropScore(assembled.input);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({
        id: propertyScoreVersions.id,
        revision: propertyScoreVersions.revision,
        cohortSnapshot: propertyScoreVersions.cohortSnapshot,
      })
      .from(propertyScoreVersions)
      .where(
        and(
          eq(propertyScoreVersions.publicationVersionId, publicationVersionId),
          eq(propertyScoreVersions.methodologyVersion, PROPSCORE_METHODOLOGY_VERSION),
        ),
      )
      .orderBy(desc(propertyScoreVersions.revision))
      .limit(1);
    if (previous) {
      const existingDimensions = await tx
        .select({
          dimension: propertyScoreDimensions.dimension,
          inputSnapshot: propertyScoreDimensions.inputSnapshot,
        })
        .from(propertyScoreDimensions)
        .where(eq(propertyScoreDimensions.scoreVersionId, previous.id));
      const unchangedCohort =
        stableJson(previous.cohortSnapshot) === stableJson(assembled.cohortSnapshot);
      const unchangedInputs =
        existingDimensions.length === SCORE_DIMENSIONS.length &&
        existingDimensions.every(
          (dimension) =>
            stableJson(dimension.inputSnapshot) ===
            stableJson(dimensionInputSnapshot(assembled.input, dimension.dimension)),
        );
      if (unchangedCohort && unchangedInputs) {
        return { ...result, id: previous.id, revision: previous.revision, reused: true as const };
      }
    }
    const [scoreVersion] = await tx
      .insert(propertyScoreVersions)
      .values({
        publicationVersionId,
        methodologyVersion: result.methodologyVersion,
        revision: (previous?.revision ?? 0) + 1,
        composite: result.composite,
        status: result.status,
        coveragePercent: result.coveragePercent,
        cohortSnapshot: assembled.cohortSnapshot,
        calculatedBy: reviewerId,
        calculatedAt: new Date(assembled.input.calculatedAt),
        supersedesId: previous?.id ?? null,
      })
      .returning({ id: propertyScoreVersions.id, revision: propertyScoreVersions.revision });
    if (!scoreVersion) throw new Error("Could not persist PropScore");
    await tx.insert(propertyScoreDimensions).values(
      result.dimensions.map((dimension) => ({
        scoreVersionId: scoreVersion.id,
        dimension: dimension.dimension,
        score: dimension.score,
        status: dimension.status,
        coveragePercent: dimension.coveragePercent,
        inputSnapshot: dimensionInputSnapshot(assembled.input, dimension.dimension),
        publicExplanation: dimension.why,
      })),
    );
    await tx.insert(auditEvents).values({
      actorType: "staff",
      actorId: reviewerId,
      action: previous ? "propscore_superseded" : "propscore_calculated",
      entityType: "property_score_version",
      entityId: scoreVersion.id,
      metadata: {
        publicationVersionId,
        methodologyVersion: result.methodologyVersion,
        revision: scoreVersion.revision,
        status: result.status,
      },
    });
    return { ...result, id: scoreVersion.id, revision: scoreVersion.revision };
  });
}

function publicWhy(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const reason = item as Record<string, unknown>;
    const label = text(reason.metric);
    const explanation = text(reason.explanation);
    const evidenceAsOf = text(reason.evidenceAsOf);
    return label && explanation && evidenceAsOf ? [{ label, explanation, evidenceAsOf }] : [];
  });
}

export async function findGatedPropScore(slug: string): Promise<GatedPropScorePayload | null> {
  const db = getDatabase();
  const [publication] = await db
    .select({ id: propertyPublicationVersions.id })
    .from(properties)
    .innerJoin(
      propertyPublicationVersions,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .where(eq(properties.slug, slug))
    .limit(1);
  if (!publication) return null;
  const [score] = await db
    .select()
    .from(propertyScoreVersions)
    .where(
      and(
        eq(propertyScoreVersions.publicationVersionId, publication.id),
        eq(propertyScoreVersions.methodologyVersion, PROPSCORE_METHODOLOGY_VERSION),
      ),
    )
    .orderBy(desc(propertyScoreVersions.revision))
    .limit(1);
  if (!score) return null;
  const [dimensions, reraRows, locations] = await Promise.all([
    db
      .select()
      .from(propertyScoreDimensions)
      .where(eq(propertyScoreDimensions.scoreVersionId, score.id)),
    db
      .select()
      .from(propertyReraVerifications)
      .where(eq(propertyReraVerifications.publicationVersionId, publication.id))
      .orderBy(desc(propertyReraVerifications.revision))
      .limit(1),
    db
      .select()
      .from(propertyVerifiedLocations)
      .where(eq(propertyVerifiedLocations.publicationVersionId, publication.id))
      .orderBy(desc(propertyVerifiedLocations.revision))
      .limit(1),
  ]);
  const rera = reraRows[0];
  const discrepancies = rera
    ? await db
        .select({
          variantName: configurationVariants.variantName,
          displayName: configurationOptions.displayName,
          brochureRawText: propertyReraAreaChecks.brochureRawText,
          reraRawText: propertyReraAreaChecks.reraRawText,
          differencePercent: propertyReraAreaChecks.differencePercent,
        })
        .from(propertyReraAreaChecks)
        .innerJoin(
          configurationVariants,
          eq(propertyReraAreaChecks.configurationVariantId, configurationVariants.id),
        )
        .innerJoin(
          configurationOptions,
          eq(configurationVariants.configurationOptionId, configurationOptions.id),
        )
        .where(
          and(
            eq(propertyReraAreaChecks.verificationId, rera.id),
            eq(propertyReraAreaChecks.result, "discrepancy"),
          ),
        )
    : [];
  const connectivityRows = locations[0]
    ? await db
        .select({
          landmarkId: marketLandmarks.id,
          category: marketLandmarks.category,
          landmark: marketLandmarks.displayName,
          distanceMeters: propertyConnectivitySnapshots.distanceMeters,
          durationSeconds: propertyConnectivitySnapshots.durationSeconds,
          calculatedAt: propertyConnectivitySnapshots.calculatedAt,
          revision: propertyConnectivitySnapshots.revision,
        })
        .from(propertyConnectivitySnapshots)
        .innerJoin(
          marketLandmarks,
          eq(propertyConnectivitySnapshots.landmarkId, marketLandmarks.id),
        )
        .where(eq(propertyConnectivitySnapshots.verifiedLocationId, locations[0].id))
        .orderBy(desc(propertyConnectivitySnapshots.revision))
    : [];
  const latestConnectivity = [
    ...new Map(connectivityRows.map((row) => [row.landmarkId, row])).values(),
  ];
  const dimensionByKey = new Map(dimensions.map((dimension) => [dimension.dimension, dimension]));
  const response = gatedPropScoreSchema.parse({
    methodologyVersion: score.methodologyVersion,
    calculatedAt: score.calculatedAt.toISOString(),
    composite: score.composite,
    status: score.status === "complete" ? "complete" : "insufficient_evidence",
    coveragePercent: score.coveragePercent,
    dimensions: SCORE_DIMENSIONS.map((key) => {
      const dimension = dimensionByKey.get(key);
      return {
        key,
        score: dimension?.score ?? null,
        status:
          dimension?.status === "complete" || dimension?.status === "invalid"
            ? dimension.status
            : "insufficient_evidence",
        coveragePercent: dimension?.coveragePercent ?? 0,
        why: publicWhy(dimension?.publicExplanation),
      };
    }),
    reraCrossCheck: {
      status: rera?.status ?? "pending",
      checkedAt: rera?.checkedAt.toISOString() ?? null,
      promoterMatch: rera?.promoterMatch ?? null,
      completionDifferenceDays: rera?.completionDifferenceDays ?? null,
      areaDiscrepancies: discrepancies.map((item) => ({
        configurationLabel: [item.displayName, item.variantName].filter(Boolean).join(" · "),
        brochureValue: item.brochureRawText,
        reraValue: item.reraRawText,
        differencePercent: Number(item.differencePercent),
      })),
    },
    connectivity: latestConnectivity.map((item) => ({
      category: item.category,
      landmark: item.landmark,
      distanceKm: item.distanceMeters === null ? null : Math.round(item.distanceMeters / 100) / 10,
      durationMinutes: item.durationSeconds === null ? null : Math.round(item.durationSeconds / 60),
      calculatedAt: item.calculatedAt.toISOString(),
    })),
  });
  assertConsumerPayloadSafe(response);
  return response;
}
