import { z } from "zod";

import {
  areaBasisSchema,
  areaUnitSchema,
  ceilingHeightBasisSchema,
  configurationKindSchema,
  fieldStateSchema,
  propertyTypeSchema,
} from "@/generated/property-contract";

const nullableTrimmed = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();

const gatedNumber = () => z.number().finite().nullable();
const gatedInt = () => z.number().int().nullable();
const gatedText = (maximum: number) => nullableTrimmed(maximum);

// Specification fields brochures print as prose rather than as a label — see
// MAX_SPEC_TEXT in property-schema.ts, which this must not be tighter than or
// a value the form accepts would be rejected at publish time instead.
const SPEC_TEXT_MAX = 600;

const publicationDetailsSchema = z
  .object({
    plotSizeValue: gatedNumber(),
    plotSizeUnit: areaUnitSchema.nullable(),
    plotSizeState: fieldStateSchema,
    totalTowers: gatedInt(),
    totalTowersState: fieldStateSchema,
    totalFloors: gatedInt(),
    totalFloorsState: fieldStateSchema,
    unitsPerFloor: gatedInt(),
    unitsPerFloorState: fieldStateSchema,
    totalUnits: gatedInt(),
    totalUnitsState: fieldStateSchema,
    unitsPerAcre: gatedNumber(),
    unitsPerAcreState: fieldStateSchema,
    openSpacePercent: gatedNumber(),
    openSpacePercentState: fieldStateSchema,
    parkingLevels: gatedInt(),
    parkingLevelsState: fieldStateSchema,
    podiumStructure: gatedText(200),
    podiumStructureState: fieldStateSchema,
    liftsPerTower: gatedInt(),
    liftsPerTowerState: fieldStateSchema,
    clubhouseSizeSqFt: gatedNumber(),
    clubhouseSizeSqFtState: fieldStateSchema,
    internalCeilingHeightFt: gatedNumber(),
    ceilingHeightBasis: ceilingHeightBasisSchema,
    ceilingHeightState: fieldStateSchema,
    constructionQuality: gatedText(SPEC_TEXT_MAX),
    constructionQualityState: fieldStateSchema,
    flooringType: gatedText(SPEC_TEXT_MAX),
    flooringTypeState: fieldStateSchema,
    windowGlazing: gatedText(200),
    windowGlazingState: fieldStateSchema,
    bathSanitaryFittings: gatedText(SPEC_TEXT_MAX),
    bathSanitaryFittingsState: fieldStateSchema,
    vrvAcProvision: gatedText(200),
    vrvAcProvisionState: fieldStateSchema,
    geyserProvision: gatedText(200),
    geyserProvisionState: fieldStateSchema,
    experienceYears: gatedInt(),
    experienceYearsState: fieldStateSchema,
    deliveredProjects: gatedInt(),
    deliveredProjectsState: fieldStateSchema,
    ongoingProjects: gatedInt(),
    ongoingProjectsState: fieldStateSchema,
    notableDeliveredProjects: z.array(z.string().trim().min(1).max(200)).max(100),
    notableDeliveredProjectsState: fieldStateSchema,
    background: gatedText(2000),
    backgroundState: fieldStateSchema,
    proposedStartDateRera: z.string().date().nullable(),
    proposedStartDateReraState: fieldStateSchema,
    possessionConfirmedAsOf: z.string().date().nullable(),
    possessionConfirmedAsOfState: fieldStateSchema,
    registeredCompletionDateRera: z.string().date().nullable(),
    registeredCompletionDateReraState: fieldStateSchema,
    constructionProgressRera: gatedText(100),
    constructionProgressReraState: fieldStateSchema,
    amenitiesOther: gatedText(2000),
  })
  .strict();

const configurationAreaSchema = z
  .object({
    basis: areaBasisSchema,
    value: z.number().finite().nonnegative().nullable(),
    unit: areaUnitSchema.nullable(),
    rawText: nullableTrimmed(200),
    state: fieldStateSchema,
  })
  .strict();

