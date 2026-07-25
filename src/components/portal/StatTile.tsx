import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dashboard stat tile — icon, label, value, hint. Links (with hover-lift) when
 *  `to` is given, otherwise renders a static card. */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  to,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  to?: string;
}) {
  const cls = cn(
    "block rounded-2xl border border-(--rule) bg-card p-5 shadow-(--shadow-lift)",
    to &&
      "hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/50",
  );
  const inner = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="font-label text-[10px] font-semibold tracking-luxury text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-champagne/12 text-champagne">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-3xl leading-none text-foreground tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
