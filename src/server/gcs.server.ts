import { Storage } from "@google-cloud/storage";

let storage: Storage | undefined;

function client() {
  storage ??= new Storage({ projectId: process.env.GCP_PROJECT_ID });
  return storage;
}

export async function createPrivatePdfUploadUrl(
  bucket: string,
  objectPath: string,
  sha256: string,
) {
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const [url] = await client()
    .bucket(bucket)
    .file(objectPath)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: "application/pdf",
      extensionHeaders: { "x-goog-meta-sha256": sha256 },
    });
  return { url, expiresAt: new Date(expiresAt).toISOString() };
}

export async function createPrivateReviewEvidenceUploadUrl(
  bucket: string,
  objectPath: string,
  sha256: string,
  contentType: "application/pdf" | "image/jpeg" | "image/png",
) {
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const [url] = await client()
    .bucket(bucket)
    .file(objectPath)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType,
      extensionHeaders: { "x-goog-meta-sha256": sha256 },
    });
  return { url, expiresAt: new Date(expiresAt).toISOString() };
}

// Public bucket, uploaded directly (no signed URL) — the two callers already
// receive the image buffer server-side. Public read is granted at the bucket
// level (allUsers: objectViewer), not per-object, so no ACL call is needed here.
export async function uploadPublicObject(
  bucket: string,
  objectPath: string,
  buffer: Buffer,
  contentType: string,
) {
  await client().bucket(bucket).file(objectPath).save(buffer, { contentType });
  return `https://storage.googleapis.com/${bucket}/${objectPath}`;
}

export async function deletePrivateObject(bucket: string, objectPath: string) {
  await client().bucket(bucket).file(objectPath).delete({ ignoreNotFound: true });
}

export async function getPrivateObjectMetadata(bucket: string, objectPath: string) {
  const [metadata] = await client().bucket(bucket).file(objectPath).getMetadata();
  return {
    contentType: metadata.contentType ?? null,
    sizeBytes: Number(metadata.size ?? -1),
    sha256: metadata.metadata?.sha256 ?? null,
  };
}
