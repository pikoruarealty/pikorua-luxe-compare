import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import { throwSafeError } from "@/lib/safe-error";
import type { PendingSession, VisitorSession } from "@/server/session.server";

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

function toDTO(row: {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  profession: string | null;
  business_name: string | null;
  quiz_answers: unknown;
}): ProfileDTO {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    profession: row.profession,
    businessName: row.business_name,
    quizAnswers: (row.quiz_answers as QuizAnswersDTO | null) ?? null,
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Phone is the unique key, so an address already tied to a different
    // number would leave two accounts sharing one login identity.
    const { data: emailOwners, error: emailOwnersError } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .eq("email", data.email);
    if (emailOwnersError) throw new Error("Couldn't check email availability");
    if ((emailOwners ?? []).some((r) => r.phone !== phone)) {
      throw new Error("That email is already linked to another account. Try signing in instead.");
    }

    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          phone,
          name: data.name,
          email: data.email,
          profession: data.profession,
          business_name: data.businessName,
        },
        { onConflict: "phone" },
      )
      .select("id, phone, name, email, profession, business_name, quiz_answers")
      .single();
    if (error) throwSafeError("upsertProfileAfterOtp", error, "Failed to save profile");
    if (!row) throw new Error("Failed to save profile");

    const session = await visitorSession();
    await session.update({ profileId: row.id, phone: row.phone });
    await pending.clear();

    // Record the sign-up for the admin activity view (best-effort).
    try {
      await supabaseAdmin
        .from("customer_activity")
        .insert({ profile_id: row.id, event_type: "signup", metadata: {} as never });
    } catch {
      // analytics must never block sign-up
    }

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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const query = supabaseAdmin.from("profiles").select("id");
    const { data: rows, error } =
      data.channel === "email"
        ? await query.eq("email", data.identity)
        : await query.eq("phone", data.identity);
    if (error) throwSafeError("checkAccountExists", error, "Could not check account");
    return { exists: (rows ?? []).length > 0 };
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const columns = "id, phone, name, email, profession, business_name, quiz_answers";
    const { data: rows, error } = phone
      ? await supabaseAdmin.from("profiles").select(columns).eq("phone", phone)
      : await supabaseAdmin
          .from("profiles")
          .select(columns)
          .eq("email", email as string);
    if (error) throwSafeError("completeLogin", error, "Could not complete sign-in");

    const matches = rows ?? [];
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("profiles")
    .select("id, phone, name, email, profession, business_name, quiz_answers")
    .eq("id", profileId)
    .maybeSingle();
  if (error || !row) return null;
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ quiz_answers: data.answers as never })
      .eq("id", profileId);
    if (error) throwSafeError("saveQuizAnswers", error, "Could not save preferences");
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; email: string; profession: string; businessName?: string | null }) => {
      if (!data?.name?.trim() || !data?.email?.trim() || !data?.profession?.trim()) {
        throw new Error("Missing fields");
      }
      // Lowercased to match how every other write stores it — otherwise the
      // same address saved here and at sign-up produces two rows that only a
      // case-insensitive lookup can tell apart.
      const email = data.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address");
      return {
        name: data.name.trim(),
        email,
        profession: data.profession.trim(),
        businessName: data.businessName?.trim() || null,
      };
    },
  )
  .handler(async ({ data }) => {
    const session = await visitorSession();
    const profileId = session.data?.profileId;
    if (!profileId) throw new Error("Not signed in");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // One address, one profile. upsertProfileAfterOtp has enforced this since it
    // was written; this path never got the same check, so a signed-in visitor
    // could type in somebody else's address and take it. That locks the real
    // owner out of email sign-in, because completeLogin refuses to guess
    // between two matches.
    const { data: emailOwners, error: ownersError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email);
    if (ownersError) throw new Error("Couldn't check that email. Please try again.");
    if ((emailOwners ?? []).some((r: { id: string }) => r.id !== profileId)) {
      throw new Error("That email is already linked to another account.");
    }

    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .update({
        name: data.name,
        email: data.email,
        profession: data.profession,
        business_name: data.businessName,
      })
      .eq("id", profileId)
      .select("id, phone, name, email, profession, business_name, quiz_answers")
      .single();
    if (error) throwSafeError("updateProfile", error, "Failed to update profile");
    if (!row) throw new Error("Failed to update profile");
    return toDTO(row);
  });

export const signOutProfile = createServerFn({ method: "POST" }).handler(async () => {
  const session = await visitorSession();
  await session.clear();
  return { ok: true };
});
