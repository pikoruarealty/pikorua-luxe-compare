import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import type { Property } from "@/types/property";
import { Section } from "./Section";

interface DifferenceHighlightsProps {
  properties: Property[];
}

interface Highlight {
  label: string;
  winnerIndex: number;
  winnerValue: string;
  detail: string;
}

/** Months until possession — "Ready to Move" = 0, unparseable = unknown (never wins). */
const possessionMonths = (s: string): number => {
  const t = s.trim().toLowerCase();
  if (/ready|immediate|rtmi/.test(t)) return 0;
  const m = t.match(/([\d.]+)\s*(year|month)/);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = parseFloat(m[1]);
  return /month/.test(m[2]) ? n : n * 12;
};

export function DifferenceHighlights({ properties }: DifferenceHighlightsProps) {
  const highlights: Highlight[] = [];

  // Largest footprint — only when sizes actually differ.
  const sizes = properties.map((p) => p.sizeNumeric);
  const largest = sizes.indexOf(Math.max(...sizes));
  if (Math.max(...sizes) > Math.min(...sizes)) {
    highlights.push({
      label: "Largest footprint",
      winnerIndex: largest,
      winnerValue: properties[largest].size,
      detail: `${properties[largest].name} offers the most expansive living canvas in this comparison.`,
    });
  }

  // Richest amenity set — skip when every residence ties.
  const amenityCounts = properties.map((p) => p.amenities.length);
  const mostAmenitiesIdx = amenityCounts.indexOf(Math.max(...amenityCounts));
  if (Math.max(...amenityCounts) > Math.min(...amenityCounts)) {
    highlights.push({
      label: "Richest amenity set",
      winnerIndex: mostAmenitiesIdx,
      winnerValue: `${amenityCounts[mostAmenitiesIdx]} amenities`,
      detail: `${properties[mostAmenitiesIdx].name} leads on curated experiences within the residence.`,
    });
  }

  // Earliest possession — parse "Ready to Move" / "N Years" / "N Months".
  const months = properties.map((p) => possessionMonths(p.possession));
  const minMonths = Math.min(...months);
  const earliestPossessionIdx = months.indexOf(minMonths);
  if (Number.isFinite(minMonths) && months.some((m) => m !== minMonths)) {
    highlights.push({
      label: "Earliest possession",
      winnerIndex: earliestPossessionIdx,
      winnerValue: properties[earliestPossessionIdx].possession,
      detail: `${properties[earliestPossessionIdx].name} is the fastest route to keys-in-hand.`,
    });
  }

  // Most unique amenities — skip when nobody has an exclusive.
  const exclusiveAmenities = properties.map((p, i) => {
    const others = properties.filter((_, j) => j !== i).flatMap((o) => o.amenities);
    return p.amenities.filter((a) => !others.includes(a));
  });
  const exclusiveCounts = exclusiveAmenities.map((arr) => arr.length);
  const uniquenessIdx = exclusiveCounts.indexOf(Math.max(...exclusiveCounts));
  if (Math.max(...exclusiveCounts) > 0) {
    highlights.push({
      label: "Most unique amenities",
      winnerIndex: uniquenessIdx,
      winnerValue: exclusiveAmenities[uniquenessIdx].slice(0, 2).join(", "),
      detail: `${properties[uniquenessIdx].name} holds the most one-of-one features.`,
    });
  }

  if (highlights.length === 0) return null;

  return (
    <Section
      id="differences"
      eyebrow="05 · Difference Highlights"
      title="Where each residence quietly wins"
      description="Automatic analysis of the most material gaps between your selection."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {highlights.map((h, i) => (
          <motion.div
            key={h.label}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: i * 0.06 }}
            className="rounded-card border border-[var(--rule)] bg-card p-7"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full border border-champagne/40 bg-champagne/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase text-champagne">
                {h.label}
              </span>
              <TrendingUp className="h-4 w-4 text-champagne" />
            </div>
            <p className="mt-4 font-display text-ivory" style={{ fontSize: "var(--step-1)" }}>
              {properties[h.winnerIndex].name}
            </p>
            <p className="gold-text mt-1 font-display" style={{ fontSize: "var(--step-0)" }}>
              {h.winnerValue}
            </p>
            <p
              className="mt-3 leading-relaxed text-muted-foreground"
              style={{ fontSize: "var(--step--1)" }}
            >
              {h.detail}
            </p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
