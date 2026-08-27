import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { publicationRevisionSchema } from "@/domain/publication";
import { requireReviewerAuth } from "@/lib/auth/admin-auth-middleware";

const workflowIdSchema = z.string().uuid();

export const publishPropertyRevision = createServerFn({ method: "POST" })
  .middleware([requireReviewerAuth])
  .inputValidator((data: { workflowId: string }) => ({
    workflowId: workflowIdSchema.parse(data?.workflowId),
  }))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_CATALOGUE");
    const { publishWorkflow } = await import("@/repositories/publication.repository.server");
    return publishWorkflow(data.workflowId, context.adminProfile.id);
  });

export const correctPropertyRevision = createServerFn({ method: "POST" })
  .middleware([requireReviewerAuth])
  .inputValidator((data: { workflowId: string; correctedPayload: unknown; reason: string }) => ({
    workflowId: workflowIdSchema.parse(data?.workflowId),
    correctedPayload: publicationRevisionSchema.parse(data?.correctedPayload),
    reason: z.string().trim().min(3).max(1000).parse(data?.reason),
  }))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_CATALOGUE");
    const { createReviewerCorrection } =
      await import("@/repositories/publication.repository.server");
    return createReviewerCorrection(
      data.workflowId,
      context.adminProfile.id,
      data.correctedPayload,
      data.reason,
    );
  });
