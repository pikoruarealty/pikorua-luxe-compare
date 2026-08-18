import type { ReactNode } from "react";
import { Minus } from "lucide-react";

import type { ConsumerComparison, GatedComparisonProperty } from "@/contracts/consumer";

type ComparisonProperty = ConsumerComparison["properties"][number];

const DASH = "—";

function areaUnitLabel(unit: string | null | undefined) {
  if (unit === "sq_ft") return "sq ft";
  if (unit === "sq_m") return "sq m";
  if (unit === "sq_yd") return "sq yd";
  if (unit === "acre") return "acre";
  if (unit === "gaj") return "gaj";
  return "";
}

function areaBasisLabel(basis: string | null | undefined) {
  if (basis === "carpet") return "carpet";
  if (basis === "built_up") return "built-up";
  if (basis === "super_built_up") return "super built-up";
  return null;
}

/**
 * Nine-section comparison matrix on the two-tier v2 contract (Part 6, Phase
 * 2). Public rows always render for every visitor. Gated rows render a
 * skeleton bar — never a fabricated number — until the visitor's `gated`
 * payload is present (D4).
 */
export function ComparisonMatrixTableV2({
  items,
  selectedConfigId,
  onSelectConfig,
}: {
  items: ComparisonProperty[];
  selectedConfigId: Record<string, string | null>;
  onSelectConfig: (propertyId: string, configId: string) => void;
}) {
  const cols = items.length;
  const gridTpl = cols === 2 ? "md:grid-cols-[220px_1fr_1fr]" : "md:grid-cols-[220px_1fr_1fr_1fr]";

  const configOf = (item: ComparisonProperty) =>
    item.configurations.find((c) => c.id === selectedConfigId[item.property.id]) ??
    item.configurations[0];

  const gatedConfigOf = (item: ComparisonProperty) => {
    const configId = configOf(item)?.id;
    return item.gated?.configurations.find((c) => c.id === configId) ?? null;
  };

  return (
    <div className="overflow-hidden rounded-card border border-border-strong bg-card">
      <div className="md:overflow-x-auto">
        <div className="md:min-w-0">
          <div className={`hidden md:grid ${gridTpl} border-b-2 border-border-strong bg-muted/30`}>
            <div className="tracking-luxury border-r border-border-strong px-4 py-3 text-xs text-muted-foreground">
              Attribute
            </div>
            {items.map((item, i) => (
              <div
                key={item.property.id}
                className={`px-4 py-3 text-center ${i > 0 ? "border-l border-border-strong" : ""}`}
              >
                <p className="font-display text-sm leading-tight text-foreground line-clamp-1">
                  {item.property.name}
                </p>
                <p className="tracking-luxury truncate text-xs text-muted-foreground">
                  {item.property.developerName ?? "Developer not stated"}
                </p>
              </div>
            ))}
          </div>

          <SectionLabel title="IDENTITY" />
          <Row
            label="Developer"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={item.property.developerName} />}
          />
          <Row
            label="Property Type"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={item.property.propertyType} />}
          />
          <Row
            label="Locality"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={item.property.locality ?? item.property.cityName} />}
          />
          <Row
            label="Starting Price Band"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={item.property.priceBandLabel} />}
          />
          <Row
            label="Background"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.background ?? undefined} />
            )}
          />

          <SectionLabel title="PROJECT STRUCTURE" />
          <Row
            label="Total Towers"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={numOrNull(item.publicFacts.totalTowers)} />}
          />
          <Row
            label="Total Floors"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={numOrNull(item.publicFacts.totalFloors)} />}
          />
          <Row
            label="Units per Floor"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={numOrNull(item.publicFacts.unitsPerFloor)} />}
          />
          <Row
            label="Total Units"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={numOrNull(item.publicFacts.totalUnits)} />}
          />
          <Row
            label="Plot Size"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText
                gated={item.gated}
                field={item.gated?.plotSizeValue ?? undefined}
                format={(value) =>
                  `${value} ${areaUnitLabel(item.gated?.plotSizeUnit.value ?? null)}`.trim()
                }
              />
            )}
          />
          <Row
            label="Density (Units per Acre)"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.unitsPerAcre ?? undefined} />
            )}
          />
          <Row
            label="Open Space"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText
                gated={item.gated}
                field={item.gated?.openSpacePercent ?? undefined}
                format={(value) => `${value}%`}
              />
            )}
          />

          <SectionLabel title="CONFIGURATIONS" />
          {items.some((item) => item.configurations.length > 1) && (
            <Row
              label="Layout"
              items={items}
              gridTpl={gridTpl}
              render={(item) =>
                item.configurations.length > 1 ? (
                  <select
                    value={configOf(item)?.id ?? ""}
                    onChange={(event) => onSelectConfig(item.property.id, event.target.value)}
                    className="mx-auto block h-9 w-full max-w-[180px] rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                  >
                    {item.configurations.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.displayName}
                        {option.variantName ? ` · ${option.variantName}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Plain value={item.configurations[0]?.displayName ?? null} />
                )
              }
            />
          )}
          <Row
            label="Area"
            items={items}
            gridTpl={gridTpl}
            render={(item) => {
              const configuration = configOf(item);
              if (!configuration || configuration.areaValue === null) return <NotAvail />;
              return (
                <Numeric
                  primary={String(configuration.areaValue)}
                  unit={areaUnitLabel(configuration.areaUnit)}
                  secondary={areaBasisLabel(configuration.areaBasis) ?? undefined}
                />
              );
            }}
          />
          <Row
            label="Budget Fit"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={fitLabel(configOf(item)?.fit ?? item.fit)} />}
          />
          <Row
            label="Bathrooms"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={gatedConfigOf(item)?.bathrooms} />
            )}
          />
          <Row
            label="Balconies"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={gatedConfigOf(item)?.balconies} />
            )}
          />
          <Row
            label="Servant Room"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText
                gated={item.gated}
                field={gatedConfigOf(item)?.servantRoom}
                format={(value) => (value ? "Yes" : "No")}
              />
            )}
          />
          <Row
            label="Rate"
            items={items}
            gridTpl={gridTpl}
            render={(item) => {
              if (!item.gated) return <SkeletonBar />;
              const configuration = gatedConfigOf(item);
              if (!configuration || configuration.rateRupeesPerSqFt === null) return <NotAvail />;
              return (
                <div className="text-center">
                  <Numeric
                    primary={`₹${configuration.rateRupeesPerSqFt.toLocaleString("en-IN")}`}
                    unit={`/ ${areaUnitLabel("sq_ft")} ${areaBasisLabel(configuration.rateAreaBasis) ?? ""}`}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Basic rate — excludes floor rise, PLC and other charges.
                  </p>
                </div>
              );
            }}
          />

          <SectionLabel title="ROOM DIMENSIONS" />
          <Row
            label="Rooms"
            items={items}
            gridTpl={gridTpl}
            render={(item) => {
              if (!item.gated) return <SkeletonBar />;
              const rooms = gatedConfigOf(item)?.rooms ?? [];
              if (!rooms.length) return <NotAvail />;
              return (
                <ul className="flex flex-col gap-1 text-center text-xs text-foreground/85">
                  {rooms.map((room) => (
                    <li key={room.roomType}>
                      <span className="text-muted-foreground">{room.roomType}: </span>
                      {room.state === "explicitly_not_offered"
                        ? "Not offered"
                        : (room.dimensionRaw ??
                          (room.areaValue ? `${room.areaValue} sq ft` : DASH))}
                    </li>
                  ))}
                </ul>
              );
            }}
          />

          <SectionLabel title="CONSTRUCTION & AMENITIES" />
          <Row
            label="Amenities"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <AmenitiesCell
                amenities={item.publicFacts.amenities}
                other={item.publicFacts.amenitiesOther}
              />
            )}
          />
          <Row
            label="Parking Levels"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.parkingLevels ?? undefined} />
            )}
          />
          <Row
            label="Podium Structure"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.podiumStructure ?? undefined} />
            )}
          />
          <Row
            label="Lifts per Tower"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.liftsPerTower ?? undefined} />
            )}
          />
          <Row
            label="Clubhouse Size"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText
                gated={item.gated}
                field={item.gated?.clubhouseSizeSqFt ?? undefined}
                format={(value) => `${value} sq ft`}
              />
            )}
          />
          <Row
            label="Internal Ceiling Height"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText
                gated={item.gated}
                field={item.gated?.internalCeilingHeightFt ?? undefined}
                format={(value) =>
                  `${value} ft${item.gated && item.gated.ceilingHeightBasis !== "not_stated" ? ` (${item.gated.ceilingHeightBasis.replace("_", " ")})` : ""}`
                }
              />
            )}
          />
          <Row
            label="Construction Quality"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.constructionQuality ?? undefined} />
            )}
          />
          <Row
            label="Flooring"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.flooringType ?? undefined} />
            )}
          />
          <Row
            label="Window Glazing"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.windowGlazing ?? undefined} />
            )}
          />
          <Row
            label="Bath & Sanitary Fittings"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.bathSanitaryFittings ?? undefined} />
            )}
          />
          <Row
            label="VRV / AC Provision"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.vrvAcProvision ?? undefined} />
            )}
          />
          <Row
            label="Geyser Provision"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.geyserProvision ?? undefined} />
            )}
          />

          <SectionLabel title="LOCATION & TIMELINE" />
          <Row
            label="Possession Date"
            items={items}
            gridTpl={gridTpl}
            render={(item) => <Plain value={item.property.possessionDate} />}
          />
          <Row
            label="Proposed Start Date (RERA)"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText
                gated={item.gated}
                field={item.gated?.proposedStartDateRera ?? undefined}
              />
            )}
          />
          <Row
            label="Possession Confirmed As Of"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText
                gated={item.gated}
                field={item.gated?.possessionConfirmedAsOf ?? undefined}
              />
            )}
          />

          <SectionLabel title="DEVELOPER" />
          <Row
            label="Experience (Years)"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.experienceYears ?? undefined} />
            )}
          />
          <Row
            label="Delivered Projects"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.deliveredProjects ?? undefined} />
            )}
          />
          <Row
            label="Ongoing Projects"
            items={items}
            gridTpl={gridTpl}
            render={(item) => (
              <GatedText gated={item.gated} field={item.gated?.ongoingProjects ?? undefined} />
            )}
          />
          <Row
            label="Notable Delivered Projects"
            items={items}
            gridTpl={gridTpl}
            render={(item) => {
              if (!item.gated) return <SkeletonBar />;
              const field = item.gated.notableDeliveredProjects;
              if (field.state === "explicitly_not_offered") return <NotAvail label="Not offered" />;
              if (!field.value?.length) return <NotAvail />;
              return (
                <ol className="list-decimal pl-4 text-left text-xs text-foreground/85 md:list-none md:pl-0 md:text-center">
                  {field.value.map((project) => (
                    <li key={project}>{project}</li>
                  ))}
                </ol>
              );
            }}
          />

          <SectionLabel title="DISTINCTIONS" />
          <Row
            label="Specifications"
            items={items}
            gridTpl={gridTpl}
            render={(item) => {
              if (!item.gated) return <SkeletonBar />;
              if (!item.gated.specifications.length) return <NotAvail />;
              return (
                <ul className="flex flex-col gap-1 text-left text-xs text-foreground/85 md:text-center">
                  {item.gated.specifications.map((specification) => (
                    <li key={specification.code}>
                      <span className="text-muted-foreground">{specification.displayName}: </span>
                      {specification.state === "explicitly_not_offered"
                        ? "Not offered"
                        : (specification.valueText ?? DASH)}
                    </li>
                  ))}
                </ul>
              );
            }}
          />
          <div className="border-t border-border px-4 py-2.5">
            <p className="text-[10px] text-muted-foreground/60">
              All areas and dimensions are approximate, as verified by PropCompare from the
              developer's brochure.
            </p>
          </div>

          <SectionLabel title="GALLERY" />
          <div className={`flex md:grid ${gridTpl}`}>
            <div className="tracking-luxury hidden items-center border-r border-border px-4 py-3 text-xs text-muted-foreground md:flex">
              Photo
            </div>
            {items.map((item, i) => (
              <div
                key={item.property.id}
                className={`min-w-[160px] flex-1 p-2.5 md:min-w-0 ${i > 0 ? "border-l border-border" : ""}`}
              >
                <div className="aspect-[16/10] overflow-hidden rounded-card ring-1 ring-border">
                  {item.property.heroImageUrl ? (
                    <img
                      src={item.property.heroImageUrl}
                      alt={item.property.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Approved media pending
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function fitLabel(fit: string | undefined) {
  if (fit === "within") return "Matches selected budget";
  if (fit === "slightly_above") return "Slightly above selected budget";
  if (fit === "well_above") return "Well above selected budget";
  if (fit === "slightly_below") return "Slightly below selected budget";
  if (fit === "well_below") return "Well below selected budget";
  return "Commercial fit unavailable";
}

function numOrNull(value: number | null): string | null {
  return value === null ? null : String(value);
}

function SectionLabel({ title }: { title: string }) {
  return (
    <div className="border-y-2 border-border-strong bg-muted/70 px-4 py-2.5">
      <span className="tracking-luxury text-xs font-semibold text-foreground/70">{title}</span>
    </div>
  );
}

function Row({
  label,
  items,
  gridTpl,
  render,
}: {
  label: string;
  items: ComparisonProperty[];
  gridTpl: string;
  render: (item: ComparisonProperty, index: number) => ReactNode;
}) {
  return (
    <div className={`compare-row border-b border-border last:border-b-0 md:grid ${gridTpl}`}>
      <div className="flex w-full items-center border-b border-border-strong bg-muted/10 px-3 py-1.5 sm:py-2 md:w-auto md:border-b-0 md:border-r md:px-4 md:py-3">
        <span className="font-display text-xs font-medium tracking-tight text-champagne/70">
          {label}
        </span>
      </div>
      <div className="flex md:contents">
        {items.map((item, i) => (
          <div
            key={item.property.id}
            className={`min-w-0 flex-1 px-2 py-2.5 sm:px-3 sm:py-3 md:px-4 ${i > 0 ? "border-l border-border-strong" : ""}`}
          >
            {render(item, i)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Plain({ value }: { value: string | null | undefined }) {
  return <p className="text-center text-xs leading-snug text-foreground">{value ?? DASH}</p>;
}

function NotAvail({ label = "Not stated" }: { label?: string }) {
  return (
    <span className="inline-flex w-full items-center justify-center gap-1 text-center text-xs text-muted-foreground">
      <Minus className="h-3 w-3" /> {label}
    </span>
  );
}

function Numeric({
  primary,
  unit,
  secondary,
}: {
  primary: string;
  unit?: string;
  secondary?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-center gap-1 text-center">
      <p className="font-display text-sm leading-tight text-foreground/90">
        {primary}
        {unit && <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>}
      </p>
      {secondary && <span className="text-[10px] text-muted-foreground">· {secondary}</span>}
    </div>
  );
}

function AmenitiesCell({
  amenities,
  other,
}: {
  amenities: { displayName: string }[];
  other: string | null;
}) {
  if (!amenities.length && !other) return <Plain value={null} />;
  return (
    <p className="text-center text-xs leading-relaxed text-foreground/85">
      {[...amenities.map((amenity) => amenity.displayName), other].filter(Boolean).join(" · ")}
    </p>
  );
}

/** D4: locked gated data renders a skeleton bar, never a fabricated value. */
function SkeletonBar() {
  return <div className="mx-auto h-3.5 w-16 animate-pulse rounded bg-muted" />;
}

/** `not_stated` and `explicitly_not_offered` must stay visibly distinct
 *  (Part 8, guardrail 8) — the latter renders as "Not offered", not a dash. */
function GatedText<Value>({
  gated,
  field,
  format,
}: {
  gated: GatedComparisonProperty | null;
  field: { value: Value; state: string } | undefined;
  format?: (value: NonNullable<Value>) => string;
}) {
  if (!gated) return <SkeletonBar />;
  if (!field || field.state === "not_stated" || field.value === null) return <NotAvail />;
  if (field.state === "explicitly_not_offered") return <NotAvail label="Not offered" />;
  const formatted = format ? format(field.value as NonNullable<Value>) : String(field.value);
  return <Plain value={formatted} />;
}
