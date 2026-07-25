import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/integrations/supabase/admin-auth-middleware";

const MAX_BASE64_LENGTH = 11_000_000; // ~8MB binary
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

interface UploadInput {
  folder: string;
  slot: string;
  fileName: string;
  contentType: string;
  fileBase64: string;
}

export const uploadPropertyImage = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator((data: UploadInput) => {
    if (!data?.fileBase64 || typeof data.fileBase64 !== "string") {
      throw new Error("No file provided");
    }
    if (data.fileBase64.length > MAX_BASE64_LENGTH) {
      throw new Error("Image is too large (max ~8MB)");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const base64 = data.fileBase64.includes(",")
      ? data.fileBase64.slice(data.fileBase64.indexOf(",") + 1)
      : data.fileBase64;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) throw new Error("Uploaded file was empty");

    const ext = data.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    // Timestamped so replacing an image busts any CDN/browser cache.
    const objectPath = `${data.folder}/${data.slot}-${Date.now()}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from("property-images")
      .upload(objectPath, buffer, { contentType: data.contentType, upsert: true });
    if (error) throw new Error(error.message);

    const { data: pub } = supabaseAdmin.storage.from("property-images").getPublicUrl(objectPath);
    return { url: pub.publicUrl };
  });
