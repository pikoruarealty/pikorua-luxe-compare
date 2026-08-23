import type { PropertyFormValues } from "@/lib/property-schema";
import { CONFIG_BUCKETS, VARIANT_FIELDS } from "@/lib/property-schema";
import type { AreaUnit, ConfigurationKind } from "@/generated/property-contract";
import { toSqFt } from "./units";
import type { PublicationRevision } from "./publication";

const BUCKET_TO_KIND: Record<(typeof CONFIG_BUCKETS)[number]["key"], ConfigurationKind> = {
  bhk2: "2_bhk",
  bhk3: "3_bhk",
  bhk4: "4_bhk",
  bhk5: "5_bhk",
  bhk6: "6_bhk",
  bhk7: "7_bhk",
  penthouse: "penthouse",
  duplex: "duplex",
};

const ROOM_LABELS = new Set([
  "livingArea",
  "kitchen",
  "bedroom1",
  "bedroom2",
  "bedroom3",
  "bedroom4",
  "bedroom5",
]);

function nz(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length ? trimmed : null;
}

function parseNumberOrNull(value: string | null | undefined): number | null {
  const trimmed = nz(value);
  if (!trimmed) return null;
  const match = trimmed.replace(/,/g, "").match(/[\d.]+/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The unit a brochure printed an area in, read off the text next to the
 *  number. Gujarat plan books quote carpet areas in square metres about as
 *  often as in square feet — "133.93 SQ.MT.", "383.62 Sq. Mtr." — and a few
 *  quote land in sq. yards / gaj or acres.
 *
 *  Null means the string named no unit at all ("4615", "2156.20"). That is not
 *  the same as "square feet": it is an unstated unit that only happens to be
 *  square feet most of the time. Callers decide what to do with that; this
 *  function will not guess on their behalf. */
function parseAreaUnit(value: string | null | undefined): AreaUnit | null {
  const t = (value ?? "").toLowerCase();
  // Metres first: "sq. mtr." also contains "sq. m", and testing the shorter
  // pattern first would still be correct here, but ordering longest-first keeps
  // this robust if abbreviations are added later.
  if (/\bsq\.?\s*(m|mt|mtr|mtrs|mts|metre|meter)s?\.?\b/.test(t)) return "sq_m";
  if (/\bsq\.?\s*(ft|feet|foot)\.?\b/.test(t)) return "sq_ft";
  if (/\bgaj\b/.test(t)) return "gaj";
  if (/\bsq\.?\s*(yd|yds|yard)s?\.?\b/.test(t)) return "sq_yd";
  if (/\bacres?\b/.test(t)) return "acre";
  return null;
}

/** An area as a number of square feet, whatever unit the brochure printed it
 *  in. Every area column downstream is declared `sq_ft`, so a value parsed out
 *  of "133.93 SQ.MT." has to be converted before it is stored under that
 *  label — publishing it unconverted turned a 1,441 sq ft home into a 134 sq ft
 *  one, on the very field the comparison surface ranks by.
 *
 *  A string with no unit is taken as already being square feet. That is the
 *  brochure convention this catalogue is built on and matches what the admin
 *  form's own "Super built-up (sq ft)" inputs mean, so it is an assumption
 *  about the source rather than a conversion — but it is stated here so the
 *  next person reading a suspicious number knows where to look. */
function parseAreaSqFtOrNull(value: string | null | undefined): number | null {
  const parsed = parseNumberOrNull(value);
  if (parsed === null) return null;
  const unit = parseAreaUnit(value);
  return unit === null ? parsed : toSqFt(parsed, unit);
}

function parseIntOrNull(value: string | null | undefined): number | null {
  const parsed = parseNumberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}

// Free-text brochure dates ("Jan 2025") can't be safely coerced into an ISO
// calendar date — only already-ISO values (e.g. from a <input type="date">)
// are trusted, everything else is treated as not stated rather than guessed.
function toIsoDateOrNull(value: string | null | undefined): string | null {
  const trimmed = nz(value);
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function fieldState(value: unknown): "stated" | "not_stated" {
  if (value === null || value === undefined) return "not_stated";
  if (typeof value === "string") return value.trim().length ? "stated" : "not_stated";
  if (Array.isArray(value)) return value.length ? "stated" : "not_stated";
  return "stated";
}

/** Best-effort yes/no read of a free-text "is there a servant room" answer —
 *  the form has never captured this as a checkbox, only prose. */
function parseServantRoomPresent(value: string | null | undefined): boolean | null {
  const trimmed = nz(value);
  if (!trimmed) return null;
  return !/^no\b/i.test(trimmed);
}

const AREA_BUCKET_FIELDS = [
  { name: "area" as const, basis: "super_built_up" as const },
  { name: "carpet" as const, basis: "carpet" as const },
  { name: "builtUpArea" as const, basis: "built_up" as const },
];

type ConfigDetail = PropertyFormValues["configs"]["bhk3"][number];

function mapConfiguration(
  detail: ConfigDetail,
  kind: ConfigurationKind,
  optionId: string,
): PublicationRevision["configurations"][number] {
  const areas = AREA_BUCKET_FIELDS.map(({ name, basis }) => {
    const raw = detail[name];
    const value = parseAreaSqFtOrNull(raw);
    return {
      basis,
      value,
      unit: value !== null ? ("sq_ft" as const) : null,
      rawText: nz(raw),
      state: fieldState(value),
    };
  }).filter((area) => area.state === "stated");

  const rooms = VARIANT_FIELDS.filter((field) => ROOM_LABELS.has(field.name)).map((field) => {
    const raw = detail[field.name as keyof ConfigDetail] as string | null;
    // A room is nearly always printed as a dimension pair — "18x14", "5.20 X
    // 4.30 M" — which is not an area, and taking the first number out of it
    // published an 18 sq ft living room. Multiplying the two sides would be
    // stating an area the brochure never printed, so a dimension yields no
    // areaValue at all; `dimensionRaw` still carries exactly what was on the
    // page. Only a room genuinely quoted as a single area keeps a number.
    const isDimensionPair = /\d\s*[x×]\s*\d/i.test(raw ?? "");
    const areaValue = isDimensionPair ? null : parseAreaSqFtOrNull(raw);
    return {
      roomType: field.label,
      dimensionRaw: nz(raw),
      areaValue,
      areaUnit: areaValue !== null ? ("sq_ft" as const) : null,
      state: fieldState(nz(raw)),
    };
  });

  const primaryArea = detail.area ?? detail.builtUpArea ?? detail.carpet ?? null;
  const primaryAreaValue = parseAreaSqFtOrNull(primaryArea);
  const primaryAreaBasis = detail.area
    ? ("super_built_up" as const)
    : detail.builtUpArea
      ? ("built_up" as const)
      : detail.carpet
        ? ("carpet" as const)
        : null;

  const priceValue = parseNumberOrNull(detail.price);

  return {
    optionId,
    kind,
    variantName: nz(detail.type),
    areaValue: primaryAreaValue,
    areaBasis: primaryAreaValue !== null ? primaryAreaBasis : null,
    areaUnit: primaryAreaValue !== null ? "sq_ft" : null,
    areaState: fieldState(primaryAreaValue),
    bathrooms: parseIntOrNull(detail.bathrooms),
    bathroomsState: fieldState(nz(detail.bathrooms)),
    balconies: parseIntOrNull(detail.balconies),
    balconiesState: fieldState(nz(detail.balconies)),
    servantRoomPresent: parseServantRoomPresent(detail.servantRoom),
    servantRoomState: fieldState(nz(detail.servantRoom)),
    floorPlanPage: null,
    floorPlanPageState: "not_stated",
    // publicFacts is a free-form bag (no dedicated column) — plot size only
    // applies to a subset of variants (villas/plots), so it doesn't warrant
    // a first-class field on every configuration row.
    publicFacts: nz(detail.plotSize) ? { plotSize: nz(detail.plotSize) } : {},
    areas,
    rooms,
    commercial: {
      baseSalePriceRupees: priceValue !== null ? Math.round(priceValue * 1e7) : null,
      rateRupeesPerSqFt: parseNumberOrNull(detail.rate),
      rateAreaBasis: null,
    },
  };
}

export interface PublicationMappingLookup {
  /** configurationKind -> configurationOptions.id, for every kind the
   *  taxonomy defines (not just the 5 BHK buckets), so plot/bungalow
   *  properties can be mapped too. */
  configurationOptionsByKind: Map<ConfigurationKind, string>;
  marketId: string;
  stateCode: string;
  cityCode: string;
}

const CATEGORY_TO_PROPERTY_TYPE: Record<
  PropertyFormValues["category"],
  "apartment" | "villa" | "bungalow" | "plot"
> = {
  Apartment: "apartment",
  Villa: "villa",
  Bungalow: "bungalow",
  Plots: "plot",
};

const CATEGORY_TO_CONFIG_KIND: Record<"Villa" | "Bungalow" | "Plots", ConfigurationKind> = {
  Villa: "villa",
  Bungalow: "bungalow",
  Plots: "plot",
};

export function buildPublicationRevision(
  rawValues: PropertyFormValues,
  lookup: PublicationMappingLookup,
): PublicationRevision {
  // Submissions saved before these three fields existed were stored as JSON
  // without them — a plain cast back to PropertyFormValues leaves them
  // `undefined` at runtime even though the type says `string`.
  const values: PropertyFormValues = {
    ...rawValues,
    ceilingHeightBasis: rawValues.ceilingHeightBasis ?? "not_stated",
    possessionConfirmedAsOf: rawValues.possessionConfirmedAsOf ?? "",
    amenitiesOther: rawValues.amenitiesOther ?? "",
  };

  const configurations: PublicationRevision["configurations"] = [];

  for (const bucket of CONFIG_BUCKETS) {
    const kind = BUCKET_TO_KIND[bucket.key];
    const optionId = lookup.configurationOptionsByKind.get(kind);
    if (!optionId) continue;
    for (const detail of values.configs[bucket.key]) {
      const hasAnyValue = Object.values(detail).some((value) =>
        Array.isArray(value) ? false : nz(value as string | null) !== null,
      );
      if (!hasAnyValue) continue;
      configurations.push(mapConfiguration(detail, kind, optionId));
    }
  }

  const isPlotLike =
    values.category === "Villa" || values.category === "Bungalow" || values.category === "Plots";
  if (isPlotLike && configurations.length === 0) {
    const kind = CATEGORY_TO_CONFIG_KIND[values.category as "Villa" | "Bungalow" | "Plots"];
    const optionId = lookup.configurationOptionsByKind.get(kind);
    // Plot areas are quoted in sq. yards and gaj as often as in square feet,
    // so they go through the same unit-aware parse as configuration areas.
    const superArea = parseAreaSqFtOrNull(values.plotSuperArea);
    const carpetArea = parseAreaSqFtOrNull(values.plotCarpetArea);
    if (optionId && (superArea !== null || carpetArea !== null)) {
      const areas = [
        superArea !== null
          ? {
              basis: "super_built_up" as const,
              value: superArea,
              unit: "sq_ft" as const,
              rawText: nz(values.plotSuperArea),
              state: "stated" as const,
            }
          : null,
        carpetArea !== null
          ? {
              basis: "carpet" as const,
              value: carpetArea,
              unit: "sq_ft" as const,
              rawText: nz(values.plotCarpetArea),
              state: "stated" as const,
            }
          : null,
      ].filter((area): area is NonNullable<typeof area> => area !== null);
      configurations.push({
        optionId,
        kind,
        variantName: null,
        areaValue: superArea ?? carpetArea,
        areaBasis: superArea !== null ? "super_built_up" : "carpet",
        areaUnit: "sq_ft",
        areaState: "stated",
        bathrooms: null,
        bathroomsState: "not_stated",
        balconies: null,
        balconiesState: "not_stated",
        servantRoomPresent: null,
        servantRoomState: "not_stated",
        floorPlanPage: null,
        floorPlanPageState: "not_stated",
        publicFacts: {},
        areas,
        rooms: [],
        commercial: { baseSalePriceRupees: null, rateRupeesPerSqFt: null, rateAreaBasis: null },
      });
    }
  }

  const plotSizeValue = parseNumberOrNull(values.plotSize);
  const openSpacePercent = parseNumberOrNull(values.openSpace);
  const proposedStartDateRera = toIsoDateOrNull(values.proposedStartDateRera);
  const possessionConfirmedAsOf = toIsoDateOrNull(values.possessionConfirmedAsOf);
  const registeredCompletionDateRera = toIsoDateOrNull(values.registeredCompletionDateRera);

  return {
    schemaVersion: 1,
    marketId: lookup.marketId,
    property: {
      name: values.name.trim(),
      developerName: nz(values.developer),
      propertyType: CATEGORY_TO_PROPERTY_TYPE[values.category],
      addressLine: nz(values.location),
      locality: null,
      stateCode: lookup.stateCode,
      cityCode: lookup.cityCode,
      reraRegistration: nz(values.reraId),
      possessionDate: null,
      heroImageUrl: nz(values.imageUrl),
    },
    configurations,
    assetIds: [],
    details: {
      plotSizeValue,
      plotSizeUnit: plotSizeValue !== null ? "sq_ft" : null,
      plotSizeState: fieldState(nz(values.plotSize)),
      totalTowers: parseIntOrNull(values.totalTowers),
      totalTowersState: fieldState(nz(values.totalTowers)),
      totalFloors: parseIntOrNull(values.totalFloors),
      totalFloorsState: fieldState(nz(values.totalFloors)),
      unitsPerFloor: parseIntOrNull(values.unitsPerFloor),
      unitsPerFloorState: fieldState(nz(values.unitsPerFloor)),
      totalUnits: parseIntOrNull(values.totalUnits),
      totalUnitsState: fieldState(nz(values.totalUnits)),
      unitsPerAcre: parseNumberOrNull(values.unitsPerAcre),
      unitsPerAcreState: fieldState(nz(values.unitsPerAcre)),
      openSpacePercent,
      openSpacePercentState: fieldState(nz(values.openSpace)),
      parkingLevels: parseIntOrNull(values.parkingLevels),
      parkingLevelsState: fieldState(nz(values.parkingLevels)),
      podiumStructure: nz(values.podiumStructure),
      podiumStructureState: fieldState(nz(values.podiumStructure)),
      liftsPerTower: parseIntOrNull(values.liftsPerTower),
      liftsPerTowerState: fieldState(nz(values.liftsPerTower)),
      clubhouseSizeSqFt: parseNumberOrNull(values.clubhouseSize),
      clubhouseSizeSqFtState: fieldState(nz(values.clubhouseSize)),
      internalCeilingHeightFt: parseNumberOrNull(values.internalCeilingHeight),
      ceilingHeightBasis: values.ceilingHeightBasis,
      ceilingHeightState: fieldState(nz(values.internalCeilingHeight)),
      constructionQuality: nz(values.constructionQuality),
      constructionQualityState: fieldState(nz(values.constructionQuality)),
      flooringType: nz(values.flooringType),
      flooringTypeState: fieldState(nz(values.flooringType)),
      windowGlazing: nz(values.windowGlazing),
      windowGlazingState: fieldState(nz(values.windowGlazing)),
      bathSanitaryFittings: nz(values.bathSanitaryFittings),
      bathSanitaryFittingsState: fieldState(nz(values.bathSanitaryFittings)),
      vrvAcProvision: nz(values.vrvAcProvided),
      vrvAcProvisionState: fieldState(nz(values.vrvAcProvided)),
      geyserProvision: nz(values.geyserHeatPumpProvided),
      geyserProvisionState: fieldState(nz(values.geyserHeatPumpProvided)),
      experienceYears: parseIntOrNull(values.developerExperienceYears),
      experienceYearsState: fieldState(nz(values.developerExperienceYears)),
      deliveredProjects: parseIntOrNull(values.totalDeliveredProjects),
      deliveredProjectsState: fieldState(nz(values.totalDeliveredProjects)),
      ongoingProjects: parseIntOrNull(values.ongoingProjects),
      ongoingProjectsState: fieldState(nz(values.ongoingProjects)),
      notableDeliveredProjects: values.notableDeliveredProjects
        .map((entry) => entry.trim())
        .filter(Boolean),
      notableDeliveredProjectsState: fieldState(values.notableDeliveredProjects),
      background: nz(values.developerBackground),
      backgroundState: fieldState(nz(values.developerBackground)),
      proposedStartDateRera,
      proposedStartDateReraState: fieldState(proposedStartDateRera),
      possessionConfirmedAsOf,
      possessionConfirmedAsOfState: fieldState(possessionConfirmedAsOf),
      registeredCompletionDateRera,
      registeredCompletionDateReraState: fieldState(registeredCompletionDateRera),
      constructionProgressRera: nz(values.constructionProgressRera),
      constructionProgressReraState: fieldState(nz(values.constructionProgressRera)),
      amenitiesOther: nz(values.amenitiesOther),
    },
    reraVerification: null,
  };
}
