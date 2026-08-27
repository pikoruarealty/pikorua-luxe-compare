import { and, desc, eq, isNull } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { brochureJobs } from "@/db/schema";

export interface BrochureJobRow {
  jobId: string;
  createdAt: Date;
}

/** Ownership check for every server function that takes a job id from the
 *  browser. The OCR service's ids are opaque but opacity is not authorisation
 *  — without this, a leaked id would let any developer read or cancel another
 *  developer's extraction. */
export async function isBrochureJobOwnedBy(
  jobId: string,
  adminProfileId: string,
): Promise<boolean> {
  const [row] = await getDatabase()
    .select({ jobId: brochureJobs.jobId })
    .from(brochureJobs)
    .where(and(eq(brochureJobs.jobId, jobId), eq(brochureJobs.adminProfileId, adminProfileId)))
    .limit(1);
  return row !== undefined;
}

/** Jobs this developer started that haven't yet become a property — the
 *  "resume an extraction" picker. Consumed jobs are filtered out in SQL via
 *  the `brochure_jobs_unconsumed_idx` partial index rather than in JS, so the
 *  list stays short as the table grows. */
export async function listUnconsumedBrochureJobs(
  adminProfileId: string,
): Promise<BrochureJobRow[]> {
  return getDatabase()
    .select({ jobId: brochureJobs.jobId, createdAt: brochureJobs.createdAt })
    .from(brochureJobs)
    .where(and(eq(brochureJobs.adminProfileId, adminProfileId), isNull(brochureJobs.propertyId)))
    .orderBy(desc(brochureJobs.createdAt));
}

export async function insertBrochureJob(jobId: string, adminProfileId: string): Promise<void> {
  await getDatabase().insert(brochureJobs).values({ jobId, adminProfileId });
}

/** Marks a job as consumed once its extraction has become a real property.
 *
 *  Takes the caller's transaction (see publishWorkflow) rather than opening
 *  its own, so the stamp lands atomically with the publish it's recording —
 *  a job should never end up marked consumed by a publish that rolled back,
 *  or vice versa.
 *
 *  Scoped to `adminProfileId` so a caller can't stamp someone else's job, and
 *  to rows that aren't already claimed so a re-submitted brochure can't
 *  silently repoint an earlier property's job at a new one. */
export async function markBrochureJobConsumed(
  tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  jobId: string,
  adminProfileId: string,
  propertyId: string,
): Promise<void> {
  await tx
    .update(brochureJobs)
    .set({ propertyId })
    .where(
      and(
        eq(brochureJobs.jobId, jobId),
        eq(brochureJobs.adminProfileId, adminProfileId),
        isNull(brochureJobs.propertyId),
      ),
    );
}
