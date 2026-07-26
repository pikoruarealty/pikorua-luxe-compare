import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useActivityLog } from "@/hooks/use-activity-log";
import { useOnboarding } from "@/context/OnboardingContext";

interface Props {
  propertyId: string;
  propertyName: string;
  propertyImage?: string;
  className?: string;
}

interface FlyState {
  from: { x: number; y: number };
  to: { x: number; y: number };
  image?: string;
  key: number;
}

export function FavoriteButton({ propertyId, propertyName, propertyImage, className = "" }: Props) {
  const hydrated = useHydrated();
  const { isFavorite, toggle } = useFavoritesStore();
  const { requestAuth } = useOnboarding();
  const logActivity = useActivityLog();
  const favorited = hydrated && isFavorite(propertyId);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [fly, setFly] = useState<FlyState | null>(null);
  const [pulse, setPulse] = useState(0);

  // Pick the saved-heart that is actually visible (desktop nav vs mobile bar).
  // Note: the targets are SVGs, so visibility is checked via bounding rect.
  const findSavedTarget = (): Element | null => {
    const targets = Array.from(document.querySelectorAll("[data-saved-target]"));
    return targets.find((t) => t.getBoundingClientRect().width > 0) ?? targets[0] ?? null;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wasFav = favorited;
    const nowFav = toggle(propertyId);
    if (!wasFav && nowFav) logActivity("favorite_add", propertyId);

    // Clear any previous queued toasts immediately and show single confirmation toast
    toast.dismiss();
    toast.success(
      nowFav ? `${propertyName} saved to favorites` : `${propertyName} removed from favorites`,
      { duration: 2000 },
    );

    // If unfavoriting, clear any pending flight animation state immediately
    if (!nowFav) {
      setFly(null);
      return;
    }

    // Favoriting: trigger flight animation if target icon is present
    const btn = btnRef.current;
    const target = findSavedTarget();
    if (btn && target) {
      const a = btn.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      setFly({
        from: { x: a.left + a.width / 2, y: a.top + a.height / 2 },
        to: { x: b.left + b.width / 2, y: b.top + b.height / 2 },
        image: propertyImage,
        key: Date.now(),
      });
      setPulse((p) => p + 1);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
        onClick={handleClick}
        className={`relative grid h-9 w-9 place-items-center rounded-full border backdrop-blur-md transition-all duration-300 ${
          favorited
            ? "border-champagne bg-champagne text-lux-black"
            : "border-champagne/40 bg-lux-black/40 text-champagne hover:bg-lux-black/60"
        } ${className}`}
      >
        <motion.span
          key={pulse}
          initial={{ scale: 1 }}
          animate={pulse ? { scale: [1, 1.4, 0.85, 1] } : { scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="grid place-items-center"
        >
          <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
        </motion.span>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {fly && (
              <motion.div
                key={fly.key}
                initial={{
                  x: fly.from.x,
                  y: fly.from.y,
                  scale: 1,
                  opacity: 1,
                  rotate: 0,
                }}
                animate={{
                  // Curved arc: rise above the straight line mid-flight, then
                  // swoop into the saved heart. The peak is clamped so the
                  // card never leaves the viewport (the heart sits near the
                  // top edge, so an unclamped peak would fly off-screen).
                  x: [fly.from.x, (fly.from.x + fly.to.x) / 2, fly.to.x],
                  y: [fly.from.y, Math.max(44, Math.min(fly.from.y, fly.to.y) - 90), fly.to.y],
                  scale: [1, 0.82, 0.16],
                  opacity: [1, 1, 0.9],
                  rotate: [0, -5, 8],
                }}
                exit={{ opacity: 0, scale: 0.1 }}
                transition={{
                  duration: 1.05,
                  // Small delay lets the card mount and paint before it
                  // moves, so the first flight frame never stutters.
                  delay: 0.06,
                  times: [0, 0.48, 1],
                  ease: ["easeOut", "easeIn"],
                }}
                onAnimationComplete={() => {
                  // Landing pulse on the saved heart
                  const target = findSavedTarget();
                  target?.animate?.(
                    [
                      { transform: "scale(1)" },
                      { transform: "scale(1.45)" },
                      { transform: "scale(1)" },
                    ],
                    { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
                  );
                  setFly(null);
                }}
                style={{
                  position: "fixed",
                  left: 0,
                  top: 0,
                  translateX: "-50%",
                  translateY: "-50%",
                  pointerEvents: "none",
                  zIndex: 9999,
                  willChange: "transform",
                }}
                className="grid h-16 w-16 place-items-center overflow-hidden rounded-card border border-champagne bg-lux-black shadow-[0_10px_28px_-8px_rgba(0,0,0,0.4)]"
              >
                {fly.image ? (
                  <img
                    src={fly.image}
                    alt=""
                    width={64}
                    height={64}
                    decoding="sync"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Heart className="h-6 w-6 fill-champagne text-champagne" />
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
