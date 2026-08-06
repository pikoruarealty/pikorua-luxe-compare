import assert from "node:assert/strict";
import {
  pollUntilExtracted,
  type ProgressSnapshot,
  GIVE_UP_AFTER_UNREACHABLE_MS,
} from "@/lib/poll-extraction";

const snap = (over: Partial<ProgressSnapshot> = {}): ProgressSnapshot => ({
  status: "processing",
  batchesDone: 1,
  batchesTotal: 10,
  error: null,
  ...over,
});

/** A fake clock: `wait` advances it instantly, so a two-minute deadline is
 *  exercised in microseconds rather than by actually waiting. */
function harness(responses: (ProgressSnapshot | Error)[]) {
  let clock = 0;
  let index = 0;
  const seen: number[] = [];
  return {
    calls: () => index,
    progressSeen: seen,
    clockNow: () => clock,
    opts: {
      fetchProgress: async () => {
        const next = responses[Math.min(index, responses.length - 1)];
        index += 1;
        if (next instanceof Error) throw next;
        return next;
      },
      onProgress: (done: number) => seen.push(done),
      isCancelled: () => false,
      wait: async (ms: number) => {
        clock += ms;
      },
      now: () => clock,
    },
  };
}

// --- The reported bug: one dropped poll must not lose a finished job. ---
const flake = harness([
  snap({ batchesDone: 8 }),
  new Error("fetch failed"), // the socket that broke the 59MB run
  snap({ batchesDone: 10, status: "done" }),
]);
await pollUntilExtracted(flake.opts);
assert.deepEqual(flake.progressSeen, [8, 10], "must resume and see the job finish");
console.log("one dropped poll  -> recovered, job completed");

// A long unresponsive stretch is survived as long as it ends.
const stall = harness([
  snap({ batchesDone: 9 }),
  ...Array.from({ length: 20 }, () => new Error("socket hang up")),
  snap({ batchesDone: 10, status: "done" }),
]);
await pollUntilExtracted(stall.opts);
console.log(`20 consecutive failures -> still recovered (${stall.calls()} polls)`);

// --- But a service that is genuinely gone must still be reported. ---
const dead = harness([new Error("ECONNREFUSED")]);
await assert.rejects(
  () => pollUntilExtracted(dead.opts),
  /ECONNREFUSED/,
  "an unbroken run of failures must eventually surface",
);
assert.ok(
  dead.clockNow() > GIVE_UP_AFTER_UNREACHABLE_MS,
  "must not give up before the deadline",
);
console.log(`permanently down  -> gave up after ${dead.clockNow() / 1000}s, error surfaced`);

// The failure clock resets on success, so intermittent flakiness never
// accumulates into a false "service is gone".
const intermittent = harness([]);
let n = 0;
intermittent.opts.fetchProgress = async () => {
  n += 1;
  if (n > 60) return snap({ status: "done", batchesDone: 10 });
  if (n % 2 === 0) throw new Error("flaky");
  return snap({ batchesDone: n });
};
await pollUntilExtracted(intermittent.opts);
console.log(`alternating fail/ok over ${n} polls -> completed, never gave up`);

// --- Real terminal states still propagate immediately. ---
await assert.rejects(
  () => pollUntilExtracted(harness([snap({ status: "error", error: "no credit" })]).opts),
  /no credit/,
);
await assert.rejects(
  () => pollUntilExtracted(harness([snap({ status: "cancelled" })]).opts),
  /cancelled/,
);
console.log("server-reported error / cancel -> surfaced at once, not retried");

// --- Navigating away stops the loop silently. ---
const left = harness([snap()]);
left.opts.isCancelled = () => true;
await pollUntilExtracted(left.opts);
assert.equal(left.calls(), 0, "must not poll after the step unmounts");
console.log("cancelled by caller -> stopped without polling");

console.log("\nOK — all polling assertions passed");
