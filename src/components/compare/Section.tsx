import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface SectionProps {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}

export function Section({ id, eyebrow, title, description, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-[260px] py-14 sm:py-24">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mb-10 max-w-3xl sm:mb-14"
      >
        <div className="flex items-center gap-3">
          <span className="h-px w-8 bg-champagne/80 sm:w-12" />
          <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-champagne sm:text-[11px] sm:tracking-[0.42em]">
            {eyebrow}
          </p>
        </div>
        <h2 className="mt-5 font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.035em] text-ivory sm:mt-6 sm:text-[64px] sm:leading-[0.98]">
          {title}
        </h2>
        {description && (
          <p className="mt-5 max-w-2xl text-[15px] font-medium leading-relaxed text-muted-foreground sm:mt-6 sm:text-[18px]">
            {description}
          </p>
        )}
      </motion.header>
      {children}
    </section>
  );
}
