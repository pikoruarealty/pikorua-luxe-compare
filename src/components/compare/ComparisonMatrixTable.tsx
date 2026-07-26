import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowUpRight, Check, ChevronDown, Info, Minus } from "lucide-react";
import type { ConfigKey, Property } from "@/types/property";
import { PhotoSlideshow } from "@/components/compare/PhotoSlideshow";
import { VariantSwitcher, VariantValueCell, variantsOf } from "@/components/compare/VariantColumns";
import { useVariantViewStore, variantKey } from "@/stores/variant-view-store";
import { RoomFieldValue } from "@/components/compare/RoomFieldValue";
import { formatAreaNumber, parseBareSqFt, unitLabel } from "@/lib/area-units";
import { livePossessionLabel } from "@/lib/possession-format";
import { priceLabel } from "@/lib/price-format";
import { safeHttpUrl } from "@/lib/utils";
import { calculatePropertyDistances } from "@/lib/distance.functions";
import { useAreaUnitStore } from "@/stores/area-unit-store";

const TERM_INFO: Record<string, { title: string; body: string }> = {
  Developer: {
    title: "Developer",
    body: "A developer is a person or company that plans, builds, and sells projects such as residential apartments, commercial buildings, or townships.",
  },
  Carpet: {
    title: "Carpet Area",
    body: "Carpet Area is the actual usable space inside your home—the area where you can walk, place furniture, and live. It does not include the thickness of walls or common areas like corridors, lifts, or staircases.",
  },
  Possession: {
    title: "Possession Date",
    body: "Possession is the date when the developer hands over the property to the buyer, allowing them to move in or start interior work.",
  },
  Status: {
    title: "Project Status",
    body: "Project Status shows the current stage of the property's construction, such as Under Construction, Nearing Possession, or Ready to Move.",
  },
};

const DASH = "—";

type RoomKey =
  "livingArea" | "kitchen" | "bedroom1" | "bedroom2" | "bedroom3" | "bedroom4" | "bedroom5";

function roomFieldsFor(k: ConfigKey): { key: RoomKey; label: string }[] {
  const bedroomCount: Record<ConfigKey, number> = {
    "4 BHK": 4,
    "5 BHK": 5,
    Penthouse: 5,
    Duplex: 4,
  };
  const n = bedroomCount[k] ?? 4;
  const bedroomKeys: RoomKey[] = ["bedroom1", "bedroom2", "bedroom3", "bedroom4", "bedroom5"];
  const bedrooms = bedroomKeys.slice(0, n).map((key, i) => ({
    key,
    label: `Bedroom ${i + 1}`,
  }));
  return [
    { key: "livingArea", label: "Drawing / Living / Dining" },
    { key: "kitchen", label: "Kitchen" },
    ...bedrooms,
  ];
}

const parseMaxNum = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const nums = String(s)
    .replace(/,/g, "")
    .match(/\d+(\.\d+)?/g);
  if (!nums) return null;
  return Math.max(...nums.map(parseFloat));
};

function bestIndex(values: (number | null)[]): number | null {
  const valid = values.map((v, i) => ({ v, i })).filter((x) => x.v !== null) as {
    v: number;
    i: number;
  }[];
  if (valid.length < 2) return null;
  const max = Math.max(...valid.map((x) => x.v));
  const winners = valid.filter((x) => x.v === max);
  if (winners.length === valid.length) return null;
  return winners[0].i;
}

