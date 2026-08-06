import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/integrations/supabase/admin-auth-middleware";
import type { ExtractionResponse, PropertyExtraction } from "@/lib/brochure-field-mapping";

/** How long a browser has to start its upload after asking for a ticket. Long
 *  enough to pick up a slow connection, short enough that a token scraped from
 *  a request log is worthless by the time anyone reads it. */
const UPLOAD_TICKET_TTL_SECONDS = 900;

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

/** `<unix-expiry>.<hex hmac>` — Web Crypto so this works unchanged on both
 *  Cloudflare Workers and Vercel's node runtime. */
async function signUploadToken(secret: string): Promise<string> {
  const expiry = String(Math.floor(Date.now() / 1000) + UPLOAD_TICKET_TTL_SECONDS);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(expiry));
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${expiry}.${hex}`;
}

/** Authorises the browser to upload its brochures straight to the extractor.
 *
 *  The file deliberately does not travel through this server. A brochure runs
 *  to tens of megabytes — one here is 31MB, another larger — and both of our
 *  deploy targets cap what may be POSTed to a server function (Vercel at
 *  4.5MB). Relaying the bytes would therefore fail in production no matter what
 *  limit this code claimed, and base64-ing them for the trip added a third
 *  again on top. So the browser gets a short-lived signed ticket and posts the
 *  raw files to the service itself; everything after that — progress, results,
 *  images — still goes through here, because those payloads are small and the
 *  service key stays server-side. */
export const createBrochureUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .handler(async (): Promise<{ uploadUrl: string; token: string }> => {
    const { baseUrl } = serviceConfig();
    const apiKey = process.env.BROCHURE_EXTRACTOR_API_KEY;
    return {
      uploadUrl: `${baseUrl}/api/properties/extract`,
      // An extractor running without a key configured wants no auth header at
      // all — sending an unverifiable one would be rejected outright.
      token: apiKey ? await signUploadToken(apiKey) : "",
    };
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
        // Generous: this is polled for minutes on end, so the cost of waiting
        // out a slow response is far lower than the cost of abandoning a job
        // that is still running. The caller retries either way.
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      // Don't guess at a cause in the message — an earlier version claimed the
      // service had restarted, which sent debugging down the wrong path when
      // the truth was a dropped keep-alive socket on a job that finished fine.
      // The caller retries these, so this only ever surfaces if they persist.
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Couldn't read extraction progress: ${reason}`);
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
      (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, "-")
        .replace(/^-|-$/g, "");
    const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const objectPath = `${safe(data.folder) || "brochure"}/${safe(data.slot)}-${Date.now()}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from("property-images")
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (error) throw new Error(error.message);

    const { data: pub } = supabaseAdmin.storage.from("property-images").getPublicUrl(objectPath);
    return { url: pub.publicUrl };
  });
