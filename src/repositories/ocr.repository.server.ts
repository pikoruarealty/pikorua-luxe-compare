import { and, desc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { ocrExtractionRevisions, ocrJobs, sourceDocuments } from "@/db/schema";

export async function createSourceDocument(
  developerId: string,
  input: { filename: string; mimeType: string; sizeBytes: number; sha256: string },
) {
  const db = getDatabase();
  const [existing] = await db
    .select()
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.ownerDeveloperId, developerId),
        eq(sourceDocuments.sha256, input.sha256),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const bucket = process.env.GCS_PRIVATE_SOURCE_BUCKET;
  if (!bucket) throw new Error("GCS_PRIVATE_SOURCE_BUCKET is required");
  const [created] = await db
    .insert(sourceDocuments)
    .values({
      ownerDeveloperId: developerId,
      storageBucket: bucket,
      storageObjectPath: `brochures/${developerId}/${crypto.randomUUID()}.pdf`,
      originalFilename: input.filename,
      sha256: input.sha256,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadState: "pending",
    })
    .returning();
  if (!created) throw new Error("Could not create source document");
  return created;
}

export async function markSourceUploadedAndQueue(documentId: string, developerId: string) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [document] = await tx
      .select()
      .from(sourceDocuments)
      .where(
        and(eq(sourceDocuments.id, documentId), eq(sourceDocuments.ownerDeveloperId, developerId)),
      )
      .limit(1);
    if (!document) throw new Error("Source document not found");

    const { getPrivateObjectMetadata } = await import("@/server/gcs.server");
    const metadata = await getPrivateObjectMetadata(
      document.storageBucket,
      document.storageObjectPath,
    );
    if (
      metadata.contentType !== "application/pdf" ||
      metadata.sizeBytes !== document.sizeBytes ||
      metadata.sha256 !== document.sha256
    ) {
      await tx
        .update(sourceDocuments)
        .set({ uploadState: "rejected" })
        .where(eq(sourceDocuments.id, document.id));
      throw new Error("Uploaded brochure metadata did not match the upload ticket");
    }

    await tx
      .update(sourceDocuments)
      .set({ uploadState: "verified", verifiedChecksumAt: new Date() })
      .where(eq(sourceDocuments.id, document.id));
    const [created] = await tx
      .insert(ocrJobs)
      .values({ sourceDocumentId: document.id, developerId, state: "queued" })
      .onConflictDoNothing({ target: ocrJobs.sourceDocumentId })
      .returning({ id: ocrJobs.id });
    if (created) return { jobId: created.id, reused: false };
    const [existing] = await tx
      .select({ id: ocrJobs.id })
      .from(ocrJobs)
      .where(eq(ocrJobs.sourceDocumentId, document.id))
      .limit(1);
    if (!existing) throw new Error("Could not queue OCR job");
    return { jobId: existing.id, reused: true };
  });
}

export async function getOwnedOcrJob(jobId: string, developerId: string) {
  const db = getDatabase();
  const [job] = await db
    .select({
      id: ocrJobs.id,
      state: ocrJobs.state,
      progress: ocrJobs.progress,
      attempts: ocrJobs.attempts,
      errorCode: ocrJobs.lastErrorCode,
      updatedAt: ocrJobs.updatedAt,
    })
    .from(ocrJobs)
    .where(and(eq(ocrJobs.id, jobId), eq(ocrJobs.developerId, developerId)))
    .limit(1);
  if (!job) throw new Error("OCR job not found");

  const [revision] = await db
    .select({
      id: ocrExtractionRevisions.id,
      revision: ocrExtractionRevisions.revision,
      extraction: ocrExtractionRevisions.extractionPayload,
      validation: ocrExtractionRevisions.validationResult,
      createdAt: ocrExtractionRevisions.createdAt,
    })
    .from(ocrExtractionRevisions)
    .where(eq(ocrExtractionRevisions.jobId, jobId))
    .orderBy(desc(ocrExtractionRevisions.revision))
    .limit(1);
  return { ...job, revision: revision ?? null };
}

export async function requestOwnedOcrCancellation(jobId: string, developerId: string) {
  const db = getDatabase();
  const [job] = await db
    .select({ state: ocrJobs.state })
    .from(ocrJobs)
    .where(and(eq(ocrJobs.id, jobId), eq(ocrJobs.developerId, developerId)))
    .limit(1);
  if (!job) throw new Error("OCR job not found");
  if (
    ["ready_for_review", "needs_correction", "completed", "failed", "cancelled"].includes(job.state)
  ) {
    return { state: job.state };
  }
  const nextState = job.state === "queued" ? "cancelled" : job.state;
  await db
    .update(ocrJobs)
    .set({ cancelRequestedAt: new Date(), state: nextState })
    .where(and(eq(ocrJobs.id, jobId), eq(ocrJobs.developerId, developerId)));
  return { state: nextState === "cancelled" ? "cancelled" : "cancelling" };
}
