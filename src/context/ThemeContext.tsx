import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

type Ctx = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "pikorua-theme";

function applyTheme(root: HTMLElement, theme: Theme) {
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const storedTheme = (typeof window !== "undefined" &&
      localStorage.getItem(STORAGE_KEY)) as Theme | null;
    if (storedTheme === "light" || storedTheme === "dark") setThemeState(storedTheme);
  }, []);

  useEffect(() => {
    applyTheme(document.documentElement, theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable (private mode / SSR) — theme still applies for the session
    }
  }, [theme]);

  const switchTheme = (next: Theme) => {
    const root = document.documentElement;

    // Use the View Transitions API when available for a cinematic crossfade
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      // @ts-ignore — startViewTransition may not be in all TS lib targets
      document.startViewTransition(() => {
        applyTheme(root, next);
        setThemeState(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
      });
    } else {
      // Fallback: quick CSS transition for browsers without View Transitions
      root.classList.add("theme-anim");
      setThemeState(next);
      window.setTimeout(() => root.classList.remove("theme-anim"), 550);
    }
  };

  const setTheme = (t: Theme) => switchTheme(t);
  const toggle = () => switchTheme(theme === "dark" ? "light" : "dark");

  return <ThemeCtx.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
