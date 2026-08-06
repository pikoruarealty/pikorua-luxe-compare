/** Waiting out a brochure extraction.
 *
 *  The job lives on the OCR service, not in the browser: once it is started,
 *  the only thing this side does is ask how far along it is. That matters for
 *  how failures are treated — an extraction runs for minutes and is polled the
 *  whole way, so a single dropped request is a near-certainty rather than an
 *  anomaly (a reused keep-alive socket closing between polls is enough). An
 *  earlier version aborted on the first failure and threw away a 59MB job the
 *  service had already finished. Only an unbroken run of failures, long enough
 *  that the service is plainly gone, is fatal.
 *
 *  Kept apart from the component so the retry rules can be tested against a
 *  fake clock instead of a real four-minute extraction. */

export type ExtractionStatus =
  | "queued"
  | "processing"
  | "done"
  | "error"
  | "cancelled"
  | "cancelling";

export interface ProgressSnapshot {
  status: ExtractionStatus;
  batchesDone: number;
  batchesTotal: number;
  error: string | null;
}

export interface PollOptions {
  fetchProgress: () => Promise<ProgressSnapshot>;
  onProgress: (done: number, total: number) => void;
  /** True once the caller has navigated away — stops the loop silently. */
  isCancelled: () => boolean;
  wait: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  giveUpAfterUnreachableMs?: number;
}

export const POLL_INTERVAL_MS = 3000;
export const GIVE_UP_AFTER_UNREACHABLE_MS = 120_000;

/** Resolves when the extraction is done; throws if it failed, was cancelled,
 *  or stayed unreachable past the deadline. Returns without throwing when the
 *  caller cancelled — there is nothing to report in that case. */
export async function pollUntilExtracted({
  fetchProgress,
  onProgress,
  isCancelled,
  wait,
  now = Date.now,
  intervalMs = POLL_INTERVAL_MS,
  giveUpAfterUnreachableMs = GIVE_UP_AFTER_UNREACHABLE_MS,
}: PollOptions): Promise<void> {
  let unreachableSince: number | null = null;

  for (;;) {
    if (isCancelled()) return;
    await wait(intervalMs);
    if (isCancelled()) return;

    let progress: ProgressSnapshot;
    try {
      progress = await fetchProgress();
    } catch (err) {
      unreachableSince ??= now();
      if (now() - unreachableSince > giveUpAfterUnreachableMs) throw err;
      continue;
    }

    unreachableSince = null;
    onProgress(progress.batchesDone, progress.batchesTotal);

    if (progress.status === "done") return;
    if (progress.status === "error") {
      throw new Error(progress.error ?? "Extraction failed on the server.");
    }
    if (progress.status === "cancelled" || progress.status === "cancelling") {
      throw new Error("Extraction was cancelled.");
    }
  }
}
