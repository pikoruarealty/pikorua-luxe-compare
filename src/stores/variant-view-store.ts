import { create } from "zustand";
import type { ConfigKey, Property } from "@/types/property";

/** Per-(BHK, property) key. Variant choice is scoped to both, so switching
 *  Type on a 5 BHK never disturbs the same property's 4 BHK. */
export const variantKey = (key: ConfigKey, propertyId: string) => `${key}__${propertyId}`;

interface VariantViewState {
  /** Which layout each column currently shows. */
  active: Record<string, number>;
  /** Which columns are fanned out into one sub-column per layout. */
  expanded: Record<string, boolean>;
  setActive: (k: string, idx: number) => void;
  toggleExpanded: (k: string) => void;
  reset: () => void;
}

/**
 * View-only state for the comparison tables, deliberately *not* persisted —
 * which layout you were looking at is a reading position, not a preference.
 *
 * It lives in a store rather than component state because the sticky tray sits
 * outside the table's React tree but has to size its property chips to match
 * the columns underneath. Both read the same expansion map.
 */
export const useVariantViewStore = create<VariantViewState>()((set, get) => ({
  active: {},
  expanded: {},
  setActive: (k, idx) => set({ active: { ...get().active, [k]: idx } }),
  toggleExpanded: (k) => set({ expanded: { ...get().expanded, [k]: !get().expanded[k] } }),
  reset: () => set({ active: {}, expanded: {} }),
}));

/**
 * How many column-widths a property currently occupies: 1 normally, or the
 * number of layouts in whichever BHK the visitor has fanned out. Used to keep
 * the tray chips and the table columns on the same rhythm.
 */
export function columnWeight(
  p: Property,
  expanded: Record<string, boolean>,
  keys: ConfigKey[],
): number {
  let weight = 1;
  for (const k of keys) {
    if (!expanded[variantKey(k, p.id)]) continue;
    weight = Math.max(weight, p.configurations[k]?.length ?? 1);
  }
  return weight;
}
