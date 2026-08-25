/**
 * Phase 3 — drive the already-extracted brochures through the canonical
 * submission workflow and into the v2 catalogue tables.
 *
 *   bun scripts/load-brochures.ts --plan               # no writes; report only
 *   bun scripts/load-brochures.ts --plan --name avant  # one property
 *   bun scripts/load-brochures.ts --publish            # create + publish
 *
 * This deliberately does NOT re-run OCR. The job JSONs in
 * property-ocr-suite/backend/storage/jobs/ are the extraction output, already
 * human-checked and RERA-enriched; re-extracting would spend LLM budget to
 * throw that away. What was actually missing is this step — nothing on disk
 * had ever been fed into the submission workflow.
 *
 * It also does not invent a publish path: it calls the same three repository
 * functions the developer portal calls (saveDeveloperRevision →
 * submitDeveloperWorkflow → publishWorkflow), so anything published here is
 * indistinguishable from a real developer submission approved by a reviewer.
 * The v1 Supabase `property_submissions` table is intentionally not touched —
 * that is the legacy workflow, and it is PostgREST-bound.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { configurationOptions, markets, properties } from "@/db/schema";
import { buildPublicationRevision } from "@/domain/publication-mapping.server";
import { publicationRevisionSchema, type PublicationRevision } from "@/domain/publication";
import {
  mapExtractedPayload,
  type PropertyExtraction,
  type ExtractedField,
} from "@/lib/brochure-field-mapping";
import {
  emptyPropertyForm,
  propertyFormSchema,
  type PropertyFormValues,
} from "@/lib/property-schema";
import type { ConfigurationKind } from "@/generated/property-contract";

const JOBS_DIR = resolve("property-ocr-suite/backend/storage/jobs");
const OUT_DIR = resolve("property-ocr-suite/backend/storage/publication-plan");

interface Job {
  file: string;
  name: string;
  extraction: PropertyExtraction;
}

interface Plan {
  file: string;
  name: string;
  values: PropertyFormValues;
  revision: PublicationRevision | null;
  blockers: string[];
  warnings: string[];
  stated: number;
  notStated: number;
}

function text(field: unknown): string {
  if (field === null || field === undefined) return "";
  if (typeof field === "object" && "value" in (field as ExtractedField)) {
    return String((field as ExtractedField).value ?? "").trim();
  }
  return String(field).trim();
}

/** Same-property duplicates on disk are re-uploads of one brochure, not two
 *  projects. Compared on a loose key so "GODREJ ALTUS" and "Godrej Altus"
 *  collapse; the richest extraction wins rather than the newest file, since a
 *  re-upload that extracted fewer configurations is a worse source. */
function dedupeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadJobs(): Job[] {
  const jobs: Job[] = [];
  for (const file of readdirSync(JOBS_DIR)) {
    if (!file.endsWith(".json") || file === "_manifest.json") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(JOBS_DIR, file), "utf8"));
    } catch {
      console.warn(`  ! ${file}: unreadable JSON, skipped`);
      continue;
    }
    // Some files are the bare extraction, others wrap it in a job envelope.
    const record = parsed as Record<string, unknown>;
    const extraction = ((record.extraction as PropertyExtraction) ?? record) as PropertyExtraction;
    const name = text(extraction.basics?.property_name);
    if (!name) {
      console.warn(`  ! ${file}: no property name, skipped`);
      continue;
    }
    jobs.push({ file, name, extraction });
  }

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
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every extraction field carrying a validation_warning from the backend's
 *  cross-field validators (Phase 4). These force review — §5.1's rule is that
 *  a failed rule outranks model confidence. */
function collectWarnings(extraction: PropertyExtraction): string[] {
  const found: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.validation_warning === "string" && record.validation_warning.trim()) {
      found.push(`${path}: ${record.validation_warning}`);
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "value" || key === "confidence" || key === "citation") continue;
      walk(value, path ? `${path}.${key}` : key);
    }
  };
  walk(extraction, "");
  for (const warning of extraction.warnings ?? []) {
    const message = text(warning);
    if (message) found.push(`extraction: ${message}`);
  }
  return found;
}

function countStates(revision: PublicationRevision): { stated: number; notStated: number } {
  let stated = 0;
  let notStated = 0;
  for (const [key, value] of Object.entries(revision.details)) {
    if (!key.endsWith("State")) continue;
    if (value === "stated") stated += 1;
    else notStated += 1;
  }
  return { stated, notStated };
}

async function loadLookup() {
  const db = getDatabase();
  const [market] = await db
    .select({ id: markets.id, stateCode: markets.stateCode, cityCode: markets.cityCode })
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
  };
}

function buildPlan(job: Job, lookup: Awaited<ReturnType<typeof loadLookup>>): Plan {
  const blockers: string[] = [];
  // mapExtractedPayload returns a Partial — the form's own defaults fill the
  // rest, so no value here is ever invented, only left empty.
  const merged = { ...emptyPropertyForm(), ...mapExtractedPayload(job.extraction) };
  const parsed = propertyFormSchema.safeParse(merged);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      blockers.push(`form ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
  }
  const values = parsed.success ? parsed.data : (merged as PropertyFormValues);

  let revision: PublicationRevision | null = null;
  try {
    const built = buildPublicationRevision(values, lookup);
    const checked = publicationRevisionSchema.safeParse(built);
    if (checked.success) {
      revision = checked.data;
    } else {
      for (const issue of checked.error.issues) {
        blockers.push(`revision ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
    }
  } catch (error) {
    blockers.push(`revision build failed: ${error instanceof Error ? error.message : error}`);
  }

  const counts = revision ? countStates(revision) : { stated: 0, notStated: 0 };
  return {
    file: job.file,
    name: job.name,
    values,
    revision,
    blockers,
    warnings: collectWarnings(job.extraction),
    ...counts,
  };
}

