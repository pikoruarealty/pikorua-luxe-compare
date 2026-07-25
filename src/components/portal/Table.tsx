import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Scroll-contained table shell with the portal's card surface + depth. Pages
 *  compose `<thead>/<tbody>` with the `Th`/`Td` helpers; on small screens they
 *  render a card list instead (see the routes for the pattern). */
export function TableWrap({
  children,
  minWidth = "min-w-[820px]",
  className = "",
}: {
  children: ReactNode;
  minWidth?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-2xl border border-[var(--rule)] bg-card shadow-[var(--shadow-lift)]",
        className,
      )}
    >
      <table className={cn("w-full text-sm", minWidth)}>{children}</table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}
