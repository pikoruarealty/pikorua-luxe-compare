import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Menu, MessageCircle, Moon, Sun, UserRound, X } from "lucide-react";
import { useOnboarding } from "@/context/OnboardingContext";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useTheme } from "@/context/ThemeContext";

const WHATSAPP_NUMBER = "916354359222"; // country code + number, no + or spaces
const WHATSAPP_MESSAGE = "Hi PIKORUA, I'd like to know more about your luxury residences.";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

const NAV_LINKS = [
  { href: "/#suite", label: "Suite" },
  { href: "/#collection", label: "Collection" },
];

export function SiteHeader() {
  const { userProfile } = useOnboarding();
  const { theme, toggle } = useTheme();
  const hydrated = useHydrated();
  const favCount = useFavoritesStore((s) => s.favorites.length);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close the mobile menu on navigation and lock body scroll while open.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Scroll-aware chrome — the bar compacts and its glass deepens once the page
  // leaves the very top, so the header reads as a thin editorial rule in motion.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scrollspy — highlight Suite/Collection as those sections pass the viewport.
  useEffect(() => {
    if (pathname !== "/") {
      setActiveSection(null);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          setActiveSection(e.target.id === "hero" ? null : `/#${e.target.id}`);
        });
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    ["hero", "suite", "collection"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const initials = userProfile?.name
    ? userProfile.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : null;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 border-b border-[var(--glass-border)] backdrop-blur-md [transform:translateZ(0)] transition-shadow duration-300 ${
        scrolled ? "bg-card/90 shadow-[0_12px_34px_-20px_rgba(0,0,0,0.5)]" : "bg-card/80"
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between px-4 transition-[height] duration-300 sm:px-6 ${
          scrolled ? "h-[58px]" : "h-[68px]"
        }`}
      >
        <Link
          to="/"
          className="group flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          onClick={() => setMenuOpen(false)}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full gold-border transition-transform duration-500 group-hover:rotate-[8deg]">
            <span className="font-display text-sm gold-text">P</span>
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg leading-none text-ivory">PIKORUA</p>
            <p
              className="font-label tracking-luxury mt-1 text-champagne"
              style={{ fontSize: "var(--step--2)" }}
            >
              Property Consultant
            </p>
          </div>
        </Link>

        {/* Desktop nav.
            Gold in this bar is now just two things: the wordmark above, and
            the Contact button below — a nav item lighting up gold every time
            its section scrolls into view, and every control's border tinted
            gold at rest, made permanent chrome look like a special occasion. */}
        <nav className="hidden items-center gap-8 sm:flex">
          {NAV_LINKS.map((l) => {
            const active = activeSection === l.href;
            return (
              <a
                key={l.href}
                href={l.href}
                aria-current={active ? "true" : undefined}
                className={`tracking-luxury relative transition-colors hover:text-foreground ${
                  active ? "text-foreground" : "text-ivory/70"
                }`}
                style={{ fontSize: "var(--step--2)" }}
              >
                {l.label}
                <span
                  className={`absolute -bottom-1.5 left-0 h-px bg-foreground transition-all duration-300 ${
                    active ? "w-full" : "w-0"
                  }`}
                />
              </a>
            );
          })}

          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contact on WhatsApp"
            className="tracking-luxury inline-flex items-center gap-1.5 rounded-full border border-champagne/40 bg-champagne/10 px-3 py-1.5 text-ivory transition hover:border-champagne hover:bg-champagne/20 hover:text-champagne"
            style={{ fontSize: "var(--step--2)" }}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Contact
          </a>

          <Link
            to="/favorites"
            aria-label="Saved residences"
            className="tracking-luxury relative flex items-center gap-2 text-ivory/70 transition hover:text-foreground"
            style={{ fontSize: "var(--step--2)" }}
          >
            <Heart data-saved-target className="h-3.5 w-3.5" />
            Saved
            {hydrated && favCount > 0 && (
              <span
                className="grid h-4 min-w-4 place-items-center rounded-full bg-champagne px-1 font-medium text-lux-black"
                style={{ fontSize: "var(--step--2)" }}
              >
                {favCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--rule)] text-ivory/80 transition hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/50"
          >
            {hydrated && theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
          {userProfile ? (
            <Link
              to="/account"
              className="tracking-luxury flex items-center gap-2 rounded-full border border-[var(--rule)] py-1 pr-3 pl-1 text-ivory transition hover:border-foreground/40"
              style={{ fontSize: "var(--step--2)" }}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-champagne to-muted-gold font-display text-xs text-lux-black">
                {initials}
              </span>
              Account
            </Link>
          ) : (
            <Link
              to="/account"
              className="tracking-luxury flex items-center gap-2 rounded-full border border-[var(--rule)] px-3 py-1.5 text-ivory/80 transition hover:border-foreground/40 hover:text-foreground"
              style={{ fontSize: "var(--step--2)" }}
            >
              <UserRound className="h-3.5 w-3.5" />
              Account
            </Link>
          )}
        </nav>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--rule)] text-ivory/80 transition hover:border-foreground/40 hover:text-foreground"
          >
            {hydrated && theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          <Link
            to="/favorites"
            aria-label="Saved residences"
            className="relative grid h-9 w-9 place-items-center rounded-full border border-[var(--rule)] text-ivory/80 transition hover:border-foreground/40 hover:text-foreground"
          >
            <Heart data-saved-target className="h-4 w-4" />
            {hydrated && favCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-champagne px-1 font-medium text-lux-black"
                style={{ fontSize: "var(--step--2)" }}
              >
                {favCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--rule)] text-ivory transition hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/50"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-[var(--glass-border)] bg-card/95 text-foreground backdrop-blur-xl sm:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="tracking-luxury rounded-xl px-4 py-3.5 text-foreground/80 transition hover:bg-muted hover:text-foreground touch-manipulation active:scale-[0.99]"
                  style={{ fontSize: "var(--step--1)" }}
                >
                  {l.label}
                </a>
              ))}
              <Link
                to="/favorites"
                onClick={() => setMenuOpen(false)}
                className="tracking-luxury flex items-center justify-between rounded-xl px-4 py-3.5 text-foreground/80 transition hover:bg-muted hover:text-foreground touch-manipulation active:scale-[0.99]"
                style={{ fontSize: "var(--step--1)" }}
              >
                <span className="inline-flex items-center gap-2">
                  <Heart className="h-3.5 w-3.5" /> Saved
                </span>
                {hydrated && favCount > 0 && (
                  <span
                    className="grid h-5 min-w-5 place-items-center rounded-full bg-champagne px-1.5 font-medium text-lux-black"
                    style={{ fontSize: "var(--step--2)" }}
                  >
                    {favCount}
                  </span>
                )}
              </Link>
              <Link
                to="/account"
                onClick={() => setMenuOpen(false)}
                className="tracking-luxury flex items-center gap-3 rounded-xl px-4 py-3.5 text-foreground/80 transition hover:bg-muted hover:text-foreground touch-manipulation active:scale-[0.99]"
                style={{ fontSize: "var(--step--1)" }}
              >
                {userProfile ? (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-champagne to-muted-gold font-display text-xs text-lux-black">
                    {initials}
                  </span>
                ) : (
                  <UserRound className="h-3.5 w-3.5" />
                )}
                Account
              </Link>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="tracking-luxury mt-2 inline-flex items-center justify-center gap-2 rounded-full border border-champagne/40 bg-champagne/10 px-4 py-3 text-foreground transition hover:border-champagne hover:text-champagne touch-manipulation active:scale-[0.99]"
                style={{ fontSize: "var(--step--1)" }}
              >
                <MessageCircle className="h-4 w-4 text-champagne" />
                Contact on WhatsApp
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
