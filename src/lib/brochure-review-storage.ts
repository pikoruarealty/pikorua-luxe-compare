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
  // Step 3 (image slot picks) owns these — optional because step 2 (field
  // review) writes progress before step 3 has ever run.
  picked?: Partial<Record<string, string>>;
  customUrls?: Partial<Record<string, string>>;
  activeSlot?: string;
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

// Steps 2 and 3 each own a different slice of this record and save
// independently — merge onto whatever's already stored rather than
// overwriting wholesale, so saving one step's slice doesn't erase the
// other's.
export function saveReviewProgress(jobId: string, patch: Partial<ReviewProgress>): void {
  try {
    const existing = loadReviewProgress(jobId);
    localStorage.setItem(PREFIX + jobId, JSON.stringify({ ...existing, ...patch }));
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
