import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Portal-wide status pill. `tone` maps to the brand's semantic colours so
 *  submission status (pending/approved/rejected) and publish state (live/hidden)
 *  read consistently everywhere. Replaces the copies previously inlined in the
 *  properties, submissions, and developer-dashboard routes. */
export type BadgeTone = "neutral" | "positive" | "negative" | "warning";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-champagne/15 text-champagne",
  negative: "bg-red-500/10 text-red-600 dark:text-red-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export function StatusBadge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Convenience mapping for the recurring submission status → tone. */
export function submissionTone(status: "pending" | "approved" | "rejected"): BadgeTone {
  return status === "approved" ? "positive" : status === "rejected" ? "negative" : "neutral";
}
