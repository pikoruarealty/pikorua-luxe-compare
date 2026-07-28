import { type ReactNode, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, Moon, Sun, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import { useHydrated } from "@/hooks/use-hydrated";

export interface PortalNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Light/dark switch shared by the sidebar footer and mobile top bar. Renders
 *  the "switch to dark" (Moon) icon until hydration so it matches the light
 *  default served by RootShell — same guard the public SiteHeader uses. */
function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const hydrated = useHydrated();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-(--rule-strong) text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none",
        className,
      )}
    >
      {hydrated && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/** Shared responsive shell for the admin and developer portals. On lg+ a glass
 *  sidebar sits alongside the content; below lg it collapses into a sticky top
 *  bar with a slide-in drawer (same menu-open / body-lock / close-on-route
 *  pattern as the public SiteHeader). Auth/role logic stays in the thin
 *  AdminLayout / DeveloperLayout wrappers — this component is presentation only. */
export function PortalShell({
  children,
  nav,
  homePath,
  portalLabel,
  userLabel,
  userRole,
  onSignOut,
  title,
}: {
  children: ReactNode;
  nav: PortalNavItem[];
  /** Exact-match dashboard root, e.g. "/admin" — everything else is prefix-matched. */
  homePath: string;
  portalLabel: string;
  userLabel: string;
  userRole: string;
  onSignOut: () => void;
  title?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the drawer on navigation; lock body scroll while it's open.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const isActive = (to: string) =>
    to === homePath ? pathname === homePath : pathname.startsWith(to);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-(--rule) px-6 py-5">
        <p className="font-display text-lg tracking-[0.02em] gold-text">PropCompare</p>
        <p className="mt-1 font-label text-[10px] tracking-luxury text-muted-foreground">
          {portalLabel}
        </p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/50",
                active
                  ? "bg-champagne/12 text-champagne"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-champagne" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-(--rule) px-3 py-4">
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-foreground">{userLabel}</p>
            <p className="font-label text-[10px] tracking-luxury text-muted-foreground">
              {userRole}
            </p>
          </div>
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 lg:flex lg:flex-col">
        {sidebar}
      </aside>

      {/* Mobile drawer + overlay */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              key="portal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              key="portal-drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="glass-strong fixed inset-y-0 left-0 z-50 flex w-72 flex-col lg:hidden"
            >
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="absolute top-5 right-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/50"
              >
                <X className="h-4 w-4" />
              </button>
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="glass sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
          <p className="font-display text-base tracking-[0.02em] gold-text">PropCompare</p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="grid h-9 w-9 place-items-center rounded-lg border border-(--rule-strong) text-foreground transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden">
          {title && (
            <header className="border-b border-(--rule) px-5 py-6 sm:px-8">
              <h1 className="font-display text-2xl text-foreground">{title}</h1>
            </header>
          )}
          <div className="px-5 py-6 sm:px-8 sm:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
