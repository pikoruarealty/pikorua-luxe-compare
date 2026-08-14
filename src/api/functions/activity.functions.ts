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
  | "contact_click";

const EVENTS: ActivityEvent[] = [
  "signup",
  "quiz_completed",
  "property_view",
  "compare_add",
  "compare_open",
  "favorite_add",
  "contact_click",
];

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
        metadata:
          data.metadata && typeof data.metadata === "object" ? data.metadata : ({} as const),
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
      await supabaseAdmin.from("customer_activity").insert({
        profile_id: profileId,
        session_key: data.sessionKey,
        event_type: data.event,
        property_slug: data.propertySlug,
        metadata: data.metadata as never,
      });
      return { ok: true };
    } catch {
      // Analytics is best-effort — swallow so browsing never breaks.
      return { ok: false };
    }
  });
