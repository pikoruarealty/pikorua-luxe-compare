import { useCallback } from "react";
import { logActivity, type ActivityEvent } from "@/api/functions/activity.functions";

const SESSION_KEY_STORAGE = "pikorua:session-key";

/** Stable per-browser id so anonymous (pre-signup) activity can still be grouped. */
function getSessionKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let key = window.localStorage.getItem(SESSION_KEY_STORAGE);
    if (!key) {
      key = crypto.randomUUID();
      window.localStorage.setItem(SESSION_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget interaction logging for the admin analytics view.
 * Never rejects — analytics must not interfere with browsing.
 */
export function useActivityLog() {
  return useCallback(
    (event: ActivityEvent, propertySlug?: string | null, metadata?: Record<string, unknown>) => {
      try {
        void logActivity({
          data: {
            event,
            propertySlug: propertySlug ?? null,
            sessionKey: getSessionKey(),
            metadata: metadata ?? null,
          },
        }).catch(() => {});
      } catch {
        // ignore
      }
    },
    [],
  );
}
