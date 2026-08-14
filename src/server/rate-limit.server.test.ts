// Cover for the shared limiter, and for the property that made it necessary:
// the counter must live somewhere the caller cannot reset.

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Counts calls per key so the fake behaves like a real sliding window for the
 *  only thing these tests care about — whether the budget is consumed. */
let counters: Map<string, number>;
let redisFails = false;

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(_config: unknown) {}
  },
}));

vi.mock("@upstash/ratelimit", () => {
  class FakeRatelimit {
    private readonly max: number;
    private readonly prefix: string;
    constructor(config: { limiter: { max: number }; prefix: string }) {
      this.max = config.limiter.max;
      this.prefix = config.prefix;
    }
    static slidingWindow(max: number, _window: string) {
      return { max };
    }
    async limit(key: string) {
      if (redisFails) throw new Error("ECONNREFUSED");
      const full = `${this.prefix}:${key}`;
      const used = (counters.get(full) ?? 0) + 1;
      counters.set(full, used);
      return { success: used <= this.max };
    }
  }
  return { Ratelimit: FakeRatelimit };
});

async function freshModule() {
  vi.resetModules();
  return import("./rate-limit.server");
}

describe("rate limiter", () => {
  beforeEach(() => {
    counters = new Map();
    redisFails = false;
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");
    vi.stubEnv("ALLOW_UNLIMITED_LOCAL", "");
  });

  it("allows up to the limit and refuses past it", async () => {
    const { enforce, POLICIES, RateLimitError } = await freshModule();

    // OTP_SEND's tightest window is 1 per 60s.
    await expect(enforce(POLICIES.OTP_SEND, "919876543210")).resolves.toBeUndefined();
    await expect(enforce(POLICIES.OTP_SEND, "919876543210")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("counts each subject separately", async () => {
    const { enforce, POLICIES } = await freshModule();
    await enforce(POLICIES.OTP_SEND, "919876543210");
    // A different number must not inherit the first one's spent budget.
    await expect(enforce(POLICIES.OTP_SEND, "919000000001")).resolves.toBeUndefined();
  });

  it("keeps policies from sharing a counter", async () => {
    const { enforce, POLICIES } = await freshModule();
    await enforce(POLICIES.OTP_SEND, "same-subject");
    await expect(enforce(POLICIES.EMAIL_SEND, "same-subject")).resolves.toBeUndefined();
  });

  it("does not spend budget on a subject that was refused by an earlier window", async () => {
    const { enforce, POLICIES, RateLimitError } = await freshModule();
    // ACCOUNT_LOOKUP allows 10/min; the 11th must fail.
    for (let i = 0; i < 10; i += 1) await enforce(POLICIES.ACCOUNT_LOOKUP, "ip:1.2.3.4");
    await expect(enforce(POLICIES.ACCOUNT_LOOKUP, "ip:1.2.3.4")).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  describe("when Redis is unreachable", () => {
    it("refuses the request for anything guarding credentials or spend", async () => {
      const { enforce, POLICIES, RateLimitError } = await freshModule();
      redisFails = true;
      // Failing a sign-in during an outage is recoverable; letting an unmetered
      // brute-force through is not.
      await expect(enforce(POLICIES.OTP_ATTEMPT, "challenge")).rejects.toBeInstanceOf(
        RateLimitError,
      );
    });

    it("lets analytics through rather than breaking the page", async () => {
      const { enforce, POLICIES } = await freshModule();
      redisFails = true;
      await expect(enforce(POLICIES.ACTIVITY, "ip:1.2.3.4")).resolves.toBeUndefined();
    });
  });

  describe("when Upstash is not configured", () => {
    it("refuses to silently stop enforcing", async () => {
      vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
      vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
      const { enforce, POLICIES } = await freshModule();
      // The OCR service shipped with exactly this hole: absent configuration
      // quietly meaning "no enforcement".
      await expect(enforce(POLICIES.OTP_SEND, "919876543210")).rejects.toThrow(/UPSTASH/);
    });

    it("stands down only when explicitly opted into", async () => {
      vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
      vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
      vi.stubEnv("ALLOW_UNLIMITED_LOCAL", "1");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { enforce, POLICIES } = await freshModule();

      await expect(enforce(POLICIES.OTP_SEND, "919876543210")).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });
  });
});

describe("email OTP attempt counting (H-3)", () => {
  beforeEach(() => {
    counters = new Map();
    redisFails = false;
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");
    vi.stubEnv("ALLOW_UNLIMITED_LOCAL", "");
  });

  it("does not reset when the same cookie is replayed", async () => {
    const { enforce, POLICIES, RateLimitError } = await freshModule();

    // The attack: snapshot the sealed cookie as issued and resend that exact
    // copy with every guess. It carries a fixed challengeId, and the count is
    // keyed on that -- so replaying it inherits the count instead of clearing
    // it, which is the whole point of moving the counter off the client.
    const challengeId = "11111111-2222-3333-4444-555555555555";

    for (let guess = 0; guess < 5; guess += 1) {
      await enforce(POLICIES.OTP_ATTEMPT, challengeId);
    }
    await expect(enforce(POLICIES.OTP_ATTEMPT, challengeId)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("gives a genuinely new code a fresh budget", async () => {
    const { enforce, POLICIES } = await freshModule();
    const first = "11111111-2222-3333-4444-555555555555";
    for (let guess = 0; guess < 5; guess += 1) await enforce(POLICIES.OTP_ATTEMPT, first);

    // Requesting a new code mints a new challengeId server-side, so the person
    // who genuinely mistyped is not locked out for the window.
    const second = "99999999-8888-7777-6666-555555555555";
    await expect(enforce(POLICIES.OTP_ATTEMPT, second)).resolves.toBeUndefined();
  });
});
