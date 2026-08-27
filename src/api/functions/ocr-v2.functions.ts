import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDeveloperAuth } from "@/lib/auth/admin-auth-middleware";

const idSchema = z.string().uuid();
const uploadSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    mimeType: z.literal("application/pdf"),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(40 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const createDurableOcrUpload = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAuth])
  .inputValidator((data: unknown) => uploadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_OCR");
    const { createSourceDocument } = await import("@/repositories/ocr.repository.server");
    const document = await createSourceDocument(context.adminProfile.id, data);
    if (document.uploadState === "verified") {
      return { documentId: document.id, upload: null, reused: true };
    }
    if (document.uploadState !== "pending") throw new Error("Brochure cannot be uploaded");
    const { createPrivatePdfUploadUrl } = await import("@/server/gcs.server");
    const upload = await createPrivatePdfUploadUrl(
      document.storageBucket,
      document.storageObjectPath,
      document.sha256,
    );
    return {
      documentId: document.id,
      upload: {
        ...upload,
        method: "PUT" as const,
        headers: {
          "Content-Type": "application/pdf",
          "x-goog-meta-sha256": document.sha256,
        },
      },
      reused: false,
    };
  });

export const finalizeDurableOcrUpload = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAuth])
  .inputValidator((data: { documentId: string }) => ({
    documentId: idSchema.parse(data?.documentId),
  }))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_OCR");
    const { markSourceUploadedAndQueue } = await import("@/repositories/ocr.repository.server");
    return markSourceUploadedAndQueue(data.documentId, context.adminProfile.id);
  });

export const getDurableOcrProgress = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAuth])
  .inputValidator((data: { jobId: string }) => ({ jobId: idSchema.parse(data?.jobId) }))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_OCR");
    const { getOwnedOcrJob } = await import("@/repositories/ocr.repository.server");
    return getOwnedOcrJob(data.jobId, context.adminProfile.id);
  });

export const cancelDurableOcrJob = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAuth])
  .inputValidator((data: { jobId: string }) => ({ jobId: idSchema.parse(data?.jobId) }))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_OCR");
    const { requestOwnedOcrCancellation } = await import("@/repositories/ocr.repository.server");
    return requestOwnedOcrCancellation(data.jobId, context.adminProfile.id);
  });
