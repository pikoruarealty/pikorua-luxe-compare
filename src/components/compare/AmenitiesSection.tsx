import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { Property } from "@/types/property";
import { Section } from "./Section";

export function AmenitiesSection({ properties }: { properties: Property[] }) {
  return (
    <Section
      id="amenities"
      eyebrow="03 · Amenities"
      title="A vocabulary of indulgence"
      description="Every chip is a curated experience inside the residence."
    >
      <div
        className="stack-sm grid gap-6"
        style={{ gridTemplateColumns: `repeat(${properties.length}, minmax(0, 1fr))` }}
      >
        {properties.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: i * 0.08 }}
            className="glass rounded-[32px] p-6"
          >
            <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-ivory sm:text-[28px]">
              {p.name}
            </h3>
            <div className="mt-5 flex flex-wrap gap-2">
              {p.amenities.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1.5 rounded-full bg-graphite/70 px-3.5 py-1.5 text-xs text-ivory/85 ring-1 ring-[var(--glass-border)] transition-colors hover:bg-champagne hover:text-lux-black"
                >
                  <Sparkles className="h-3 w-3 text-champagne group-hover:text-lux-black" />
                  {a}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
