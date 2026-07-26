import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useOnboarding } from "@/context/OnboardingContext";

export function WelcomeCard() {
  const { userProfile, setPhase } = useOnboarding();
  const firstName = userProfile?.name?.trim().split(/\s+/)[0] ?? "there";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="flex h-full flex-col items-center justify-center text-center"
    >
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <Sparkles className="h-8 w-8 text-champagne" />
      </motion.div>

      <h2 className="mt-6 font-display text-foreground" style={{ fontSize: "var(--step-2)" }}>
        Welcome, {firstName}.
      </h2>
      <p
        className="mt-3 font-display text-champagne"
        style={{ fontStyle: "normal", fontSize: "var(--step-1)" }}
      >
        Compare confidently. Decide clearly.
      </p>

      <motion.div
        initial={{ width: 0 }}
        animate={{ width: "100%" }}
        transition={{ delay: 0.6, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="mt-10 h-px max-w-95"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--color-champagne) 50%, transparent 100%)",
        }}
      />

      <div className="mt-10 w-full max-w-80">
        <button
          onClick={() => setPhase("site-preview")}
          className="flex h-12 w-full items-center justify-center rounded-full bg-champagne font-medium tracking-wide text-lux-black transition-opacity hover:opacity-95"
          style={{ fontSize: "var(--step--1)" }}
        >
          Start comparing →
        </button>
      </div>
    </motion.div>
  );
}
