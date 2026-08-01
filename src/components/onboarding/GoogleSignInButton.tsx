import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { verifyGoogleCredential, type GoogleIdentity } from "@/api/functions/google-auth.functions";

const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GsiWindow {
  google?: {
    accounts: {
      id: {
        initialize: (opts: {
          client_id: string;
          callback: (r: { credential?: string }) => void;
          auto_select?: boolean;
        }) => void;
        renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
      };
    };
  };
}

/** Loads Google's script once per page, no matter how many buttons mount. */
let scriptPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if ((window as GsiWindow).google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Renders Google's own button (their branding rules require it) and hands the
 *  caller a verified email once the credential has been checked server-side.
 *  Renders nothing at all when the client ID isn't configured, so the rest of
 *  the auth flow stays usable without Google set up. */
export function GoogleSignInButton({
  onIdentity,
  onError,
}: {
  onIdentity: (identity: GoogleIdentity) => void;
  onError: (message: string) => void;
}) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const holderRef = useRef<HTMLDivElement>(null);
  const [verifying, setVerifying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const verifyFn = useServerFn(verifyGoogleCredential);

  // Callbacks live in a ref so re-renders never re-initialise Google's widget.
  const handlers = useRef({ onIdentity, onError });
  handlers.current = { onIdentity, onError };

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !holderRef.current) return;
        const gsi = (window as GsiWindow).google?.accounts?.id;
        if (!gsi) return setUnavailable(true);

        gsi.initialize({
          client_id: clientId,
          auto_select: false,
          callback: async (response) => {
            if (!response?.credential) {
              handlers.current.onError("Google didn't return a sign-in token.");
              return;
            }
            setVerifying(true);
            try {
              const identity = await verifyFn({ data: { credential: response.credential } });
              handlers.current.onIdentity(identity);
            } catch (err) {
              handlers.current.onError(
                err instanceof Error ? err.message : "Google sign-in failed.",
              );
            } finally {
              setVerifying(false);
            }
          },
        });
        gsi.renderButton(holderRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "center",
          width: 320,
        });
      })
      .catch(() => !cancelled && setUnavailable(true));

    return () => {
      cancelled = true;
    };
  }, [clientId, verifyFn]);

  if (!clientId) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={holderRef} className={verifying ? "pointer-events-none opacity-50" : ""} />
      {verifying && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Confirming with Google…
        </p>
      )}
      {unavailable && (
        <p className="text-xs text-muted-foreground">
          Google sign-in couldn't load — use your email instead.
        </p>
      )}
    </div>
  );
}
