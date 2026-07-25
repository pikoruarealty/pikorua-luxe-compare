import { AnimatePresence, motion, useInView } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, MapPin, Plus, Ruler, Calendar } from "lucide-react";
import type { Property } from "@/types/property";
import { MAX_COMPARE, useCompareStore } from "@/stores/compare-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useImagePrewarm } from "@/hooks/use-image-prewarm";
import { toast } from "sonner";
import { FavoriteButton } from "@/components/property/FavoriteButton";
import { Lightbox } from "@/components/Lightbox";
import { PropertyHoverCard, useHoverIntent } from "@/components/property/PropertyHoverCard";

interface Props {
  property: Property;
  index?: number;
}

export function PropertyListRow({ property, index = 0 }: Props) {
  const hydrated = useHydrated();
  const { isSelected, toggle, selected } = useCompareStore();
  const selectedFlag = hydrated && isSelected(property.id);
  const atMax = hydrated && selected.length >= MAX_COMPARE && !selectedFlag;

  const handleToggle = () => {
    const result = toggle(property.id);
    if (!result.ok && result.reason) toast.error(result.reason);
    else if (!selectedFlag) toast.success(`${property.name} added to compare`);
  };

  const slides = useMemo(() => {
    const g = property.gallery ?? ({} as Record<string, string>);
    const list = [property.image, g.livingRoom, g.masterBedroom, g.pool, g.clubhouse].filter(
      (src): src is string => Boolean(src),
    );
    return Array.from(new Set(list));
  }, [property]);

  const [slideIdx, setSlideIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const inView = useInView(articleRef, { amount: 0.25 });
  const { open: hoverOpen, enter, leave } = useHoverIntent(220);
  useImagePrewarm(slides);

  useEffect(() => {
    // Flip only while the row is actually on screen — calmer page, lighter CPU.
    if (slides.length <= 1 || hoverOpen || !inView || lightboxOpen) return;
    // Stagger start per row so the whole page doesn't flip in unison.
    const id = setInterval(
      () => {
        setSlideIdx((i) => (i + 1) % slides.length);
      },
      3400 + (index % 5) * 260,
    );
    return () => clearInterval(id);
  }, [slides.length, hoverOpen, index, inView, lightboxOpen]);

  return (
    <>
      <motion.article
        ref={articleRef as React.RefObject<HTMLElement>}
        onPointerEnter={enter}
        onPointerLeave={leave}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.45, delay: Math.min(index, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
        animate={{ opacity: hoverOpen ? 0.35 : 1 }}
        className="group grid grid-cols-1 gap-5 overflow-hidden rounded-2xl bg-card p-4 shadow-(--shadow-glass) sm:grid-cols-[300px_minmax(0,1fr)_auto] sm:items-center sm:gap-7 sm:p-5"
        style={{
          border: "1px solid var(--glass-border)",
          contentVisibility: "auto",
          containIntrinsicSize: "240px",
          transition: "opacity 0.3s ease",
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={`Open ${property.name} photo gallery`}
          onClick={() => setLightboxOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setLightboxOpen(true);
            }
          }}
          className="media-frame relative aspect-[16/10] cursor-zoom-in overflow-hidden rounded-xl sm:aspect-[5/3]"
          style={{ perspective: 1200 }}
        >
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              key={slides[slideIdx]}
              initial={{ rotateX: -78, opacity: 0.35 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.45, delay: 0.3 } }}
              transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
              style={{ transformOrigin: "top center", backfaceVisibility: "hidden" }}
            >
              <img
                src={slides[slideIdx]}
                alt={property.name}
                loading={index < 2 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-black"
                initial={{ opacity: 0.45 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
              />
            </motion.div>
          </AnimatePresence>
          <span aria-hidden className="shine" />
          <span className="glass absolute left-3 top-3 z-10 rounded-full px-3 py-1 text-[10px] tracking-luxury text-foreground">
            {property.status}
          </span>
          <div className="absolute right-3 top-3 z-10">
            <FavoriteButton
              propertyId={property.id}
              propertyName={property.name}
              propertyImage={property.image}
            />
          </div>
          {slides.length > 1 && (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className={`h-0.75 rounded-full transition-all duration-500 ${
                    i === slideIdx ? "w-4 bg-white" : "w-1 bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 sm:border-l sm:border-border sm:pl-7">
          <p className="text-[10px] tracking-luxury text-muted-foreground">
            {property.configuration}
          </p>
          <h3 className="mt-2 font-display text-[28px] leading-tight text-ivory sm:text-[32px]">
            <Link
              to="/residence/$id"
              params={{ id: property.id }}
              className="group/name inline-flex items-baseline gap-2 transition-opacity hover:opacity-80"
            >
              {property.name}
              <ArrowUpRight className="h-4 w-4 shrink-0 self-center text-muted-foreground opacity-0 transition-all duration-300 group-hover/name:translate-x-0.5 group-hover/name:opacity-100" />
            </Link>
          </h3>
          <p className="mt-1 text-[11px] tracking-luxury text-muted-foreground">
            {property.developer}
          </p>
          <p className="mt-2 text-[14px] text-muted-foreground line-clamp-1">{property.tagline}</p>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px] text-foreground/85">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-foreground" /> {property.location}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5 text-foreground" /> {property.size}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-foreground" /> {property.possession}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:items-end sm:justify-center">
          <div className="sm:text-right">
            <p className="text-[9px] tracking-luxury text-muted-foreground">Pricing</p>
            <p className="mt-0.5 font-display text-[15px] leading-tight text-champagne">
              On Request
            </p>
          </div>
          <button
            onClick={handleToggle}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-xs tracking-luxury transition-all duration-300 ${
              selectedFlag
                ? "bg-champagne text-lux-black shadow-[0_10px_30px_-10px_rgba(200,164,93,0.6)]"
                : atMax
                  ? "bg-graphite text-muted-foreground hover:text-foreground"
                  : "gold-border text-champagne hover:bg-champagne hover:text-lux-black"
            }`}
          >
            {selectedFlag ? (
              <>
                <Check className="h-4 w-4" /> Added
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
            className="inline-flex items-center gap-1.5 text-[11px] tracking-luxury text-muted-foreground transition hover:text-foreground sm:justify-end"
          >
            View residence <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </motion.article>

      <Lightbox
        images={slides}
        index={slideIdx}
        open={lightboxOpen}
        title={property.name}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setSlideIdx}
      />

      <PropertyHoverCard
        property={property}
        anchorRef={articleRef}
        open={hoverOpen}
        slides={slides}
        slideIdx={slideIdx}
        onSlideChange={setSlideIdx}
        selectedFlag={selectedFlag}
        atMax={atMax}
        onToggleCompare={handleToggle}
        onPointerEnter={enter}
        onPointerLeave={leave}
      />
    </>
  );
}
