import { motion } from "framer-motion";
import type { Property, ComparisonRow } from "@/types/property";
import { Section } from "./Section";

interface OverviewSectionProps {
  properties: Property[];
}

export function OverviewSection({ properties }: OverviewSectionProps) {
  const rows: ComparisonRow[] = [
    { label: "Configuration", values: properties.map((p) => p.configuration) },
    {
      label: "Size",
      values: properties.map((p) => p.size),
      highlightIndex: properties.reduce(
        (best, p, i) => (p.sizeNumeric > properties[best].sizeNumeric ? i : best),
        0,
      ),
    },
    { label: "Location", values: properties.map((p) => p.location) },
    { label: "Status", values: properties.map((p) => p.status) },
    { label: "Possession", values: properties.map((p) => p.possession) },
  ];

  return (
    <Section
      id="overview"
      eyebrow="01 · Overview"
      title="The essentials, side by side"
      description="A quiet read of what defines each residence."
    >
      <div className="space-y-3">
        {rows.map((row, rowIdx) => (
          <motion.div
            key={row.label}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: rowIdx * 0.05 }}
            className="compare-cols grid items-center gap-3 rounded-3xl bg-card/60 p-4 sm:p-6"
            style={
              {
                gridTemplateColumns: `minmax(120px, 200px) repeat(${properties.length}, minmax(0, 1fr))`,
                border: "1px solid var(--glass-border)",
                "--compare-cols": properties.length,
              } as React.CSSProperties
            }
          >
            <p className="compare-label text-[10px] tracking-luxury text-muted-foreground sm:text-[11px]">
              {row.label}
            </p>
            {row.values.map((val, i) => (
              <div
                key={i}
                className={`rounded-2xl px-2.5 py-3 text-[13px] transition-colors sm:px-4 sm:text-center sm:text-base ${
                  row.highlightIndex === i
                    ? "bg-gradient-to-br from-champagne/20 to-transparent text-ivory ring-1 ring-champagne/40"
                    : "text-ivory/85"
                }`}
              >
                <p className="mb-0.5 truncate text-[9px] tracking-luxury text-muted-foreground sm:hidden">
                  {properties[i].name}
                </p>
                {val}
              </div>
            ))}
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
