import { motion } from "framer-motion";
import type { ConfigKey, Property } from "@/types/property";
import { CONFIG_KEYS } from "@/types/property";
import { Section } from "./Section";
import { VariantSwitcher, VariantValueCell, variantsOf } from "@/components/compare/VariantColumns";
import { useVariantViewStore, variantKey } from "@/stores/variant-view-store";
import { AreaUnitToggle } from "@/components/compare/AreaUnitToggle";
import { BareAreaValue, RoomFieldValue } from "@/components/compare/RoomFieldValue";

type RoomKey =
  "livingArea" | "kitchen" | "bedroom1" | "bedroom2" | "bedroom3" | "bedroom4" | "bedroom5";

const BEDROOM_COUNT: Record<ConfigKey, number> = {
  "3 BHK": 3,
  "4 BHK": 4,
  "5 BHK": 5,
  Penthouse: 5,
  Duplex: 4,
};

function rowsFor(k: ConfigKey): { key: RoomKey | "area" | "carpet"; label: string }[] {
  const bedrooms = (["bedroom1", "bedroom2", "bedroom3", "bedroom4", "bedroom5"] as RoomKey[])
    .slice(0, BEDROOM_COUNT[k])
    .map((key, i) => ({ key, label: `Bedroom ${i + 1}` }));
  return [
    { key: "area", label: "Super Built-up" },
    { key: "carpet", label: "Carpet" },
    { key: "livingArea", label: "Drawing / Living / Dining" },
    { key: "kitchen", label: "Kitchen" },
    ...bedrooms,
  ];
}

const DASH = "—";

/** One group per BHK the compared set actually offers. Layout variants live
 *  inside their own property's column (see VariantColumns) rather than forcing
 *  a near-empty group on every property that has only one layout. */
function usedConfigKeys(properties: Property[]): ConfigKey[] {
  return CONFIG_KEYS.filter((key) =>
    properties.some((p) => (p.configurations[key]?.length ?? 0) > 0),
  );
}

