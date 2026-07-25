import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import type { Property } from "@/types/property";
import { Section } from "./Section";

export function ExpertVerdict({ properties }: { properties: Property[] }) {
  return (
    <Section
      id="verdict"
      eyebrow="07 · Pikorua Expert Verdict"
      title="A private-client perspective"
      description="Considered guidance from our luxury advisory desk."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {properties.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, delay: i * 0.1 }}
            className="glass-strong relative overflow-hidden rounded-[32px] p-8 sm:p-10"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{ background: "var(--gradient-radial-gold)" }}
            />
            <Quote className="h-8 w-8 text-champagne/60" />
            <p className="mt-6 font-display text-2xl leading-snug text-ivory sm:text-3xl">
              {p.expertNote}
            </p>
            <div className="mt-8 flex items-center gap-4 border-t border-(--glass-border) pt-6">
              <img
                src={p.image}
                alt={p.name}
                className="h-12 w-12 rounded-xl object-cover ring-1 ring-champagne/40"
              />
              <div>
                <p className="font-display text-lg text-ivory">{p.name}</p>
                <p className="text-[10px] tracking-luxury text-champagne">
                  Pikorua · Private Advisory
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
