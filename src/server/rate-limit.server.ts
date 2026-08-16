// The shared rate-limiting layer.
//
// The audit's framing was that seven findings were one missing component seen
// from seven angles: OTP sends with no cap at all, an email code guessable
// 10^6 ways, a resend cooldown and an attempt counter both stored in the
// caller's own cookie, an open account-existence oracle, and an anonymous
// unbounded write into customer_activity. Several of those endpoints cost real
// money per call -- 2Factor per SMS, Brevo per email, OpenAI per brochure page.
//
// The two throttles that existed before kept their state somewhere the caller
// controlled, so neither actually held. State lives in Redis here, keyed by
// something the caller cannot pick freely.
//
// Upstash rather than a platform primitive: it is plain HTTPS, so this works
// unchanged on Vercel today and on the GCP VM later. Cloudflare KV would not
// have survived that move, and KV's eventual consistency makes it a poor
// counter regardless.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Duration = Parameters<typeof Ratelimit.slidingWindow>[1];

interface Window {
  limit: number;
  window: Duration;
}

export interface Policy {
  /** Namespaces the counter. Two policies must never share one. */
  name: string;
  /** Every window must pass. A burst cap and a daily cap can coexist. */
  windows: Window[];
  /** What to do when Redis itself is unreachable.
   *
   *  For anything guarding money or credentials this is `true`: refusing a
   *  legitimate sign-in during a Redis outage is recoverable, letting an
   *  unmetered brute-force through is not. For analytics it is `false` --
   *  losing page-view counts is not worth breaking someone's browsing. */
  failClosed: boolean;
  /** Shown to the caller when they exceed it. */
  message: string;
}

export const POLICIES = {
  /** Real SMS, billed per message, to any number the caller names. */
  OTP_SEND: {
    name: "otp-send",
    windows: [
      { limit: 1, window: "60 s" },
      { limit: 5, window: "1 h" },
      { limit: 10, window: "24 h" },
    ],
    failClosed: true,
    message: "Please wait a moment before requesting another code.",
  },
  /** Guessing a 6-digit code. Keyed on the challenge, not the browser. */
  OTP_ATTEMPT: {
    name: "otp-attempt",
    windows: [{ limit: 5, window: "15 m" }],
    failClosed: true,
    message: "Too many incorrect attempts. Request a new code.",
  },
  /** Transactional email, billed per send, and sender reputation on top. */
  EMAIL_SEND: {
    name: "email-send",
    windows: [
      { limit: 1, window: "30 s" },
      { limit: 5, window: "1 h" },
      { limit: 20, window: "24 h" },
    ],
    failClosed: true,
    message: "Please wait a moment before requesting another code.",
  },
  /** "Does an account exist for this address" — answered precisely, to anyone. */
  ACCOUNT_LOOKUP: {
    name: "account-lookup",
    windows: [
      { limit: 10, window: "1 m" },
      { limit: 100, window: "1 h" },
    ],
    failClosed: true,
    message: "Too many attempts. Please try again shortly.",
  },
  /** Exchanging a verified-channel proof for a session. */
  LOGIN: {
    name: "login",
    windows: [{ limit: 20, window: "10 m" }],
    failClosed: true,
    message: "Too many attempts. Please try again shortly.",
  },
  /** Anonymous inserts into customer_activity. */
  ACTIVITY: {
    name: "activity",
    windows: [{ limit: 60, window: "1 m" }],
    failClosed: false,
    message: "Too many events.",
  },
  /** Qualitative matching can otherwise be probed as a commercial-value oracle. */
  RECOMMENDATION: {
    name: "recommendation",
    windows: [
      { limit: 30, window: "1 m" },
      { limit: 300, window: "1 h" },
    ],
    failClosed: true,
    message: "Too many recommendation requests. Please try again shortly.",
  },
  /** Nominatim geocoding — someone else's service, and their terms. */
  GEOCODE: {
    name: "geocode",
    windows: [
      { limit: 20, window: "1 m" },
      { limit: 200, window: "1 h" },
    ],
    failClosed: false,
    message: "Too many lookups. Please try again shortly.",
  },
} satisfies Record<string, Policy>;

/** Thrown when a limit is hit, so callers can tell this apart from a fault. */
export class RateLimitError extends Error {
  readonly status = 429;
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

let redis: Redis | null = null;
let unlimited = false;

function client(): Redis | null {
  if (redis || unlimited) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redis = new Redis({ url, token });
    return redis;
  }

  // Deliberately not silent. The OCR service shipped with exactly this shape of
  // hole -- missing configuration quietly meaning "no enforcement" -- and one
  // unset variable was the difference between protected and open.
  if (process.env.ALLOW_UNLIMITED_LOCAL === "1") {
    unlimited = true;
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_* are unset and ALLOW_UNLIMITED_LOCAL=1: " +
        "no request is being rate limited. Local use only.",
    );
    return null;
  }
  throw new Error(
    "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set. Set them, or " +
      "set ALLOW_UNLIMITED_LOCAL=1 to run without rate limiting (local development only).",
  );
}

const limiters = new Map<string, Ratelimit>();

function limiterFor(policy: Policy, index: number, redisClient: Redis): Ratelimit {
  const { limit, window } = policy.windows[index];
  const key = `${policy.name}:${index}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `rl:${key}`,
      analytics: false,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

/** Consumes one unit against `policy` for `subject`, or throws RateLimitError.
 *
 *  `subject` must be something the caller cannot vary at will — a phone number,
 *  an email address, a client IP, a server-issued challenge id. Keying on
 *  anything the caller chooses (a session key they invented, say) lets them
 *  reset the counter by choosing again. */
export async function enforce(policy: Policy, subject: string): Promise<void> {
  let redisClient: Redis | null;
  try {
    redisClient = client();
  } catch (err) {
    // Misconfiguration, not an outage. Never silently unlimited.
    if (policy.failClosed) throw err;
    return;
  }
  if (!redisClient) return; // explicitly opted out, already warned

  const key = `${policy.name}:${subject}`;
  try {
    for (let i = 0; i < policy.windows.length; i += 1) {
      const { success } = await limiterFor(policy, i, redisClient).limit(key);
      if (!success) throw new RateLimitError(policy.message);
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    // Redis is unreachable. Which way to fail is the policy's call, not ours.
    console.error("[rate-limit] backend unavailable", err);
    if (policy.failClosed) {
      throw new RateLimitError("We couldn't verify that request. Please try again shortly.");
    }
  }
}

/** Best-effort client IP.
 *
 *  Nothing in this codebase read the client address before, so every per-IP
 *  limit here is new. Treat it as a coarse signal: a proxy header can be forged
 *  when the app is reached directly, and mobile networks put many people behind
 *  one address. It is a useful second key alongside the target, not a identity. */
export async function clientIp(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const headers = getRequest().headers;
    // x-forwarded-for is a chain; the first entry is the original client. On
    // Vercel and behind nginx on the VM the platform appends, so this holds.
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? "unknown";
  } catch {
    // No active request (tests, warm-up). "unknown" buckets these together
    // rather than exempting them.
    return "unknown";
  }
}
