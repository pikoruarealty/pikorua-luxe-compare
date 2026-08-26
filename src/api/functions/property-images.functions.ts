import { createServerFn } from "@tanstack/react-start";
import { throwSafeError } from "@/lib/safe-error";
import { requireAdminAuth } from "@/integrations/supabase/admin-auth-middleware";

export const DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 4_000_000;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

function maxImageUploadBytes(): number {
  const configured = Number.parseInt(process.env.MAX_IMAGE_UPLOAD_BYTES ?? "", 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_IMAGE_UPLOAD_BYTES;
}

function hasImageSignature(buffer: Buffer, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === "image/png") {
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }
  if (contentType === "image/avif") {
    if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return false;
    for (let offset = 8; offset + 4 <= Math.min(buffer.length, 64); offset += 4) {
      const brand = buffer.toString("ascii", offset, offset + 4);
      if (brand === "avif" || brand === "avis") return true;
    }
    return false;
  }
  return false;
}

interface UploadInput {
  folder: string;
  slot: string;
  fileName: string;
  contentType: string;
  fileBase64: string;
}

export const getPropertyImageUploadLimit = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(() => maxImageUploadBytes());

export const uploadPropertyImage = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: UploadInput) => {
    if (!data?.fileBase64 || typeof data.fileBase64 !== "string") {
      throw new Error("No file provided");
    }
    if (!ALLOWED.includes(data.contentType)) {
      throw new Error("Unsupported image type — use JPG, PNG, WebP or AVIF");
    }
    // Keep the storage path free of anything that could escape the folder.
    const safe = (s: string) =>
      (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, "-")
        .replace(/^-|-$/g, "");
    return {
      folder: safe(data.folder) || "uploads",
      slot: safe(data.slot) || "image",
      fileName: safe(data.fileName) || "upload",
      contentType: data.contentType,
      fileBase64: data.fileBase64,
    };
  })
  .handler(async ({ data }) => {
    const { uploadPublicObject } = await import("@/server/gcs.server");

    const base64 = data.fileBase64.includes(",")
      ? data.fileBase64.slice(data.fileBase64.indexOf(",") + 1)
      : data.fileBase64;
    const maxBytes = maxImageUploadBytes();
    if (base64.length > Math.ceil(maxBytes / 3) * 4 + 4) {
      throw new Error(`Image is too large (max ${(maxBytes / 1_000_000).toFixed(1)}MB)`);
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
      throw new Error("Invalid image encoding");
    }
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) throw new Error("Uploaded file was empty");
    if (buffer.length > maxBytes) {
      throw new Error(`Image is too large (max ${(maxBytes / 1_000_000).toFixed(1)}MB)`);
    }
    if (!hasImageSignature(buffer, data.contentType)) {
      throw new Error("Image content does not match the selected file type");
    }

    const ext = data.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    // Timestamped so replacing an image busts any CDN/browser cache.
    const objectPath = `${data.folder}/${data.slot}-${Date.now()}.${ext}`;

    const bucket = process.env.GCS_PUBLIC_IMAGES_BUCKET;
    if (!bucket) throw new Error("GCS_PUBLIC_IMAGES_BUCKET is required");
    let url: string;
    try {
      url = await uploadPublicObject(bucket, objectPath, buffer, data.contentType);
    } catch (error) {
      throwSafeError("uploadPropertyImage", error, "Could not upload image");
    }
    return { url };
  });
