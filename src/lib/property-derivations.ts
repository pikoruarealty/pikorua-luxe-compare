import type { PropertyCategory, PropertyConfigurations, ConfigDetail } from "@/types/property";
import { CONFIG_KEYS } from "@/types/property";

export interface RawRow {
  name: string;
  type: string;
  developer: string;
  status: string;
  location: string;
  /** City the property sits in. Defaults to "Ahmedabad" when a row omits it. */
  city?: string;
  /** State the property sits in. Defaults to "Gujarat" when a row omits it. */
  state?: string;
  configs: Record<string, ConfigDetail[] | null>;
  plotSuper: string | null;
  plotCarpet: string | null;
  possession: string;
  /** Project-specific highlights from brochures — shown before generated ones. */
  highlights?: string[];
  /** Project-specific amenity list from brochures — replaces the generic set. */
  amenities?: string[];
}

export const DEFAULT_CITY = "Ahmedabad";
export const DEFAULT_STATE = "Gujarat";

export const amenitiesFor = (type: PropertyCategory): string[] => {
  if (type === "Plots")
    return [
      "Gated Community",
      "Landscaped Avenues",
      "24/7 Security",
      "Underground Utilities",
      "Clubhouse Access",
      "Jogging Track",
    ];
  if (type === "Bungalow")
    return [
      "Private Garden",
      "Plunge Pool",
      "Home Automation",
      "Driver & Staff Quarters",
      "Private Elevator",
      "24/7 Concierge",
      "EV Charging",
      "Landscaped Forecourt",
    ];
  return [
    "Infinity Pool",
    "Sky Lounge",
    "Spa & Wellness",
    "Concierge 24/7",
    "Banquet Hall",
    "Cinema Lounge",
    "Fitness Studio",
    "EV Charging",
  ];
};

export const advantagesFor = (r: RawRow): string[] => {
  const a: string[] = [];
  if (r.highlights?.length) a.push(...r.highlights);
  a.push(`${r.location} — premium West Ahmedabad address`);
  if (r.type === "Apartment") a.push("Curated luxury apartment living");
  if (r.type === "Bungalow") a.push("Standalone bungalow with private grounds");
  if (r.type === "Plots") a.push("Build-to-suit plotted development");
  if (/Pre-Launch/i.test(r.status)) a.push("Early-bird pricing window open");
  if (/Ready/i.test(r.status)) a.push("Move-in ready, zero wait");
  if (/Near Possession/i.test(r.status)) a.push("Handover within months");
  return a;
};

export const expertNoteFor = (r: RawRow): string =>
  `${r.name} by ${r.developer || "a reputed developer"} on ${r.location} offers ${r.type.toLowerCase()} living in a tightly held micro-market — a considered pick for discerning buyers in Ahmedabad's luxury corridor.`;

export const taglineFor = (r: RawRow): string => {
  if (r.type === "Plots") return `Plotted enclave at ${r.location}.`;
  if (r.type === "Bungalow") return `Private bungalow address in ${r.location}.`;
  return `Luxury residences on ${r.location}.`;
};

export const summariseConfiguration = (
  cfgs: PropertyConfigurations,
  type: PropertyCategory,
): string => {
  if (type === "Plots") return "Residential Plot";
  const bhk: string[] = [];
  const extras: string[] = [];
  for (const k of CONFIG_KEYS) {
    if (!cfgs[k]) continue;
    if (k === "Penthouse" || k === "Duplex") extras.push(k);
    else bhk.push(k.replace(" BHK", ""));
  }
  const bhkStr = bhk.length ? `${bhk.join(", ")} BHK` : "";
  const tail = extras.length ? ` · ${extras.join(" · ")}` : "";
  const prefix = type === "Bungalow" ? "Bungalow · " : "";
  const out = `${prefix}${bhkStr}${tail}`.trim();
  return out || type;
};

// Raw possession values are inconsistent ("RTMI", "1 YEAR", "6 Months") —
// normalise to a clean display string.
export const normalizePossession = (s: string | null | undefined): string => {
  if (!s) return "-";
  const t = s.trim();
  if (/^rtmi$/i.test(t) || /ready|immediate/i.test(t)) return "Ready to Move";
  const m = t.match(/^([\d.]+)\s*(year|month)s?$/i);
  if (m) {
    const n = parseFloat(m[1]);
    const unit = /month/i.test(m[2]) ? "Month" : "Year";
    return `${n} ${unit}${n === 1 ? "" : "s"}`;
  }
  return t;
};

export const parseNumeric = (s: string | null | undefined): number => {
  if (!s) return 0;
  const m = String(s).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
};

export const aggregateArea = (cfgs: PropertyConfigurations, field: "area" | "carpet"): string => {
  const vals = CONFIG_KEYS.flatMap((k) => (cfgs[k] ?? []).map((d) => d[field])).filter(
    (v): v is string => !!v,
  );
  if (vals.length === 0) return "-";
  const nums = vals
    .flatMap((v) => v.split(/[-–]/).map((x) => parseFloat(x.replace(/[^\d.]/g, ""))))
    .filter((n) => !isNaN(n) && n > 0);
  if (nums.length === 0) return vals[0];
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const fmt = (n: number) => n.toLocaleString("en-IN");
  return lo === hi ? `${fmt(lo)} sq ft` : `${fmt(lo)} – ${fmt(hi)} sq ft`;
};

export const buildPriceSummary = (cfgs: PropertyConfigurations): string => {
  // Raw price strings are inconsistent ("10cr+", "2.6-3.4", "12") — take the
  // lowest number across all configs and normalise to "X Cr onwards".
  const nums = CONFIG_KEYS.flatMap((k) =>
    (cfgs[k] ?? []).flatMap((d) => {
      if (!d.price) return [];
      return (String(d.price).match(/[\d.]+/g) ?? [])
        .map(parseFloat)
        .filter((n) => !isNaN(n) && n > 0);
    }),
  );
  if (nums.length === 0) return "Price on Request";
  return `${Math.round(Math.min(...nums) * 100) / 100} Cr onwards`;
};
