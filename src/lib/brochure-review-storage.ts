import type { VariantOverrides } from "@/lib/brochure-field-mapping";

/** A reviewer's in-progress ticks/edits for one brochure job, kept in
 *  localStorage so leaving mid-review (closing the tab, going back a step,
 *  resuming by job id later) doesn't throw the work away. Keyed by job_id —
 *  the same id the resume flow already uses to refetch the extraction. */
export interface ReviewProgress {
  approved: Record<string, boolean>;
  values: Record<string, string>;
  listValues: Record<string, string[]>;
  overrides: VariantOverrides;
}

const PREFIX = "brochure-review:";

export function loadReviewProgress(jobId: string): ReviewProgress | null {
  try {
    const raw = localStorage.getItem(PREFIX + jobId);
    if (!raw) return null;
    return JSON.parse(raw) as ReviewProgress;
  } catch {
    return null;
  }
}

export function saveReviewProgress(jobId: string, progress: ReviewProgress): void {
  try {
    localStorage.setItem(PREFIX + jobId, JSON.stringify(progress));
  } catch {
    // Best-effort — a full/blocked localStorage just means progress isn't
    // saved this time, not something worth interrupting the review over.
  }
}

export function clearReviewProgress(jobId: string): void {
  try {
    localStorage.removeItem(PREFIX + jobId);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
