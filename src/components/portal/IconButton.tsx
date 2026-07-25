import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Compact square icon action used in table rows and toolbars. Adds a
 *  focus-visible ring the inlined copies lacked. */
export function IconButton({
  children,
  onClick,
  title,
  disabled,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors",
        "hover:bg-foreground/5 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/50",
        "disabled:pointer-events-none disabled:opacity-50",
        tone === "danger" && "hover:bg-red-500/10 hover:text-red-500",
        className,
      )}
    >
      {children}
    </button>
  );
}
