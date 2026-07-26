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

const encoder = new TextEncoder();

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyPhoneToken(token?: string | null) {
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET missing");
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;
  const payloadBytes = base64UrlToBytes(payloadPart);
  const providedSignature = base64UrlToBytes(signaturePart);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(new TextDecoder().decode(payloadBytes))),
  );
  if (!timingSafeEqual(providedSignature, expected)) return null;
  const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as VerifiedPhoneToken;
  if (!parsed.phone || Date.now() - parsed.verifiedAt > 60 * 10 * 1000) return null;
  return parsed.phone.replace(/[^0-9]/g, "");
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
    }) => {
      if (!data?.name?.trim() || !data?.email?.trim() || !data?.profession?.trim()) {
        throw new Error("Missing fields");
      }
      return {
        name: data.name.trim(),
        email: data.email.trim(),
        profession: data.profession.trim(),
        businessName: data.businessName?.trim() || null,
        verificationToken:
          typeof data.verificationToken === "string" ? data.verificationToken : undefined,
      };
    },
  )
  .handler(async ({ data }) => {
    const pending = await useSession<{ phone: string; verifiedAt: number }>(pendingConfig());
    const phone = pending.data?.phone ?? (await verifyPhoneToken(data.verificationToken));
    if (!phone) throw new Error("Phone not verified. Please verify OTP first.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
