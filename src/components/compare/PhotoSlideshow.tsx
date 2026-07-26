import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import type { Property } from "@/types/property";
import { useImagePrewarm } from "@/hooks/use-image-prewarm";
import { Lightbox } from "@/components/common/Lightbox";

export function PhotoSlideshow({ property }: { property: Property }) {
  const slides = useMemo(() => {
    const g = (property.gallery ?? {}) as unknown as Record<string, string>;
    const list = [property.image, g.livingRoom, g.masterBedroom, g.pool, g.clubhouse].filter(
      (s): s is string => Boolean(s),
    );
    return Array.from(new Set(list));
  }, [property]);

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  useImagePrewarm(slides);

  useEffect(() => {
    if (slides.length <= 1 || paused || lightboxOpen) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % slides.length), 2000);
    return () => clearInterval(id);
  }, [slides.length, paused, lightboxOpen]);

  const go = (dir: 1 | -1) => setIdx((i) => (i + dir + slides.length) % slides.length);

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-champagne/15"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={`View ${property.name} photos full screen`}
        className="relative block aspect-[4/3] w-full cursor-zoom-in"
      >
        <AnimatePresence initial={false} mode="sync">
          <motion.img
            key={slides[idx]}
            src={slides[idx]}
            alt={property.name}
            loading="eager"
            decoding="async"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </AnimatePresence>
        <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">
          <Expand className="h-3.5 w-3.5" />
        </span>
      </button>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100 hover:bg-champagne hover:text-lux-black"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100 hover:bg-champagne hover:text-lux-black"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to image ${i + 1}`}
                onClick={() => setIdx(i)}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === idx ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}

      <Lightbox
        images={slides}
        index={idx}
        open={lightboxOpen}
        title={property.name}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setIdx}
      />
    </div>
  );
}
