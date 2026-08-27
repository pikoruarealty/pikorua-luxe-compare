import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireReviewerAuth } from "@/lib/auth/admin-auth-middleware";
import { requireVisitorAuth } from "@/middleware/visitor-auth";

const uuid = z.string().uuid();
const areaUnit = z.enum(["sq_ft", "sq_m", "sq_yd", "gaj", "acre"]);

const reraVerificationInput = z
  .object({
    publicationVersionId: uuid,
    registrationNumber: z.string().trim().min(1).max(200),
    sourceUrl: z.string().url().optional(),
    sourceDocumentId: uuid.optional(),
    checkedAt: z.string().datetime(),
    status: z.enum(["matched", "discrepancy", "unavailable", "invalid_registration"]),
    publishedPromoterName: z.string().trim().max(300).optional(),
    officialPromoterName: z.string().trim().max(300).optional(),
    promoterMatchBasis: z.enum(["exact", "normalized", "manual_override", "unresolved"]).optional(),
    promoterMatchReason: z.string().trim().max(1000).optional(),
    publishedCompletionDate: z.string().date().optional(),
    officialCompletionDate: z.string().date().optional(),
    notes: z.string().trim().max(2000).optional(),
    areas: z
      .array(
        z
          .object({
            configurationVariantId: uuid,
            brochureValue: z.number().finite().nonnegative(),
            brochureUnit: areaUnit,
            brochureRawText: z.string().trim().min(1).max(200),
            reraValue: z.number().finite().nonnegative(),
            reraUnit: areaUnit,
            reraRawText: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .refine((value) => value.sourceUrl || value.sourceDocumentId || value.status === "unavailable", {
    message: "RERA verification requires an official source",
  });

export const getVerificationCandidates = createServerFn({ method: "GET" })
  .middleware([requireReviewerAuth])
  .handler(async () => {
    const repository = await import("@/repositories/propscore.repository.server");
    return repository.listVerificationCandidates();
  });

export const saveReraVerification = createServerFn({ method: "POST" })
  .middleware([requireReviewerAuth])
  .inputValidator((data: unknown) => reraVerificationInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_PROPSCORE");
    const repository = await import("@/repositories/propscore.repository.server");
    return repository.recordReraVerification(data, context.adminProfile.id);
  });

export const calculatePublicationPropScore = createServerFn({ method: "POST" })
  .middleware([requireReviewerAuth])
  .inputValidator((data: unknown) => z.object({ publicationVersionId: uuid }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_PROPSCORE");
    const repository = await import("@/repositories/propscore.repository.server");
    return repository.calculateAndPersistPropScore(
      data.publicationVersionId,
      context.adminProfile.id,
    );
  });

export const getGatedPropScore = createServerFn({ method: "GET" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ slug: z.string().regex(/^[a-z0-9-]{1,200}$/) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_PROPSCORE");
    const repository = await import("@/repositories/propscore.repository.server");
    return repository.findGatedPropScore(data.slug);
  });
