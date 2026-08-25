import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import type { PendingSession, VisitorSession } from "@/server/session.server";
import {
  findProfilesByEmail,
  findProfilesByPhone,
  getProfileById,
  insertProfile,
  updateProfile as updateProfileRow,
  updateQuizAnswers,
  upsertProfileByPhone,
  type ProfileRow,
} from "@/repositories/profile.repository.server";
import { recordActivity } from "@/repositories/customer-activity.repository.server";

export interface QuizAnswersDTO {
  state?: string;
  city?: string;
  bhk: string[];
  propertyType: string[];
  budgetRange: string;
  budgetSub: string;
}

const quizAnswersSchema = z
  .object({
    state: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    bhk: z.array(z.string().trim().min(1).max(20)).max(2),
    propertyType: z.array(z.string().trim().min(1).max(50)).max(5),
    budgetRange: z.string().trim().max(100),
    budgetSub: z.string().trim().max(100),
  })
  .strict();

export interface ProfileDTO {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  profession: string | null;
  businessName: string | null;
  quizAnswers: QuizAnswersDTO | null;
}

interface VerifiedPhoneToken {
  phone: string;
  verifiedAt: number;
}

// Cookie options live in @/server/session.server so the sealing and scoping
// rules have one home. Imported dynamically to keep SESSION_SECRET server-side.
//
// `useSession` is h3's request composable, not a React hook — react-hooks only
// flags it because of the name.
/* eslint-disable react-hooks/rules-of-hooks */
async function visitorSession() {
  const { sessionConfig } = await import("@/server/session.server");
  return useSession<VisitorSession>(sessionConfig());
}

async function pendingSession() {
  const { pendingConfig } = await import("@/server/session.server");
  return useSession<PendingSession>(pendingConfig());
}
/* eslint-enable react-hooks/rules-of-hooks */

const CLAIM_TTL_MS = 60 * 10 * 1000;

/** The phone from the pending cookie, but only once verifyOtp has proven it.
 *
 *  sendOtp writes the number into that cookie so verifyOtp can bind against it,
 *  which means the cookie's mere presence now says "a code went out" — not
 *  "a code came back". Reading `phone` without checking `verifiedAt` would let a
 *  caller request a code for any number and skip straight to owning it. */
function provenPendingPhone(pending: { verifiedAt?: number; phone?: string } | undefined) {
  if (!pending?.verifiedAt || !pending.phone) return null;
  if (Date.now() - pending.verifiedAt > CLAIM_TTL_MS) return null;
  return pending.phone;
}

async function verifyPhoneToken(token?: string | null) {
  const { readClaim } = await import("@/server/verification-token.server");
  const claim = await readClaim<VerifiedPhoneToken>("phone", token, CLAIM_TTL_MS);
  return claim?.phone ? claim.phone.replace(/[^0-9]/g, "") : null;
}

async function verifyEmailToken(token?: string | null) {
  const { readClaim } = await import("@/server/verification-token.server");
  const claim = await readClaim<{ email: string; verifiedAt: number }>(
    "email",
    token,
    CLAIM_TTL_MS,
  );
  return claim?.email ? claim.email.trim().toLowerCase() : null;
}

function toDTO(row: ProfileRow): ProfileDTO {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    profession: row.profession,
    businessName: row.businessName,
    quizAnswers: (row.quizAnswers as QuizAnswersDTO | null) ?? null,
  };
}

