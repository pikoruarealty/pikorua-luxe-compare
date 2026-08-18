import { Lock } from "lucide-react";

/**
 * D4/D5: the deep comparison rows already render as skeleton bars inline in
 * the matrix table — this banner never blocks or hides the public tier, it
 * only offers the phone + OTP unlock for the rows still filling in.
 */
export function UnlockGate({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-champagne/30 bg-champagne/5 px-6 py-5 text-center sm:flex-row sm:justify-between sm:text-left">
      <div className="flex items-center gap-3">
        <Lock className="h-5 w-5 shrink-0 text-champagne" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Areas, room dimensions, rate and developer track record are locked.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Verify your phone number to unlock every row below — no email, no password.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onUnlock}
        className="shrink-0 rounded-full bg-champagne px-6 py-2.5 text-xs tracking-luxury text-lux-black transition hover:opacity-90"
      >
        Unlock full comparison
      </button>
    </div>
  );
}
