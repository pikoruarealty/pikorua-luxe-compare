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
    constructionQuality: gatedText(200),
    constructionQualityState: fieldStateSchema,
    flooringType: gatedText(200),
    flooringTypeState: fieldStateSchema,
    windowGlazing: gatedText(200),
    windowGlazingState: fieldStateSchema,
    bathSanitaryFittings: gatedText(200),
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
    dimensionRaw: nullableTrimmed(200),
    areaValue: z.number().finite().nonnegative().nullable(),
    areaUnit: areaUnitSchema.nullable(),
    state: fieldStateSchema,
  })
  .strict();

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
