/**
 * Post-Phase-D follow-up: retrospective property approval.
 *
 * The 24 properties `scripts/load-brochures.ts` put live were submitted and
 * approved by two script-created accounts (`brochure-reviewer@pikorua.dev` as
 * developer of record, `owner@propcompare.local` as approver) — real accounts,
 * but the approver was never a person clicking Approve. The audit trail is
 * procedurally incomplete even though the data itself was never in question.
 *
 * This script does NOT approve anything and does NOT change what's live. Per
 * property it only:
 *
 *   1. Reads the revision that produced the property's current publication
 *      version, unchanged — no field in it is touched.
 *   2. Opens a brand-new submission workflow for that same property, owned by
 *      the same developer of record, and submits it — the real
 *      saveDeveloperRevision -> submitDeveloperWorkflow sequence, landing the
 *      workflow in `in_review` in the real admin queue (`/admin/submissions`).
 *
 * A person — the real owner, logged in as themselves — then has to open that
 * queue and click Approve on each one. That click is what `publishWorkflow`
 * turns into a new publication version whose `verified_by` is the owner's own
 * admin_profiles id, which is the actual thing this follow-up is for. Nothing
 * here can substitute for that click, on purpose.
 *
 * A property is skipped if it already has a non-terminal workflow (someone
 * already queued it, or a post-live edit is mid-flight) — so a re-run after a
 * partial failure only queues what's still missing.
 *
 *   bun scripts/retrospective-property-approval.ts           # dry run
 *   bun scripts/retrospective-property-approval.ts --apply   # queues for review
 */
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import {
  properties,
  propertyPublicationDetails,
  propertyPublicationVersions,
  propertySubmissionRevisions,
  propertySubmissionWorkflows,
} from "@/db/schema";
import { publicationRevisionSchema } from "@/domain/publication";
import {
  saveDeveloperRevision,
  submitDeveloperWorkflow,
} from "@/repositories/submission-workflow.repository.server";

const APPLY = process.argv.includes("--apply");
const TERMINAL_STATES = ["rejected", "published", "superseded"] as const;

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
    console.log("Nothing to queue.");
    return;
  }

  const propertyIds = live.map((row) => row.id);
  const pendingWorkflows = await db
    .select({ propertyId: propertySubmissionWorkflows.propertyId })
    .from(propertySubmissionWorkflows)
    .where(
      and(
        inArray(propertySubmissionWorkflows.propertyId, propertyIds),
        notInArray(propertySubmissionWorkflows.state, [...TERMINAL_STATES]),
      ),
    );
  const alreadyQueued = new Set(pendingWorkflows.map((row) => row.propertyId));

  const versionIds = live.map((row) => row.currentVersionId as string);
  const versionRows = await db
    .select({
      id: propertyPublicationVersions.id,
      propertyId: propertyPublicationVersions.propertyId,
      sourceRevisionId: propertyPublicationVersions.sourceRevisionId,
    })
    .from(propertyPublicationVersions)
    .where(inArray(propertyPublicationVersions.id, versionIds));
  const versionsByProperty = new Map(versionRows.map((row) => [row.propertyId, row]));

  // A handful of these revisions were written before the RERA compliance
  // fields (`registeredCompletionDateRera`/`constructionProgressRera` and
  // their `*State` siblings) existed on `publicationRevisionSchema`, so they
  // fail a strict re-parse even though nothing about them actually changed.
  // `property_publication_details` is the exact row `publishWorkflow` wrote
  // those fields into for the version that's live right now, so it's the
  // authoritative source for what to backfill — not a guessed default.
  const detailRows = await db
    .select({
      publicationVersionId: propertyPublicationDetails.publicationVersionId,
      registeredCompletionDateRera: propertyPublicationDetails.registeredCompletionDateRera,
      registeredCompletionDateReraState:
        propertyPublicationDetails.registeredCompletionDateReraState,
      constructionProgressRera: propertyPublicationDetails.constructionProgressRera,
      constructionProgressReraState: propertyPublicationDetails.constructionProgressReraState,
    })
    .from(propertyPublicationDetails)
    .where(inArray(propertyPublicationDetails.publicationVersionId, versionIds));
  const detailsByVersion = new Map(detailRows.map((row) => [row.publicationVersionId, row]));
  const KNOWN_MISSING_RERA_PATHS = new Set([
    "details.registeredCompletionDateRera",
    "details.registeredCompletionDateReraState",
    "details.constructionProgressRera",
    "details.constructionProgressReraState",
  ]);

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

  interface Planned {
    propertyId: string;
    slug: string;
    developerId: string;
    payload: unknown;
  }
  const planned: Planned[] = [];
  const skipped: string[] = [];

  for (const property of live) {
    if (alreadyQueued.has(property.id)) {
      skipped.push(`${property.slug} — already has a non-terminal workflow`);
      continue;
    }
    const version = versionsByProperty.get(property.id);
    if (!version) {
      skipped.push(`${property.slug} — current publication version row is missing`);
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
    let result = publicationRevisionSchema.safeParse(revision.payload);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      const detail = detailsByVersion.get(version.id);
      if (detail && paths.every((path) => KNOWN_MISSING_RERA_PATHS.has(path))) {
        const rawPayload = revision.payload as Record<string, unknown>;
        const rawDetails = (rawPayload.details ?? {}) as Record<string, unknown>;
        const patched = {
          ...rawPayload,
          details: {
            ...rawDetails,
            registeredCompletionDateRera: detail.registeredCompletionDateRera,
            registeredCompletionDateReraState: detail.registeredCompletionDateReraState,
            constructionProgressRera: detail.constructionProgressRera,
            constructionProgressReraState: detail.constructionProgressReraState,
          },
        };
        result = publicationRevisionSchema.safeParse(patched);
      }
    }
    if (!result.success) {
      skipped.push(
        `${property.slug} — current revision fails schema parse: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
      );
      continue;
    }
    planned.push({
      propertyId: property.id,
      slug: property.slug,
      developerId: revision.developerId,
      payload: result.data,
    });
  }

  console.log(`\nTo queue for review: ${planned.length}`);
  for (const item of planned) console.log(`  ${item.slug}`);
  if (skipped.length) {
    console.log(`\nSkipped: ${skipped.length}`);
    for (const reason of skipped) console.log(`  ! ${reason}`);
  }

  if (!APPLY) {
    console.log(`\nDry run — no writes made. Re-run with --apply to queue ${planned.length}.`);
    return;
  }
  if (planned.length === 0) {
    console.log("\nNothing to queue.");
    return;
  }

  let queued = 0;
  for (const item of planned) {
    try {
      const { workflowId } = await saveDeveloperRevision(
        item.developerId,
        item.payload,
        undefined,
        item.propertyId,
      );
      await submitDeveloperWorkflow(workflowId, item.developerId);
      queued += 1;
      console.log(`  queued ${item.slug} — workflow v2:${workflowId}`);
    } catch (e) {
      console.error(`  ! FAILED ${item.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nQueued ${queued} of ${planned.length} for review.`);
  console.log("Next: the real owner opens /admin/submissions and approves each one.");
  if (queued !== planned.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
