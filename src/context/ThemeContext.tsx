import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

type Ctx = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "pikorua-theme";

// The app ships one palette — Bright Gold — set unconditionally in the SSR
// shell (see __root.tsx's `data-palette="bright"`) and never changed at
// runtime. This provider used to also carry a `palette` / `setPalette` pair
// for switching between seven palettes, but there was never a picker UI, so
// it was six dead options and a client-side effect re-asserting a value the
// server had already set. See styles.css's PALETTE SYSTEM comment for the
// CSS side of this cut.

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const storedTheme = (typeof window !== "undefined" &&
      localStorage.getItem(STORAGE_KEY)) as Theme | null;
    if (storedTheme === "light" || storedTheme === "dark") setThemeState(storedTheme);
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

  return <ThemeCtx.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
