import { motion } from "framer-motion";
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
    { key: "carpet", label: "Carpet", unit: "sq ft" },
    { key: "price", label: "Price" },
    { key: "rate", label: "Rate" },
    { key: "livingArea", label: "Drawing / Living / Dining" },
    { key: "kitchen", label: "Kitchen" },
    ...bedrooms,
  ];
}

/**
 * This residence's own layout variants, side by side.
 *
 * The comparison board deliberately collapses variants into one column so a
 * property offering three 5 BHK types doesn't crowd out the others. On its own
 * report there is nothing to crowd, so every type gets a full column and can be
 * read against its siblings directly.
 */
export function ResidenceLayouts({ property }: { property: Property }) {
  const groups = CONFIG_KEYS.map((key) => ({
    key,
    variants: property.configurations[key] ?? [],
  })).filter((g) => g.variants.length > 0);

  if (groups.length === 0) return null;

  return (
    <section className="mt-20">
      <h2 className="font-display text-[26px] text-ivory sm:text-[32px]">Layouts & dimensions</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Every layout this residence offers, compared against each other.
      </p>

      <div className="mt-8 space-y-8">
        {groups.map(({ key, variants }) => {
          const fields = fieldsFor(key).filter(({ key: f }) => variants.some((v) => v[f]));
          if (fields.length === 0) return null;

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
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6 }}
            >
              <div className="mb-3 flex items-center gap-3">
                <h3 className="font-display text-[20px] text-ivory sm:text-[24px]">{key}</h3>
                <span className="text-[11px] tracking-luxury text-muted-foreground">
                  {variants.length} {variants.length === 1 ? "layout" : "layouts"}
                </span>
                <span className="h-px flex-1 bg-champagne/15" />
              </div>

              {/* Horizontal scroll rather than shrinking columns — a residence
                  can offer more layouts than fit, and unreadable columns are
                  worse than a scrollbar. */}
              <div className="overflow-x-auto rounded-3xl border-2 border-border-strong bg-card/60">
                <div
                  className="min-w-[520px]"
                  style={
                    {
                      "--layout-cols": variants.length,
                    } as React.CSSProperties
                  }
                >
                  {/* A single-layout BHK gets no type header — labelling the
                      only layout "Type A" invents a distinction the data
                      doesn't make. The BHK heading above already names it. */}
                  {variants.length > 1 && (
                    <div
                      className="grid items-center gap-3 border-b-2 border-border-strong bg-muted/25 p-4 sm:p-5"
                      style={{
                        gridTemplateColumns: `minmax(140px, 200px) repeat(${variants.length}, minmax(0, 1fr))`,
                      }}
                    >
                      <p className="text-[10px] tracking-luxury text-muted-foreground sm:text-[11px]">
                        Layout
                      </p>
                      {variants.map((v, i) => (
                        <p
                          key={i}
                          className={`text-center text-[11px] font-semibold uppercase tracking-[0.14em] ${
                            i === bestIdx ? "text-champagne" : "text-foreground"
                          }`}
                        >
                          {variantLabel(v, i)}
                          {i === bestIdx && (
                            <span className="ml-1.5 text-[9px] font-normal normal-case tracking-normal text-champagne/80">
                              largest
                            </span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}

                  {fields.map(({ key: f, label, unit }, rowIdx) => (
                    <div
                      key={String(f)}
                      className={`grid items-center gap-3 p-4 sm:p-5 ${
                        rowIdx > 0 ? "border-t border-[var(--glass-border)]" : ""
                      }`}
                      style={{
                        gridTemplateColumns: `minmax(140px, 200px) repeat(${variants.length}, minmax(0, 1fr))`,
                      }}
                    >
                      <p className="text-[10px] tracking-luxury text-muted-foreground sm:text-[11px]">
                        {label}
                      </p>
                      {variants.map((v, i) => {
                        const raw = (v[f] as string | null) ?? null;
                        return (
                          <p
                            key={i}
                            className={`text-center text-[12px] leading-snug sm:text-[14px] ${
                              raw ? "text-ivory/90" : "text-muted-foreground/60"
                            }`}
                          >
                            {raw ? (unit ? `${raw} ${unit}` : raw) : DASH}
                          </p>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
