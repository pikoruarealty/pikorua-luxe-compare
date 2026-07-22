import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CompareState {
  selected: string[];
  toggle: (id: string) => { ok: boolean; reason?: string };
  remove: (id: string) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 3;

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      selected: [],
      toggle: (id) => {
        const current = get().selected;
        if (current.includes(id)) {
          set({ selected: current.filter((x) => x !== id) });
          return { ok: true };
        }
        if (current.length >= MAX_COMPARE) {
          return {
            ok: false,
            reason: `Your suite already has ${MAX_COMPARE} residences. Remove one to add another.`,
          };
        }
        set({ selected: [...current, id] });
        return { ok: true };
      },
      remove: (id) => set({ selected: get().selected.filter((x) => x !== id) }),
      clear: () => set({ selected: [] }),
      isSelected: (id) => get().selected.includes(id),
    }),
    { name: "pikorua-compare" },
  ),
);