const configurationRoomSchema = z
  .object({
    roomType: z.string().trim().min(1).max(100),
    // Plan books print a room's dimensions with the room name, unit and
    // occasional annotation all in one string; 200 clipped the longest of them.
    dimensionRaw: nullableTrimmed(SPEC_TEXT_MAX),
    areaValue: z.number().finite().nonnegative().nullable(),
    areaUnit: areaUnitSchema.nullable(),
    state: fieldStateSchema,
  })
  .strict();

/** Editorial and presentational content that the public property page shows
 *  but the canonical catalogue had nowhere to put.
 *
 *  Until Phase C3a these ten fields existed only on V1's flat `properties`
 *  table: `buildPublicationRevision` dropped every one of them, and
 *  `publishWorkflow`'s snapshot was `{...revision.property}` — identity
 *  columns only. That was survivable while the public listing/detail page read
 *  V1 directly, but it meant V2 could not represent what the site actually
 *  displays, so V1 could never be retired and any developer editing through V2
 *  would have published their own tagline, possession and amenities away.
 *
 *  These live here rather than on `property` because `property` maps 1:1 onto
 *  the identity columns `createPropertyIdentity` writes; this is content that
 *  only ever travels in the jsonb snapshot. Nothing here is a measurement or a
 *  comparable fact — those all belong in `details` or `configurations`, which
 *  carry an explicit `*State` field so a gap publishes as `not_stated` rather
 *  than an inferred value.
 *
 *  Optional with a full default, deliberately: publication revisions are
 *  immutable, so the ones already stored can never gain this key, and
 *  `publishWorkflow` re-parses stored payloads at publish time
 *  (publication.repository.server.ts:93). A required field here would break
 *  every in-flight submission that predates it. */
const publicationPresentationSchema = z
  .object({
    tagline: gatedText(200),
    status: gatedText(200),
    /** Free-text duration as the brochure states it ("Dec 2027", "36 months").
     *  Distinct from `property.possessionDate`, which is a real calendar date
     *  and is usually null because a brochure rarely prints one. */
    possession: gatedText(200),
    /** When the free-text `possession` above was last confirmed accurate, so
     *  the public site can age it rather than showing it frozen. */
    possessionAsOf: gatedText(200),
    expertNote: gatedText(5000),
    availableBhkTypes: gatedText(200),
    reraUrl: z.string().url().nullable(),
    gallery: z
      .object({
        livingRoom: z.string().url().nullable(),
        pool: z.string().url().nullable(),
        clubhouse: z.string().url().nullable(),
        masterBedroom: z.string().url().nullable(),
      })
      .strict(),
    /** Free text, matching how V1 stores them. `publishWorkflow` maps these
     *  onto `amenity_catalog` codes into `property_amenities` (see
     *  `src/domain/amenity-mapping.ts`, C7); unmatched strings fall through
     *  into `amenitiesOther` instead of being dropped. This field itself is
     *  still carried verbatim into the snapshot as the developer's source of
     *  truth for what to re-match on a future re-publish. */
    amenities: z.array(z.string().trim().min(1).max(200)).max(100),
    advantages: z.array(z.string().trim().min(1).max(200)).max(100),
  })
  .strict();

export const emptyPublicationPresentation = (): PublicationPresentation => ({
  tagline: null,
  status: null,
  possession: null,
  possessionAsOf: null,
  expertNote: null,
  availableBhkTypes: null,
  reraUrl: null,
  gallery: { livingRoom: null, pool: null, clubhouse: null, masterBedroom: null },
  amenities: [],
  advantages: [],
});

export type PublicationPresentation = z.infer<typeof publicationPresentationSchema>;

