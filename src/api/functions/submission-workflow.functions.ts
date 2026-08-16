import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { publicationRevisionSchema } from "@/domain/publication";
import {
  requireDeveloperAuth,
  requireReviewerAuth,
} from "@/integrations/supabase/admin-auth-middleware";

const workflowId = z.string().uuid();

export const savePropertySubmissionRevision = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAuth])
  .inputValidator((data: { workflowId?: string; payload: unknown }) => ({
    workflowId: data?.workflowId ? workflowId.parse(data.workflowId) : undefined,
    payload: publicationRevisionSchema.parse(data?.payload),
  }))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_CATALOGUE");
    const { saveDeveloperRevision } =
      await import("@/repositories/submission-workflow.repository.server");
    return saveDeveloperRevision(context.adminProfile.id, data.payload, data.workflowId);
  });

export const submitPropertyWorkflow = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAuth])
  .inputValidator((data: { workflowId: string }) => ({
    workflowId: workflowId.parse(data?.workflowId),
  }))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_CATALOGUE");
    const { submitDeveloperWorkflow } =
      await import("@/repositories/submission-workflow.repository.server");
    return submitDeveloperWorkflow(data.workflowId, context.adminProfile.id);
  });

export const adjudicatePropertyWorkflow = createServerFn({ method: "POST" })
  .middleware([requireReviewerAuth])
  .inputValidator(
    (data: { workflowId: string; action: "changes_requested" | "rejected"; reason: string }) => ({
      workflowId: workflowId.parse(data?.workflowId),
      action: z.enum(["changes_requested", "rejected"]).parse(data?.action),
      reason: z.string().trim().min(3).max(1000).parse(data?.reason),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_CATALOGUE");
    const { adjudicateWorkflow } =
      await import("@/repositories/submission-workflow.repository.server");
    return adjudicateWorkflow(data.workflowId, context.adminProfile.id, data.action, data.reason);
  });
