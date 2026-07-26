import { useProperties } from "@/context/PropertiesContext";

/**
 * Featured locations & category quick-filter capsules strip.
 * Standardized to match app-wide pill chip design tokens.
 */
export function TickerStrip() {
  const properties = useProperties();

  const locations = Array.from(new Set(properties.map((p) => p.location))).slice(0, 4);
  const items = [...locations, "Ready to Move", "Penthouses", "Duplexes", "Private Bungalows"];

  const handleClick = (category: string) => {
    const el = document.getElementById("collection");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section
      className="border-y border-border bg-background py-5"
      aria-label="Featured locations and categories"
    >
      <div className="container-lux">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          <span className="mr-1 text-[10px] font-bold tracking-luxury text-muted-foreground uppercase">
            Coverage
          </span>
          {items.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleClick(t)}
              className="rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-foreground/80 transition-all hover:border-foreground/40 hover:bg-muted hover:text-foreground touch-manipulation active:scale-95 shadow-xs"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
