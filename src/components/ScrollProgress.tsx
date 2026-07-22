import { motion, useScroll, useSpring } from "framer-motion";

/** Thin page-reading progress bar pinned above the fixed header. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });

  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] h-[2.5px] origin-left"
      style={{ scaleX, background: "var(--brand)" }}
    />
  );
}
