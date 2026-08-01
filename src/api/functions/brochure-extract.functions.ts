import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/integrations/supabase/admin-auth-middleware";
import type { ExtractionResponse, PropertyExtraction } from "@/lib/brochure-field-mapping";

interface BrochureFile {
  fileName: string;
  fileBase64: string;
}

const MAX_FILES = 6;
const MAX_BASE64_LENGTH = 55_000_000; // ~40MB binary

/** Statuses the service reports back from GET /api/properties/{id}/progress. */
export interface ExtractionProgress {
  status: "queued" | "processing" | "done" | "error" | "cancelled" | "cancelling";
  batchesDone: number;
  batchesTotal: number;
  currentFile: string | null;
  error: string | null;
}

function serviceConfig() {
  const baseUrl = process.env.BROCHURE_EXTRACTOR_URL;
  if (!baseUrl) {
    throw new Error(
      "Brochure OCR isn't set up yet — ask your admin to deploy the extractor service and set BROCHURE_EXTRACTOR_URL.",
    );
  }
  const headers: Record<string, string> = {};
  // The service treats an empty SERVICE_API_KEY as "auth disabled", so only
  // send the header when we actually hold a key.
  const apiKey = process.env.BROCHURE_EXTRACTOR_API_KEY;
  if (apiKey) headers["X-Service-Key"] = apiKey;
  return { baseUrl: baseUrl.replace(/\/$/, ""), headers };
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.detail ?? body?.error ?? fallback;
}

/** Uploads the PDFs and returns immediately with a job id. Extraction runs in
 *  the background on the service — a full brochure takes minutes, far longer
 *  than any serverless request may stay open, so the client polls from here. */
export const startBrochureExtraction = createServerFn({ method: "POST" })
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
      if (f.fileBase64.length > MAX_BASE64_LENGTH) throw new Error(`${f.fileName} is too large`);
    }
    return { files: data.files };
  })
  .handler(async ({ data }): Promise<{ jobId: string }> => {
    const { baseUrl, headers } = serviceConfig();

    const form = new FormData();
    for (const f of data.files) {
      const base64 = f.fileBase64.includes(",")
        ? f.fileBase64.slice(f.fileBase64.indexOf(",") + 1)
        : f.fileBase64;
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) continue;
      const name = f.fileName.toLowerCase().endsWith(".pdf") ? f.fileName : `${f.fileName}.pdf`;
      form.append("files", new Blob([buffer], { type: "application/pdf" }), name);
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/properties/extract`, {
        method: "POST",
        headers,
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new Error("Couldn't reach the OCR service. It may be offline — try again shortly.");
    }

    if (!res.ok) throw new Error(await readError(res, `OCR service error (${res.status})`));
    const body = (await res.json()) as { job_id?: string };
    if (!body?.job_id) throw new Error("OCR service didn't return a job id");
    return { jobId: body.job_id };
  });

/** Polled by the upload step until the job finishes. */
export const getBrochureExtractionProgress = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { jobId: string }) => {
    if (!data?.jobId || !/^[A-Za-z0-9-]{4,64}$/.test(data.jobId)) {
      throw new Error("Invalid job id");
    }
    return { jobId: data.jobId };
  })
  .handler(async ({ data }): Promise<ExtractionProgress> => {
    const { baseUrl, headers } = serviceConfig();

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/properties/${encodeURIComponent(data.jobId)}/progress`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error("Lost contact with the OCR service. It may have restarted.");
    }

    if (!res.ok) throw new Error(await readError(res, `OCR service error (${res.status})`));
    const body = (await res.json()) as Record<string, unknown>;
    return {
      status: (body.status as ExtractionProgress["status"]) ?? "processing",
      batchesDone: Number(body.batches_done ?? 0),
      batchesTotal: Number(body.batches_total ?? 0),
      currentFile: (body.current_file as string) ?? null,
      error: (body.error as string) ?? null,
    };
  });

/** Fetches the finished extraction once progress reports "done". */
export const getBrochureExtraction = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { jobId: string }) => {
    if (!data?.jobId || !/^[A-Za-z0-9-]{4,64}$/.test(data.jobId)) {
      throw new Error("Invalid job id");
    }
    return { jobId: data.jobId };
  })
  .handler(async ({ data }): Promise<ExtractionResponse> => {
    const { baseUrl, headers } = serviceConfig();

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/properties/${encodeURIComponent(data.jobId)}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("Couldn't fetch the extraction result. Try again shortly.");
    }

    if (!res.ok) throw new Error(await readError(res, `OCR service error (${res.status})`));
    const body = (await res.json()) as { job_id?: string; extraction?: PropertyExtraction };
    if (!body?.extraction) throw new Error("OCR service returned an empty result");

    // The service returns image paths relative to itself ("/api/images/…").
    // The browser needs absolute URLs to preview them, and only the server
    // knows where the service lives, so resolve them here. Each segment is
    // encoded because the filename carries the source PDF's name, which
    // routinely holds spaces and "&".
    const extraction = body.extraction;
    extraction.image_candidates = (extraction.image_candidates ?? []).map((img) => {
      if (img.image_path.startsWith("http")) return img;
      const encoded = img.image_path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      return {
        ...img,
        image_path: `${baseUrl}${encoded.startsWith("/") ? "" : "/"}${encoded}`,
      };
    });

    return { job_id: body.job_id ?? data.jobId, extraction };
  });

const IMAGE_SLOTS = ["cover", "livingRoom", "masterBedroom", "pool", "clubhouse"] as const;

/** Copies one brochure image into our own storage. Pulling it server-side and
 *  re-hosting it matters: the OCR service's copy lives on a disk that gets
 *  wiped on redeploy, so a property pointing at it would lose its photos. */
export const importBrochureImage = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { imageUrl: string; slot: string; folder: string }) => {
    if (!data?.imageUrl || !/^https?:\/\//.test(data.imageUrl)) {
      throw new Error("Invalid image reference");
    }
    if (!IMAGE_SLOTS.includes(data.slot as (typeof IMAGE_SLOTS)[number])) {
      throw new Error("Unknown image slot");
    }
    return { imageUrl: data.imageUrl, slot: data.slot, folder: data.folder || "brochure" };
  })
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { headers } = serviceConfig();

    // Only ever fetch from the extractor we configured — never an arbitrary
    // URL a caller hands us, which would make this an SSRF hole.
    const allowedBase = process.env.BROCHURE_EXTRACTOR_URL?.replace(/\/$/, "") ?? "";
    if (!allowedBase || !data.imageUrl.startsWith(allowedBase)) {
      throw new Error("That image doesn't belong to this extraction");
    }

    let res: Response;
    try {
      res = await fetch(data.imageUrl, { headers, signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new Error("Couldn't download that image from the OCR service.");
    }
    if (!res.ok) throw new Error(`Couldn't download that image (${res.status})`);

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) throw new Error("That image was empty");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe = (s: string) =>
      (s || "").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-|-$/g, "");
    const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const objectPath = `${safe(data.folder) || "brochure"}/${safe(data.slot)}-${Date.now()}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from("property-images")
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (error) throw new Error(error.message);

    const { data: pub } = supabaseAdmin.storage.from("property-images").getPublicUrl(objectPath);
    return { url: pub.publicUrl };
  });
