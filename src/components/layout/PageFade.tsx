import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";

/** Soft fade/rise on every route change — one continuous experience. */
export function PageFade({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
