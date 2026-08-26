import type { PropertyFormValues } from "@/lib/property-schema";
import { CONFIG_BUCKETS, VARIANT_FIELDS, emptyPropertyForm } from "@/lib/property-schema";
import type { ConfigurationKind } from "@/generated/property-contract";
import { ROOM_LABELS } from "./publication-mapping.server";
import type { PublicationRevision } from "./publication";

/**
 * The inverse of `buildPublicationRevision` — turns a stored publication
 * revision back into the shape the admin/developer property form edits.
 *
 * Phase C3 needs this and nothing in the repo had it: the catalogue has only
 * ever been written *to*, because editing still happened against V1's flat
 * `properties` row. Loading a V2 property into the form without this is what
 * made `getMyPropertyForEdit` fail with "Property not found" for every
 * V2-published property.
 *
 * Fidelity comes from reading the raw text the forward mapper preserved
 * (`areas[].rawText`, `rooms[].dimensionRaw`) rather than re-rendering the
 * parsed numbers. That matters because parsing is lossy in ways that would
 * corrupt a round-trip: "133.93 SQ.MT." is stored as 1441.6 sq ft, and
 * re-printing that number into a field the developer last saw as "133.93
 * SQ.MT." would silently rewrite their brochure's own wording. Where raw text
 * was never captured, the number is printed instead — stated plainly below
 * per field.
 */

/** Number back to form text. `null` becomes "" (the form's not-stated), and
 *  integers never pick up a trailing ".0" — `String` already does this, but
 *  it's the property the round-trip depends on, so it's stated rather than
 *  assumed. */
