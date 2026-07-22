import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SavedCompare {
  /** Stable key derived from the member ids — order-independent. */
  id: string;
  propertyIds: string[];
  savedAt: number;
}

interface SavedComparesState {
  saved: SavedCompare[];
  /** Returns false when this exact set is already saved (no duplicate row). */
  save: (propertyIds: string[]) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  isSaved: (propertyIds: string[]) => boolean;
}

/**
 * A comparison is identified by its member set, not the order they were added
 * in — reordering the suite must not produce a second "saved" entry.
 */
export function compareKey(propertyIds: string[]): string {
  return [...propertyIds].sort().join("|");
}

export const useSavedComparesStore = create<SavedComparesState>()(
  persist(
    (set, get) => ({
      saved: [],
      save: (propertyIds) => {
        if (propertyIds.length < 2) return false;
        const id = compareKey(propertyIds);
        if (get().saved.some((c) => c.id === id)) return false;
        set({
          saved: [{ id, propertyIds: [...propertyIds], savedAt: Date.now() }, ...get().saved],
        });
        return true;
      },
      remove: (id) => set({ saved: get().saved.filter((c) => c.id !== id) }),
      clear: () => set({ saved: [] }),
      isSaved: (propertyIds) => {
        if (propertyIds.length < 2) return false;
        const id = compareKey(propertyIds);
        return get().saved.some((c) => c.id === id);
      },
    }),
    { name: "pikorua-saved-compares" },
  ),
);
