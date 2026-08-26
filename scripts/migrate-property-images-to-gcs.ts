/**
 * Phase B, sub-phase B2: re-host existing property images from Supabase
 * Storage onto the GCS bucket B1 already wired new uploads to
 * (`GCS_PUBLIC_IMAGES_BUCKET`).
 *
 * Two independent sources, migrated separately:
 *  - V1 (hosted Supabase `properties` table): `image_url` + `gallery` jsonb
 *    (`{ livingRoom, pool, clubhouse, masterBedroom }`), written back via
 *    supabase-js `update()`.
 *  - V2 (local Postgres `property_publication_versions`): `publicSnapshot
 *    .heroImageUrl` is the only image field in `publicationRevisionSchema`
 *    (see src/domain/publication.ts) — gallery/multi-image display for V2
 *    is deliberately out of scope (propertyAssets has no rendered gallery
 *    yet, per the Phase B plan doc). Only the *current* publication version
 *    per property is updated — older versions aren't rendered anywhere and
 *    keep their original (still-working, until Phase D) Supabase URLs. This
 *    is a direct field update on that one JSONB column, not a new version
 *    row: relocating where a file lives isn't a content edit, so it doesn't
 *    need to go through `createReviewerCorrection`/a review workflow.
 *
 * Idempotent — any URL that already points at the target GCS bucket, or
 * doesn't match the Supabase Storage public-URL shape, is left alone.
 * Per-image failures (download or upload) are logged and skipped; they
 * don't abort the run — old Supabase URLs keep working until Supabase
 * Storage is torn down in Phase D cleanup, so a partial re-host is safe.
 *
 * WARNING: `DATABASE_URL` locally is a native Postgres on 127.0.0.1:5433,
 * not a tunnel into the VM. Running `--apply` locally only touches local
 * dev data. Reaching real production data requires running this on the VM
 * itself, against the real $DATABASE_URL there.
 *
 *   bun scripts/migrate-property-images-to-gcs.ts           # dry run
 *   bun scripts/migrate-property-images-to-gcs.ts --apply   # writes
 */
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client.server";
import { properties, propertyPublicationVersions } from "@/db/schema";
import { uploadPublicObject } from "@/server/gcs.server";

const APPLY = process.argv.includes("--apply");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GCS_BUCKET = process.env.GCS_PUBLIC_IMAGES_BUCKET;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (.env).");
  process.exit(1);
}
if (!GCS_BUCKET) {
  console.error("Missing GCS_PUBLIC_IMAGES_BUCKET in environment (.env).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SUPABASE_STORAGE_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/`;
const GCS_URL_PREFIX = `https://storage.googleapis.com/${GCS_BUCKET}/`;

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

function contentTypeFor(url: string): string {
  const ext = url.split("?")[0].split(".").pop();
  return CONTENT_TYPES[`.${(ext ?? "").toLowerCase()}`] ?? "application/octet-stream";
}

function needsMigration(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith(SUPABASE_STORAGE_PREFIX);
}

/** Download a Supabase Storage object and re-upload it to the GCS bucket, returning the new URL. */
async function rehost(sourceUrl: string, objectPath: string): Promise<string | null> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    console.warn(`  ! download failed (${res.status}): ${sourceUrl}`);
    return null;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  try {
    return await uploadPublicObject(GCS_BUCKET!, objectPath, buffer, contentTypeFor(sourceUrl));
  } catch (error) {
    console.warn(`  ! upload failed for ${objectPath}: ${(error as Error).message}`);
    return null;
  }
}

interface V1Row {
  id: string;
  slug: string;
  image_url: string | null;
  gallery: Partial<Record<"livingRoom" | "pool" | "clubhouse" | "masterBedroom", string>> | null;
}

async function migrateV1() {
  const { data, error } = await supabase
    .from("properties")
    .select("id, slug, image_url, gallery")
    .order("slug");
  if (error) throw error;
  const rows = (data ?? []) as V1Row[];

  console.log(`\n=== V1 (Supabase properties): ${rows.length} row(s) ===`);
  let planned = 0;
  for (const row of rows) {
    const gallerySlots = row.gallery ?? {};
    const toMigrate: Array<{ field: "image_url" | keyof typeof gallerySlots; url: string }> = [];
    if (needsMigration(row.image_url)) toMigrate.push({ field: "image_url", url: row.image_url });
    for (const [slot, url] of Object.entries(gallerySlots)) {
      if (needsMigration(url)) toMigrate.push({ field: slot as keyof typeof gallerySlots, url });
    }
    if (!toMigrate.length) continue;
    planned++;
    console.log(`  [${row.slug}] ${toMigrate.length} image(s) to re-host`);
    if (!APPLY) continue;

    const nextImageUrl = row.image_url;
    const nextGallery = { ...gallerySlots };
    let ok = true;
    for (const { field, url } of toMigrate) {
      const filename = url.split("/").pop() ?? "image";
      const objectPath = `v1/${row.slug}/${filename}`;
      const newUrl = await rehost(url, objectPath);
      if (!newUrl) {
        ok = false;
        continue;
      }
      if (field === "image_url") row.image_url = newUrl;
      else nextGallery[field] = newUrl;
    }
    if (!ok) {
      console.warn(`  ! ${row.slug}: one or more images failed, skipping DB write for this row`);
      continue;
    }
    const { error: updateError } = await supabase
      .from("properties")
      .update({ image_url: row.image_url ?? nextImageUrl, gallery: nextGallery })
      .eq("id", row.id);
    if (updateError) {
      console.warn(`  ! ${row.slug}: DB update failed: ${updateError.message}`);
    } else {
      console.log(`  ok: ${row.slug}`);
    }
  }
  console.log(`V1: ${planned} row(s) ${APPLY ? "processed" : "would be processed"}.`);
}

async function migrateV2() {
  const db = getDatabase();
  const rows = await db
    .select({
      propertyId: properties.id,
      slug: properties.slug,
      versionId: propertyPublicationVersions.id,
      publicSnapshot: propertyPublicationVersions.publicSnapshot,
    })
    .from(properties)
    .innerJoin(
      propertyPublicationVersions,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    );

  console.log(`\n=== V2 (local Postgres, current publication versions): ${rows.length} row(s) ===`);
  let planned = 0;
  for (const row of rows) {
    const heroImageUrl = row.publicSnapshot.heroImageUrl;
    if (!needsMigration(typeof heroImageUrl === "string" ? heroImageUrl : null)) continue;
    planned++;
    console.log(`  [${row.slug}] hero image to re-host`);
    if (!APPLY) continue;

    const url = heroImageUrl as string;
    const filename = url.split("/").pop() ?? "hero";
    const objectPath = `v2/${row.slug}/${filename}`;
    const newUrl = await rehost(url, objectPath);
    if (!newUrl) {
      console.warn(`  ! ${row.slug}: hero image failed, skipping DB write for this row`);
      continue;
    }
    await db
      .update(propertyPublicationVersions)
      .set({ publicSnapshot: { ...row.publicSnapshot, heroImageUrl: newUrl } })
      .where(eq(propertyPublicationVersions.id, row.versionId));
    console.log(`  ok: ${row.slug}`);
  }
  console.log(`V2: ${planned} row(s) ${APPLY ? "processed" : "would be processed"}.`);
}

async function main() {
  console.log(`Target bucket: ${GCS_BUCKET} (${GCS_URL_PREFIX})`);
  await migrateV1();
  await migrateV2();
  if (!APPLY) {
    console.log(`\nDry run — no writes made. Re-run with --apply to migrate the images above.`);
  } else {
    console.log(`\nDone.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