/** The workflow needs a developer to own the submission and a reviewer to
 *  approve it. On a fresh database neither exists; these are created once and
 *  named for exactly what they are, so no publication ever claims to have been
 *  reviewed by a person who did not review it. */
async function ensureAccounts() {
  const db = getDatabase();
  const wanted = [
    { email: "brochure-reviewer@pikorua.dev", role: "developer", name: "Brochure Reviewer" },
    { email: "owner@propcompare.local", role: "owner", name: "PropCompare Owner" },
  ] as const;
  // Raw SQL throughout: the Drizzle mirror of admin_profiles carries only
  // `id`/`role` — it exists to be an FK target, not to be written through — and
  // auth.users is the bootstrap shim with no model at all. Every value below is
  // a compile-time constant from `wanted` or a generated UUID, never user
  // input, so there is no injection surface.
  const ids: string[] = [];
  for (const account of wanted) {
    const rows = (await db.execute(
      sql.raw(`select id from admin_profiles where email = '${account.email}' limit 1`),
    )) as unknown as Array<{ id: string }>;
    if (rows[0]) {
      ids.push(rows[0].id);
      continue;
    }
    const id = crypto.randomUUID();
    // admin_profiles has an FK onto auth.users, so that row must exist first.
    await db.execute(
      sql.raw(
        `insert into auth.users (id, email) values ('${id}', '${account.email}') on conflict (id) do nothing`,
      ),
    );
    await db.execute(
      sql.raw(
        `insert into admin_profiles (id, role, email, full_name)
         values ('${id}', '${account.role}', '${account.email}', '${account.name}')`,
      ),
    );
    ids.push(id);
  }
  return { developerId: ids[0], reviewerId: ids[1] };
}

/** Names already live in the catalogue (current_publication_version_id set),
 *  keyed the same loose way as on-disk dedup. `saveDeveloperRevision` always
 *  inserts a fresh workflow/property when called without a workflowId, so
 *  this is the only thing standing between a re-run and a duplicate. */
async function alreadyPublished(): Promise<Set<string>> {
  const db = getDatabase();
  const rows = await db
    .select({ name: properties.name })
    .from(properties)
    .where(sql`${properties.currentPublicationVersionId} is not null`);
  return new Set(rows.map((row) => dedupeKey(row.name)));
}

async function publish(plans: Plan[]) {
  const { saveDeveloperRevision, submitDeveloperWorkflow } =
    await import("@/repositories/submission-workflow.repository.server");
  const { publishWorkflow } = await import("@/repositories/publication.repository.server");
  const { developerId, reviewerId } = await ensureAccounts();
  const live = await alreadyPublished();

  let published = 0;
  let skipped = 0;
  for (const plan of plans) {
    if (!plan.revision) {
      console.log(`  skip   ${plan.name} — ${plan.blockers.length} blocker(s)`);
      continue;
    }
    if (live.has(dedupeKey(plan.name))) {
      console.log(`  skip   ${plan.name} — already published`);
      skipped += 1;
      continue;
    }
    try {
      const { workflowId } = await saveDeveloperRevision(developerId, plan.revision);
      await submitDeveloperWorkflow(workflowId, developerId);
      const result = await publishWorkflow(workflowId, reviewerId);
      published += 1;
      live.add(dedupeKey(plan.name));
      console.log(`  publish ${plan.name} -> property ${result.propertyId}`);
    } catch (error) {
      console.log(
        `  FAIL   ${plan.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  console.log(`\npublished ${published} of ${plans.length}${skipped ? `, ${skipped} already live` : ""}`);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--publish") ? "publish" : "plan";
  const nameIndex = args.indexOf("--name");
  const filter = nameIndex >= 0 ? args[nameIndex + 1]?.toLowerCase() : undefined;

  let jobs = loadJobs();
  if (filter) jobs = jobs.filter((job) => job.name.toLowerCase().includes(filter));
  console.log(`${jobs.length} unique propert${jobs.length === 1 ? "y" : "ies"} on disk\n`);

  const lookup = await loadLookup();
  const plans = jobs.map((job) => buildPlan(job, lookup));

  const ready = plans.filter((plan) => plan.revision && plan.blockers.length === 0);
  const blocked = plans.filter((plan) => !plan.revision || plan.blockers.length > 0);

  for (const plan of plans) {
    const status = plan.revision && !plan.blockers.length ? "ready " : "BLOCKED";
    const configs = plan.revision?.configurations.length ?? 0;
    console.log(
      `${status} ${plan.name.padEnd(48)} ${String(configs).padStart(2)} config(s)  ` +
        `${plan.stated} stated / ${plan.notStated} not_stated  ` +
        `${plan.warnings.length} warning(s)`,
    );
    for (const blocker of plan.blockers) console.log(`         · ${blocker}`);
  }

  console.log(`\n${ready.length} ready to publish, ${blocked.length} blocked.`);

  if (mode === "plan") {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const plan of plans) {
      writeFileSync(
        join(OUT_DIR, `${plan.file.replace(/\.json$/, "")}.plan.json`),
        JSON.stringify(
          {
            name: plan.name,
            sourceFile: plan.file,
            blockers: plan.blockers,
            warnings: plan.warnings,
            revision: plan.revision,
          },
          null,
          2,
        ),
      );
    }
    console.log(`\nplans written to ${OUT_DIR}`);
    console.log("no database writes were made — re-run with --publish to load them");
    return;
  }

  await publish(ready);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
