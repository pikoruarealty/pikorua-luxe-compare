/**
 * Phase C, sub-phase C6: republish every live V2 property so its
 * `public_snapshot` carries the `presentation` block C3a added.
 *
 * C3a taught the publication contract about the ten editorial fields the
 * public property page actually renders (tagline, possession, expert note,
 * gallery, amenities, advantages, …). It could not backfill them: publication
 * versions are immutable, enforced by `reject_immutable_version_change()`, so
 * the only way an existing property gains those fields is a *new* version
 * published through the normal workflow.
 *
 * What this does per property, and deliberately no more:
 *
 *   1. Read the revision that produced the property's current publication
 *      version (`current_publication_version_id` -> `source_revision_id`).
 *   2. Graft `presentation` onto it from the matching V1 Supabase row. Every
 *      other key — configurations, details, property identity — is carried
 *      across byte-for-byte. Nothing this script does may change a comparable
 *      fact or a PropScore input; it is relocating editorial content, not
 *      re-deriving the catalogue.
 *   3. saveDeveloperRevision(..., propertyId) -> submitDeveloperWorkflow ->
 *      publishWorkflow, i.e. the real state machine. A published workflow can
 *      only go to `superseded` and is not editable, so a new draft workflow
 *      bound to the same property is the only legal path; `properties` stays
 *      live throughout because only publishWorkflow touches
 *      `current_publication_version_id`.
 *
 * On publishing without a human reviewer: the content being written is already
 * live on the public site via V1, so nothing unreviewed becomes public. This is
 * a storage move. The original developer and the original reviewer are carried
 * over from the existing workflow and publication version rather than
 * attributing the work to whoever runs this.
 *
 * Properties whose grafted presentation is identical to what the current
 * revision already holds are skipped, so a second run publishes nothing and the
 * script is safe to re-run after a partial failure.
 *
 * Matching is by slug, falling back to SLUG_OVERRIDES for the 12 properties
 * whose V1 and V2 slugs diverged (verified by hand, see the comment on that
 * map). Any V2 property with no V1 row at either is reported and skipped —
 * republishing it with an empty presentation would blank fields that a later
 * reader will expect to find.
 *
 * WARNING: `DATABASE_URL` locally is a native Postgres on 127.0.0.1:5433, not a
 * tunnel into the VM. Reaching real production data requires running this on
 * the VM itself.
 *
 *   bun scripts/republish-with-presentation.ts           # dry run
 *   bun scripts/republish-with-presentation.ts --apply   # publishes
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import {
  properties,
  propertyPublicationVersions,
  propertySubmissionRevisions,
  propertySubmissionWorkflows,
} from "@/db/schema";
import {
  emptyPublicationPresentation,
  publicationRevisionSchema,
  type PublicationPresentation,
} from "@/domain/publication";
import { publishWorkflow } from "@/repositories/publication.repository.server";
import {
  saveDeveloperRevision,
  submitDeveloperWorkflow,
} from "@/repositories/submission-workflow.repository.server";

const APPLY = process.argv.includes("--apply");

/** V1's slug diverged from V2's for these 12 properties — renames, brand
 *  prefixes dropped/added, or a name written out differently between the two
 *  imports. Verified by hand (see scripts/diagnose-slug-mismatch.ts and
 *  scripts/diagnose-shantigram.ts): "the-capstone" was confirmed with the
 *  user as the same project renamed to "The Beaumonde"; "shantigram" and
 *  "the-north-park-at-shantigram" were confirmed against GujRERA's public
 *  registry directly (RAA15538 is registered as "BELROSA", RAA01824 as
 *  "NORTH PARK (Phase-2 and 3)") rather than guessed from names, since both
 *  are Adani sub-projects sharing the same Shantigram township address and a
 *  name-only match would have picked the wrong one. Every other live V2
 *  property matches its V1 row by slug directly and needs no entry here. */
const SLUG_OVERRIDES: Record<string, string> = {
  "360": "maruti-360",
  "anamika-high-point": "anamika",
  luxor: "satyamev-luxor",
  "rashmi-skyscape": "rashm-sky-scape",
  "riviera-select": "goyal-riviera-select",
  shantigram: "belrosa",
  "swati-senor-residential-project-at-ambli-road-ahmedabad": "swati-senor",
  "the-bellagio": "belagio",
  "the-capstone": "capstone",
  "the-kimana-towers": "kimana",
  "the-north-park-at-shantigram": "northpark",
  "the-west-park": "westpark",
};

