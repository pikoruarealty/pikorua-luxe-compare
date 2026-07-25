import { motion } from "framer-motion";
import { MoveHorizontal, Sparkles, CheckCircle2, Home, Maximize2, Building2 } from "lucide-react";
import type { ConfigDetail, ConfigKey, Property } from "@/types/property";
import { CONFIG_KEYS } from "@/types/property";
import { variantLabel } from "@/components/compare/VariantColumns";

const DASH = "—";

type FieldKey = keyof ConfigDetail;

const BEDROOM_COUNT: Record<ConfigKey, number> = {
  "4 BHK": 4,
  "5 BHK": 5,
  Penthouse: 5,
  Duplex: 4,
};

function fieldsFor(k: ConfigKey): { key: FieldKey; label: string; unit?: string }[] {
  const bedrooms = (["bedroom1", "bedroom2", "bedroom3", "bedroom4", "bedroom5"] as FieldKey[])
    .slice(0, BEDROOM_COUNT[k])
    .map((key, i) => ({ key, label: `Bedroom ${i + 1}` }));
  return [
    { key: "area", label: "Super Built-up", unit: "sq ft" },
    { key: "carpet", label: "Carpet Area", unit: "sq ft" },
    { key: "price", label: "Starting Price" },
    { key: "rate", label: "Price / Sq Ft" },
    { key: "livingArea", label: "Drawing / Living / Dining" },
    { key: "kitchen", label: "Kitchen Space" },
    ...bedrooms,
  ];
}

function formatValue(key: FieldKey, raw: string | null, unit?: string): string {
  if (!raw) return DASH;

  if (key === "price") {
    if (raw.toLowerCase().includes("cr")) {
      const numMatch = raw.match(/[\d.]+/);
      if (numMatch) {
        const val = parseFloat(numMatch[0]);
        return `₹ ${val.toFixed(2)} Cr${raw.includes("+") ? " +" : ""}`;
      }
    }
    if (!raw.includes("₹")) return `₹ ${raw}`;
    return raw;
  }

  if (key === "rate") {
    const num = parseFloat(raw.replace(/[^\d.]/g, ""));
    if (!isNaN(num)) {
      return `₹ ${num.toLocaleString("en-IN")} / sq ft`;
    }
    return raw;
  }

  if (unit && !raw.toLowerCase().includes(unit.toLowerCase())) {
    return `${raw} ${unit}`;
  }

  return raw;
}

/**
 * High-Luxury Layouts & Dimensions Matrix Component
 */