export const publicationRevisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    marketId: z.string().uuid(),
    requestedSlug: z
      .string()
      .regex(/^[a-z0-9-]{1,200}$/)
      .optional(),
    property: z
      .object({
        name: z.string().trim().min(1).max(200),
        developerName: nullableTrimmed(200),
        propertyType: propertyTypeSchema,
        addressLine: nullableTrimmed(500),
        locality: nullableTrimmed(200),
        stateCode: z.string().trim().min(1).max(10),
        cityCode: z.string().trim().min(1).max(50),
        reraRegistration: nullableTrimmed(100),
        possessionDate: z.string().date().nullable(),
        heroImageUrl: z.string().url().nullable(),
      })
      .strict(),
    configurations: z
      .array(
        z
          .object({
            optionId: z.string().uuid(),
            kind: configurationKindSchema,
            variantName: nullableTrimmed(100),
            areaValue: z.number().finite().nonnegative().nullable(),
            areaBasis: areaBasisSchema.nullable(),
            areaUnit: areaUnitSchema.nullable(),
            areaState: fieldStateSchema,
            bathrooms: z.number().int().nonnegative().max(30).nullable(),
            bathroomsState: fieldStateSchema,
            balconies: z.number().int().nonnegative().max(30).nullable(),
            balconiesState: fieldStateSchema,
            servantRoomPresent: z.boolean().nullable(),
            servantRoomState: fieldStateSchema,
            floorPlanPage: z.number().int().nonnegative().nullable(),
            floorPlanPageState: fieldStateSchema,
            publicFacts: z.record(z.string(), z.string().max(1000).nullable()),
            areas: z.array(configurationAreaSchema).max(10),
            rooms: z.array(configurationRoomSchema).max(20),
            commercial: z
              .object({
                baseSalePriceRupees: z.number().int().nonnegative().nullable(),
                rateRupeesPerSqFt: z.number().finite().nonnegative().nullable(),
                rateAreaBasis: areaBasisSchema.nullable(),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    assetIds: z.array(z.string().uuid()).max(50),
    presentation: publicationPresentationSchema.default(emptyPublicationPresentation),
    details: publicationDetailsSchema,
    reraVerification: z
      .object({
        sourceUrl: z.string().url(),
        verifiedOn: z.string().date(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((revision, context) => {
    const seen = new Set<string>();
    for (const [index, configuration] of revision.configurations.entries()) {
      const key = `${configuration.optionId}:${configuration.variantName ?? ""}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["configurations", index],
          message: "Duplicate configuration variant",
        });
      }
      seen.add(key);
      if (configuration.areaState === "stated" && configuration.areaValue === null) {
        context.addIssue({
          code: "custom",
          path: ["configurations", index, "areaValue"],
          message: "A stated area requires a value",
        });
      }
    }
  });

export type PublicationRevision = z.infer<typeof publicationRevisionSchema>;

export const submissionTransitions = {
  draft: ["submitted"],
  submitted: ["validating"],
  validating: ["in_review", "changes_requested", "rejected"],
  in_review: ["changes_requested", "rejected", "approved"],
  changes_requested: ["submitted"],
  rejected: [],
  approved: ["published"],
  published: ["superseded"],
  superseded: [],
} as const;

export type SubmissionState = keyof typeof submissionTransitions;

export function assertSubmissionTransition(from: SubmissionState, to: SubmissionState): void {
  if (!(submissionTransitions[from] as readonly string[]).includes(to)) {
    throw new Error(`Invalid submission transition: ${from} -> ${to}`);
  }
}

export function calculateVerifiedCompleteness(revision: PublicationRevision): number {
  const propertyValues = Object.values(revision.property);
  const statedPropertyValues = propertyValues.filter(
    (value) => value !== null && value !== "",
  ).length;
  const statedConfigurationValues = revision.configurations.reduce(
    (count, configuration) =>
      count +
      Number(configuration.areaState === "stated") +
      Number(configuration.bathroomsState === "stated") +
      Number(configuration.balconiesState === "stated"),
    0,
  );
  const possible = propertyValues.length + revision.configurations.length * 3;
  return Math.round(((statedPropertyValues + statedConfigurationValues) / possible) * 100);
}
