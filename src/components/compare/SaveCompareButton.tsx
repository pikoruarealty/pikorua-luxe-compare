import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useSavedComparesStore } from "@/stores/saved-compares-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOnboarding } from "@/context/OnboardingContext";
import type { Property } from "@/types/property";

interface Props {
  properties: Property[];
  className?: string;
  /** Fires once the flight lands, so callers can chain a follow-up action. */
  onSaved?: () => void;
  /** Override the idle label where the surrounding copy needs a different verb. */
  saveLabel?: string;
}

interface FlyState {
  from: { x: number; y: number };
  to: { x: number; y: number };
  images: string[];
  key: number;
}

/** The visible saved marker — desktop nav vs mobile bar. Mirrors FavoriteButton. */
function findSavedTarget(): Element | null {
  const targets = Array.from(document.querySelectorAll("[data-saved-target]"));
  return targets.find((t) => t.getBoundingClientRect().width > 0) ?? targets[0] ?? null;
}

/**
 * Saves the whole comparison (not the individual residences) to the visitor's
 * saved list, with the same takeoff-and-land flight the favorite heart uses —
 * here the flying object is the stacked set, so it reads as "this whole
 * comparison went to saved".
 */
export function SaveCompareButton({ properties, className = "", onSaved, saveLabel }: Props) {
  const hydrated = useHydrated();
  const { save, isSaved } = useSavedComparesStore();
  const { requestAuth } = useOnboarding();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [fly, setFly] = useState<FlyState | null>(null);

  const ids = properties.map((p) => p.id);
  const saved = hydrated && isSaved(ids);
  const label = properties.map((p) => p.name).join(" vs ");

  const handleClick = () => {
    if (saved) {
      toast.info("This comparison is already saved.");
      return;
    }
    const didSave = save(ids);
    if (!didSave) return;

    const btn = btnRef.current;
    const target = findSavedTarget();
    if (!btn || !target) {
      // No visible target to fly to — fall back to a plain confirmation.
      toast.success(`Comparison saved — ${label}`);
      onSaved?.();
      return;
    }

    const a = btn.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    setFly({
      from: { x: a.left + a.width / 2, y: a.top + a.height / 2 },
      to: { x: b.left + b.width / 2, y: b.top + b.height / 2 },
      images: properties.map((p) => p.image).filter(Boolean),
      key: Date.now(),
    });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        aria-label={saved ? "Comparison already saved" : "Save this comparison"}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] tracking-luxury transition-all duration-300 ${
          saved
            ? "border-champagne bg-champagne/10 text-champagne"
            : "border-border text-foreground hover:border-foreground/40"
        } ${className}`}
      >
        {saved ? (
          <>
            <Check className="h-3.5 w-3.5" /> Saved
          </>
        ) : (
          <>
            <Bookmark className="h-3.5 w-3.5" /> {saveLabel ?? "Save comparison"}
          </>
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {fly && (
              <motion.div
                key={fly.key}
                className="pointer-events-none fixed left-0 top-0 z-200"
                initial={{ x: fly.from.x, y: fly.from.y, scale: 1, opacity: 1, rotate: 0 }}
                animate={{
                  // Same clamped arc as the favorite flight: rise above the
                  // straight line, then swoop into the saved marker. The peak
                  // is clamped so the stack never leaves the viewport.
                  x: [fly.from.x, (fly.from.x + fly.to.x) / 2, fly.to.x],
                  y: [fly.from.y, Math.max(44, Math.min(fly.from.y, fly.to.y) - 90), fly.to.y],
                  scale: [1, 0.8, 0.14],
                  opacity: [1, 1, 0.9],
                  rotate: [0, -5, 8],
                }}
                exit={{ opacity: 0, scale: 0.1 }}
                transition={{
                  duration: 1.05,
                  delay: 0.06,
                  times: [0, 0.48, 1],
                  ease: ["easeOut", "easeIn"],
                }}
                onAnimationComplete={() => {
                  findSavedTarget()?.animate?.(
                    [
                      { transform: "scale(1)" },
                      { transform: "scale(1.45)" },
                      { transform: "scale(1)" },
                    ],
                    { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
                  );
                  toast.success(`Comparison saved — ${label}`);
                  setFly(null);
                  onSaved?.();
                  // High-intent moment — same sign-up invitation the heart uses.
                  window.setTimeout(() => requestAuth(), 1400);
                }}
              >
                {/* Fanned stack — reads as the whole set in flight, not one card. */}
                <div className="-translate-x-1/2 -translate-y-1/2">
                  <div className="relative h-14 w-20">
                    {fly.images.slice(0, 3).map((src, i) => (
                      <img
                        key={`${src}-${i}`}
                        src={src}
                        alt=""
                        className="absolute h-14 w-20 rounded-lg border border-champagne/40 object-cover shadow-lg"
                        style={{
                          transform: `translateX(${(i - 1) * 7}px) rotate(${(i - 1) * 7}deg)`,
                          zIndex: i,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
