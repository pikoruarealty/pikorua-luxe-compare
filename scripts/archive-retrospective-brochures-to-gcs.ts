/**
 * Moves the restored original PDFs for the 24 retrospective drafts into the
 * private source bucket. It is dry-run by default and deliberately leaves the
 * VM files alone; cleanup happens only after browser-side citation checks.
 *
 *   bun scripts/archive-retrospective-brochures-to-gcs.ts
 *   bun scripts/archive-retrospective-brochures-to-gcs.ts --apply
 */
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Storage } from "@google-cloud/storage";
import { and, eq, isNotNull } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { properties, propertySubmissionWorkflows } from "@/db/schema";

const APPLY = process.argv.includes("--apply");
const EXPECTED_DRAFTS = 24;
const UPLOADS_DIR = resolve("property-ocr-suite/backend/storage/uploads");

async function main() {
  const bucketName = process.env.GCS_PRIVATE_SOURCE_BUCKET;
  if (!bucketName) throw new Error("GCS_PRIVATE_SOURCE_BUCKET is required");

  const db = getDatabase();
  const drafts = await db
    .select({ jobId: propertySubmissionWorkflows.brochureJobId, slug: properties.slug })
    .from(propertySubmissionWorkflows)
    .innerJoin(properties, eq(propertySubmissionWorkflows.propertyId, properties.id))
    .where(
      and(
        eq(propertySubmissionWorkflows.state, "draft"),
        eq(properties.isPublished, true),
        isNotNull(propertySubmissionWorkflows.brochureJobId),
      ),
    )
    .orderBy(properties.slug);

  if (drafts.length !== EXPECTED_DRAFTS || drafts.some((draft) => !draft.jobId)) {
    throw new Error(`Expected ${EXPECTED_DRAFTS} linked live drafts; found ${drafts.length}`);
  }

  const sources = drafts.map((draft) => {
    const files = readdirSync(join(UPLOADS_DIR, draft.jobId!)).filter((name) =>
      name.endsWith(".pdf"),
    );
    if (files.length !== 1)
      throw new Error(`${draft.slug}: expected exactly one PDF, found ${files.length}`);
    return { ...draft, sourcePath: join(UPLOADS_DIR, draft.jobId!, files[0]!) };
  });

  console.log(`Private bucket: ${bucketName}`);
  console.log(`Retrospective brochures: ${sources.length}`);
  for (const source of sources) console.log(`  ok ${source.slug} -> ${source.jobId}`);
  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to upload the 24 private source PDFs.");
    return;
  }

  const bucket = new Storage({ projectId: process.env.GCP_PROJECT_ID }).bucket(bucketName);
  for (const source of sources) {
    const destination = `brochure-archive/legacy/${source.jobId}/source.pdf`;
    await bucket.upload(source.sourcePath, {
      destination,
      resumable: true,
      validation: "crc32c",
      metadata: { contentType: "application/pdf", metadata: { legacyJobId: source.jobId! } },
    });
  }
  console.log("Uploaded 24 brochures to private GCS storage.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
