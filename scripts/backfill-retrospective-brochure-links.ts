/**
 * Restores provenance for the 24 retrospective review drafts.
 *
 * The original catalogue import read the archived OCR JSON files directly,
 * which preserved the property data but did not retain the source job id on
 * its workflow. This script deterministically matches each live property's
 * name to its richest archived extraction, grants the owning reviewer access
 * to that job, and links the existing draft to it. It never submits or
 * publishes a workflow.
 *
 *   bun scripts/backfill-retrospective-brochure-links.ts
 *   bun scripts/backfill-retrospective-brochure-links.ts --apply
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { brochureJobs, properties, propertySubmissionWorkflows } from "@/db/schema";
import type { PropertyExtraction } from "@/lib/brochure-field-mapping";

const APPLY = process.argv.includes("--apply");
const JOBS_DIR = resolve("property-ocr-suite/backend/storage/jobs");

interface ArchivedJob {
  jobId: string;
  propertyName: string;
  configurationCount: number;
}

function normalizedName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractionName(extraction: PropertyExtraction): string {
  const field = extraction.basics?.property_name;
  if (!field || !field.found || field.value === null || field.value === undefined) return "";
  return String(field.value).trim();
}

function loadBestJobs(): Map<string, ArchivedJob> {
  const best = new Map<string, ArchivedJob>();
  for (const filename of readdirSync(JOBS_DIR)) {
    if (!/^[a-f0-9]{12,32}\.json$/i.test(filename)) continue;
    const parsed = JSON.parse(readFileSync(join(JOBS_DIR, filename), "utf8")) as Record<
      string,
      unknown
    >;
    const extraction = (parsed.extraction ?? parsed) as PropertyExtraction;
    const propertyName = extractionName(extraction);
    if (!propertyName) continue;
    const candidate: ArchivedJob = {
      jobId: filename.slice(0, -".json".length),
      propertyName,
      configurationCount: extraction.configurations?.length ?? 0,
    };
    const key = normalizedName(propertyName);
    const current = best.get(key);
    if (!current || candidate.configurationCount > current.configurationCount)
      best.set(key, candidate);
  }
  return best;
}

async function main() {
  const bestJobs = loadBestJobs();
  const db = getDatabase();
  const drafts = await db
    .select({
      workflowId: propertySubmissionWorkflows.id,
      developerId: propertySubmissionWorkflows.developerId,
      brochureJobId: propertySubmissionWorkflows.brochureJobId,
      propertyId: properties.id,
      propertyName: properties.name,
      slug: properties.slug,
    })
    .from(propertySubmissionWorkflows)
    .innerJoin(properties, eq(propertySubmissionWorkflows.propertyId, properties.id))
    .where(
      and(
        eq(propertySubmissionWorkflows.state, "draft"),
        eq(properties.isPublished, true),
        isNotNull(properties.currentPublicationVersionId),
      ),
    )
    .orderBy(properties.slug);

  const planned = drafts.map((draft) => ({
    ...draft,
    source: bestJobs.get(normalizedName(draft.propertyName)),
  }));
  const unmatched = planned.filter((item) => !item.source);
  const linkedToAnotherSource = planned.filter(
    (item) => item.brochureJobId && item.source && item.brochureJobId !== item.source.jobId,
  );

  console.log(`Archived extraction names: ${bestJobs.size}`);
  console.log(`Live retrospective drafts: ${drafts.length}`);
  for (const item of planned) {
    console.log(
      `  ${item.source ? "ok" : "!!"} ${item.slug} -> ${item.source?.jobId ?? "NO MATCH"}`,
    );
  }

  if (drafts.length !== 24 || unmatched.length || linkedToAnotherSource.length) {
    throw new Error(
      `Refusing to link: expected 24 matched drafts; found ${drafts.length} drafts, ${unmatched.length} unmatched, ${linkedToAnotherSource.length} conflicting links.`,
    );
  }
  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to attach the 24 evidence sources.");
    return;
  }

  await db.transaction(async (tx) => {
    for (const item of planned) {
      const source = item.source!;
      const [job] = await tx
        .select({
          adminProfileId: brochureJobs.adminProfileId,
          propertyId: brochureJobs.propertyId,
        })
        .from(brochureJobs)
        .where(eq(brochureJobs.jobId, source.jobId))
        .limit(1);
      if (job && job.adminProfileId !== item.developerId) {
        throw new Error(`${item.slug}: archived job ${source.jobId} belongs to another reviewer`);
      }
      if (job?.propertyId && job.propertyId !== item.propertyId) {
        throw new Error(
          `${item.slug}: archived job ${source.jobId} is already consumed by another property`,
        );
      }
      if (!job) {
        await tx.insert(brochureJobs).values({
          jobId: source.jobId,
          adminProfileId: item.developerId,
        });
      }
      await tx
        .update(propertySubmissionWorkflows)
        .set({ brochureJobId: source.jobId })
        .where(
          and(
            eq(propertySubmissionWorkflows.id, item.workflowId),
            eq(propertySubmissionWorkflows.state, "draft"),
            isNull(propertySubmissionWorkflows.brochureJobId),
          ),
        );
    }
  });

  console.log("Linked 24 retrospective drafts to their archived brochure evidence.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
