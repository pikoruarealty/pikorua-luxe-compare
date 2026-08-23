/** Fills the RERA facts the team decided are worth keeping as real form
 *  fields, for projects our own extractions have already been hand-matched to
 *  a GujRERA filing — registered timeline (start → completion), construction
 *  progress %, developer track record (filed/completed project counts), and
 *  the RERA ID itself.
 *
 *  Decision trail (2026-08-23): of six RERA-only facts the pilot surfaced
 *  (scripts/rera-pilot.ts), the user approved exactly these three as schema
 *  fields, and explicitly asked that they reuse/pre-fill an existing form
 *  field wherever one is a close match rather than always adding a new one:
 *    - registered timeline start  → rera.proposed_start_date   (existing field)
 *    - registered timeline end    → rera.registered_completion_date (new — no
 *      existing field covered it)
 *    - construction progress %    → rera.construction_progress (new)
 *    - developer track record     → developer.total_delivered_projects /
 *      developer.ongoing_projects  (existing fields)
 *  Registered promoter, total carpet area, and declared project cost were
 *  explicitly turned down and must not be added anywhere.
 *
 *  Decision trail (2026-08-24): the user asked that reraId also be backfilled
 *  from the hand-confirmed match's regNo wherever the brochure itself never
 *  printed one — a verified GujRERA registration number is real data, not an
 *  inference, so "not found in the brochure" is no longer a reason to leave
 *  it blank. reraUrl is deliberately NOT backfilled here: no verified
 *  human-facing GujRERA project URL exists anywhere in this codebase or its
 *  research, and this script does not fabricate one.
 *
 *  Conservative reading of "replaced or pre filled": this script only ever
 *  writes into a field that is currently blank (found === false) and never
 *  human-verified. An already-populated or verified field is left alone and
 *  reported as skipped — outright overwriting a value a human already
 *  reviewed is a bigger step than what was asked for here, and is not what
 *  this script does without that being separately confirmed.
 *
 *  Same posture as scripts/rera-brochures.ts: reads only the hand-confirmed
 *  entityIds in scripts/rera-matches.json (never the pilot's automatic
 *  matches), one connection at a time, dry-run by default.
 *
 *  Usage: bun run scripts/rera-enrich.ts [--only=<name fragment>] [--apply]
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import https from "node:https";
import crypto from "node:crypto";

const JOB_DIR = "property-ocr-suite/backend/storage/jobs";
const BACKUP_DIR = "property-ocr-suite/backend/storage/jobs_rera_enrich_backup";
const MATCH_FILE = "scripts/rera-matches.json";
const HOST = "gujrera.gujarat.gov.in";
const PAUSE_MS = 700;
const APPLY = process.argv.includes("--apply");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);

// ─────────────────────────────────────────────────────────── transport

const agent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  keepAlive: true,
  maxSockets: 1,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Res = { status: number; body: string };

function once(path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: HOST, path, method: "GET", agent, timeout: 120_000, headers: { accept: "*/*" } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.end();
  });
}

let callCount = 0;

