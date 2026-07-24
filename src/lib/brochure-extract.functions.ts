import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/integrations/supabase/admin-auth-middleware";
import type { ExtractionResponse } from "./brochure-field-mapping";

interface BrochureFile {
  fileName: string;
  fileBase64: string;
}

const MAX_FILES = 6;
const MAX_BASE64_LENGTH = 55_000_000; // ~40MB binary, matches the service's own MAX_FILE_MB default

/** Server-only proxy to the brochure-extractor service — INTEGRATION.md is
 *  explicit that its API key must never reach the browser, so this function
 *  is the one place that holds it and makes the call. Called from the
 *  developer portal's brochure-upload step. */
export const extractFromBrochures = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { files: BrochureFile[] }) => {
    if (!Array.isArray(data?.files) || data.files.length === 0) {
      throw new Error("Upload at least one brochure PDF");
    }
    if (data.files.length > MAX_FILES) {
      throw new Error(`Upload at most ${MAX_FILES} files at a time`);
    }
    for (const f of data.files) {
      if (!f?.fileName || !f?.fileBase64) throw new Error("Malformed file upload");
      if (f.fileBase64.length > MAX_BASE64_LENGTH) {
        throw new Error(`${f.fileName} is too large`);
      }
    }
    return { files: data.files };
  })
  .handler(async ({ data }): Promise<ExtractionResponse> => {
    const baseUrl = process.env.BROCHURE_EXTRACTOR_URL;
    const apiKey = process.env.BROCHURE_EXTRACTOR_API_KEY;
    if (!baseUrl) {
      throw new Error(
        "Brochure OCR isn't set up yet — ask your admin to deploy the extractor service and set BROCHURE_EXTRACTOR_URL.",
      );
    }

    const form = new FormData();
    for (const f of data.files) {
      const base64 = f.fileBase64.includes(",") ? f.fileBase64.slice(f.fileBase64.indexOf(",") + 1) : f.fileBase64;
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) continue;
      const name = f.fileName.toLowerCase().endsWith(".pdf") ? f.fileName : `${f.fileName}.pdf`;
      form.append("files", new Blob([buffer], { type: "application/pdf" }), name);
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/extract?with_images=false`, {
        method: "POST",
        headers: apiKey ? { "X-API-Key": apiKey } : undefined,
        body: form,
        // Extraction chunks pages in parallel but a large brochure still
        // takes a while — INTEGRATION.md quotes 25-60s.
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new Error("Couldn't reach the OCR service. It may be offline — try again shortly.");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? body?.detail ?? `OCR service error (${res.status})`);
    }
    return (await res.json()) as ExtractionResponse;
  });