export const upsertProfileAfterOtp = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      email: string;
      profession: string;
      businessName?: string;
      verificationToken?: string;
      emailToken?: string;
    }) => {
      if (!data?.name?.trim() || !data?.email?.trim() || !data?.profession?.trim()) {
        throw new Error("Missing fields");
      }
      return {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        profession: data.profession.trim(),
        businessName: data.businessName?.trim() || null,
        verificationToken:
          typeof data.verificationToken === "string" ? data.verificationToken : undefined,
        emailToken: typeof data.emailToken === "string" ? data.emailToken : undefined,
      };
    },
  )
  .handler(async ({ data }) => {
    const pending = await pendingSession();
    const phone =
      provenPendingPhone(pending.data) ?? (await verifyPhoneToken(data.verificationToken));
    if (!phone) throw new Error("Phone not verified. Please verify OTP first.");

    // Both channels must be proven, and the proven address must be the one
    // being saved — otherwise a visitor could confirm one inbox and register
    // somebody else's.
    const verifiedEmail = await verifyEmailToken(data.emailToken);
    if (!verifiedEmail) throw new Error("Email not verified. Please verify your email first.");
    if (verifiedEmail !== data.email) {
      throw new Error("That email doesn't match the one you verified.");
    }

    // Phone is the unique key, so an address already tied to a different
    // number would leave two accounts sharing one login identity.
    const emailOwners = await findProfilesByEmail(data.email);
    if (emailOwners.some((r) => r.phone !== phone)) {
      throw new Error("That email is already linked to another account. Try signing in instead.");
    }

    const row = await upsertProfileByPhone({
      phone,
      name: data.name,
      email: data.email,
      profession: data.profession,
      businessName: data.businessName,
    });

    const session = await visitorSession();
    await session.update({ profileId: row.id, phone: row.phone });
    await pending.clear();

    // Record the sign-up for the admin activity view (best-effort).
    try {
      await recordActivity({
        profileId: row.id,
        sessionKey: null,
        eventType: "signup",
        propertySlug: null,
        metadata: {},
      });
    } catch {
      // analytics must never block sign-up
    }

    return toDTO(row);
  });

/** Phone-backed account creation used by the v2 action gate. Email and
 * profession are optional; when Google supplies an email token it is still
 * verified and bound to the new phone-backed profile. */
export const upsertPhoneProfileAfterOtp = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; verificationToken?: string; email?: string; emailToken?: string }) => ({
      name: z.string().trim().min(1).max(100).parse(data?.name),
      verificationToken:
        typeof data?.verificationToken === "string" ? data.verificationToken : undefined,
      email: data?.email ? z.string().trim().toLowerCase().email().parse(data.email) : null,
      emailToken: typeof data?.emailToken === "string" ? data.emailToken : undefined,
    }),
  )
  .handler(async ({ data }): Promise<ProfileDTO> => {
    const phone = await verifyPhoneToken(data.verificationToken);
    if (!phone) throw new Error("Phone verification expired. Please request a new code.");

    let email: string | null = null;
    if (data.email) {
      const verifiedEmail = await verifyEmailToken(data.emailToken);
      if (!verifiedEmail || verifiedEmail !== data.email) {
        throw new Error("Google email verification expired. Please try again.");
      }
      email = verifiedEmail;
    }

    const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.LOGIN, `ip:${await clientIp()}`);

    const existing = await findProfilesByPhone(phone);
    if (existing.length > 0) throw new Error("This phone already has an account. Sign in instead.");

    if (email) {
      const emailOwners = await findProfilesByEmail(email);
      if (emailOwners.length > 0)
        throw new Error("That Google account is already linked. Sign in instead.");
    }

    const row = await insertProfile({ phone, name: data.name, email, profession: null });

    const session = await visitorSession();
    await session.update({ profileId: row.id, phone: row.phone });
    const pending = await pendingSession();
    await pending.clear();
    return toDTO(row);
  });

const EMAIL_RE = /^[^\s@%_]+@[^\s@%_]+\.[^\s@%_]+$/;

/** Sign-in step 1: does an account exist for this email / phone? Checked
 *  before any OTP is sent, so we never mail or SMS a stranger — and so a
 *  visitor with no account is pointed at sign-up instead of a dead end. */
export const checkAccountExists = createServerFn({ method: "POST" })
  .inputValidator((data: { identity: string; channel: "email" | "phone" }) => {
    if (data?.channel !== "email" && data?.channel !== "phone") {
      throw new Error("Invalid channel");
    }
    const raw = String(data?.identity ?? "").trim();
    if (data.channel === "email") {
      const email = raw.toLowerCase();
      if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address");
      return { channel: "email" as const, identity: email };
    }
    const phone = raw.replace(/[^0-9]/g, "");
    if (phone.length < 6 || phone.length > 15) throw new Error("Enter a valid phone number");
    return { channel: "phone" as const, identity: phone };
  })
  .handler(async ({ data }) => {
    // Answers "is this person a customer" precisely, to anyone who asks. The
    // reason for it is sound -- nobody should be mailed a code for an account
    // that does not exist -- but unthrottled it also confirms membership for
    // an arbitrary list of numbers or addresses.
    const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.ACCOUNT_LOOKUP, `ip:${await clientIp()}`);

    const rows =
      data.channel === "email"
        ? await findProfilesByEmail(data.identity)
        : await findProfilesByPhone(data.identity);
    return { exists: rows.length > 0 };
  });

