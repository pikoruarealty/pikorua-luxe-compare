/** Downloads the brochure each project filed with GujRERA, for projects our
 *  own extractions have already been matched to.
 *
 *  Why this exists: the document RERA holds is the brochure the developer
 *  submitted as part of a statutory filing, not the one a sales office emailed
 *  us. For a registered project it is the authoritative version of the same
 *  document our OCR pipeline already reads, so it can be fed straight back into
 *  that pipeline — which is the point. Nothing here is for redistribution: we
 *  agreed to use these internally and to link out to RERA's own page if anyone
 *  ever wants the official copy.
 *
 *  Constraints, carried over from scripts/rera-pilot.ts and equally load-bearing:
 *
 *  1. Only the brochure. `getproject-doc` also hands out audited balance
 *     sheets, income-tax returns, PAN cards, title reports and the promoter's
 *     Aadhaar-linked paperwork. BROCHURE_KEY is the only document reference
 *     this script will read, and it is not configurable by a flag. Everything
 *     else in that payload is stepped over without being logged.
 *  2. One connection, one request at a time, with a pause. These are multi-
 *     megabyte PDFs from a government host; a parallel fetch of two dozen of
 *     them is an incident, not a script.
 *  3. Only matched projects. The entityId comes from the pilot's matching
 *     ladder, so a project a human has not resolved is skipped rather than
 *     guessed at — downloading the wrong developer's brochure would poison the
 *     pipeline downstream in a way that is very hard to notice later.
 *
 *  Usage: bun run scripts/rera-brochures.ts [--only=<name fragment>] [--force]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import https from "node:https";
import crypto from "node:crypto";

const JOB_DIR = "property-ocr-suite/backend/storage/jobs";
const OUT_DIR = "property-ocr-suite/backend/storage/rera-brochures";
const MATCH_FILE = "scripts/rera-matches.json";
const HOST = "gujrera.gujarat.gov.in";
const PAUSE_MS = 700;
const FORCE = process.argv.includes("--force");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);

/** The one document key this script is allowed to follow. See constraint 1. */
const BROCHURE_KEY = "brochureOfCurrentProjectDocUId";

// ─────────────────────────────────────────────────────────── transport

/** Same legacy-renegotiation permission the pilot needs, scoped to one agent
 *  for this one host rather than granted process-wide via NODE_OPTIONS. */
const agent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  keepAlive: true,
  maxSockets: 1,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Res = { status: number; body: Buffer; type: string };

/** Buffers rather than decoding, because half of what this script fetches is a
 *  PDF and a string round-trip would quietly corrupt it. */
