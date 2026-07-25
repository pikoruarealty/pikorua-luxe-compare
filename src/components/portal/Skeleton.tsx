import { cn } from "@/lib/utils";

/** Brand-toned loading placeholder. `animate-pulse` settles instantly under
 *  prefers-reduced-motion via the global rule in styles.css. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
