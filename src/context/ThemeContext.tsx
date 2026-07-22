import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";
export type Palette = "bright" | "mono" | "cloud" | "warm-sand" | "sage" | "emerald" | "ocean";

type Ctx = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "pikorua-theme";
const PALETTE_KEY = "pikorua-palette";

export const PALETTES: { id: Palette; label: string; swatch: string }[] = [
  { id: "bright", label: "Bright Gold", swatch: "#f2a900" },
  { id: "mono", label: "Monochrome", swatch: "#000000" },
  { id: "cloud", label: "Cloud White", swatch: "#3b82f6" },
  { id: "warm-sand", label: "Warm Sand", swatch: "#b8894a" },
  { id: "sage", label: "Sage", swatch: "#7d9b76" },
  { id: "emerald", label: "Emerald", swatch: "#0d7a5f" },
  { id: "ocean", label: "Ocean", swatch: "#2d8a9e" },
];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [palette, setPaletteState] = useState<Palette>("bright");

  useEffect(() => {
    const storedTheme = (typeof window !== "undefined" &&
      localStorage.getItem(STORAGE_KEY)) as Theme | null;
    if (storedTheme === "light" || storedTheme === "dark") setThemeState(storedTheme);
    // The site ships as Bright Gold; ignore palettes persisted by older
    // versions (there is no picker UI, so a stored value can only be stale).
    const storedPalette = (typeof window !== "undefined" &&
      localStorage.getItem(PALETTE_KEY)) as Palette | null;
    if (storedPalette === "bright") {
      setPaletteState(storedPalette);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable (private mode / SSR) — theme still applies for the session
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-palette", palette);
    try {
      localStorage.setItem(PALETTE_KEY, palette);
    } catch {
      // localStorage unavailable — palette still applies for the session
    }
  }, [palette]);

  // Enable colour transitions only for the moment of switching — a
  // permanent universal transition makes the whole app feel laggy.
  const animateSwitch = () => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 400);
  };

  const setTheme = (t: Theme) => {
    animateSwitch();
    setThemeState(t);
  };
  const toggle = () => {
    animateSwitch();
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  };
  const setPalette = (p: Palette) => {
    animateSwitch();
    setPaletteState(p);
  };

  return (
    <ThemeCtx.Provider value={{ theme, toggle, setTheme, palette, setPalette }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
