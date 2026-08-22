import type { PropertyFormValues } from "@/lib/property-schema";
import { CONFIG_BUCKETS, VARIANT_FIELDS } from "@/lib/property-schema";
import type { ConfigurationKind } from "@/generated/property-contract";
import type { PublicationRevision } from "./publication";

const BUCKET_TO_KIND: Record<(typeof CONFIG_BUCKETS)[number]["key"], ConfigurationKind> = {
  bhk3: "3_bhk",
  bhk4: "4_bhk",
  bhk5: "5_bhk",
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
    const value = parseNumberOrNull(raw);
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
    const areaValue = parseNumberOrNull(raw);
    return {
      roomType: field.label,
      dimensionRaw: nz(raw),
      areaValue,
      areaUnit: areaValue !== null ? ("sq_ft" as const) : null,
      state: fieldState(nz(raw)),
    };
  });

  const primaryArea = detail.area ?? detail.builtUpArea ?? detail.carpet ?? null;
  const primaryAreaValue = parseNumberOrNull(primaryArea);
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
    publicFacts: {},
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
  "apartment" | "bungalow" | "plot"
> = {
  Apartment: "apartment",
  Bungalow: "bungalow",
  Plots: "plot",
};

const CATEGORY_TO_CONFIG_KIND: Record<"Bungalow" | "Plots", ConfigurationKind> = {
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

  const isPlotLike = values.category === "Bungalow" || values.category === "Plots";
  if (isPlotLike && configurations.length === 0) {
    const kind = CATEGORY_TO_CONFIG_KIND[values.category as "Bungalow" | "Plots"];
    const optionId = lookup.configurationOptionsByKind.get(kind);
    const superArea = parseNumberOrNull(values.plotSuperArea);
    const carpetArea = parseNumberOrNull(values.plotCarpetArea);
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
      amenitiesOther: nz(values.amenitiesOther),
    },
    reraVerification: null,
  };
}
