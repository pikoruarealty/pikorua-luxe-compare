import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Consistent empty-state card for lists and tables across both portals. */
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-[var(--rule-strong)] bg-card/40 px-8 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <h3 className="mt-4 font-display text-lg text-foreground">{title}</h3>
      {message && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{message}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
