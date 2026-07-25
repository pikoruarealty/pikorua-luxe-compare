import { motion } from "framer-motion";
import type { Property, ComparisonRow } from "@/types/property";
import { Section } from "./Section";
import { livePossessionLabel } from "@/lib/possession-format";

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
    {
      label: "Possession",
      values: properties.map((p) => livePossessionLabel(p.possession, p.possessionAsOf)),
    },
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
            className="compare-cols grid items-center gap-3 rounded-card border border-[var(--rule)] bg-card/60 p-4 sm:p-6"
            style={
              {
                gridTemplateColumns: `minmax(120px, 200px) repeat(${properties.length}, minmax(0, 1fr))`,
                "--compare-cols": properties.length,
              } as React.CSSProperties
            }
          >
            <p
              className="compare-label tracking-luxury text-muted-foreground"
              style={{ fontSize: "var(--step--2)" }}
            >
              {row.label}
            </p>
            {row.values.map((val, i) => (
              <div
                key={i}
                className={`rounded-card px-2.5 py-3 transition-colors sm:px-4 sm:text-center ${
                  row.highlightIndex === i
                    ? "bg-gradient-to-br from-champagne/20 to-transparent text-ivory ring-1 ring-champagne/40"
                    : "text-ivory/85"
                }`}
                style={{ fontSize: "var(--step--1)" }}
              >
                <p
                  className="tracking-luxury mb-0.5 truncate text-muted-foreground sm:hidden"
                  style={{ fontSize: "var(--step--2)" }}
                >
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
