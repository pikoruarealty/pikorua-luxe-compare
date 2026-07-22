import { useProperties } from "@/context/PropertiesContext";

/**
 * Infinite editorial ticker — scrolling strip of residence names and
 * locations between the hero and the suite. Pauses on hover.
 */
export function TickerStrip() {
  const properties = useProperties();
  const items: string[] = [];
  const locations = Array.from(new Set(properties.map((p) => p.location))).slice(0, 6);
  properties.slice(0, 10).forEach((p, i) => {
    items.push(p.name.toUpperCase());
    if (locations[i % locations.length]) items.push(locations[i % locations.length].toUpperCase());
  });
  items.push("READY TO MOVE", "PENTHOUSES", "DUPLEXES", "PRIVATE BUNGALOWS");

  const row = (key: string) => (
    <div key={key} className="ticker-row" aria-hidden={key === "b"}>
      {items.map((t, i) => (
        <span key={`${key}-${i}`} className="ticker-item">
          {t}
          <span className="ticker-dot">·</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="ticker-strip" aria-label="Featured residences ticker">
      <div className="ticker-track">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}
