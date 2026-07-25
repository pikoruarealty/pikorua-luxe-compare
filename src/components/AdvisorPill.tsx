import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "916354359222";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Hi PIKORUA, I'd like to speak with an advisor about your residences.",
)}`;

/**
 * Floating "Speak to an advisor" pill — appears after the visitor has
 * scrolled a screen's worth or spent 20s on the page, then stays put.
 */
export function AdvisorPill() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 20000);
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.9) setVisible(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Public-site chrome only — the advisor pill has no place in the admin or
  // developer portals, which are internal tools rather than sales surfaces.
  if (pathname.startsWith("/admin") || pathname.startsWith("/developer")) {
    return null;
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="advisor-pill"
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-5 right-5 z-70 sm:bottom-7 sm:right-7"
        >
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Speak to an advisor — replies within the hour"
            className="group flex items-center rounded-full border border-border bg-card p-1.5 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.45)] backdrop-blur transition hover:border-foreground/40"
          >
            <span
              className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
            >
              <MessageCircle className="h-4.5 w-4.5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
            </span>
            {/* Collapsed to zero width until hover/focus — 0fr→1fr animates the reveal */}
            <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]">
              <span className="overflow-hidden">
                <span className="block whitespace-nowrap pl-3 pr-2.5 text-left leading-tight">
                  <span className="block text-[12px] font-semibold text-foreground">
                    Speak to an advisor
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    Replies within the hour
                  </span>
                </span>
              </span>
            </span>
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
