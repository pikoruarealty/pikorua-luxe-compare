import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Check, ChevronLeft, ChevronRight, MapPin, Plus, Ruler, X } from "lucide-react";
import type { Property } from "@/types/property";
import { FavoriteButton } from "@/components/property/FavoriteButton";
import { useImagePrewarm } from "@/hooks/use-image-prewarm";

interface Props {
  property: Property;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  slides: string[];
  slideIdx: number;
  onSlideChange: (i: number) => void;
  selectedFlag: boolean;
  atMax: boolean;
  onToggleCompare: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onClose?: () => void;
}

const EXPANDED_HEIGHT = 520;
const EXTRA_WIDTH = 80; // px wider than row on each side combined
const MIN_WIDTH = 820; // ensure popup is always large enough to show full info
const EXTRA_LIFT = 12;

export function PropertyHoverCard({
  property,
  anchorRef,
  open,
  slides,
  slideIdx,
  onSlideChange,
  selectedFlag,
  atMax,
  onToggleCompare,
  onPointerEnter,
  onPointerLeave,
  onClose,
}: Props) {
  const [box, setBox] = useState<{
    top: number;
    left: number;
    width: number;
    originX: number;
    originY: number;
    initialScale: number;
  } | null>(null);
  useImagePrewarm(open ? slides : []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const compute = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const desired = Math.max(r.width + EXTRA_WIDTH, MIN_WIDTH);
      const width = Math.min(desired, vw - 24);
      // Always center the card horizontally and vertically in the viewport.
      const left = Math.max(12, (vw - width) / 2);
      const top = Math.max(12, (vh - EXPANDED_HEIGHT) / 2);
      // Scale origin points from the anchor toward the centered card.
      const anchorCx = r.left + r.width / 2;
      const anchorCy = r.top + r.height / 2;
      const originX = Math.min(100, Math.max(0, ((anchorCx - left) / width) * 100));
      const originY = Math.min(100, Math.max(0, ((anchorCy - top) / EXPANDED_HEIGHT) * 100));
      // proportional starting scale (uniform — no stretch)
      const initialScale = Math.max(0.82, Math.min(r.width / width, r.height / EXPANDED_HEIGHT));
      setBox({ top, left, width, originX, originY, initialScale });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("resize", compute);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const go = (dir: 1 | -1) => {
    onSlideChange((slideIdx + dir + slides.length) % slides.length);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && box && (
        <motion.div
          onWheel={(e) => e.preventDefault()}
          onTouchMove={(e) => e.preventDefault()}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: box.initialScale }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: box.initialScale }}
          transition={{
            opacity: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
            scale: { type: "spring", stiffness: 260, damping: 32, mass: 0.9 },
          }}
          className="pointer-events-auto fixed z-80 hidden md:block"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: EXPANDED_HEIGHT,
            transformOrigin: `${box.originX}% ${box.originY}%`,
            willChange: "transform, opacity",
            borderRadius: 32,
            background: "var(--card)",
            backdropFilter: "blur(28px) saturate(140%)",
            border: "1px solid var(--glass-border)",
            boxShadow: "0 40px 100px -20px color-mix(in oklab, var(--foreground) 35%, transparent)",
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "55% 45%",
            backfaceVisibility: "hidden",
            transform: "translateZ(0)",
            color: "var(--foreground)",
          }}
        >
          {onClose && (
            <button
              type="button"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="absolute right-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition hover:bg-champagne hover:text-lux-black"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* LEFT — Image carousel */}
          <div className="media-frame relative h-full overflow-hidden">
            <AnimatePresence initial={false} mode="sync">
              <motion.img
                key={slides[slideIdx]}
                src={slides[slideIdx]}
                alt={property.name}
                decoding="async"
                fetchPriority="high"
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ imageRendering: "auto", willChange: "transform, opacity" }}
              />
            </AnimatePresence>

            <span className="glass absolute left-4 top-4 z-10 rounded-full px-3 py-1 text-[10px] tracking-luxury text-champagne">
              {property.status}
            </span>
            <div className="absolute right-4 top-4 z-10">
              <FavoriteButton
                propertyId={property.id}
                propertyName={property.name}
                propertyImage={property.image}
              />
            </div>

            {slides.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    go(-1);
                  }}
                  className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white backdrop-blur-md transition hover:bg-champagne hover:text-lux-black"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    go(1);
                  }}
                  className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white backdrop-blur-md transition hover:bg-champagne hover:text-lux-black"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>

                <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Go to image ${i + 1}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSlideChange(i);
                      }}
                      className={`h-1 rounded-full transition-all duration-500 ${
                        i === slideIdx ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* RIGHT — Details */}
          <div className="flex h-full flex-col p-9">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-px w-6 bg-champagne/70" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-champagne">
                  {property.developer}
                </p>
              </div>
              <h3 className="mt-4 font-display text-[38px] font-medium leading-[1.02] tracking-[-0.02em] text-ivory">
                {property.name}
              </h3>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.28em] text-ivory/60">
                {property.configuration}
              </p>
              <p className="mt-5 text-[14px] leading-relaxed text-ivory/75 line-clamp-3">
                {property.tagline}
              </p>
            </div>

            <div className="mt-auto">
              <div
                className="my-6 h-px w-full"
                style={{
                  background:
                    "linear-gradient(to right, transparent, var(--glass-border), transparent)",
                }}
              />

              <dl className="grid grid-cols-1 gap-3 text-[13px]">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-champagne/10 ring-1 ring-champagne/25">
                    <MapPin className="h-3.5 w-3.5 text-champagne" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-[9px] font-semibold uppercase tracking-[0.28em] text-ivory/45">
                      Location
                    </dt>
                    <dd className="truncate text-ivory/90">{property.location}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-champagne/10 ring-1 ring-champagne/25">
                    <Ruler className="h-3.5 w-3.5 text-champagne" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-[9px] font-semibold uppercase tracking-[0.28em] text-ivory/45">
                      Size
                    </dt>
                    <dd className="truncate text-ivory/90">{property.size}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-champagne/10 ring-1 ring-champagne/25">
                    <Calendar className="h-3.5 w-3.5 text-champagne" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-[9px] font-semibold uppercase tracking-[0.28em] text-ivory/45">
                      Possession
                    </dt>
                    <dd className="truncate text-ivory/90">{property.possession}</dd>
                  </div>
                </div>
              </dl>

              {/* Not disabled at max — the click must land so the "suite is full"
                  toast can explain why nothing was added. */}
              <button
                onClick={onToggleCompare}
                className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.28em] transition-all duration-300 ${
                  selectedFlag
                    ? "bg-champagne text-lux-black shadow-[0_14px_36px_-12px_rgba(200,164,93,0.7)]"
                    : atMax
                      ? "bg-graphite text-muted-foreground hover:text-foreground"
                      : "gold-border text-champagne hover:bg-champagne hover:text-lux-black"
                }`}
              >
                {selectedFlag ? (
                  <>
                    <Check className="h-4 w-4" /> Added to Compare
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Add to Compare
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function useHoverIntent(delay = 220) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const enter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open || openTimer.current) return;
    openTimer.current = setTimeout(() => {
      setOpen(true);
      openTimer.current = null;
    }, delay);
  };

  const leave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) return;
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, 140);
  };

  const closeNow = () => {
    clearTimers();
    setOpen(false);
  };

  useEffect(() => () => clearTimers(), []);

  // Close the hover card on any scroll/wheel/touchmove so it doesn't
  // float over the list while the user is browsing.
  useEffect(() => {
    if (!open) return;
    const handler = () => {
      if (openTimer.current) {
        clearTimeout(openTimer.current);
        openTimer.current = null;
      }
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setOpen(false);
    };
    window.addEventListener("scroll", handler, { passive: true, capture: true });
    window.addEventListener("wheel", handler, { passive: true });
    window.addEventListener("touchmove", handler, { passive: true });
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("wheel", handler);
      window.removeEventListener("touchmove", handler);
    };
  }, [open]);

  return { open, enter, leave, close: closeNow };
}
