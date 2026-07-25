import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface LightboxProps {
  images: string[];
  index: number;
  open: boolean;
  title?: string;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}

/** Full-screen black gallery with keyboard, swipe and click navigation. */
export function Lightbox({ images, index, open, title, onClose, onIndexChange }: LightboxProps) {
  const total = images.length;
  const go = (dir: 1 | -1) => onIndexChange((index + dir + total) % total);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, total]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-200 flex flex-col bg-black/96 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title ? `${title} gallery` : "Photo gallery"}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-5 py-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              {title && (
                <p className="descender-safe truncate font-display text-[16px] sm:text-[18px]">
                  {title}
                </p>
              )}
              <p className="text-[11px] tracking-[0.24em] text-white/50 tabular-nums">
                {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close gallery"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white transition hover:border-white hover:bg-white/10"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Stage */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-6 sm:px-16">
            <AnimatePresence initial={false} mode="wait">
              <motion.img
                key={images[index]}
                src={images[index]}
                alt={title ? `${title} — photo ${index + 1}` : `Photo ${index + 1}`}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.01 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="max-h-full max-w-full rounded-xl object-contain shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
                onClick={(e) => e.stopPropagation()}
                draggable={false}
              />
            </AnimatePresence>

            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    go(-1);
                  }}
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 text-white transition hover:border-white hover:bg-white/10 sm:left-6"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    go(1);
                  }}
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 text-white transition hover:border-white hover:bg-white/10 sm:right-6"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {total > 1 && (
            <div
              className="flex gap-2 overflow-x-auto px-4 pb-6 sm:justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => onIndexChange(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg transition-all sm:h-14 sm:w-20 ${
                    i === index ? "ring-2 ring-white opacity-100" : "opacity-40 hover:opacity-80"
                  }`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