/** The V1 columns that feed `presentation`, and nothing else — this script has
 *  no business reading the rest of the row. */
const V1_COLUMNS =
  "slug, tagline, status, possession, possession_as_of, expert_note, available_bhk_types, rera_url, gallery, amenities, advantages";

interface V1Row {
  slug: string;
  tagline: string | null;
  status: string | null;
  possession: string | null;
  possession_as_of: string | null;
  expert_note: string | null;
  available_bhk_types: string | null;
  rera_url: string | null;
  gallery: Record<string, string> | null;
  amenities: string[] | null;
  advantages: string[] | null;
}

/** V1 uses "-" as a not-stated placeholder in several text columns (see
 *  getPropertyForEdit, which strips the same marker); carrying it into V2 would
 *  publish a literal hyphen as the property's status. */
function nz(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed.length || trimmed === "-") return null;
  return trimmed;
}

/** A URL or nothing. `presentation` types these as `z.string().url()`, and V1
 *  holds a few blanks and at least one non-URL placeholder; letting one through
 *  would fail the whole revision parse rather than that one field. */
function url(value: string | null | undefined): string | null {
  const trimmed = nz(value);
  if (!trimmed) return null;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

function list(value: string[] | null | undefined): string[] {
  return (value ?? [])
    .map((entry) => (entry ?? "").trim())
    .filter((entry) => entry.length > 0 && entry.length <= 200)
    .slice(0, 100);
}

function presentationFromV1(row: V1Row): PublicationPresentation {
  const gallery = row.gallery ?? {};
  return {
    ...emptyPublicationPresentation(),
    tagline: nz(row.tagline),
    status: nz(row.status),
    possession: nz(row.possession),
    possessionAsOf: nz(row.possession_as_of),
    expertNote: nz(row.expert_note),
    availableBhkTypes: nz(row.available_bhk_types),
    reraUrl: url(row.rera_url),
    gallery: {
      livingRoom: url(gallery.livingRoom),
      pool: url(gallery.pool),
      clubhouse: url(gallery.clubhouse),
      masterBedroom: url(gallery.masterBedroom),
    },
    amenities: list(row.amenities),
    advantages: list(row.advantages),
  };
}

function summarise(presentation: PublicationPresentation): string {
  const filled = [
    presentation.tagline && "tagline",
    presentation.status && "status",
    presentation.possession && "possession",
    presentation.expertNote && "expertNote",
    presentation.reraUrl && "reraUrl",
    Object.values(presentation.gallery).some(Boolean) && "gallery",
    presentation.amenities.length > 0 && `amenities(${presentation.amenities.length})`,
    presentation.advantages.length > 0 && `advantages(${presentation.advantages.length})`,
  ].filter(Boolean);
  return filled.length ? filled.join(", ") : "nothing to add";
}

async function main() {
  const db = getDatabase();

  // Live properties only. An unpublished or never-published row has no current
  // version to read a revision from, and republishing it would be a decision
  // about what should be public — not this script's call to make.
  const live = await db
    .select({
      id: properties.id,
      slug: properties.slug,
      name: properties.name,
      currentVersionId: properties.currentPublicationVersionId,
    })
    .from(properties)
    .where(and(eq(properties.isPublished, true), isNotNull(properties.currentPublicationVersionId)))
    .orderBy(properties.slug);

  console.log(`Live V2 properties: ${live.length}`);
  if (live.length === 0) {
    console.log("Nothing to republish.");
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("properties").select(V1_COLUMNS);
  if (error) throw new Error(`Couldn't read Supabase properties: ${error.message}`);
  const v1BySlug = new Map(((data ?? []) as unknown as V1Row[]).map((row) => [row.slug, row]));
  console.log(`V1 Supabase properties: ${v1BySlug.size}`);

  const versionRows = await db
    .select({
      id: propertyPublicationVersions.id,
      sourceRevisionId: propertyPublicationVersions.sourceRevisionId,
      verifiedBy: propertyPublicationVersions.verifiedBy,
    })
    .from(propertyPublicationVersions)
    .where(
      inArray(
        propertyPublicationVersions.id,
        live.map((row) => row.currentVersionId as string),
      ),
    );
  const versions = new Map(versionRows.map((row) => [row.id, row]));

  const revisionIds = versionRows
    .map((row) => row.sourceRevisionId)
    .filter((id): id is string => id !== null);
  const revisionRows = revisionIds.length
    ? await db
        .select({
          id: propertySubmissionRevisions.id,
          payload: propertySubmissionRevisions.submittedPayload,
          createdBy: propertySubmissionRevisions.createdBy,
          developerId: propertySubmissionWorkflows.developerId,
        })
        .from(propertySubmissionRevisions)
        .innerJoin(
          propertySubmissionWorkflows,
          eq(propertySubmissionRevisions.workflowId, propertySubmissionWorkflows.id),
        )
        .where(inArray(propertySubmissionRevisions.id, revisionIds))
    : [];
  const revisions = new Map(revisionRows.map((row) => [row.id, row]));

  interface Planned {
    propertyId: string;
    slug: string;
    name: string;
    developerId: string;
    reviewerId: string;
    payload: unknown;
    summary: string;
  }
  const planned: Planned[] = [];
  const skipped: string[] = [];

  for (const property of live) {
    const version = versions.get(property.currentVersionId as string);
    if (!version) {
      skipped.push(`${property.slug} — current publication version row is missing`);
      continue;
    }
    if (!version.sourceRevisionId) {
      // Rows published before the workflow recorded its source (or loaded by a
      // direct script) have no revision to carry forward. Rebuilding one from
      // the snapshot would re-derive configurations, which is exactly what this
      // script promises not to do.
      skipped.push(`${property.slug} — publication version has no source_revision_id`);
      continue;
    }
    const revision = revisions.get(version.sourceRevisionId);
    if (!revision) {
      skipped.push(`${property.slug} — source revision ${version.sourceRevisionId} not found`);
      continue;
    }
    const v1 = v1BySlug.get(property.slug) ?? v1BySlug.get(SLUG_OVERRIDES[property.slug] ?? "");
    if (!v1) {
      skipped.push(`${property.slug} — no V1 row at this slug or its override`);
      continue;
    }

    const parsed = publicationRevisionSchema.parse(revision.payload);
    const presentation = presentationFromV1(v1);
    if (JSON.stringify(parsed.presentation) === JSON.stringify(presentation)) {
      skipped.push(`${property.slug} — presentation already current`);
      continue;
    }

    planned.push({
      propertyId: property.id,
      slug: property.slug,
      name: property.name,
      // Attribute to whoever originally submitted and approved this property,
      // not to whoever is running the script.
      developerId: revision.developerId,
      reviewerId: version.verifiedBy,
      payload: { ...parsed, presentation },
      summary: summarise(presentation),
    });
  }

  console.log(`\nTo republish: ${planned.length}`);
  for (const item of planned) {
    console.log(`  ${item.slug} — ${item.summary}`);
  }
  if (skipped.length) {
    console.log(`\nSkipped: ${skipped.length}`);
    for (const reason of skipped) console.log(`  ! ${reason}`);
  }

  if (!APPLY) {
    console.log(`\nDry run — no writes made. Re-run with --apply to republish ${planned.length}.`);
    return;
  }
  if (planned.length === 0) {
    console.log("\nNothing to republish.");
    return;
  }

  let published = 0;
  for (const item of planned) {
    // One property per iteration, each of the three calls in its own
    // transaction (they open their own). A failure part-way leaves that
    // property's new workflow mid-flight and its published version untouched —
    // the site keeps serving the old version, and a re-run picks up the rest.
    try {
      const { workflowId } = await saveDeveloperRevision(
        item.developerId,
        item.payload,
        undefined,
        item.propertyId,
      );
      await submitDeveloperWorkflow(workflowId, item.developerId);
      await publishWorkflow(workflowId, item.reviewerId);
      published += 1;
      console.log(`  published ${item.slug}`);
    } catch (e) {
      console.error(`  ! FAILED ${item.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nRepublished ${published} of ${planned.length}.`);
  if (published !== planned.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
