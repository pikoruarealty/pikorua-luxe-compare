import type { ConfigDetail, ConfigKey, Property } from "@/types/property";

export { variantKey } from "@/stores/variant-view-store";

export function variantsOf(p: Property, key: ConfigKey): ConfigDetail[] {
  return p.configurations[key] ?? [];
}

/** "Type A" / "Type B" … falling back to a letter when the data has no name. */
export function variantLabel(v: ConfigDetail, idx: number): string {
  return v.type ?? `Type ${String.fromCharCode(65 + idx)}`;
}

/** Just the distinguishing part, for the narrow strips. Brochure labels are
 *  rarely as tidy as "Type A" — a plan book prints "TYPE - 4 SUB UNIT TYPE - 4.2",
 *  where the trailing number is the only thing that tells variants apart.
 *  Taking the first two characters of that left every strip reading "- ". */
function shortLabel(label: string): string {
  const numbers = label.match(/\d+(?:\.\d+)*/g);
  if (numbers?.length) return numbers[numbers.length - 1].slice(0, 4);
  const cleaned = label.replace(/^type\b/i, "").replace(/^[\s\-–—:.]+/, "");
  return (cleaned || label).slice(0, 2) || "?";
}

/** Collapsed strips and the bands beneath them share this width and gap so the
 *  two line up into one continuous column running down the table. */
const STRIP = "w-8";
const GAP = "gap-1";

interface CellProps {
  variants: ConfigDetail[];
  activeIdx: number;
  expanded: boolean;
  render: (variant: ConfigDetail, idx: number) => React.ReactNode;
  /** Makes the collapsed bands clickable, same as the header strips. */
  onSelect?: (idx: number) => void;
}

/**
 * A value cell for a property that may offer several layout variants.
 *
 * Collapsed, the active variant fills the cell and the others run alongside as
 * narrow striped bands. The banding is deliberate: a flat empty box reads as
 * "nothing here", while a striped band reads as content folded away. The bands
 * are clickable too, so the whole column is a target rather than just the small
 * header strip.
 */
export function VariantValueCell({ variants, activeIdx, expanded, render, onSelect }: CellProps) {
  if (variants.length <= 1) {
    return <>{variants[0] ? render(variants[0], 0) : null}</>;
  }

  return (
    <div className={`flex items-stretch ${GAP}`}>
      {variants.map((v, i) => {
        const isActive = i === activeIdx;

        // On a phone a property column is ~100px wide. Splitting that into
        // three sub-columns puts two characters per line and the values
        // collide, so below md only the active layout is ever rendered —
        // switching happens through the chips in the group header instead.
        if (expanded) {
          return (
            <div
              key={i}
              className={`min-w-0 flex-1 ${isActive ? "" : "hidden md:block"} ${
                i > 0 ? "md:border-l md:border-border/60 md:pl-2" : ""
              }`}
            >
              {render(v, i)}
            </div>
          );
        }
        if (isActive) {
          return (
            <div key={i} className="min-w-0 flex-1">
              {render(v, i)}
            </div>
          );
        }
        const label = variantLabel(v, i);
        return (
          // Bands are desktop-only too — on mobile that width belongs to the
          // value, not to a decoration.
          <button
            key={i}
            type="button"
            onClick={() => onSelect?.(i)}
            tabIndex={-1}
            aria-hidden={!onSelect}
            title={`Show ${label}`}
            className={`${STRIP} hidden shrink-0 self-stretch border-x border-border/50 bg-[repeating-linear-gradient(135deg,var(--muted)_0px,var(--muted)_4px,transparent_4px,transparent_8px)] opacity-70 transition-opacity hover:opacity-100 md:block`}
          />
        );
      })}
    </div>
  );
}

interface SwitcherProps {
  property: Property;
  variants: ConfigDetail[];
  activeIdx: number;
  expanded: boolean;
  onSelect: (idx: number) => void;
  onToggleExpand: () => void;
}

/**
 * The header control for a multi-variant column: the active type named in full,
 * the other types as narrow tabs sitting on the side they occupy, and a count
 * button that fans them all into equal sub-columns.
 */
export function VariantSwitcher({
  property,
  variants,
  activeIdx,
  expanded,
  onSelect,
  onToggleExpand,
}: SwitcherProps) {
  if (variants.length <= 1) return null;
  const others = variants.length - 1;

  return (
    <div className="min-w-0">
      {/* Mobile: one compact row of numbered chips. Only the active layout is
          rendered in the cells below, so these chips are how you switch. */}
      <div className="flex flex-wrap gap-1 md:hidden">
        {variants.map((v, i) => {
          const label = variantLabel(v, i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={i === activeIdx}
              aria-label={`Show ${label} for ${property.name}`}
              className={`h-8 min-w-8 rounded-md px-2.5 text-xs font-semibold touch-manipulation transition-all active:scale-95 ${
                i === activeIdx
                  ? "bg-foreground text-background shadow-sm"
                  : "border border-border-strong text-muted-foreground hover:text-foreground"
              }`}
            >
              {shortLabel(label)}
            </button>
          );
        })}
      </div>

      <div className={`hidden items-stretch md:flex ${GAP}`}>
        {variants.map((v, i) => {
          const label = variantLabel(v, i);
          const isActive = i === activeIdx;

          if (expanded) {
            return (
              <div
                key={i}
                className="min-w-0 flex-1 truncate rounded-md bg-foreground/90 px-2 py-1 text-center text-[9px] font-semibold uppercase tracking-widest text-background"
                title={`${property.name} — ${label}`}
              >
                {label}
              </div>
            );
          }

          return isActive ? (
            <span
              key={i}
              className="min-w-0 flex-1 truncate rounded-md bg-foreground px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-background"
            >
              {label}
            </span>
          ) : (
            // Matches the band below it in width and stripe, so the tab and the
            // folded-away column read as one thing.
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`Show ${label} for ${property.name}`}
              title={`Show ${label}`}
              className={`${STRIP} grid shrink-0 place-items-center rounded-t-md border-x border-t border-border/60 bg-muted py-1 text-[9px] font-bold text-muted-foreground transition-colors hover:bg-foreground hover:text-background`}
            >
              {shortLabel(label)}
            </button>
          );
        })}
      </div>

      {/* Says outright what the strips mean — the shapes alone weren't telling
          anyone that more layouts were sitting beside the active one. Hidden on
          mobile: side-by-side layouts don't fit there, so offering it would
          promise something the phone layout can't deliver. */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-pressed={expanded}
        className="mt-1 hidden w-full truncate text-left text-[9px] font-medium tracking-wide text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground md:block"
      >
        {expanded
          ? `Collapse to one layout`
          : `+${others} more layout${others === 1 ? "" : "s"} — compare all`}
      </button>
    </div>
  );
}