async function call<T>(path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(PAUSE_MS * 3 * attempt);
    await sleep(PAUSE_MS);
    callCount++;
    let res: Res;
    try {
      res = await once(path);
    } catch (err) {
      if (attempt === 2) {
        console.log(`      ! ${(err as Error).message}`);
        return null;
      }
      continue;
    }
    if (res.status >= 500 && attempt < 2) continue;
    if (res.status !== 200) return null;
    try {
      const parsed = JSON.parse(res.body);
      return (parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed) as T;
    } catch {
      return null;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────── same shape as rera-pilot.ts's pull()

const DETAIL_KEYS = ["startDateStr", "completionDateStr"] as const;
const PREV_KEYS = ["projectCurrentStatus"] as const;

type Bag = Record<string, unknown>;
type DetailsResponse = { projectDetail?: Bag };
type ProgressRow = { qtr_name?: unknown; project_progress?: unknown };
type PrevListResponse = { pervlist?: unknown[] };

function pick<K extends string>(obj: unknown, keys: readonly K[]): Partial<Record<K, unknown>> {
  const out: Partial<Record<K, unknown>> = {};
  if (obj && typeof obj === "object") for (const k of keys) out[k] = (obj as Bag)[k];
  return out;
}

async function pull(entityId: number) {
  const details = await call<DetailsResponse>(`/project_reg/public/getproject-details/${entityId}`);
  const progress = await call<ProgressRow[]>(`/quarter/get-project-progress/${entityId}`);
  const prev = await call<PrevListResponse>(`/project_reg/public/getprev-project-list/${entityId}`);

  const detail = pick(details?.projectDetail, DETAIL_KEYS);
  const progressRows = Array.isArray(progress)
    ? progress
        .filter((p) => p?.qtr_name)
        .map((p) => ({ quarter: String(p.qtr_name), percent: Number(p.project_progress) }))
    : [];
  const previous = Array.isArray(prev?.pervlist)
    ? prev.pervlist.map((p: unknown) => pick(p, PREV_KEYS))
    : [];

  return {
    startDateStr: typeof detail.startDateStr === "string" ? detail.startDateStr : null,
    completionDateStr:
      typeof detail.completionDateStr === "string" ? detail.completionDateStr : null,
    latestProgress: progressRows.at(-1) ?? null,
    filedCount: previous.length,
    completedCount: previous.filter((p) => /complet/i.test(String(p.projectCurrentStatus ?? "")))
      .length,
  };
}

// ─────────────────────────────────────────────────────────── what to fetch

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type Confirmed = { entityId: number | null; entityName?: string; regNo?: string };

function loadConfirmed(): Map<string, Confirmed> {
  const out = new Map<string, Confirmed>();
  if (!existsSync(MATCH_FILE)) return out;
  try {
    const raw = JSON.parse(readFileSync(MATCH_FILE, "utf-8")) as Record<string, Confirmed>;
    for (const [name, rec] of Object.entries(raw)) {
      if (name.startsWith("//")) continue;
      out.set(norm(name), rec);
    }
  } catch {
    console.log(`  ! ${MATCH_FILE} is unreadable`);
  }
  return out;
}

type Target = { name: string; entityId: number; regNo: string | null; source: string; path: string };

function loadTargets(): Target[] {
  const confirmed = loadConfirmed();
  const targets: Target[] = [];
  const seen = new Set<string>();
  if (!existsSync(JOB_DIR)) return targets;

  for (const file of readdirSync(JOB_DIR)) {
    const path = join(JOB_DIR, file);
    if (!file.endsWith(".json") || statSync(path).size === 0) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      continue;
    }
    const doc = (raw?.extraction ?? raw) as Record<string, unknown>;
    const basics = doc?.basics as Record<string, { value?: unknown }> | undefined;
    const name = basics?.property_name?.value ? String(basics.property_name.value).trim() : "";
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));

    const rec = confirmed.get(norm(name));
    if (!rec?.entityId) continue;
    if (ONLY && !norm(name).includes(norm(ONLY))) continue;
    targets.push({
      name,
      entityId: rec.entityId,
      regNo: rec.regNo?.trim() || null,
      source: rec.entityName ?? "",
      path,
    });
  }
  return targets.sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────── writing

type ExtractedField = {
  value: unknown;
  found: boolean;
  confidence: number;
  source_file: string | null;
  source_page: number | null;
  evidence: string | null;
  verified: boolean;
  derived: boolean;
  validation_warning: string | null;
};

/** True for a field that has never been filled — either it's missing outright
 *  (a job extracted before this field existed in the schema) or it's present
 *  but still blank. Either way it's safe to fill; anything found or verified
 *  is left alone. */
function isBlank(f: unknown): boolean {
  if (f === undefined) return true;
  return (
    !!f &&
    typeof f === "object" &&
    (f as ExtractedField).found === false &&
    (f as ExtractedField).verified === false
  );
}

