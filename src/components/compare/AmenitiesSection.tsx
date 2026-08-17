import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { Property } from "@/types/property";
import { Section } from "./Section";

export function AmenitiesSection({ properties }: { properties: Property[] }) {
  if (!properties.some((p) => p.amenities.length > 0)) return null;
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
            className="rounded-card border border-[var(--rule)] bg-card p-6"
          >
            <h3
              className="font-display font-bold text-ivory"
              style={{ fontSize: "var(--step-2)", letterSpacing: "var(--tracking-display)" }}
            >
              {p.name}
            </h3>
            <div className="mt-5 flex flex-wrap gap-2">
              {p.amenities.map((a) => (
                <span
                  key={a}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-graphite/70 px-3.5 py-1.5 text-ivory/85 ring-1 ring-[var(--rule)] transition-colors hover:bg-champagne hover:text-lux-black"
                  style={{ fontSize: "var(--step--2)" }}
                >
                  <Sparkles className="h-3 w-3 text-foreground group-hover:text-lux-black" />
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
