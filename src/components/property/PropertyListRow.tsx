import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
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
import { priceLabel } from "@/lib/price-format";

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
  const { open: hoverOpen, enter, leave } = useHoverIntent(220);
  useImagePrewarm(slides);

  // Photos no longer advance on a timer. Every visible row cycling its own
  // image every ~3.4s meant a buyer could not read a row's location, size and
  // possession without something moving next to the text — on a page that also
  // carried a hero slideshow and marquees. The dots below drive the carousel
  // instead, so motion only happens when the visitor asks for it.

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
        className="group grid grid-cols-1 gap-5 overflow-hidden rounded-card bg-card p-4 sm:grid-cols-[300px_minmax(0,1fr)_auto] sm:items-center sm:gap-7 sm:p-5"
        style={{
          // Editorial print: structure from a hairline, not a floating shadow.
          border: "1px solid var(--rule)",
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
          className="media-frame relative aspect-[16/10] cursor-zoom-in overflow-hidden rounded-card sm:aspect-[5/3]"
          style={{ perspective: 1200 }}
        >
          {/* A plain crossfade, not the old 3D page-flip. The flip existed to
              dress up an automatic transition; now that changing photo is a
              deliberate act, the transition should get out of its own way. */}
          <AnimatePresence initial={false} mode="sync">
            <motion.img
              key={slides[slideIdx]}
              src={slides[slideIdx]}
              alt={property.name}
              loading={index < 2 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
              decoding="async"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </AnimatePresence>
          <span aria-hidden className="shine" />
          {/* Solid scrim, not the frosted-glass treatment — a print label sits
              on the photo, it doesn't blur it. */}
          <span className="absolute left-2.5 top-2.5 z-10 max-w-[calc(100%-4rem)] truncate rounded-full border border-border/60 bg-background/90 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-foreground shadow-xs backdrop-blur-md">
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
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {slides.map((_, i) => (
                // Clicks must not bubble to the wrapper, which opens the lightbox.
                <button
                  key={i}
                  type="button"
                  aria-label={`Show ${property.name} photo ${i + 1} of ${slides.length}`}
                  aria-current={i === slideIdx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSlideIdx(i);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
                    i === slideIdx ? "w-5 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 sm:border-l sm:border-[var(--rule)] sm:pl-7">
          <p
            className="tracking-luxury text-muted-foreground"
            style={{ fontSize: "var(--step--2)" }}
          >
            {property.configuration}
          </p>
          <h3
            className="mt-2 font-display leading-tight text-foreground"
            style={{ fontSize: "var(--step-2)" }}
          >
            <Link
              to="/residence/$id"
              params={{ id: property.id }}
              className="group/name inline-flex items-baseline gap-2 transition-opacity hover:opacity-80"
            >
              {property.name}
              <ArrowUpRight className="h-4 w-4 shrink-0 self-center text-muted-foreground opacity-0 transition-all duration-300 group-hover/name:translate-x-0.5 group-hover/name:opacity-100" />
            </Link>
          </h3>
          <p
            className="tracking-luxury mt-1 text-muted-foreground"
            style={{ fontSize: "var(--step--2)" }}
          >
            {property.developer}
          </p>
          <p
            className="mt-2 text-muted-foreground line-clamp-1"
            style={{ fontSize: "var(--step--1)" }}
          >
            {property.tagline}
          </p>

          <div
            className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-foreground/85"
            style={{ fontSize: "var(--step--1)" }}
          >
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

        <div className="flex flex-col gap-3 sm:items-end sm:justify-center border-t border-[var(--rule)] pt-3 sm:border-t-0 sm:pt-0">
          <div className="sm:text-right">
            <p className="font-label text-[10px] font-bold tracking-luxury uppercase text-muted-foreground">
              Starting From
            </p>
            <p className="mt-0.5 font-display text-base font-bold text-foreground sm:text-lg">
              {priceLabel(property)}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={handleToggle}
              className={`group/btn relative inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-xs font-semibold tracking-wide transition-all duration-300 active:scale-95 ${
                selectedFlag
                  ? "bg-champagne text-lux-black shadow-md"
                  : atMax
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "border border-champagne/60 text-champagne hover:bg-champagne hover:text-lux-black hover:border-champagne"
              }`}
            >
              {selectedFlag ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Added to Suite
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 transition-transform duration-300 group-hover/btn:rotate-90" />{" "}
                  Add to Compare
                </>
              )}
            </button>

            <Link
              to="/residence/$id"
              params={{ id: property.id }}
              className="group/link inline-flex items-center gap-1 pt-0.5 text-[11px] font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              View Full Details{" "}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
            </Link>
          </div>
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
