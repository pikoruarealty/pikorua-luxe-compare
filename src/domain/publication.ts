import { z } from "zod";

import {
  areaBasisSchema,
  areaUnitSchema,
  configurationKindSchema,
  fieldStateSchema,
  propertyTypeSchema,
} from "@/generated/property-contract";

const nullableTrimmed = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();

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
            publicFacts: z.record(z.string(), z.string().max(1000).nullable()),
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
