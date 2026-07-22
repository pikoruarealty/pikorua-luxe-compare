import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FavoritesState {
  favorites: string[];
  toggle: (id: string) => boolean; // returns new state (true = favorited)
  remove: (id: string) => void;
  clear: () => void;
  isFavorite: (id: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggle: (id) => {
        const current = get().favorites;
        if (current.includes(id)) {
          set({ favorites: current.filter((x) => x !== id) });
          return false;
        }
        set({ favorites: [...current, id] });
        return true;
      },
      remove: (id) => set({ favorites: get().favorites.filter((x) => x !== id) }),
      clear: () => set({ favorites: [] }),
      isFavorite: (id) => get().favorites.includes(id),
    }),
    { name: "pikorua-favorites" },
  ),
);
