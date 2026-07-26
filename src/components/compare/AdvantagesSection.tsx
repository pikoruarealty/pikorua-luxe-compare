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
            className="rounded-card border border-[var(--rule)] bg-card p-6"
          >
            <p
              className="tracking-luxury font-bold text-champagne"
              style={{ fontSize: "var(--step--2)" }}
            >
              Defining strengths
            </p>
            <h3
              className="mt-3 font-display font-bold text-ivory"
              style={{ fontSize: "var(--step-2)", letterSpacing: "var(--tracking-display)" }}
            >
              {p.name}
            </h3>
            <ul className="mt-5 space-y-4">
              {p.advantages.map((adv, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted ring-1 ring-[var(--rule)]">
                    <Diamond className="h-3.5 w-3.5 text-foreground" />
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
