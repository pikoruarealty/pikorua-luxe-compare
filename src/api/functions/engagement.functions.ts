import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  requireDeveloperAuth,
  requireModerationAuth,
} from "@/integrations/supabase/admin-auth-middleware";
import { requireVisitorAuth } from "@/middleware/visitor-auth";

const slug = z.string().regex(/^[a-z0-9-]{1,200}$/);
const reviewId = z.string().uuid();
const reviewInput = z
  .object({
    slug,
    rating: z.number().int().min(1).max(5),
    text: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
const reportReasons = ["spam", "privacy", "abuse", "misleading", "other"] as const;

export const getPublicReviews = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug }).strict().parse(data))
  .handler(async ({ data }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_REVIEWS");
    setResponseHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.listPublicReviews(data.slug);
  });

export const saveOwnReview = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) => reviewInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_REVIEWS");
    setResponseHeader("Cache-Control", "private, no-store");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.upsertOwnReview(context.profileId, data);
  });

export const getOwnReview = createServerFn({ method: "GET" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) => z.object({ slug }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_REVIEWS");
    setResponseHeader("Cache-Control", "private, no-store");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.findOwnReview(context.profileId, data.slug);
  });

export const deleteOwnReview = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) => z.object({ reviewId }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_REVIEWS");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.deleteOwnReview(context.profileId, data.reviewId);
  });

export const reportPublicReview = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ reviewId, reasonCode: z.enum(reportReasons) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_REVIEWS");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.reportReview(context.profileId, data.reviewId, data.reasonCode);
  });

export const submitPriceEnquiry = createServerFn({ method: "POST" })
  .middleware([requireVisitorAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        slug,
        configurationVariantId: z.string().uuid().nullable().optional(),
        message: z.string().trim().max(2000).nullable().optional(),
        consent: z.literal(true),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_ENQUIRIES");
    setResponseHeader("Cache-Control", "private, no-store");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.createEnquiry(context.profileId, data);
  });

export const getMyDeveloperEnquiries = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAuth])
  .handler(async ({ context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_ENQUIRIES");
    setResponseHeader("Cache-Control", "private, no-store");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.listDeveloperEnquiries(context.adminProfile.id);
  });

export const setMyDeveloperEnquiryStatus = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        enquiryId: z.string().uuid(),
        status: z.enum(["new", "viewed", "contacted", "closed"]),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_ENQUIRIES");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.updateDeveloperEnquiryStatus(
      context.adminProfile.id,
      data.enquiryId,
      data.status,
    );
  });

export const saveDeveloperReviewResponse = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ reviewId, responseText: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_REVIEWS");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.upsertDeveloperResponse(
      context.adminProfile.id,
      data.reviewId,
      data.responseText,
    );
  });

export const getMyDeveloperReviews = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAuth])
  .handler(async ({ context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_REVIEWS");
    setResponseHeader("Cache-Control", "private, no-store");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.listDeveloperReviews(context.adminProfile.id);
  });

export const getModerationQueue = createServerFn({ method: "GET" })
  .middleware([requireModerationAuth])
  .handler(async () => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_REVIEWS");
    setResponseHeader("Cache-Control", "private, no-store");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.listModerationQueue();
  });

export const moderateReview = createServerFn({ method: "POST" })
  .middleware([requireModerationAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        reviewId,
        action: z.enum(["hide", "restore"]),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_REVIEWS");
    const repository = await import("@/repositories/engagement.repository.server");
    return repository.adjudicateReview(context.adminProfile.id, data);
  });
