import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "dimensions", label: "Dimensions" },
  { id: "amenities", label: "Amenities" },
  { id: "advantages", label: "Advantages" },
  { id: "differences", label: "Differences" },
  { id: "gallery", label: "Gallery" },
  { id: "verdict", label: "Verdict" },
];

export function SectionNav() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="fixed inset-x-0 bottom-6 z-40 mx-auto hidden w-fit max-w-[92vw] px-6 lg:block">
      {/* A floating bar over scrolling content is the one place a blur earns
          its keep — legibility while the page moves underneath it — so it
          keeps backdrop-blur, just not the .glass utility's naming/values. */}
      <div className="flex items-center justify-center gap-1 rounded-card border border-[var(--rule)] bg-[color-mix(in_oklab,var(--background)_92%,transparent)] p-2 backdrop-blur-md">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`tracking-luxury rounded-full px-4 py-2 transition-all duration-300 ${
              active === s.id
                ? "bg-gradient-to-r from-champagne to-muted-gold text-lux-black"
                : "text-muted-foreground hover:text-ivory"
            }`}
            style={{ fontSize: "var(--step--2)" }}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
