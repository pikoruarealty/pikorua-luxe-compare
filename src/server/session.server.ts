// Cookie configuration for the three visitor-facing sessions.
//
// These options were previously spelled out in four files — `pikorua-session`
// alone had three copies. They happened to agree, but a security setting that
// lives in four places is one that gets changed in three of them. Anything
// touching how these cookies are sealed or scoped now has exactly one edit site.
//
// Server-only: `useSession` reads SESSION_SECRET, which must never reach the
// browser. Import the values through `await import(...)` from server-function
// handlers, and use `import type` for the interfaces (type imports are erased,
// so they do not pull this module into the client graph).

export const PENDING_COOKIE = "pikorua-pending";
export const SESSION_COOKIE = "pikorua-session";
export const EMAIL_OTP_COOKIE = "pikorua-email-otp";

/** The phone sign-in handshake, spanning sendOtp -> verifyOtp -> profile write.
 *
 *  `phone` is written by sendOtp and is the number 2Factor actually texted.
 *  It is never read from the request: a caller proving they can read *an* inbox
 *  says nothing about which number they are claiming, and treating the two as
 *  interchangeable is what made any account takeable over with nothing but its
 *  owner's phone number.
 *
 *  `verifiedAt` is set by verifyOtp and only by verifyOtp. Its absence means
 *  "a code went out", not "a code came back" — consumers must check for it
 *  before trusting `phone`. */
export interface PendingSession {
  /** 2Factor's id for the outstanding SMS, pinning a verify to its own send. */
  sessionId: string;
  phone: string;
  verifiedAt?: number;
}

/** A signed-in visitor. */
export interface VisitorSession {
  profileId: string;
  phone: string;
}

/** The email sign-in handshake. `attempts` is deliberately still here; Phase 3
 *  moves the counter server-side, because a sealed cookie stops the client
 *  editing it but not replaying an older copy of it. */
export interface EmailOtpSession {
  email: string;
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
}

// sameSite "none" is wrong for a first-party site and is being changed to "lax";
// it lives here now so that is a one-line change rather than a four-file hunt.
const cookieOpts = {
  path: "/",
  httpOnly: true,
  sameSite: "none" as const,
  secure: true,
};

function password(): string {
  const value = process.env.SESSION_SECRET;
  // The previous `process.env.SESSION_SECRET!` handed h3 `undefined` and failed
  // somewhere further down with a message that named neither the cause nor us.
  if (!value) throw new Error("SESSION_SECRET missing");
  return value;
}

export const pendingConfig = () => ({
  password: password(),
  name: PENDING_COOKIE,
  maxAge: 60 * 10,
  cookie: cookieOpts,
});

export const sessionConfig = () => ({
  password: password(),
  name: SESSION_COOKIE,
  maxAge: 60 * 60 * 24 * 60, // 60 days
  cookie: cookieOpts,
});

export const emailOtpConfig = () => ({
  password: password(),
  name: EMAIL_OTP_COOKIE,
  maxAge: 60 * 15,
  cookie: cookieOpts,
});
