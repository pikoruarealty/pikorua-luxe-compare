import { useState } from "react";
import { motion } from "framer-motion";
import { Expand } from "lucide-react";
import type { Property } from "@/types/property";
import { Section } from "./Section";
import { Lightbox } from "@/components/common/Lightbox";

const CATEGORIES = [
  { key: "livingRoom", label: "Living Room" },
  { key: "pool", label: "Pool" },
  { key: "clubhouse", label: "Clubhouse" },
  { key: "masterBedroom", label: "Master Bedroom" },
] as const;

/** Gallery images for one property, in the same order as CATEGORIES. */
function categoryImages(p: Property): string[] {
  return CATEGORIES.map((c) => p.gallery[c.key]).filter(Boolean);
}

export function GalleryComparison({ properties }: { properties: Property[] }) {
  const [lightbox, setLightbox] = useState<{ property: number; image: number } | null>(null);
  const activeProperty = lightbox ? properties[lightbox.property] : null;

  return (
    <Section
      id="gallery"
      eyebrow="06 · Gallery Comparison"
      title="A walk through each residence"
      description="Identical vantage points, distinctly different worlds. Click any photo to view it full screen."
    >
      <div className="space-y-12">
        {CATEGORIES.map((cat, cIdx) => (
          <div key={cat.key}>
            <div className="mb-5 flex items-center gap-4">
              <p
                className="font-display font-bold text-ivory"
                style={{ fontSize: "var(--step-1)", letterSpacing: "var(--tracking-display)" }}
              >
                {cat.label}
              </p>
              <div className="h-px flex-1 bg-gradient-to-r from-champagne/40 to-transparent" />
            </div>
            <div
              className="stack-sm grid gap-4"
              style={{ gridTemplateColumns: `repeat(${properties.length}, minmax(0, 1fr))` }}
            >
              {properties.map((p, i) => (
                <motion.figure
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.7, delay: cIdx * 0.05 + i * 0.08 }}
                  className="group overflow-hidden rounded-card border border-[var(--rule)]"
                >
                  <button
                    type="button"
                    onClick={() => setLightbox({ property: i, image: cIdx })}
                    aria-label={`View ${p.name} ${cat.label} full screen`}
                    className="relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden"
                  >
                    <img
                      src={p.gallery[cat.key]}
                      alt={`${p.name} — ${cat.label}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-[1400ms] group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
                    <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">
                      <Expand className="h-4 w-4" />
                    </span>
                    <figcaption
                      className="tracking-luxury absolute bottom-4 left-5 right-5 text-left text-white"
                      style={{ fontSize: "var(--step--2)" }}
                    >
                      {p.name}
                    </figcaption>
                  </button>
                </motion.figure>
              ))}
            </div>
          </div>
        ))}
      </div>

      {activeProperty && lightbox && (
        <Lightbox
          images={categoryImages(activeProperty)}
          index={Math.min(lightbox.image, categoryImages(activeProperty).length - 1)}
          open
          title={activeProperty.name}
          onClose={() => setLightbox(null)}
          onIndexChange={(i) => setLightbox({ ...lightbox, image: i })}
        />
      )}
    </Section>
  );
}
