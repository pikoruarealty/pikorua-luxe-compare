/** Fetches a project's own website — as printed in its brochure — and surfaces
 *  what's on the homepage for a human to read. Never searches the web for a
 *  site we weren't given; never writes anything back into an extraction.
 *
 *  Why this exists: brochures often print a project's domain, and that page
 *  can carry things the brochure doesn't (a current RERA registration number,
 *  a construction-progress note, updated contact details). This is a research
 *  aid, not a data source — nothing it prints is merged into any job file, the
 *  extraction schema, or a database. A human reads the output and decides what
 *  (if anything) is worth acting on, same posture as scripts/rera-pilot.ts's
 *  "candidate" tier.
 *
 *  Deliberately narrow, per team decision (2026-08-23):
 *  - Brochure-printed URL only. If `basics.website` wasn't extracted from the
 *    brochure, the job is skipped — this script does not search the web to
 *    *find* a site. (Doing that would need a real search API and a separate
 *    decision to pay for one.)
 *  - One page per project — the homepage the printed URL resolves to. No
 *    crawling, no following internal links.
 *  - One request at a time, spaced out, honestly identified — these are many
 *    different small businesses' hosts, not one host we have a standing
 *    understanding with like RERA's.
 *
 *  Usage:
 *    bun run scripts/website-lookup.ts [--only=<name fragment>]
 *    bun run scripts/website-lookup.ts --url=<url> --name=<label>   (one-off, no job file needed)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const JOB_DIR = "property-ocr-suite/backend/storage/jobs";
const PAUSE_MS = 800;
const TIMEOUT_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; PikoruaLuxeCompareResearch/1.0)";

const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const URL_OVERRIDE = process.argv.find((a) => a.startsWith("--url="))?.slice("--url=".length);
const NAME_OVERRIDE = process.argv.find((a) => a.startsWith("--name="))?.slice("--name=".length);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────── what to fetch

type Target = { name: string; url: string; source: string };

function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

/** Extractions run before `basics.website` existed in the schema simply won't
 *  have this field — those jobs are silently skipped, not treated as errors.
 *  Re-running extraction on old uploads is a separate decision, not this
 *  script's job. */
function loadTargets(): Target[] {
  if (URL_OVERRIDE) {
    const url = normalizeUrl(URL_OVERRIDE);
    if (!url) {
      console.log(`! --url=${URL_OVERRIDE} doesn't parse as a URL`);
      return [];
    }
    return [{ name: NAME_OVERRIDE ?? url, url, source: "--url override" }];
  }

  const targets: Target[] = [];
  if (!existsSyncSafe(JOB_DIR)) return targets;
  const seen = new Set<string>();

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
    const websiteRaw = basics?.website?.value ? String(basics.website.value).trim() : "";
    if (!name || !websiteRaw) continue;
    if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) continue;

    const url = normalizeUrl(websiteRaw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    targets.push({ name, url, source: file });
  }
  return targets.sort((a, b) => a.name.localeCompare(b.name));
}

function existsSyncSafe(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────── fetch + read

async function fetchPage(
  url: string,
): Promise<{ status: number; html: string } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html"))
      return { error: `served ${type || "unknown content-type"}, not HTML` };
    const html = await res.text();
    return { status: res.status, html };
  } catch (err) {
    return { error: (err as Error).name === "AbortError" ? "timed out" : (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&#39;": "'",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
};

function visibleText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  for (const [ent, ch] of Object.entries(ENTITIES)) s = s.split(ent).join(ch);
  return s.replace(/\s+/g, " ").trim();
}

function pageTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
}

/** GujRERA registration numbers are printed as one unbroken token
 *  (PR/GJ/.../RAA14025/A1R/060525/311229) even when the surrounding brochure
 *  or webpage text wraps around them. */
function reraMentions(text: string): string[] {
  const hits = text.match(/PR\/GJ\/[^\s"'<>)]{10,100}/g) ?? [];
  return [...new Set(hits)];
}

// ─────────────────────────────────────────────────────────── main

async function main() {
  const targets = loadTargets();
  console.log(`\nLooking up ${targets.length} project website(s) — homepage only, one at a time.`);
  console.log(`Read-only: nothing is written back to any job file or database.\n`);

  if (!targets.length) {
    console.log(`Nothing to do. Either pass --url=<url> --name=<label> for a one-off lookup,`);
    console.log(`or re-run extraction on a brochure so "basics.website" gets populated —`);
    console.log(`no existing job in ${JOB_DIR} has that field yet (it's a new schema addition).\n`);
    return;
  }

  let ok = 0;
  let failed = 0;

  for (const t of targets) {
    if (targets.indexOf(t) > 0) await sleep(PAUSE_MS);
    console.log(`─── ${t.name}  (${t.source})`);
    console.log(`    ${t.url}`);

    const res = await fetchPage(t.url);
    if ("error" in res) {
      console.log(`  ! ${res.error}\n`);
      failed++;
      continue;
    }
    if (res.status >= 400) {
      console.log(`  ! HTTP ${res.status}\n`);
      failed++;
      continue;
    }
    ok++;
    const title = pageTitle(res.html);
    const text = visibleText(res.html);
    const rera = reraMentions(text);

    if (title) console.log(`  title   : ${title}`);
    if (rera.length) {
      console.log(
        `  RERA no.: ${rera.join(", ")}  ← cross-check against scripts/rera-matches.json`,
      );
    }
    console.log(`  excerpt : ${text.slice(0, 400)}${text.length > 400 ? "…" : ""}`);
    console.log();
  }

  console.log(`══════════ SUMMARY ══════════`);
  console.log(`  fetched : ${ok}`);
  console.log(`  failed  : ${failed}`);
  console.log(
    `\nAttribute anything used from these pages to the project's own website, not RERA.\n`,
  );
}

main();
