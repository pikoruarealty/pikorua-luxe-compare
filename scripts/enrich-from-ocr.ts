/**
 * Phase C, sub-phase C7 follow-up: re-source every live V2 property's content
 * from its OCR brochure extraction wherever the extraction found a value,
 * falling back to whatever is live today (V1-derived, from C6) for anything
 * OCR didn't find.
 *
 * Why this exists: C6's `republish-with-presentation.ts` built `presentation`
 * (and every V2 property's original content) entirely from V1 Supabase's own
 * columns. V1 is thin and stale — e.g. `amaris` carries 0 amenities in V1
 * against 87 in its OCR extraction. The OCR job files
 * (property-ocr-suite/backend/storage/jobs/*.json) are richer and were
 * already human-reviewed, but nothing had ever merged them into what's live.
 *
 * How the merge works, per property:
 *
 *   1. Read the revision behind the property's current publication version
 *      (unchanged, unparsed until step 2) and turn it back into
 *      `PropertyFormValues` via `buildFormValuesFromRevision` (C3a's reverse
 *      mapper) — this is "what's live today", in the same shape a developer's
 *      edit form would show.
 *   2. Find the OCR job file whose `basics.property_name` matches this
 *      property's name (loose match, same `dedupeKey` as `load-brochures.ts`)
 *      and run it through `mapExtractedPayload`, which returns only the
 *      fields OCR actually found — nothing invented, nothing defaulted.
 *   3. Merge: `{ ...currentFormValues, ...ocrPartial }`. Every field OCR found
 *      overwrites the live value; every field OCR didn't find keeps the live
 *      value untouched. This is a plain object spread, not a field allowlist,
 *      so it naturally does the right thing for fields with no OCR mapping at
 *      all (gallery, possessionAsOf) — they're simply never in `ocrPartial`,
 *      so the live value survives unconditionally. `configs` is the one
 *      coarse-grained field: if OCR matched *any* BHK variant, `mapExtracted
 *      Payload` sets the *whole* `configs` object, replacing every bucket —
 *      there's no per-variant merge, which is exactly why this script writes
 *      a full old/new config dump per property for a human to skim before
 *      `--apply` rather than trusting the merge blindly there.
 *   4. Re-validate as a form (`propertyFormSchema`), rebuild a revision
 *      (`buildPublicationRevision`), and republish through the real state
 *      machine (saveDeveloperRevision -> submitDeveloperWorkflow ->
 *      publishWorkflow), attributed to the original developer and reviewer —
 *      same pattern as `backfill-amenities.ts` and `load-brochures.ts`.
 *
 * `publishWorkflow` maps `presentation.amenities` onto `amenity_catalog` on
 * every publish (C7), so a property enriched here gets its `property_amenities`
 * rows as a side effect — `backfill-amenities.ts` is only still needed for a
 * property this script doesn't touch (no OCR match) or explicitly skips.
 *
 * A property with no matching OCR job, or whose merged form/revision fails
 * validation, is skipped — its live content is left exactly as-is.
 *
 * WARNING: `DATABASE_URL` locally is a native Postgres on 127.0.0.1:5433, not
 * a tunnel into the VM. Reaching real production data requires running this
 * on the VM itself. `SUPABASE_*` env vars are not used here at all — nothing
 * touches V1.
 *
 *   bun scripts/enrich-from-ocr.ts           # dry run, writes review dumps
 *   bun scripts/enrich-from-ocr.ts --apply   # publishes
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import {
  configurationOptions,
  markets,
  properties,
  propertyPublicationVersions,
  propertySubmissionRevisions,
  propertySubmissionWorkflows,
} from "@/db/schema";
import { publicationRevisionSchema, type PublicationRevision } from "@/domain/publication";
import { buildPublicationRevision } from "@/domain/publication-mapping.server";
import { buildFormValuesFromRevision } from "@/domain/publication-to-form.server";
import {
  mapExtractedPayload,
  type ExtractedField,
  type PropertyExtraction,
} from "@/lib/brochure-field-mapping";
import {
  emptyPropertyForm,
  propertyFormSchema,
  type PropertyFormValues,
} from "@/lib/property-schema";
import type { ConfigurationKind } from "@/generated/property-contract";
import { publishWorkflow } from "@/repositories/publication.repository.server";
import {
  saveDeveloperRevision,
  submitDeveloperWorkflow,
} from "@/repositories/submission-workflow.repository.server";

const APPLY = process.argv.includes("--apply");
const JOBS_DIR = resolve("property-ocr-suite/backend/storage/jobs");
const REVIEW_DIR = resolve("property-ocr-suite/backend/storage/ocr-enrichment-review");

function jobText(field: unknown): string {
  if (field === null || field === undefined) return "";
  if (typeof field === "object" && "value" in (field as ExtractedField)) {
    return String((field as ExtractedField).value ?? "").trim();
  }
  return String(field).trim();
}

/** Same loose comparison `load-brochures.ts` uses so "AMARIS" and "Amaris"
 *  are the same property. */
function dedupeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Job {
  file: string;
  name: string;
  extraction: PropertyExtraction;
}

function loadJobs(): Job[] {
  const jobs: Job[] = [];
  for (const file of readdirSync(JOBS_DIR)) {
    if (!file.endsWith(".json") || file === "_manifest.json") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(JOBS_DIR, file), "utf8"));
    } catch {
      continue;
    }
    const record = parsed as Record<string, unknown>;
    const extraction = ((record.extraction as PropertyExtraction) ?? record) as PropertyExtraction;
    const name = jobText(extraction.basics?.property_name);
    if (!name) continue;
    jobs.push({ file, name, extraction });
  }

  // A brochure re-uploaded under a second job file is one property, not two —
  // the richer extraction (more configuration variants) wins.
  const best = new Map<string, Job>();
  for (const job of jobs) {
    const key = dedupeKey(job.name);
    const existing = best.get(key);
    if (!existing) {
      best.set(key, job);
      continue;
    }
    const richer =
      (job.extraction.configurations ?? []).length >
      (existing.extraction.configurations ?? []).length;
    if (richer) best.set(key, job);
  }
  return [...best.values()];
}

function fieldDiff(
  before: PropertyFormValues,
  ocrPartial: Partial<PropertyFormValues>,
): { field: string; before: unknown; after: unknown }[] {
  const diffs: { field: string; before: unknown; after: unknown }[] = [];
  for (const key of Object.keys(ocrPartial) as (keyof PropertyFormValues)[]) {
    const beforeValue = before[key];
    const afterValue = ocrPartial[key];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      diffs.push({ field: key, before: beforeValue, after: afterValue });
    }
  }
  return diffs;
}

async function loadLookup() {
  const db = getDatabase();
  const [market] = await db
    .select({
      id: markets.id,
      stateCode: markets.stateCode,
      cityCode: markets.cityCode,
      stateName: markets.stateName,
      cityName: markets.cityName,
    })
    .from(markets)
    .where(eq(markets.isEnabled, true))
    .limit(1);
  if (!market) throw new Error("No enabled market — did the migrations seed `markets`?");
  const optionRows = await db
    .select({ id: configurationOptions.id, kind: configurationOptions.kind })
    .from(configurationOptions);
  return {
    configurationOptionsByKind: new Map(
      optionRows.map((row) => [row.kind as ConfigurationKind, row.id]),
    ),
    marketId: market.id,
    stateCode: market.stateCode,
    cityCode: market.cityCode,
    stateName: market.stateName,
    cityName: market.cityName,
  };
}