export function ComparisonMatrixTable({
  items,
  visibleConfigKeys,
  slotBudgetStatus,
  budgetLabel,
}: {
  items: Property[];
  visibleConfigKeys: ConfigKey[];
  slotBudgetStatus: Record<string, "in" | "near" | "far">;
  budgetLabel: string | null;
}) {
  const cols = items.length;
  // Desktop grid layout — only applied at md+ breakpoint
  const gridTpl = cols === 2 ? "md:grid-cols-[200px_1fr_1fr]" : "md:grid-cols-[200px_1fr_1fr_1fr]";
  // Mobile stacked — no min-width needed
  const mobileMinW = "";

  const {
    active: activeVariant,
    expanded: expandedTypes,
    setActive,
    toggleExpanded,
  } = useVariantViewStore();

  const activeIdxFor = (key: ConfigKey, p: Property) => activeVariant[variantKey(key, p.id)] ?? 0;
  const isExpanded = (key: ConfigKey, p: Property) => expandedTypes[variantKey(key, p.id)] ?? false;
  const selectVariant = (key: ConfigKey, p: Property, idx: number) =>
    setActive(variantKey(key, p.id), idx);
  const toggleExpand = (key: ConfigKey, p: Property) => toggleExpanded(variantKey(key, p.id));

  const areaUnit = useAreaUnitStore((s) => s.unit);

  const bestCarpetIdx = useMemo(
    () => bestIndex(items.map((p) => parseMaxNum(p.carpetArea))),
    [items],
  );

  return (
    <div className="overflow-hidden rounded-card border border-border-strong bg-card">
      {/* ─── Desktop: horizontal scroll if needed; Mobile: no scroll ─── */}
      <div className="md:overflow-x-auto">
        <div className="md:min-w-0">
          {/* ─── Mobile-only property name header (stacked, no scroll) ── */}
          <div className="flex gap-2 border-b-2 border-border-strong bg-muted/20 px-3 py-2.5 md:hidden">
            {items.map((p, i) => (
              <div key={p.id} className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-foreground font-semibold text-background"
                  style={{ fontSize: "9px", lineHeight: 0 }}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <p
                  className="min-w-0 font-display leading-tight text-foreground line-clamp-1"
                  style={{ fontSize: "var(--step--2)" }}
                >
                  {p.name}
                </p>
              </div>
            ))}
          </div>

          {/* ─── Desktop header row (unchanged) ─────────────────────── */}
          <div className={`hidden md:grid ${gridTpl} border-b-2 border-border-strong bg-muted/30`}>
            <div
              className="tracking-luxury border-r border-border-strong px-4 py-3 text-muted-foreground"
              style={{ fontSize: "var(--step--2)" }}
            >
              Attribute
            </div>
            {items.map((p, i) => (
              <div
                key={p.id}
                className={`px-4 py-3 ${i > 0 ? "border-l border-border-strong" : ""}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground font-medium text-background"
                    style={{ fontSize: "var(--step--2)" }}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <div className="min-w-0 text-center">
                    <p
                      className="descender-safe font-display leading-tight text-foreground line-clamp-1"
                      style={{ fontSize: "var(--step--1)" }}
                    >
                      {p.name}
                    </p>
                    <p
                      className="tracking-luxury truncate text-muted-foreground"
                      style={{ fontSize: "var(--step--2)" }}
                    >
                      {p.developer}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ─── Table sections ──────────────────────────────────────── */}
          <SectionLabel title="Overview" />
          <Row
            label="Developer"
            items={items}
            gridTpl={gridTpl}
            render={(p) => <Plain value={p.developer} />}
          />
          <Row
            label="Location"
            items={items}
            gridTpl={gridTpl}
            render={(p) => <Plain value={p.location} />}
          />
          <Row
            label="Starting Price"
            items={items}
            gridTpl={gridTpl}
            render={(p) => (
              <p
                className="font-display font-semibold text-champagne md:text-center"
                style={{ fontSize: "var(--step-0)" }}
              >
                {priceLabel(p)}
              </p>
            )}
          />
          <Row
            label="Carpet Area"
            items={items}
            gridTpl={gridTpl}
            render={(p, i) => {
              const sqft = parseBareSqFt(p.carpetArea);
              if (sqft === null) return <Plain value={p.carpetArea} />;
              return (
                <Numeric
                  primary={formatAreaNumber(sqft, areaUnit)}
                  unit={unitLabel(areaUnit)}
                  secondary={p.size ?? undefined}
                  isBest={bestCarpetIdx === i}
                />
              );
            }}
          />
          <Row
            label="Possession"
            items={items}
            gridTpl={gridTpl}
            render={(p) => <Plain value={livePossessionLabel(p.possession, p.possessionAsOf)} />}
          />
          <Row
            label="Status"
            items={items}
            gridTpl={gridTpl}
            render={(p) => <Plain value={p.status} />}
          />

          <SectionLabel title="Distance Calculator" />
          <DistanceCalculator items={items} gridTpl={gridTpl} />

          <SectionLabel title="Specifications & Floorplans" />
          {visibleConfigKeys.map((k) => (
            <RoomDimensionsGroup
              key={k}
              configKey={k}
              status={slotBudgetStatus[k]}
              budgetLabel={budgetLabel}
              items={items}
              gridTpl={gridTpl}
              activeIdxFor={activeIdxFor}
              isExpanded={isExpanded}
              selectVariant={selectVariant}
              toggleExpand={toggleExpand}
            />
          ))}

          <SectionLabel title="RERA Details" />
          <Row
            label="RERA ID"
            items={items}
            gridTpl={gridTpl}
            render={(p) => <RegistrationLink id={p.reraId} url={p.reraUrl} />}
          />

          <SectionLabel title="Amenities & Verdict" />
          <Row
            label="Amenities"
            items={items}
            gridTpl={gridTpl}
            render={(p) => <AmenitiesCell amenities={p.amenities} />}
          />
          <Row
            label="Key Advantages"
            items={items}
            gridTpl={gridTpl}
            render={(p) =>
              p.advantages?.length ? (
                <div className="flex flex-col items-start gap-2 py-1 text-left">
                  {p.advantages.map((adv) => (
                    <div
                      key={adv}
                      className="inline-flex max-w-full items-start gap-2 rounded-xl border border-champagne/30 bg-champagne/10 px-3 py-1.5 font-medium text-champagne"
                      style={{ fontSize: "var(--step--2)" }}
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" />
                      <span className="leading-snug">{adv}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Plain value={null} />
              )
            }
          />
          <Row
            label="Verdict"
            items={items}
            gridTpl={gridTpl}
            render={(p) =>
              p.expertNote ? (
                <p
                  className="leading-relaxed text-foreground/85 md:text-center"
                  style={{ fontSize: "var(--step--1)" }}
                >
                  &ldquo;{p.expertNote}&rdquo;
                </p>
              ) : (
                <Plain value={null} />
              )
            }
          />

          {/* ─── Gallery ─────────────────────────────────────────────── */}
          <SectionLabel title="Gallery" />
          <div
            className="flex md:grid md:grid-cols-[200px_1fr_1fr] md:[&[data-cols='3']]:grid-cols-[200px_1fr_1fr_1fr]"
            data-cols={cols}
          >
            <div
              className="tracking-luxury hidden w-[200px] shrink-0 items-center border-r border-border px-4 py-3 text-muted-foreground md:flex"
              style={{ fontSize: "var(--step--2)" }}
            >
              Photo
            </div>
            {items.map((p, i) => (
              <div
                key={p.id}
                id={`gallery-${p.id}`}
                className={`min-w-[160px] flex-1 p-2.5 md:min-w-0 ${i > 0 ? "border-l border-border" : ""}`}
              >
                <div className="aspect-[16/10] overflow-hidden rounded-card ring-1 ring-border transition-shadow [&.flash]:ring-2 [&.flash]:ring-foreground">
                  <PhotoSlideshow property={p} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Room Dimensions Group ─────────────────────────────────────── */

function RoomDimensionsGroup({
  configKey,
  status,
  budgetLabel,
  items,
  gridTpl,
  activeIdxFor,
  isExpanded,
  selectVariant,
  toggleExpand,
}: {
  configKey: ConfigKey;
  status: "in" | "near" | "far" | undefined;
  budgetLabel: string | null;
  items: Property[];
  gridTpl: string;
  activeIdxFor: (key: ConfigKey, p: Property) => number;
  isExpanded: (key: ConfigKey, p: Property) => boolean;
  selectVariant: (key: ConfigKey, p: Property, idx: number) => void;
  toggleExpand: (key: ConfigKey, p: Property) => void;
}) {
  const collapsible = status === "near" || status === "far";
  const [expanded, setExpanded] = useState(false);
  const showFields = !collapsible || expanded;

  const headerTone =
    status === "in"
      ? "border-y border-emerald-600/25 bg-emerald-600/10"
      : status === "near"
        ? "border-y border-amber-500/25 bg-amber-500/10"
        : status === "far"
          ? "border-y border-red-600/25 bg-red-600/10"
          : "border-y border-border-strong bg-muted/50";

  return (
    <div>
      {/* BHK header strip — full width, no sticky column needed */}
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 ${headerTone}`}>
        <div className="flex items-center gap-2">
          <span
            className="font-display font-bold tracking-tight text-foreground"
            style={{ fontSize: "var(--step-0)" }}
          >
            {configKey}
          </span>
          {status === "in" && budgetLabel && (
            <span
              className="tracking-luxury rounded-full bg-emerald-600/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400"
              style={{ fontSize: "var(--step--2)" }}
            >
              In selected range
            </span>
          )}
          {status === "near" && budgetLabel && (
            <span
              className="tracking-luxury rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-400"
              style={{ fontSize: "var(--step--2)" }}
            >
              Slightly above range
            </span>
          )}
          {status === "far" && budgetLabel && (
            <span
              className="tracking-luxury rounded-full bg-red-600/15 px-2 py-0.5 font-semibold text-red-700 dark:text-red-400"
              style={{ fontSize: "var(--step--2)" }}
            >
              Well above range
            </span>
          )}
        </div>
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="tracking-luxury inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
            style={{ fontSize: "var(--step--2)" }}
          >
            {expanded ? "Hide details" : "View details"}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Layout variant switcher row */}
      {showFields && items.some((p) => variantsOf(p, configKey).length > 1) && (
        <div
          className={`compare-row flex md:grid ${gridTpl} border-b border-border-strong bg-muted/25`}
        >
          {/* Sticky label — visible on mobile too so users know what the chips are */}
          <div className="sticky left-0 z-10 w-[110px] shrink-0 border-r border-border-strong bg-[var(--sticky-col-bg)] px-2.5 py-2 md:static md:w-auto md:bg-transparent">
            <span
              className="tracking-luxury text-muted-foreground"
              style={{ fontSize: "var(--step--2)" }}
            >
              Layout
            </span>
          </div>
          {items.map((p, i) => (
            <div
              key={p.id}
              className={`min-w-[190px] flex-1 px-2.5 py-2 md:min-w-0 md:px-4 ${i > 0 ? "border-l border-border-strong" : ""}`}
            >
              <VariantSwitcher
                property={p}
                variants={variantsOf(p, configKey)}
                activeIdx={activeIdxFor(configKey, p)}
                expanded={isExpanded(configKey, p)}
                onSelect={(idx) => selectVariant(configKey, p, idx)}
                onToggleExpand={() => toggleExpand(configKey, p)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Room dimension rows */}
      {showFields &&
        roomFieldsFor(configKey).map(({ key, label }) => (
          <Row
            key={`${configKey}-${key}`}
            label={label}
            items={items}
            gridTpl={gridTpl}
            render={(p) => {
              const variants = variantsOf(p, configKey);
              if (variants.length === 0) return <NotAvail />;
              return (
                <VariantValueCell
                  variants={variants}
                  activeIdx={activeIdxFor(configKey, p)}
                  expanded={isExpanded(configKey, p)}
                  onSelect={(idx) => selectVariant(configKey, p, idx)}
                  render={(v) =>
                    v[key] ? (
                      <div
                        className="leading-snug text-foreground md:text-center"
                        style={{ fontSize: "var(--step--1)" }}
                      >
                        <RoomFieldValue value={v[key]} />
                      </div>
                    ) : (
                      <Plain value={null} />
                    )
                  }
                />
              );
            }}
          />
        ))}
    </div>
  );
}

/* ─── Primitives ────────────────────────────────────────────────── */

function SectionLabel({ title }: { title: string }) {
  return (
    <div className="border-y-2 border-border-strong bg-muted/70 px-4 py-2.5">
      <span
        className="tracking-luxury font-semibold text-foreground/70"
        style={{ fontSize: "var(--step--2)" }}
      >
        {title}
      </span>
    </div>
  );
}

/**
 * A single data row.
 *
 * Mobile layout  — flexbox with a sticky left label column (110 px) and
 *   min-width property columns (190 px each), all inside the parent's
 *   overflow-x-auto scroll container.
 *
 * Desktop layout — CSS grid via `gridTpl` (md:grid-cols-[200px_1fr_1fr…]).
 */
function Row({
  label,
  items,
  gridTpl,
  render,
  colTpl,
}: {
  label: string;
  items: Property[];
  gridTpl: string;
  render: (p: Property, i: number) => React.ReactNode;
  /** Desktop-only column override for fanned-out variant expansion. */
  colTpl?: string;
}) {
  const info = TERM_INFO[label];
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`compare-row border-b border-border last:border-b-0 md:grid ${gridTpl}`}
      style={colTpl ? ({ "--row-cols": colTpl } as React.CSSProperties) : undefined}
    >
      {/* ── Label cell — full-width on mobile, grid col on desktop ── */}
      <div className="flex w-full items-center gap-1.5 border-b border-border-strong bg-muted/10 px-3 py-2 md:w-auto md:border-b-0 md:border-r md:bg-muted/10 md:px-4 md:py-3">
        <span
          className="font-display font-medium tracking-tight text-champagne/70"
          style={{ fontSize: "var(--step--2)" }}
        >
          {label}
        </span>
        {info && (
          <>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-champagne/40 text-champagne/70 transition-colors hover:border-champagne hover:text-champagne"
              aria-label={`More about ${label}`}
              title={`More about ${label}`}
            >
              <Info className="h-2.5 w-2.5" />
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display" style={{ fontSize: "var(--step-1)" }}>
                    {info.title}
                  </DialogTitle>
                  <DialogDescription
                    className="pt-2 leading-relaxed text-foreground/80"
                    style={{ fontSize: "var(--step--1)" }}
                  >
                    {info.body}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      {/* ── Property value cells ──────────────────────────────────── */}
      <div className="flex md:contents">
        {items.map((p, i) => (
          <div
            key={p.id}
            className={`flex-1 px-3 py-3 md:px-4 ${i > 0 ? "border-l border-border-strong" : ""}`}
          >
            {render(p, i)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Plain({ value, italic }: { value: string | null | undefined; italic?: boolean }) {
  return (
    <p
      className={`leading-snug text-foreground md:text-center ${italic ? "text-foreground/75" : ""}`}
      style={{ fontSize: "var(--step--1)" }}
    >
      {value ?? DASH}
    </p>
  );
}

function DistanceCalculator({ items, gridTpl }: { items: Property[]; gridTpl: string }) {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [distances, setDistances] = useState<Record<string, number | null>>({});

  const handleCalculate = async () => {
    if (!address.trim() || status === "loading") return;
    setStatus("loading");
    try {
      const result = await calculatePropertyDistances({
        data: {
          address,
          properties: items.map((p) => ({
            id: p.id,
            address: [p.location, p.city, p.state].filter(Boolean).join(", "),
          })),
        },
      });
      if (result.ok) {
        setDistances(result.distancesKm);
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <div className="border-b border-border bg-muted/10 px-4 py-3">
        <p className="mb-2 text-muted-foreground" style={{ fontSize: "var(--step--1)" }}>
          Enter a landmark or neighbourhood — we'll show you how far each residence is. No exact
          location or map is used.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCalculate()}
            placeholder="e.g. Prahlad Nagar, Ahmedabad"
            className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-[16px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-champagne md:text-sm"
          />
          <button
            type="button"
            onClick={handleCalculate}
            disabled={!address.trim() || status === "loading"}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 font-medium tracking-wide text-background transition hover:opacity-85 disabled:opacity-50"
            style={{ fontSize: "var(--step--2)" }}
          >
            {status === "loading" ? "Calculating…" : "Calculate distance"}
          </button>
        </div>
        {status === "error" && (
          <p className="mt-2 text-red-600 dark:text-red-400" style={{ fontSize: "var(--step--1)" }}>
            Couldn&apos;t locate that address. Try adding more detail (area, city).
          </p>
        )}
      </div>
      <Row
        label="Distance"
        items={items}
        gridTpl={gridTpl}
        render={(p) => {
          if (status === "idle" || status === "error") return <Plain value={null} />;
          if (status === "loading") return <Plain value="Calculating…" italic />;
          const km = distances[p.id];
          return <Plain value={km !== null && km !== undefined ? `~${km} km away` : null} />;
        }}
      />
    </>
  );
}

function RegistrationLink({
  id,
  url,
}: {
  id: string | null | undefined;
  url: string | null | undefined;
}) {
  if (!id) return <Plain value={null} />;
  // The URL is developer-submitted; only render it as a link when it's a safe
  // http(s) address, otherwise show the RERA id as plain text (no href sink).
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return <Plain value={id} />;
  return (
    <a
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 leading-snug text-foreground underline decoration-border-strong underline-offset-2 transition-colors hover:text-champagne md:justify-center"
      style={{ fontSize: "var(--step--1)" }}
    >
      {id}
      <ArrowUpRight className="h-3 w-3 shrink-0" />
    </a>
  );
}

function AmenitiesCell({ amenities }: { amenities: string[] }) {
  if (!amenities.length) return <Plain value={null} />;
  return (
    <p
      className="leading-relaxed text-foreground/85 md:text-center"
      style={{ fontSize: "var(--step--1)" }}
    >
      {amenities.join(" · ")}
    </p>
  );
}

function NotAvail() {
  return (
    <span
      className="inline-flex items-center gap-1 text-muted-foreground md:flex md:justify-center"
      style={{ fontSize: "var(--step--1)" }}
    >
      <Minus className="h-3 w-3" /> Not available
    </span>
  );
}

function Numeric({
  primary,
  unit,
  secondary,
  isBest,
}: {
  primary: string;
  unit?: string;
  secondary?: string;
  isBest?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 md:justify-center">
      <p
        className={`font-display leading-tight ${isBest ? "font-semibold text-foreground" : "text-foreground/90"}`}
        style={{ fontSize: "var(--step-0)" }}
      >
        {primary}
        {unit && (
          <span
            className="ml-1 tracking-wide text-muted-foreground"
            style={{ fontSize: "var(--step--2)" }}
          >
            {unit}
          </span>
        )}
      </p>
      {secondary && (
        <span className="text-muted-foreground" style={{ fontSize: "var(--step--2)" }}>
          · {secondary}
        </span>
      )}
    </div>
  );
}