export function ResidenceLayouts({ property }: { property: Property }) {
  const groups = CONFIG_KEYS.map((key) => ({
    key,
    variants: property.configurations[key] ?? [],
  })).filter((g) => g.variants.length > 0);

  if (groups.length === 0) return null;

  return (
    <section className="mt-20 border-t border-[var(--rule)] pt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-champagne" />
            <p className="tracking-luxury text-xs font-semibold uppercase text-champagne">
              Layout Specifications
            </p>
          </div>
          <h2
            className="mt-2 font-display text-2xl font-bold text-foreground sm:text-4xl"
            style={{ letterSpacing: "var(--tracking-display)" }}
          >
            Layouts & dimensions
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">
            Every layout variant offered by {property.name}, compared side by side.
          </p>
        </div>

        {/* Mobile Horizontal Scroll Cue */}
        <div className="sm:hidden">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-champagne/30 bg-champagne/10 px-3 py-1 text-[11px] font-medium text-champagne">
            <MoveHorizontal className="h-3.5 w-3.5" /> Swipe horizontally
          </span>
        </div>
      </div>

      <div className="mt-8 space-y-12">
        {groups.map(({ key, variants }) => {
          const fields = fieldsFor(key).filter(({ key: f }) => variants.some((v) => v[f]));
          if (fields.length === 0) return null;

          const isSingle = variants.length === 1;

          // Largest super built-up among this residence's own layouts.
          const areas = variants.map((v) => {
            const m = v.area?.match(/[\d.]+/);
            return m ? parseFloat(m[0]) : null;
          });
          const maxArea = Math.max(...areas.map((a) => a ?? -Infinity));
          const bestIdx = areas.findIndex((a) => a !== null && a === maxArea);

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6 }}
              className="space-y-5"
            >
              {/* Group Header Badge */}
              <div className="flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-3">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-5 w-5 text-champagne shrink-0" />
                  <h3 className="font-display text-xl font-bold text-foreground sm:text-2xl">
                    {key}
                  </h3>
                </div>
                <span className="rounded-full border border-[var(--rule)] bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {variants.length} {variants.length === 1 ? "layout available" : "layouts"}
                </span>
              </div>

              {/* DUAL RENDER MODE: Single Layout Dossier Card vs Multi-Layout Matrix */}
              {isSingle ? (
                <SingleLayoutCard variant={variants[0]} fields={fields} />
              ) : (
                <MultiLayoutMatrix
                  variants={variants}
                  fields={fields}
                  bestIdx={bestIdx}
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/** Bespoke Single-Layout Architectural Dossier Card */
function SingleLayoutCard({
  variant,
  fields,
}: {
  variant: ConfigDetail;
  fields: { key: FieldKey; label: string; unit?: string }[];
}) {
  const superBuiltUp = variant.area ? formatValue("area", variant.area, "sq ft") : null;
  const carpetArea = variant.carpet ? formatValue("carpet", variant.carpet, "sq ft") : null;
  const price = variant.price ? formatValue("price", variant.price) : null;
  const rate = variant.rate ? formatValue("rate", variant.rate) : null;

  const roomFields = fields.filter(
    (f) => !["area", "carpet", "price", "rate"].includes(f.key) && Boolean(variant[f.key]),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-card shadow-sm">
      {/* Key Hero Stat Cards */}
      <div className="grid grid-cols-1 divide-y divide-[var(--rule)] sm:grid-cols-3 sm:divide-x sm:divide-y-0 bg-muted/20">
        {superBuiltUp && (
          <div className="p-6">
            <span className="tracking-luxury text-[10px] font-bold uppercase text-champagne flex items-center gap-1.5">
              <Maximize2 className="h-3.5 w-3.5 text-champagne" /> Super Built-up Area
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                {superBuiltUp.replace(/sq ft/i, "").trim()}
              </span>
              <span className="text-xs font-bold text-muted-foreground uppercase">sq ft</span>
            </div>
          </div>
        )}

        {carpetArea && (
          <div className="p-6">
            <span className="tracking-luxury text-[10px] font-bold uppercase text-champagne flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5 text-champagne" /> Carpet Area
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                {carpetArea.replace(/sq ft/i, "").trim()}
              </span>
              <span className="text-xs font-bold text-muted-foreground uppercase">sq ft</span>
            </div>
          </div>
        )}

        {(price || rate) && (
          <div className="p-6">
            <span className="tracking-luxury text-[10px] font-bold uppercase text-champagne">
              Valuation & Rate
            </span>
            <div className="mt-2 flex flex-col gap-0.5">
              {price && (
                <span className="font-display text-xl font-bold text-champagne sm:text-2xl">
                  {price}
                </span>
              )}
              {rate && <span className="text-xs text-muted-foreground font-medium">{rate}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Spatial Dimensions Breakdown Cards */}
      {roomFields.length > 0 && (
        <div className="border-t border-[var(--rule)] p-6 space-y-4">
          <p className="tracking-luxury text-[11px] font-bold uppercase text-muted-foreground">
            Spatial Dimensions & Room Breakdown
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {roomFields.map(({ key, label }) => {
              const val = variant[key] as string;
              return (
                <div
                  key={key}
                  className="flex flex-col justify-center rounded-xl border border-[var(--rule)] bg-background/50 p-4 transition-colors hover:border-champagne/40"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-champagne">
                    {label}
                  </span>
                  <span className="mt-1 text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
                    {val}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Multi-Layout Comparative Matrix Table */
function MultiLayoutMatrix({
  variants,
  fields,
  bestIdx,
}: {
  variants: ConfigDetail[];
  fields: { key: FieldKey; label: string; unit?: string }[];
  bestIdx: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-card shadow-sm">
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div
          className="min-w-[560px]"
          style={{
            display: "grid",
            gridTemplateColumns: `minmax(180px, 240px) repeat(${variants.length}, minmax(180px, 1fr))`,
          }}
        >
          {/* Header Row (Layout Type Labels) */}
          <div className="sticky left-0 z-20 border-b border-[var(--rule)] bg-muted/40 p-4 sm:p-5 font-bold uppercase tracking-luxury text-foreground text-xs shadow-xs text-left">
            Specification
          </div>
          {variants.map((v, i) => (
            <div
              key={i}
              className={`border-b border-[var(--rule)] bg-muted/40 p-4 sm:p-5 text-left ${
                i === bestIdx ? "bg-champagne/5" : ""
              }`}
            >
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${
                  i === bestIdx ? "text-champagne" : "text-foreground"
                }`}
              >
                {variantLabel(v, i)}
                {i === bestIdx && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-champagne/20 px-2 py-0.5 text-[9px] font-bold text-champagne">
                    <Sparkles className="h-2.5 w-2.5" /> Largest
                  </span>
                )}
              </span>
            </div>
          ))}

          {/* Data Rows */}
          {fields.map(({ key: f, label, unit }, rowIdx) => {
            const isHighlight = f === "area" || f === "price";
            return (
              <div key={String(f)} className="contents group/row">
                {/* Left Column Label */}
                <div
                  className={`sticky left-0 z-20 flex items-center gap-2 border-t border-[var(--rule)] p-4 sm:p-5 text-left text-xs font-semibold uppercase tracking-wider text-foreground/80 transition-colors group-hover/row:bg-muted/30 ${
                    rowIdx % 2 === 0 ? "bg-card" : "bg-muted/15"
                  }`}
                >
                  {isHighlight ? (
                    <Sparkles className="h-3.5 w-3.5 text-champagne shrink-0" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 shrink-0" />
                  )}
                  <span>{label}</span>
                </div>

                {/* Variant Values */}
                {variants.map((v, i) => {
                  const raw = (v[f] as string | null) ?? null;
                  const formatted = formatValue(f, raw, unit);
                  const isBest = i === bestIdx && f === "area";

                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-start border-t border-[var(--rule)] p-4 sm:p-5 text-left text-xs sm:text-sm transition-colors group-hover/row:bg-muted/30 ${
                        rowIdx % 2 === 0 ? "bg-card" : "bg-muted/15"
                      } ${isBest ? "bg-champagne/5 font-bold text-champagne" : ""}`}
                    >
                      <span
                        className={
                          raw
                            ? f === "price"
                              ? "font-bold text-champagne text-sm sm:text-base"
                              : f === "area" || f === "carpet"
                                ? "font-semibold text-foreground"
                                : "text-foreground/90 font-medium leading-relaxed"
                            : "text-muted-foreground/50"
                        }
                      >
                        {formatted}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
