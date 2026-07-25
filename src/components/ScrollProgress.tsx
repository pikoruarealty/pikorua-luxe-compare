import { motion, useScroll, useSpring } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";

/** Thin page-reading progress bar pinned above the fixed header. */
export function ScrollProgress() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });

  // Public-site chrome only — the reading-progress bar reads as a stray bar
  // across the top of the admin/developer portals, so leave it off there.
  if (pathname.startsWith("/admin") || pathname.startsWith("/developer")) {
    return null;
  }

  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] h-[2.5px] origin-left"
      style={{ scaleX, background: "var(--brand)" }}
    />
  );
}