function once(path: string, body?: unknown): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request(
      {
        host: HOST,
        path,
        method: payload ? "POST" : "GET",
        agent,
        timeout: 120_000,
        headers: {
          accept: "*/*",
          ...(payload
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
            type: String(res.headers["content-type"] ?? ""),
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let callCount = 0;
let bytes = 0;

async function call(path: string, body?: unknown): Promise<Res | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(PAUSE_MS * 3 * attempt);
    await sleep(PAUSE_MS);
    callCount++;
    let res: Res;
    try {
      res = await once(path, body);
    } catch (err) {
      if (attempt === 2) {
        console.log(`      ! ${(err as Error).message}`);
        return null;
      }
      continue;
    }
    if (res.status >= 500 && attempt < 2) continue;
    if (res.status !== 200) return null;
    bytes += res.body.length;
    return res;
  }
  return null;
}

function json<T>(res: Res | null): T | null {
  if (!res) return null;
  try {
    const parsed = JSON.parse(res.body.toString("utf-8"));
    return (parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed) as T;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────── what to fetch

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type Confirmed = { entityId: number | null; entityName?: string; regNo?: string };

/** Only hand-confirmed projects are read here. The pilot's automatic matches
 *  live in memory for the length of one run and are reported for review; this
 *  script deliberately consumes the durable, human-checked list instead, so a
 *  download is always traceable to a decision someone made. */
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

type Target = { name: string; entityId: number; source: string };

/** The extractions carry the project names; rera-matches.json carries the
 *  entityIds a person has confirmed. A project appears here only when both
 *  agree it exists. */
function loadTargets(): Target[] {
  const confirmed = loadConfirmed();
  const targets: Target[] = [];
  const seen = new Set<string>();
  if (!existsSync(JOB_DIR)) return targets;

  for (const file of readdirSync(JOB_DIR)) {
    const path = join(JOB_DIR, file);
    if (!file.endsWith(".json") || statSync(path).size === 0) continue;
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      continue;
    }
    if (doc?.extraction) doc = doc.extraction as Record<string, unknown>;
    const basics = doc?.basics as Record<string, { value?: unknown }> | undefined;
    const name = basics?.property_name?.value ? String(basics.property_name.value).trim() : "";
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));

    const rec = confirmed.get(norm(name));
    if (!rec?.entityId) continue;
    if (ONLY && !norm(name).includes(norm(ONLY))) continue;
    targets.push({ name, entityId: rec.entityId, source: rec.entityName ?? "" });
  }
  return targets.sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────── documents

type DocMeta = { fileName?: string; mimeType?: string; totalPages?: number };

/** Reaches past everything else in the payload to the single allowlisted key.
 *  Written as an explicit lookup rather than a scan so that adding a second
 *  document type has to be a deliberate edit here. */
function brochureUid(docs: unknown): string | null {
  const projectdoc = (docs as Record<string, Record<string, unknown>> | null)?.projectdoc;
  const uid = projectdoc?.[BROCHURE_KEY];
  return typeof uid === "string" && uid.length > 20 ? uid : null;
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");

async function main() {
  const targets = loadTargets();
  console.log(`\nFetching RERA-filed brochures for ${targets.length} confirmed project(s).`);
  console.log(`Internal use only — these are not for redistribution.\n`);

  if (!targets.length) {
    console.log(`Nothing to do. Confirm projects in ${MATCH_FILE} first —`);
    console.log(`run \`bun run scripts/rera-pilot.ts --candidates\` to see what needs deciding.\n`);
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });

  let saved = 0;
  let skipped = 0;
  let missing = 0;

  for (const t of targets) {
    console.log(
      `─── ${t.name}${t.source && norm(t.source) !== norm(t.name) ? `  (filed as ${t.source})` : ""}`,
    );

    const docs = json<unknown>(await call(`/project_reg/public/getproject-doc/${t.entityId}`));
    const uid = brochureUid(docs);
    if (!uid) {
      console.log(`  · no brochure on file with RERA\n`);
      missing++;
      continue;
    }

    const meta = json<DocMeta>(await call(`/vdms/getDocMetadata/${uid}`)) ?? {};
    const stem = `${safe(t.name)}-${t.entityId}`;
    const ext = meta.mimeType === "application/pdf" ? "pdf" : "bin";
    const out = join(OUT_DIR, `${stem}.${ext}`);

    // Re-downloading a 12 MB PDF to get the same bytes is pure cost to a host
    // we are a guest on, so an existing file is left alone unless asked.
    if (existsSync(out) && !FORCE) {
      console.log(`  · already have ${stem}.${ext} — skipping (--force to refetch)\n`);
      skipped++;
      continue;
    }

    const dl = await call(`/vdms/download/${uid}`);
    if (!dl || !dl.body.length) {
      console.log(`  ! download failed\n`);
      missing++;
      continue;
    }
    // The endpoint answers 200 with an HTML error page when a document has been
    // withdrawn, so trust the bytes rather than the status line.
    if (ext === "pdf" && !dl.body.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
      console.log(`  ! served ${dl.body.length} bytes that are not a PDF — not saving\n`);
      missing++;
      continue;
    }

    writeFileSync(out, dl.body);
    saved++;
    console.log(`  ✓ ${meta.fileName ?? "brochure"} → ${out}`);
    console.log(
      `     ${(dl.body.length / 1024 / 1024).toFixed(1)} MB${meta.totalPages ? ` · ${meta.totalPages} pages` : ""}\n`,
    );
  }

  console.log(`══════════ SUMMARY ══════════`);
  console.log(`  saved              : ${saved}`);
  console.log(`  already had        : ${skipped}`);
  console.log(`  no brochure filed  : ${missing}`);
  console.log(`\nWritten to ${OUT_DIR}/ (gitignored).`);
  console.log(
    `${callCount} request(s), ${(bytes / 1024 / 1024).toFixed(1)} MB from ${HOST}. Documents are RERA public disclosure filings.\n`,
  );
}

main();
