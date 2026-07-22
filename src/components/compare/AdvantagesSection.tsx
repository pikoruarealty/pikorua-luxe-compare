import { motion } from "framer-motion";
import { Diamond } from "lucide-react";
import type { Property } from "@/types/property";
import { Section } from "./Section";

export function AdvantagesSection({ properties }: { properties: Property[] }) {
  return (
    <Section id="advantages" eyebrow="04 · Advantages" title="What sets each residence apart">
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
            className="gold-border rounded-[32px] p-6"
          >
            <p className="text-[10px] font-bold uppercase tracking-luxury text-champagne">
              Defining strengths
            </p>
            <h3 className="mt-3 font-display text-2xl font-bold tracking-[-0.02em] text-ivory sm:text-[28px]">
              {p.name}
            </h3>
            <ul className="mt-5 space-y-4">
              {p.advantages.map((adv, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-champagne/30 to-transparent text-champagne ring-1 ring-champagne/40">
                    <Diamond className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm leading-relaxed text-ivory/85">{adv}</p>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