function riraField(value: string, entityId: number): ExtractedField {
  return {
    value,
    found: true,
    confidence: 0.9,
    source_file: null,
    source_page: null,
    evidence: `GujRERA public disclosure, entityId ${entityId}`,
    verified: false,
    derived: false,
    validation_warning: null,
  };
}

async function main() {
  const targets = loadTargets();
  console.log(`\nEnriching ${targets.length} confirmed project(s) with RERA-filed facts.`);
  console.log(APPLY ? `Writing changes.\n` : `Dry run — pass --apply to write.\n`);

  if (!targets.length) {
    console.log(`Nothing to do. Confirm projects in ${MATCH_FILE} first.\n`);
    return;
  }

  let touched = 0;
  let untouched = 0;
  let skippedFields = 0;

  for (const t of targets) {
    console.log(
      `─── ${t.name}${t.source && norm(t.source) !== norm(t.name) ? `  (filed as ${t.source})` : ""}`,
    );
    const data = await pull(t.entityId);

    const raw = JSON.parse(readFileSync(t.path, "utf-8"));
    const doc = raw?.extraction ?? raw;
    const rera = (doc.rera ?? {}) as Record<string, ExtractedField>;
    const developer = (doc.developer ?? {}) as Record<string, ExtractedField>;

    const writes: Array<{
      section: Record<string, ExtractedField>;
      key: string;
      label: string;
      value: string | null;
    }> = [
      {
        section: rera,
        key: "rera_id",
        label: "RERA ID (confirmed registration no.)",
        value: t.regNo,
      },
      {
        section: rera,
        key: "proposed_start_date",
        label: "registered start",
        value: data.startDateStr,
      },
      {
        section: rera,
        key: "registered_completion_date",
        label: "registered completion",
        value: data.completionDateStr,
      },
      {
        section: rera,
        key: "construction_progress",
        label: "construction progress",
        value: data.latestProgress
          ? `${data.latestProgress.percent.toFixed(1)}% as of ${data.latestProgress.quarter}`
          : null,
      },
      {
        section: developer,
        key: "total_delivered_projects",
        label: "delivered projects (RERA count)",
        value: data.filedCount ? String(data.completedCount) : null,
      },
      {
        section: developer,
        key: "ongoing_projects",
        label: "ongoing projects (RERA count)",
        value: data.filedCount ? String(data.filedCount - data.completedCount) : null,
      },
    ];

    let any = false;
    for (const w of writes) {
      if (w.value === null) continue;
      const existing = w.section[w.key];
      if (!isBlank(existing)) {
        console.log(`  · ${w.label}: skipping — field already has a value or is verified`);
        skippedFields++;
        continue;
      }
      console.log(`  ✓ ${w.label}: ${w.value}`);
      w.section[w.key] = riraField(w.value, t.entityId);
      any = true;
    }

    if (any) {
      touched++;
      if (APPLY) {
        mkdirSync(BACKUP_DIR, { recursive: true });
        copyFileSync(t.path, join(BACKUP_DIR, `${t.path.split(/[\\/]/).pop()}`));
        doc.rera = rera;
        doc.developer = developer;
        writeFileSync(t.path, JSON.stringify(raw, null, 2), "utf-8");
      }
    } else {
      untouched++;
      console.log(`  · nothing to fill`);
    }
    console.log();
  }

  console.log(`══════════ SUMMARY ══════════`);
  console.log(`  projects touched   : ${touched}`);
  console.log(`  projects unchanged : ${untouched}`);
  console.log(`  fields skipped     : ${skippedFields} (already had a value or verified)`);
  console.log(`\n${callCount} request(s) to ${HOST}.`);
  if (!APPLY)
    console.log(`Re-run with --apply to write changes (originals backed up to ${BACKUP_DIR}/).`);
  console.log();
}

main();
