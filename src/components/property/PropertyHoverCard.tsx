import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  Ruler,
  X,
} from "lucide-react";
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

  const [direction, setDirection] = useState<number>(1);

  const go = (dir: 1 | -1) => {
    setDirection(dir);
    onSlideChange((slideIdx + dir + slides.length) % slides.length);
  };

  const openTimeRef = useRef<number>(0);

  useEffect(() => {
    if (open) {
      openTimeRef.current = Date.now();
    }
  }, [open]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (Date.now() - openTimeRef.current < 350) return;
    onClose?.();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* MOBILE SHEET / MODAL (< md) — Zero Scroll Luxury Card */}
          <div className="md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleBackdropClick}
              className="fixed inset-0 z-[85] bg-black/75 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-3 bottom-3 z-[90] flex flex-col overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-card text-foreground shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* Full-bleed Photo Hero with Overlay Badges and Close Button */}
              <div className="media-frame relative aspect-[16/10] w-full shrink-0 overflow-hidden">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.img
                    key={slides[slideIdx]}
                    src={slides[slideIdx]}
                    alt={property.name}
                    decoding="async"
                    fetchPriority="high"
                    initial={{ opacity: 0, scale: 1.05, x: direction > 0 ? 35 : -35 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95, x: direction > 0 ? -35 : 35 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ imageRendering: "auto", willChange: "transform, opacity" }}
                  />
                </AnimatePresence>

                {/* Top Overlay Controls */}
                <div className="absolute inset-x-3 top-3 z-20 flex items-center justify-between pointer-events-none">
                  <span className="pointer-events-auto rounded-full border border-border/60 bg-background/90 px-3 py-1 text-[10px] font-bold tracking-wider uppercase text-foreground shadow-xs backdrop-blur-md">
                    {property.status}
                  </span>
                  <div className="pointer-events-auto flex items-center gap-2">
                    <FavoriteButton
                      propertyId={property.id}
                      propertyName={property.name}
                      propertyImage={property.image}
                    />
                    {onClose && (
                      <button
                        type="button"
                        aria-label="Close"
                        onClick={() => onClose()}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition hover:bg-black/80"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Carousel Navigation Arrows */}
                {slides.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous image"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        go(-1);
                      }}
                      className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur-md"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next image"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        go(1);
                      }}
                      className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur-md"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>

                    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                      {slides.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSlideChange(i);
                          }}
                          className={`h-1 rounded-full transition-all duration-300 ${
                            i === slideIdx ? "w-6 bg-white" : "w-1.5 bg-white/40"
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Compact Details Content — Fits 100% On Screen With Zero Scroll */}
              <div className="flex flex-col p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <span className="h-px w-5 bg-foreground/30" />
                  <p className="font-semibold uppercase tracking-luxury text-muted-foreground text-[10px] sm:text-xs">
                    {property.developer}
                  </p>
                </div>

                <h3 className="mt-1 font-display text-xl font-bold text-foreground">
                  <Link
                    to="/residence/$id"
                    params={{ id: property.id }}
                    onClick={() => onClose?.()}
                    className="transition-opacity hover:opacity-80"
                  >
                    {property.name}
                  </Link>
                </h3>

                <p className="mt-0.5 font-medium uppercase tracking-luxury text-muted-foreground text-[11px]">
                  {property.configuration}
                </p>

                {/* High-Luxury 3-Column Specifications Card */}
                <div className="mt-3.5 grid grid-cols-3 gap-1.5 rounded-2xl border border-border/60 bg-muted/30 p-2.5 text-center">
                  <div className="min-w-0">
                    <p className="font-bold uppercase tracking-wide text-muted-foreground text-[8px] sm:text-[9px]">
                      Location
                    </p>
                    <p className="truncate font-semibold text-foreground text-[11px] sm:text-xs mt-0.5">
                      {property.location}
                    </p>
                  </div>
                  <div className="min-w-0 border-x border-border/50 px-1">
                    <p className="font-bold uppercase tracking-wide text-muted-foreground text-[8px] sm:text-[9px]">
                      Size
                    </p>
                    <p className="truncate font-semibold text-foreground text-[11px] sm:text-xs mt-0.5">
                      {property.size}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold uppercase tracking-wide text-muted-foreground text-[8px] sm:text-[9px]">
                      Possession
                    </p>
                    <p className="truncate font-semibold text-foreground text-[11px] sm:text-xs mt-0.5">
                      {property.possession}
                    </p>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="mt-4 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onToggleCompare}
                    className={`tracking-luxury inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-bold uppercase transition-all duration-300 ${
                      selectedFlag
                        ? "bg-champagne text-lux-black shadow-md"
                        : atMax
                          ? "bg-muted text-muted-foreground"
                          : "gold-border text-champagne hover:bg-champagne hover:text-lux-black"
                    }`}
                  >
                    {selectedFlag ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Added to Suite
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" /> Add to Compare
                      </>
                    )}
                  </button>
                  <Link
                    to="/residence/$id"
                    params={{ id: property.id }}
                    onClick={() => onClose?.()}
                    className="tracking-luxury inline-flex h-10 items-center justify-center gap-1 rounded-full border border-border/60 bg-card px-4 text-xs font-bold uppercase text-foreground transition hover:border-foreground/40"
                  >
                    Details <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>

          {/* DESKTOP HOVER CARD (md+) */}
          {box && (
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
              className="pointer-events-auto fixed z-[80] hidden md:grid"
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
                overflow: "hidden",
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
                  className="absolute right-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* LEFT — Image carousel */}
              <div className="media-frame relative h-full overflow-hidden">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.img
                    key={slides[slideIdx]}
                    src={slides[slideIdx]}
                    alt={property.name}
                    decoding="async"
                    fetchPriority="high"
                    initial={{ opacity: 0, scale: 1.05, x: direction > 0 ? 35 : -35 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95, x: direction > 0 ? -35 : 35 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ imageRendering: "auto", willChange: "transform, opacity" }}
                  />
                </AnimatePresence>

                <span className="absolute left-2.5 top-2.5 z-10 max-w-[calc(100%-4rem)] truncate rounded-full border border-border/60 bg-background/90 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-foreground shadow-xs backdrop-blur-md">
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
                      className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white backdrop-blur-md transition hover:bg-black/80"
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
                      className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white backdrop-blur-md transition hover:bg-black/80"
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
                    <span className="h-px w-6 bg-foreground/25" />
                    <p
                      className="font-semibold uppercase tracking-luxury text-muted-foreground"
                      style={{ fontSize: "var(--step--2)" }}
                    >
                      {property.developer}
                    </p>
                  </div>
                  <h3
                    className="mt-4 font-display font-medium leading-[1.02] text-ivory"
                    style={{ fontSize: "var(--step-2)", letterSpacing: "var(--tracking-display)" }}
                  >
                    <Link
                      to="/residence/$id"
                      params={{ id: property.id }}
                      className="transition-opacity hover:opacity-80"
                    >
                      {property.name}
                    </Link>
                  </h3>
                  <p
                    className="mt-3 font-medium uppercase tracking-luxury text-ivory/60"
                    style={{ fontSize: "var(--step--2)" }}
                  >
                    {property.configuration}
                  </p>
                  <p
                    className="mt-5 leading-relaxed text-ivory/75 line-clamp-3"
                    style={{ fontSize: "var(--step--1)" }}
                  >
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

                  <dl className="grid grid-cols-1 gap-3" style={{ fontSize: "var(--step--1)" }}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-[var(--rule)]">
                        <MapPin className="h-3.5 w-3.5 text-foreground" />
                      </span>
                      <div className="min-w-0">
                        <dt
                          className="font-semibold uppercase tracking-luxury text-ivory/45"
                          style={{ fontSize: "var(--step--2)" }}
                        >
                          Location
                        </dt>
                        <dd className="truncate text-ivory/90">{property.location}</dd>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-[var(--rule)]">
                        <Ruler className="h-3.5 w-3.5 text-foreground" />
                      </span>
                      <div className="min-w-0">
                        <dt
                          className="font-semibold uppercase tracking-luxury text-ivory/45"
                          style={{ fontSize: "var(--step--2)" }}
                        >
                          Size
                        </dt>
                        <dd className="truncate text-ivory/90">{property.size}</dd>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-[var(--rule)]">
                        <Calendar className="h-3.5 w-3.5 text-foreground" />
                      </span>
                      <div className="min-w-0">
                        <dt
                          className="font-semibold uppercase tracking-luxury text-ivory/45"
                          style={{ fontSize: "var(--step--2)" }}
                        >
                          Possession
                        </dt>
                        <dd className="truncate text-ivory/90">{property.possession}</dd>
                      </div>
                    </div>
                  </dl>

                  <div className="mt-6 flex flex-col gap-2.5">
                    <button
                      onClick={onToggleCompare}
                      className={`tracking-luxury inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 font-semibold uppercase transition-all duration-300 ${
                        selectedFlag
                          ? "bg-champagne text-lux-black"
                          : atMax
                            ? "bg-graphite text-muted-foreground hover:text-foreground"
                            : "gold-border text-champagne hover:bg-champagne hover:text-lux-black"
                      }`}
                      style={{ fontSize: "var(--step--2)" }}
                    >
                      {selectedFlag ? (
                        <>
                          <Check className="h-4 w-4" /> Added to Suite
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" /> Add to Compare
                        </>
                      )}
                    </button>
                    <Link
                      to="/residence/$id"
                      params={{ id: property.id }}
                      className="group/link inline-flex items-center justify-center gap-1.5 py-1 text-xs font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                    >
                      View Full Details{" "}
                      <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </>
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
    // Disable hover popups on mobile screens (<1024px), coarse pointers, or (hover: none) devices.
    // Prevents synthetic touch events from firing random hover popups that stick on tap.
    if (
      typeof window !== "undefined" &&
      (window.innerWidth < 1024 ||
        window.matchMedia("(hover: none)").matches ||
        window.matchMedia("(pointer: coarse)").matches)
    ) {
      return;
    }
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

  // Close the hover card on any scroll/wheel on desktop so it doesn't
  // float over the list while the user is browsing.
  useEffect(() => {
    if (!open) return;
    const handler = () => {
      clearTimers();
      setOpen(false);
    };
    window.addEventListener("scroll", handler, { passive: true, capture: true });
    window.addEventListener("wheel", handler, { passive: true });
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("wheel", handler);
    };
  }, [open]);

  return { open, enter, leave, close: closeNow };
}
