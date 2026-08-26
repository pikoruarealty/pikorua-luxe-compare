/**
 * Phase C, sub-phase C7: backfill `property_amenities` for the properties
 * that were live before the amenity mapper existed.
 *
 * `publishWorkflow` now maps `revision.presentation.amenities` onto
 * `amenity_catalog` codes on every publish (see
 * `src/domain/amenity-mapping.ts`), but publication versions are immutable —
 * a property published before this shipped has a `property_amenities` gap
 * that only a new version can close. This is the same mechanism C6 used to
 * backfill `presentation` itself (`scripts/republish-with-presentation.ts`),
 * but that script cannot be reused here: it skips a property whenever its
 * grafted `presentation` already matches what's live, and for these 24
 * properties `presentation` is already current post-C6 — every one of them
 * would be silently skipped, and nothing would ever get amenity rows.
 *
 * What this does per property, and deliberately no more:
 *
 *   1. Read the revision that produced the property's current publication
 *      version, unchanged — no field in it is touched.
 *   2. Re-publish that exact payload via saveDeveloperRevision ->
 *      submitDeveloperWorkflow -> publishWorkflow, the real state machine,
 *      attributed to the original developer and reviewer. This creates a new
 *      publication version whose content is byte-for-byte identical to the
 *      one it supersedes, purely so publishWorkflow's amenity-mapping step
 *      runs against it.
 *
 * A property is skipped if its current revision has no amenities to map, or
 * if its current publication version already has `property_amenities` rows
 * (already backfilled, or published after the mapper shipped) — so a re-run
 * after a partial failure only republishes what's still missing.
 *
 * WARNING: `DATABASE_URL` locally is a native Postgres on 127.0.0.1:5433, not
 * a tunnel into the VM. Reaching real production data requires running this
 * on the VM itself.
 *
 *   bun scripts/backfill-amenities.ts           # dry run
 *   bun scripts/backfill-amenities.ts --apply   # publishes
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import {
  amenityCatalog,
  properties,
  propertyAmenities,
  propertyPublicationVersions,
  propertySubmissionRevisions,
  propertySubmissionWorkflows,
} from "@/db/schema";
import { matchAmenities } from "@/domain/amenity-mapping";
import { publicationRevisionSchema } from "@/domain/publication";
import { publishWorkflow } from "@/repositories/publication.repository.server";
import {
  saveDeveloperRevision,
  submitDeveloperWorkflow,
} from "@/repositories/submission-workflow.repository.server";

const APPLY = process.argv.includes("--apply");

async function main() {
  const db = getDatabase();

  const live = await db
    .select({
      id: properties.id,
      slug: properties.slug,
      currentVersionId: properties.currentPublicationVersionId,
    })
    .from(properties)
    .where(and(eq(properties.isPublished, true), isNotNull(properties.currentPublicationVersionId)))
    .orderBy(properties.slug);

  console.log(`Live V2 properties: ${live.length}`);
  if (live.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const versionIds = live.map((row) => row.currentVersionId as string);
  const versionRows = await db
    .select({
      id: propertyPublicationVersions.id,
      sourceRevisionId: propertyPublicationVersions.sourceRevisionId,
      verifiedBy: propertyPublicationVersions.verifiedBy,
    })
    .from(propertyPublicationVersions)
    .where(inArray(propertyPublicationVersions.id, versionIds));
  const versions = new Map(versionRows.map((row) => [row.id, row]));

  const alreadyBackfilled = new Set(
    (
      await db
        .selectDistinct({ publicationVersionId: propertyAmenities.publicationVersionId })
        .from(propertyAmenities)
        .where(inArray(propertyAmenities.publicationVersionId, versionIds))
    ).map((row) => row.publicationVersionId),
  );

  const revisionIds = versionRows
    .map((row) => row.sourceRevisionId)
    .filter((id): id is string => id !== null);
  const revisionRows = revisionIds.length
    ? await db
        .select({
          id: propertySubmissionRevisions.id,
          payload: propertySubmissionRevisions.submittedPayload,
          developerId: propertySubmissionWorkflows.developerId,
        })
        .from(propertySubmissionRevisions)
        .innerJoin(
          propertySubmissionWorkflows,
          eq(propertySubmissionRevisions.workflowId, propertySubmissionWorkflows.id),
        )
        .where(inArray(propertySubmissionRevisions.id, revisionIds))
    : [];
  const revisions = new Map(revisionRows.map((row) => [row.id, row]));

  const catalog = await db
    .select({ code: amenityCatalog.code, displayName: amenityCatalog.displayName })
    .from(amenityCatalog);

  interface Planned {
    propertyId: string;
    slug: string;
    developerId: string;
    reviewerId: string;
    payload: unknown;
    summary: string;
  }
  const planned: Planned[] = [];
  const skipped: string[] = [];

  for (const property of live) {
    const versionId = property.currentVersionId as string;
    const version = versions.get(versionId);
    if (!version) {
      skipped.push(`${property.slug} — current publication version row is missing`);
      continue;
    }
    if (alreadyBackfilled.has(versionId)) {
      skipped.push(`${property.slug} — already has property_amenities rows`);
      continue;
    }
    if (!version.sourceRevisionId) {
      skipped.push(`${property.slug} — publication version has no source_revision_id`);
      continue;
    }
    const revision = revisions.get(version.sourceRevisionId);
    if (!revision) {
      skipped.push(`${property.slug} — source revision ${version.sourceRevisionId} not found`);
      continue;
    }

    const result = publicationRevisionSchema.safeParse(revision.payload);
    if (!result.success) {
      // A revision saved before a later schema addition (e.g. the RERA
      // compliance fields) has no default for that field and fails a strict
      // re-parse. Reported, not thrown — one bad revision shouldn't abort a
      // batch of 24, and this needs a human decision, not a guessed default.
      skipped.push(
        `${property.slug} — current revision fails schema parse: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
      );
      continue;
    }
    const parsed = result.data;
    const { matched, unmatched } = matchAmenities(parsed.presentation.amenities, catalog);
    if (matched.length === 0 && unmatched.length === 0) {
      skipped.push(`${property.slug} — no amenities on the current revision`);
      continue;
    }

    planned.push({
      propertyId: property.id,
      slug: property.slug,
      developerId: revision.developerId,
      reviewerId: version.verifiedBy,
      payload: parsed,
      summary: `${matched.length} matched, ${unmatched.length} to amenitiesOther`,
    });
  }

  console.log(`\nTo republish: ${planned.length}`);
  for (const item of planned) {
    console.log(`  ${item.slug} — ${item.summary}`);
  }
  if (skipped.length) {
    console.log(`\nSkipped: ${skipped.length}`);
    for (const reason of skipped) console.log(`  ! ${reason}`);
  }

  if (!APPLY) {
    console.log(`\nDry run — no writes made. Re-run with --apply to republish ${planned.length}.`);
    return;
  }
  if (planned.length === 0) {
    console.log("\nNothing to republish.");
    return;
  }

  let published = 0;
  for (const item of planned) {
    try {
      const { workflowId } = await saveDeveloperRevision(
        item.developerId,
        item.payload,
        undefined,
        item.propertyId,
      );
      await submitDeveloperWorkflow(workflowId, item.developerId);
      await publishWorkflow(workflowId, item.reviewerId);
      published += 1;
      console.log(`  published ${item.slug}`);
    } catch (e) {
      console.error(`  ! FAILED ${item.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nRepublished ${published} of ${planned.length}.`);
  if (published !== planned.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