async function main() {
  const db = getDatabase();
  const jobs = loadJobs();
  const jobsByKey = new Map(jobs.map((job) => [dedupeKey(job.name), job]));
  console.log(`${jobs.length} unique OCR job(s) on disk`);

  const lookup = await loadLookup();

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

  const versionIds = live.map((row) => row.currentVersionId as string);
  const versionRows = await db
    .select({
      id: propertyPublicationVersions.id,
      sourceRevisionId: propertyPublicationVersions.sourceRevisionId,
      verifiedBy: propertyPublicationVersions.verifiedBy,
    })
    .from(propertyPublicationVersions)
    .where(inArray(propertyPublicationVersions.id, versionIds));
  const versions = new Map(versionRows.map((row) => [row.id, row]));

  const revisionIds = versionRows
    .map((row) => row.sourceRevisionId)
    .filter((id): id is string => id !== null);
  const revisionRows = revisionIds.length
    ? await db
        .select({
          id: propertySubmissionRevisions.id,
          payload: propertySubmissionRevisions.submittedPayload,
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
    developerId: string;
    reviewerId: string;
    payload: PublicationRevision;
    fieldsChanged: number;
    configsChanged: boolean;
  }
  const planned: Planned[] = [];
  const skipped: string[] = [];

  mkdirSync(REVIEW_DIR, { recursive: true });

  for (const property of live) {
    const versionId = property.currentVersionId as string;
    const version = versions.get(versionId);
    if (!version?.sourceRevisionId) {
      skipped.push(`${property.slug} — current publication version/source revision missing`);
      continue;
    }
    const revisionRow = revisions.get(version.sourceRevisionId);
    if (!revisionRow) {
      skipped.push(`${property.slug} — source revision not found`);
      continue;
    }
    const currentParsed = publicationRevisionSchema.safeParse(revisionRow.payload);
    if (!currentParsed.success) {
      skipped.push(
        `${property.slug} — current revision fails schema parse: ${currentParsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
      );
      continue;
    }

    const job = jobsByKey.get(dedupeKey(property.name));
    if (!job) {
      skipped.push(`${property.slug} — no matching OCR job file`);
      continue;
    }

    const currentFormValues = buildFormValuesFromRevision(currentParsed.data, {
      stateName: lookup.stateName,
      cityName: lookup.cityName,
    });
    const ocrPartial = mapExtractedPayload(job.extraction);
    const merged: PropertyFormValues = {
      ...emptyPropertyForm(),
      ...currentFormValues,
      ...ocrPartial,
    };

    const formResult = propertyFormSchema.safeParse(merged);
    if (!formResult.success) {
      skipped.push(
        `${property.slug} — merged form fails schema: ${formResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
      continue;
    }

    let newRevision: PublicationRevision;
    try {
      const built = buildPublicationRevision(formResult.data, lookup);
      const checked = publicationRevisionSchema.safeParse(built);
      if (!checked.success) {
        skipped.push(
          `${property.slug} — rebuilt revision fails schema: ${checked.error.issues.map((i) => i.path.join(".")).join(", ")}`,
        );
        continue;
      }
      newRevision = checked.data;
    } catch (error) {
      skipped.push(
        `${property.slug} — revision build failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const diffs = fieldDiff(currentFormValues, ocrPartial);
    const configsChanged = diffs.some((d) => d.field === "configs");

    writeFileSync(
      join(REVIEW_DIR, `${property.slug}.json`),
      JSON.stringify(
        {
          slug: property.slug,
          matchedJobFile: job.file,
          fieldsChanged: diffs.length,
          configsChanged,
          diffs,
        },
        null,
        2,
      ),
    );

    planned.push({
      propertyId: property.id,
      slug: property.slug,
      developerId: revisionRow.developerId,
      reviewerId: version.verifiedBy,
      payload: newRevision,
      fieldsChanged: diffs.length,
      configsChanged,
    });
  }

  console.log(`\nTo republish: ${planned.length}`);
  for (const item of planned) {
    console.log(
      `  ${item.slug} — ${item.fieldsChanged} field(s) changed${item.configsChanged ? ", CONFIGS CHANGED" : ""} (review: ${join(REVIEW_DIR, `${item.slug}.json`)})`,
    );
  }
  if (skipped.length) {
    console.log(`\nSkipped: ${skipped.length}`);
    for (const reason of skipped) console.log(`  ! ${reason}`);
  }

  if (!APPLY) {
    console.log(`\nDry run — no writes made. Review dumps written to ${REVIEW_DIR}`);
    console.log(`Re-run with --apply to republish ${planned.length}.`);
    return;
  }
  if (planned.length === 0) {
    console.log("\nNothing to republish.");
    return;
  }

  let published = 0;
  for (const item of planned) {
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