function str(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

const PROPERTY_TYPE_TO_CATEGORY: Record<
  PublicationRevision["property"]["propertyType"],
  PropertyFormValues["category"]
> = {
  apartment: "Apartment",
  villa: "Villa",
  bungalow: "Bungalow",
  plot: "Plots",
};

const KIND_TO_BUCKET: Partial<Record<ConfigurationKind, (typeof CONFIG_BUCKETS)[number]["key"]>> = {
  "2_bhk": "bhk2",
  "3_bhk": "bhk3",
  "4_bhk": "bhk4",
  "5_bhk": "bhk5",
  "6_bhk": "bhk6",
  "7_bhk": "bhk7",
  penthouse: "penthouse",
  duplex: "duplex",
};

/** The `roomType` label the forward mapper wrote -> the form field it came
 *  from. Forward stores the VARIANT_FIELDS *label* ("Bedroom 1"), not the field
 *  name, so this inverts that. Filtered by the same ROOM_LABELS set the forward
 *  direction filters on, so a non-room label like "Price (Cr)" appearing as a
 *  roomType could never overwrite the price field. */
const ROOM_LABEL_TO_FIELD = new Map<string, string>(
  VARIANT_FIELDS.filter((field) => ROOM_LABELS.has(field.name)).map((field) => [
    field.label,
    field.name,
  ]),
);

type ConfigDetail = PropertyFormValues["configs"]["bhk3"][number];

/** The area a given basis was stated in, preferring the brochure's own wording
 *  over our parsed square-footage. */
function areaFor(
  configuration: PublicationRevision["configurations"][number],
  basis: "super_built_up" | "carpet" | "built_up",
): string | null {
  // Forward drops any basis it couldn't parse a value out of, so a missing
  // entry means the field was blank rather than unparseable.
  const area = configuration.areas.find((entry) => entry.basis === basis);
  if (!area) return null;
  return area.rawText ?? str(area.value) ?? null;
}

function toConfigDetail(
  configuration: PublicationRevision["configurations"][number],
): ConfigDetail {
  const detail: ConfigDetail = {
    type: text(configuration.variantName),
    area: areaFor(configuration, "super_built_up"),
    carpet: areaFor(configuration, "carpet"),
    builtUpArea: areaFor(configuration, "built_up"),
    // Rupees back to crores, the unit the form's "Price (Cr)" input uses.
    // Exact for every value the forward direction could have produced, since
    // it multiplied by 1e7 and rounded to whole rupees.
    price:
      configuration.commercial.baseSalePriceRupees === null
        ? null
        : String(configuration.commercial.baseSalePriceRupees / 1e7),
    rate: str(configuration.commercial.rateRupeesPerSqFt) || null,
    bathrooms: str(configuration.bathrooms) || null,
    balconies: str(configuration.balconies) || null,
    // Lossy, and knowingly so: the form captures this as prose ("Yes, in 4BHK
    // only") and the catalogue reduced it to a boolean, so the original
    // wording is not recoverable. A developer who reopens the form sees
    // "Yes"/"No" where they had written a sentence. Nothing better is
    // available without a schema change, and dropping to "" instead would
    // lose the fact itself rather than just its phrasing.
    servantRoom:
      configuration.servantRoomPresent === null
        ? null
        : configuration.servantRoomPresent
          ? "Yes"
          : "No",
    plotSize:
      typeof configuration.publicFacts.plotSize === "string"
        ? configuration.publicFacts.plotSize
        : null,
    livingArea: null,
    kitchen: null,
    bedroom1: null,
    bedroom2: null,
    bedroom3: null,
    bedroom4: null,
    bedroom5: null,
  };

  for (const room of configuration.rooms) {
    const field = ROOM_LABEL_TO_FIELD.get(room.roomType);
    if (!field || !(field in detail)) continue;
    // dimensionRaw is what the plan book printed ("18x14", "5.20 X 4.30 M").
    // areaValue is only ever set for a room quoted as a single area, so it's
    // the fallback rather than the source.
    (detail as unknown as Record<string, string | null>)[field] =
      room.dimensionRaw ?? (room.areaValue === null ? null : str(room.areaValue));
  }

  return detail;
}

export interface PublicationToFormLookup {
  /** Human-readable names for the revision's `stateCode`/`cityCode`. The form
   *  edits these as free text ("Gujarat", "Ahmedabad") while the catalogue
   *  stores codes, and the codes alone would show a developer "GJ" where they
   *  had typed "Gujarat". Omitted values fall back to the form's own defaults. */
  stateName?: string | null;
  cityName?: string | null;
}

export function buildFormValuesFromRevision(
  revision: PublicationRevision,
  lookup: PublicationToFormLookup = {},
): PropertyFormValues {
  // Starting from the empty form rather than building an object literal means
  // a field added to the schema later arrives here as its declared default
  // instead of `undefined`, which zod would then reject on the way back in.
  const values = emptyPropertyForm();
  const { property, details, presentation } = revision;

  values.name = property.name;
  values.developer = text(property.developerName);
  values.category = PROPERTY_TYPE_TO_CATEGORY[property.propertyType];
  values.location = text(property.addressLine);
  values.reraId = text(property.reraRegistration);
  values.imageUrl = text(property.heroImageUrl);
  if (lookup.stateName) values.state = lookup.stateName;
  if (lookup.cityName) values.city = lookup.cityName;

  values.tagline = text(presentation.tagline);
  values.status = text(presentation.status);
  values.possession = text(presentation.possession);
  values.possessionAsOf = text(presentation.possessionAsOf);
  values.expertNote = text(presentation.expertNote);
  values.availableBhkTypes = text(presentation.availableBhkTypes);
  values.reraUrl = text(presentation.reraUrl);
  values.gallery = {
    livingRoom: text(presentation.gallery.livingRoom),
    pool: text(presentation.gallery.pool),
    clubhouse: text(presentation.gallery.clubhouse),
    masterBedroom: text(presentation.gallery.masterBedroom),
  };
  values.amenities = [...presentation.amenities];
  values.advantages = [...presentation.advantages];

  // Lossy in the same way `servantRoom` is: forward ran a bare
  // `parseNumberOrNull` over this one (no unit awareness), so "5 acres" was
  // stored as 5 and comes back as "5". The number survives; the unit the
  // developer typed does not.
  values.plotSize = str(details.plotSizeValue);
  values.totalTowers = str(details.totalTowers);
  values.totalFloors = str(details.totalFloors);
  values.unitsPerFloor = str(details.unitsPerFloor);
  values.totalUnits = str(details.totalUnits);
  values.unitsPerAcre = str(details.unitsPerAcre);
  values.openSpace = str(details.openSpacePercent);
  values.parkingLevels = str(details.parkingLevels);
  values.podiumStructure = text(details.podiumStructure);
  values.liftsPerTower = str(details.liftsPerTower);
  values.clubhouseSize = str(details.clubhouseSizeSqFt);
  values.internalCeilingHeight = str(details.internalCeilingHeightFt);
  values.ceilingHeightBasis = details.ceilingHeightBasis;
  values.constructionQuality = text(details.constructionQuality);
  values.flooringType = text(details.flooringType);
  values.windowGlazing = text(details.windowGlazing);
  values.bathSanitaryFittings = text(details.bathSanitaryFittings);
  values.vrvAcProvided = text(details.vrvAcProvision);
  values.geyserHeatPumpProvided = text(details.geyserProvision);
  values.developerExperienceYears = str(details.experienceYears);
  values.totalDeliveredProjects = str(details.deliveredProjects);
  values.ongoingProjects = str(details.ongoingProjects);
  values.notableDeliveredProjects = [...details.notableDeliveredProjects];
  values.developerBackground = text(details.background);
  values.proposedStartDateRera = text(details.proposedStartDateRera);
  values.possessionConfirmedAsOf = text(details.possessionConfirmedAsOf);
  values.registeredCompletionDateRera = text(details.registeredCompletionDateRera);
  values.constructionProgressRera = text(details.constructionProgressRera);
  values.amenitiesOther = text(details.amenitiesOther);

  for (const configuration of revision.configurations) {
    const bucket = KIND_TO_BUCKET[configuration.kind];
    if (bucket) {
      values.configs[bucket].push(toConfigDetail(configuration));
      continue;
    }
    // villa / bungalow / plot have no BHK bucket — the forward mapper
    // synthesises a single configuration for them out of the project-level
    // plot area fields, so they unwind back into those same two fields rather
    // than into `configs`.
    const superArea = configuration.areas.find((area) => area.basis === "super_built_up");
    const carpetArea = configuration.areas.find((area) => area.basis === "carpet");
    if (superArea) values.plotSuperArea = superArea.rawText ?? str(superArea.value);
    if (carpetArea) values.plotCarpetArea = carpetArea.rawText ?? str(carpetArea.value);
  }

  return values;
}