/** Sign-in step 2: exchange a verified-channel proof for a real session.
 *  Never creates a profile — an unknown identity is a sign-up, not a login. */
export const completeLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { verificationToken?: string; emailToken?: string }) => ({
    verificationToken:
      typeof data?.verificationToken === "string" ? data.verificationToken : undefined,
    emailToken: typeof data?.emailToken === "string" ? data.emailToken : undefined,
  }))
  .handler(async ({ data }): Promise<ProfileDTO> => {
    const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
    await enforce(POLICIES.LOGIN, `ip:${await clientIp()}`);

    const phone = await verifyPhoneToken(data.verificationToken);
    const email = phone ? null : await verifyEmailToken(data.emailToken);
    if (!phone && !email) throw new Error("Verification expired. Please start again.");

    const matches = phone
      ? await findProfilesByPhone(phone)
      : await findProfilesByEmail(email as string);
    if (matches.length === 0) {
      throw new Error("No account found. Please sign up first.");
    }
    // Legacy data allows one address across two numbers; the number is the
    // unique key, so send them down that path rather than guessing.
    if (matches.length > 1) {
      throw new Error(
        "That email is linked to more than one account. Please sign in with your phone number.",
      );
    }

    const row = matches[0];
    const session = await visitorSession();
    await session.update({ profileId: row.id, phone: row.phone });

    const pending = await pendingSession();
    await pending.clear();

    return toDTO(row);
  });

export const getSessionProfile = createServerFn({ method: "GET" }).handler(async () => {
  const session = await visitorSession();
  const profileId = session.data?.profileId;
  if (!profileId) return null;
  const row = await getProfileById(profileId);
  if (!row) return null;
  return toDTO(row);
});

export const saveQuizAnswers = createServerFn({ method: "POST" })
  .inputValidator((data: { answers: QuizAnswersDTO | null }) => {
    if (!data || typeof data !== "object" || !("answers" in data)) {
      throw new Error("Invalid input");
    }
    return { answers: data.answers === null ? null : quizAnswersSchema.parse(data.answers) };
  })

  .handler(async ({ data }) => {
    const session = await visitorSession();
    const profileId = session.data?.profileId;
    if (!profileId) throw new Error("Not signed in");
    await updateQuizAnswers(profileId, data.answers);
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      email?: string | null;
      emailToken?: string;
      profession: string;
      businessName?: string | null;
    }) => {
      if (!data?.name?.trim() || !data?.profession?.trim()) {
        throw new Error("Missing fields");
      }
      // Lowercased to match how every other write stores it — otherwise the
      // same address saved here and at sign-up produces two rows that only a
      // case-insensitive lookup can tell apart.
      const email = data.email?.trim().toLowerCase() || null;
      if (email && !EMAIL_RE.test(email)) throw new Error("Enter a valid email address");
      return {
        name: data.name.trim(),
        email,
        profession: data.profession.trim(),
        businessName: data.businessName?.trim() || null,
        emailToken: typeof data.emailToken === "string" ? data.emailToken : undefined,
      };
    },
  )
  .handler(async ({ data }) => {
    const session = await visitorSession();
    const profileId = session.data?.profileId;
    if (!profileId) throw new Error("Not signed in");
    const current = await getProfileById(profileId);
    if (!current) throw new Error("Profile not found");
    if (data.email && data.email !== current.email) {
      const verifiedEmail = await verifyEmailToken(data.emailToken);
      if (verifiedEmail !== data.email) {
        throw new Error("Verify the new email before replacing your profile email.");
      }
    }

    // One address, one profile. upsertProfileAfterOtp has enforced this since it
    // was written; this path never got the same check, so a signed-in visitor
    // could type in somebody else's address and take it. That locks the real
    // owner out of email sign-in, because completeLogin refuses to guess
    // between two matches.
    const emailOwners = data.email ? await findProfilesByEmail(data.email) : [];
    if (emailOwners.some((r) => r.id !== profileId)) {
      throw new Error("That email is already linked to another account.");
    }

    const row = await updateProfileRow(profileId, {
      name: data.name,
      email: data.email,
      profession: data.profession,
      businessName: data.businessName,
    });
    if (!row) throw new Error("Failed to update profile");
    return toDTO(row);
  });

export const signOutProfile = createServerFn({ method: "POST" }).handler(async () => {
  const session = await visitorSession();
  await session.clear();
  return { ok: true };
});
