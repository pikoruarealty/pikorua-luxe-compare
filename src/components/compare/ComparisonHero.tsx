import { motion } from "framer-motion";
import type { Property } from "@/types/property";

interface ComparisonHeroProps {
  properties: Property[];
}

export function ComparisonHero({ properties }: ComparisonHeroProps) {
  // Size the headline by the total text length (names + " vs " joiners) rather
  // than just the count, so 2- and 3-way titles both fit on one line instead of
  // wrapping and orphaning a name.
  const textLen =
    properties.reduce((n, p) => n + p.name.length, 0) + Math.max(0, properties.length - 1) * 4;
  const headingSize =
    textLen <= 16
      ? "text-[44px] sm:text-[76px] md:text-[100px]"
      : textLen <= 26
        ? "text-[38px] sm:text-[60px] md:text-[76px]"
        : textLen <= 40
          ? "text-[30px] sm:text-[48px] md:text-[60px]"
          : "text-[26px] sm:text-[40px] md:text-[50px]";
  return (
    <section className="relative overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "var(--gradient-radial-gold)" }}
      />
      <div className="mx-auto max-w-7xl px-5 text-center sm:px-6">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="tracking-luxury inline-flex items-center gap-2 rounded-full border border-[var(--rule)] bg-card px-4 py-1.5 font-medium text-champagne"
          style={{ fontSize: "var(--step--2)" }}
        >
          <span className="h-1 w-1 rounded-full bg-champagne" />
          The Comparison Suite
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className={`mx-auto mt-6 flex max-w-6xl flex-wrap items-baseline justify-center gap-x-3 gap-y-2 pb-2 font-display font-extrabold leading-[1.06] tracking-[-0.04em] text-foreground sm:mt-8 sm:gap-x-6 ${headingSize}`}
        >
          {properties.map((p, i) => (
            <span key={p.id} className="inline-flex items-baseline gap-x-3 sm:gap-x-6">
              <span className="gold-text inline-block whitespace-nowrap pb-[0.18em] leading-[1.12]">
                {p.name}
              </span>
              {i < properties.length - 1 && (
                <span className="text-[0.42em] font-semibold uppercase tracking-[0.28em] text-muted-foreground sm:text-[0.48em] sm:tracking-[0.32em]">
                  vs
                </span>
              )}
            </span>
          ))}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="mx-auto mt-7 max-w-xl font-medium leading-relaxed text-muted-foreground sm:mt-10"
          style={{ fontSize: "var(--step-0)" }}
        >
          A side-by-side study of design, scale and quiet privilege — curated by Pikorua's
          private-client advisory.
        </motion.p>
      </div>
    </section>
  );
}
