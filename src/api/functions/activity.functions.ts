import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import type { VisitorSession } from "@/server/session.server";

export type ActivityEvent =
  | "signup"
  | "quiz_completed"
  | "property_view"
  | "compare_add"
  | "compare_open"
  | "favorite_add"
  | "contact_click"
  | "gate_shown"
  | "gate_unlocked"
  | "alternative_clicked"
  | "weighting_changed";

const EVENTS: ActivityEvent[] = [
  "signup",
  "quiz_completed",
  "property_view",
  "compare_add",
  "compare_open",
  "favorite_add",
  "contact_click",
  "gate_shown",
  "gate_unlocked",
  "alternative_clicked",
  "weighting_changed",
];

const MAX_METADATA_BYTES = 8_192;
const MAX_METADATA_DEPTH = 5;
const MAX_CONTAINER_ITEMS = 50;
const MAX_METADATA_STRING = 500;

function validateMetadataValue(value: unknown, depth: number): void {
  if (depth > MAX_METADATA_DEPTH) throw new Error("Activity metadata is too deeply nested");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value === "string") {
    if (value.length > MAX_METADATA_STRING) throw new Error("Activity metadata string is too long");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_CONTAINER_ITEMS) throw new Error("Activity metadata array is too large");
    value.forEach((item) => validateMetadataValue(item, depth + 1));
    return;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Invalid activity metadata object");
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_CONTAINER_ITEMS)
      throw new Error("Activity metadata object is too large");
    for (const [key, item] of entries) {
      if (key.length > 100) throw new Error("Activity metadata key is too long");
      validateMetadataValue(item, depth + 1);
    }
    return;
  }
  throw new Error("Invalid activity metadata value");
}

function validatedMetadata(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Activity metadata must be an object");
  }
  validateMetadataValue(value, 1);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_METADATA_BYTES) {
    throw new Error("Activity metadata is too large");
  }
  return value as Record<string, unknown>;
}

export function approvedMetadata(event: ActivityEvent, value: Record<string, unknown>) {
  if (event !== "quiz_completed") return {};
  const approved: Record<string, unknown> = {};
  if (typeof value.marketId === "string") approved.marketId = value.marketId.slice(0, 100);
  if (typeof value.budgetBandId === "string")
    approved.budgetBandId = value.budgetBandId.slice(0, 50);
  if (Array.isArray(value.configurationOptionIds)) {
    approved.configurationOptionIds = value.configurationOptionIds
      .filter((item): item is string => typeof item === "string")
      .slice(0, 20);
  }
  if (Array.isArray(value.propertyTypeIds)) {
    approved.propertyTypeIds = value.propertyTypeIds
      .filter((item): item is string => typeof item === "string")
      .slice(0, 20);
  }
  return approved;
}

/**
 * Records one visitor interaction. Public (no auth) — anonymous browsing counts
 * too; the event links to a profile automatically when the visitor is signed in.
 * Never throws to the caller: analytics must not break the browsing experience.
 */
export const logActivity = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      event: ActivityEvent;
      propertySlug?: string | null;
      sessionKey?: string | null;
      metadata?: Record<string, unknown> | null;
    }) => {
      if (!data || !EVENTS.includes(data.event)) throw new Error("Invalid event");
      return {
        event: data.event,
        propertySlug:
          typeof data.propertySlug === "string" ? data.propertySlug.slice(0, 200) : null,
        sessionKey: typeof data.sessionKey === "string" ? data.sessionKey.slice(0, 100) : null,
        metadata: validatedMetadata(data.metadata),
      };
    },
  )
  .handler(async ({ data }) => {
    try {
      // Public by design, but that made it an anonymous unbounded write into
      // the database. Keyed on the caller's address rather than the supplied
      // sessionKey, which the caller invents and could vary per request.
      const { enforce, clientIp, POLICIES } = await import("@/server/rate-limit.server");
      await enforce(POLICIES.ACTIVITY, `ip:${await clientIp()}`);

      const { sessionConfig } = await import("@/server/session.server");
      const session = await useSession<VisitorSession>(sessionConfig());
      const profileId = session.data?.profileId ?? null;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (profileId) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("analytics_opt_out")
          .eq("id", profileId)
          .maybeSingle();
        if ((profile as { analytics_opt_out?: boolean } | null)?.analytics_opt_out) {
          return { ok: false };
        }
      }
      const metadata = approvedMetadata(data.event, data.metadata);
      if (process.env.APP_ENV === "production") {
        const { publishProductEvent } = await import("@/server/analytics-publisher.server");
        await publishProductEvent({
          event: data.event,
          profileId,
          anonymousSessionId: data.sessionKey,
          propertySlug: data.propertySlug,
          metadata,
        });
      } else {
        await supabaseAdmin.from("customer_activity").insert({
          profile_id: profileId,
          session_key: data.sessionKey,
          event_type: data.event,
          property_slug: data.propertySlug,
          metadata: metadata as never,
        });
      }
      return { ok: true };
    } catch {
      // Analytics is best-effort — swallow so browsing never breaks.
      return { ok: false };
    }
  });
