import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

export interface QuizAnswersDTO {
  state?: string;
  city?: string;
  bhk: string[];
  propertyType: string[];
  budgetRange: string;
  budgetSub: string;
}

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

const PENDING = "pikorua-pending";
const SESSION = "pikorua-session";

const cookieOpts = {
  path: "/",
  httpOnly: true,
  sameSite: "none" as const,
  secure: true,
};
const pendingConfig = () => ({
  password: process.env.SESSION_SECRET!,
  name: PENDING,
  maxAge: 60 * 10,
  cookie: cookieOpts,
});
const sessionConfig = () => ({
  password: process.env.SESSION_SECRET!,
  name: SESSION,
  maxAge: 60 * 60 * 24 * 60, // 60 days
  cookie: cookieOpts,
});

const CLAIM_TTL_MS = 60 * 10 * 1000;

async function verifyPhoneToken(token?: string | null) {
  const { readClaim } = await import("@/server/verification-token.server");
  const claim = await readClaim<VerifiedPhoneToken>(token, CLAIM_TTL_MS);
  return claim?.phone ? claim.phone.replace(/[^0-9]/g, "") : null;
}

async function verifyEmailToken(token?: string | null) {
  const { readClaim } = await import("@/server/verification-token.server");
  const claim = await readClaim<{ email: string; verifiedAt: number }>(token, CLAIM_TTL_MS);
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
    const pending = await useSession<{ phone: string; verifiedAt: number }>(pendingConfig());
    const phone = pending.data?.phone ?? (await verifyPhoneToken(data.verificationToken));
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
    const { data: emailOwners } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .ilike("email", data.email);
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
    if (error || !row) throw new Error(error?.message ?? "Failed to save profile");

    const session = await useSession<{ profileId: string; phone: string }>(sessionConfig());
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const query = supabaseAdmin.from("profiles").select("id");
    const { data: rows, error } =
      data.channel === "email"
        ? await query.ilike("email", data.identity)
        : await query.eq("phone", data.identity);
    if (error) throw new Error(error.message);
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
    const phone = await verifyPhoneToken(data.verificationToken);
    const email = phone ? null : await verifyEmailToken(data.emailToken);
    if (!phone && !email) throw new Error("Verification expired. Please start again.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const columns = "id, phone, name, email, profession, business_name, quiz_answers";
    const { data: rows, error } = phone
      ? await supabaseAdmin.from("profiles").select(columns).eq("phone", phone)
      : await supabaseAdmin.from("profiles").select(columns).ilike("email", email as string);
    if (error) throw new Error(error.message);

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
    const session = await useSession<{ profileId: string; phone: string }>(sessionConfig());
    await session.update({ profileId: row.id, phone: row.phone });

    const pending = await useSession<{ phone: string; verifiedAt: number }>(pendingConfig());
    await pending.clear();

    return toDTO(row);
  });

export const getSessionProfile = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<{ profileId: string; phone: string }>(sessionConfig());
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
    return { answers: data.answers ?? null };
  })

  .handler(async ({ data }) => {
    const session = await useSession<{ profileId: string; phone: string }>(sessionConfig());
    const profileId = session.data?.profileId;
    if (!profileId) throw new Error("Not signed in");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ quiz_answers: data.answers as never })
      .eq("id", profileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; email: string; profession: string; businessName?: string | null }) => {
      if (!data?.name?.trim() || !data?.email?.trim() || !data?.profession?.trim()) {
        throw new Error("Missing fields");
      }
      return {
        name: data.name.trim(),
        email: data.email.trim(),
        profession: data.profession.trim(),
        businessName: data.businessName?.trim() || null,
      };
    },
  )
  .handler(async ({ data }) => {
    const session = await useSession<{ profileId: string; phone: string }>(sessionConfig());
    const profileId = session.data?.profileId;
    if (!profileId) throw new Error("Not signed in");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    if (error || !row) throw new Error(error?.message ?? "Failed to update profile");
    return toDTO(row);
  });

export const signOutProfile = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<{ profileId: string; phone: string }>(sessionConfig());
  await session.clear();
  return { ok: true };
});