export function RoomDimensionsSection({ properties }: { properties: Property[] }) {
  const configKeys = usedConfigKeys(properties);
  // Shared with the sticky tray and the on-page board — one reading position
  // for a given (BHK, property), wherever it is displayed.
  const { active, expanded, setActive, toggleExpanded } = useVariantViewStore();
  const activeIdxFor = (key: ConfigKey, p: Property) => active[variantKey(key, p.id)] ?? 0;
  const isExpanded = (key: ConfigKey, p: Property) => expanded[variantKey(key, p.id)] ?? false;

  if (configKeys.length === 0) return null;

  return (
    <Section
      id="dimensions"
      eyebrow="02 · Unit & Room Dimensions"
      title="Every square foot, accounted for"
      description="Configuration-wise areas and room dimensions, straight from the developers' unit plans."
    >
      <div className="mb-6">
        <AreaUnitToggle />
      </div>
      <div className="space-y-10">
        {configKeys.map((cfgKey) => {
          const rows = rowsFor(cfgKey).filter(({ key }) =>
            properties.some((p) => variantsOf(p, cfgKey).some((v) => v[key as keyof typeof v])),
          );
          if (rows.length === 0) return null;
          const anyMultiVariant = properties.some((p) => variantsOf(p, cfgKey).length > 1);

          // An expanded column holds N layouts, so it claims N shares of the
          // width instead of being squeezed into one — otherwise fanning out
          // three types just wraps every value onto five lines. Only this
          // group's table changes; the other BHK tables keep their own widths.
          const subCols = properties.map((p) =>
            isExpanded(cfgKey, p) ? variantsOf(p, cfgKey).length : 1,
          );
          const totalSubCols = subCols.reduce((a, b) => a + b, 0);
          const colTpl = `minmax(110px, 180px) ${subCols
            .map((n) => `minmax(0, ${n}fr)`)
            .join(" ")}`;
          // Once fanned out, guarantee every sub-column stays readable and let
          // the table scroll sideways rather than crushing the columns.
          const expandedHere = totalSubCols > properties.length;
          const minWidth = expandedHere ? 180 + totalSubCols * 150 : undefined;

          return (
            <motion.div
              key={cfgKey}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6 }}
            >
              <div className="mb-3 flex items-center gap-3">
                <h3 className="font-display text-ivory" style={{ fontSize: "var(--step-1)" }}>
                  {cfgKey}
                </h3>
                <span className="h-px flex-1 bg-champagne/15" />
              </div>
              <div className="overflow-x-auto rounded-card border-2 border-border-strong bg-card/60">
                <div style={minWidth ? { minWidth } : undefined}>
                  {anyMultiVariant && (
                    <div
                      className="compare-cols grid items-center gap-3 border-b-2 border-border-strong bg-muted/25 p-4 sm:p-5"
                      style={
                        {
                          gridTemplateColumns: colTpl,
                          "--compare-cols": properties.length,
                        } as React.CSSProperties
                      }
                    >
                      <p
                        className="compare-label tracking-luxury text-muted-foreground"
                        style={{ fontSize: "var(--step--2)" }}
                      >
                        Layout
                      </p>
                      {properties.map((p) => (
                        <VariantSwitcher
                          key={p.id}
                          property={p}
                          variants={variantsOf(p, cfgKey)}
                          activeIdx={activeIdxFor(cfgKey, p)}
                          expanded={isExpanded(cfgKey, p)}
                          onSelect={(idx) => setActive(variantKey(cfgKey, p.id), idx)}
                          onToggleExpand={() => toggleExpanded(variantKey(cfgKey, p.id))}
                        />
                      ))}
                    </div>
                  )}
                  {rows.map(({ key, label }, rowIdx) => (
                    <div
                      key={key}
                      className={`compare-cols grid items-start gap-3 p-4 sm:items-center sm:p-5 ${
                        rowIdx > 0 ? "border-t border-[var(--rule)]" : ""
                      }`}
                      style={
                        {
                          gridTemplateColumns: colTpl,
                          "--compare-cols": properties.length,
                        } as React.CSSProperties
                      }
                    >
                      <p
                        className="compare-label tracking-luxury text-muted-foreground"
                        style={{ fontSize: "var(--step--2)" }}
                      >
                        {label}
                      </p>
                      {properties.map((p) => {
                        const variants = variantsOf(p, cfgKey);
                        return (
                          // Values centre under their property column so a row of
                          // dashes reads as a column, not a ragged left edge.
                          <div key={p.id} className="sm:text-center">
                            <p
                              className="tracking-luxury truncate text-muted-foreground sm:hidden"
                              style={{ fontSize: "var(--step--2)" }}
                            >
                              {p.name}
                            </p>
                            {variants.length === 0 ? (
                              <p
                                className="leading-snug text-muted-foreground/60"
                                style={{ fontSize: "var(--step--1)" }}
                              >
                                Not offered
                              </p>
                            ) : (
                              <VariantValueCell
                                variants={variants}
                                activeIdx={activeIdxFor(cfgKey, p)}
                                expanded={isExpanded(cfgKey, p)}
                                onSelect={(idx) => setActive(variantKey(cfgKey, p.id), idx)}
                                render={(v) => {
                                  const val = (v[key as keyof typeof v] as string | null) ?? null;
                                  if (!val) {
                                    return (
                                      <p
                                        className="leading-snug text-muted-foreground/60"
                                        style={{ fontSize: "var(--step--1)" }}
                                      >
                                        {DASH}
                                      </p>
                                    );
                                  }
                                  return (
                                    <div
                                      className="leading-snug text-ivory/90"
                                      style={{ fontSize: "var(--step--1)" }}
                                    >
                                      {key === "area" || key === "carpet" ? (
                                        <BareAreaValue value={val} />
                                      ) : (
                                        <RoomFieldValue value={val} />
                                      )}
                                    </div>
                                  );
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
        <p className="text-muted-foreground" style={{ fontSize: "var(--step--2)" }}>
          All areas and dimensions are approximate, as shared by the developers.
        </p>
      </div>
    </Section>
  );
}
