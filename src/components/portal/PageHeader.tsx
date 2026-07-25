import type { ReactNode } from "react";

/** Editorial page header for portal screens: hairline + eyebrow, display title,
 *  and a right-aligned actions slot. Pages that use this drop the `title` prop
 *  on the layout so the shell doesn't render a duplicate header. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="flex items-center gap-2.5">
            <span className="h-px w-6 bg-[var(--rule-strong)]" />
            <p className="font-label text-[10px] font-semibold tracking-luxury text-champagne">
              {eyebrow}
            </p>
          </div>
        )}
        <h1 className="mt-2 font-display text-2xl text-foreground sm:text-[28px]">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
