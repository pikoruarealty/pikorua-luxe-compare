/** Cross-references our local brochure extractions against GujRERA's public
 *  disclosure API, and reports what RERA would add, confirm, or contradict.
 *
 *  This is a *pilot*, not a pipeline. The question it exists to answer is
 *  narrow: across the brochures we have actually extracted, how often does
 *  RERA resolve at all, and when it does, is what it returns worth wiring into
 *  the product? Until that is answered with real numbers there is nothing to
 *  design a schema around, so this script deliberately writes nothing — no
 *  files, no database, no cache. It reads and it prints.
 *
 *  Three constraints are load-bearing and should survive any edit:
 *
 *  1. No personal data leaves the client. RERA's project payload embeds the
 *     named engineers', architects' and promoters' email addresses, mobile
 *     numbers and home addresses. We decided that data is not useful to us and
 *     not ours to hold, so `pick()` allowlists every field that crosses out of
 *     the fetch layer. Nothing reaches the report that was not explicitly
 *     named, which means a future endpoint growing a new PII field cannot leak
 *     it into a log by default.
 *  2. We are a guest on a government host. One connection, one request at a
 *     time, a deliberate pause between them, a hard cap on retries. This pulls
 *     a few dozen records for projects we already hold brochures for; it is
 *     not a crawler and must not become one.
 *  3. A fuzzy match is never a match. Anything resolved by name rather than by
 *     registration number is reported as a *candidate* for a human to confirm.
 *
 *  Usage: bun run scripts/rera-pilot.ts [--verbose] [--only=<name fragment>]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import https from "node:https";
import crypto from "node:crypto";

const JOB_DIR = "property-ocr-suite/backend/storage/jobs";
const MATCH_FILE = "scripts/rera-matches.json";
const HOST = "gujrera.gujarat.gov.in";
const PAUSE_MS = 700;
const VERBOSE = process.argv.includes("--verbose");
const CANDIDATES_ONLY = process.argv.includes("--candidates");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);

// ─────────────────────────────────────────────────────────── transport

/** GujRERA's TLS terminator is old enough to require the legacy renegotiation
 *  that OpenSSL 3 refuses by default — a bare fetch() dies with
 *  ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED before it sends a byte. The
 *  permission is granted to this one agent, used for this one host, rather
 *  than via NODE_OPTIONS, so no other request this process might ever make
 *  gets quietly downgraded along with it. */
const agent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  keepAlive: true,
  maxSockets: 1,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function once(path: string, body?: unknown): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request(
      {
        host: HOST,
        path,
        method: payload ? "POST" : "GET",
        agent,
        timeout: 30_000,
        headers: {
          accept: "application/json",
          ...(payload
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf-8");
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let callCount = 0;

/** Sequential by construction: every caller awaits this, and this always
 *  pauses. Two retries on transport failure or 5xx, backing off — enough to
 *  ride out a blip, few enough that a portal having a bad day makes us stop
 *  rather than pile on. A 404 is an answer, not a failure, and is not retried. */
async function call<T = unknown>(path: string, body?: unknown): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(PAUSE_MS * 3 * attempt);
    await sleep(PAUSE_MS);
    callCount++;
    let res: { status: number; text: string };
    try {
      res = await once(path, body);
    } catch (err) {
      if (attempt === 2) {
        console.log(`      ! ${path} — ${(err as Error).message}`);
        return null;
      }
      continue;
    }
    if (res.status >= 500 && attempt < 2) continue;
    if (res.status !== 200) return null;
    try {
      const parsed = JSON.parse(res.text);
      // The API wraps most payloads as {status, message, data}, but the unit
      // and progress endpoints answer with a bare array. Unwrap only the wrapper.
      return (parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/** The PII firewall. Every RERA object is funnelled through this on its way
 *  out of the fetch layer, so the report can only ever contain fields named
 *  here. Adding a field is a deliberate act; inheriting one is impossible. */
function pick<T extends Record<string, unknown>>(src: unknown, keys: readonly string[]): T {
  const out: Record<string, unknown> = {};
  if (!src || typeof src !== "object") return out as T;
  for (const k of keys) {
    const v = (src as Record<string, unknown>)[k];
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  }
  return out as T;
}

// ─────────────────────────────────────────────────────────── local jobs

type Field = { value: unknown; source_file?: unknown } | undefined;
type Job = {
  file: string;
  sourceFile: string | null;
  name: string;
  developer: string | null;
  city: string | null;
  state: string | null;
  reraId: string | null;
  units: string | null;
  towers: string | null;
  plotSize: string | null;
  startDate: string | null;
  experience: string | null;
  delivered: string | null;
  ongoing: string | null;
};

const str = (f: Field): string | null => {
  const v = f?.value;
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

function loadJobs(): Job[] {
  // Gitignored runtime storage — absent on a fresh checkout until someone has
  // actually run a brochure through the OCR service locally.
  if (!existsSync(JOB_DIR)) return [];
  const jobs: Job[] = [];
  for (const file of readdirSync(JOB_DIR)) {
    const path = join(JOB_DIR, file);
    if (!file.endsWith(".json") || statSync(path).size === 0) continue;
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      continue;
    }
    // Two shapes live in this directory: the extraction itself, and an older
    // {job_id, extraction} wrapper. `_manifest.json` is neither and is skipped
    // by the same check that unwraps the other.
    if (doc?.extraction) doc = doc.extraction as Record<string, unknown>;
    if (!doc?.basics) continue;
    const section = (key: string) => (doc[key] ?? {}) as Record<string, Field>;
    const b = section("basics");
    const ps = section("project_structure");
    const rera = section("rera");
    const dev = section("developer");
    const name = str(b.property_name);
    if (!name) continue;
    jobs.push({
      file,
      // The uploaded brochure's own filename. Worth keeping because whoever
      // saved it often typed the name the project is actually registered under
      // — "capstoneThe Beaumonde Brochure.pdf" for a brochure headed only
      // "THE CAPSTONE" — which is the one clue to that project's identity
      // anywhere in our data.
      sourceFile: str(
        b.property_name?.source_file ? { value: b.property_name.source_file } : undefined,
      ),
      name,
      developer: str(b.developer),
      city: str(b.city),
      state: str(b.state),
      reraId: str(rera.rera_id),
      units: str(ps.total_units),
      towers: str(ps.total_towers),
      plotSize: str(ps.plot_size),
      startDate: str(rera.proposed_start_date),
      experience: str(dev.experience_years),
      delivered: str(dev.total_delivered_projects),
      ongoing: str(dev.ongoing_projects),
    });
  }
  // The same brochure gets re-extracted as the pipeline improves. Keep the
  // richest run per project name so one property is not queried three times.
  const best = new Map<string, Job>();
  const filled = (j: Job) =>
    [j.reraId, j.units, j.towers, j.plotSize, j.city, j.developer].filter(Boolean).length;
  for (const j of jobs) {
    const key = j.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!best.has(key) || filled(best.get(key)!) < filled(j)) best.set(key, j);
  }
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────── matching

const SEARCH = "/project_reg/public/global-search";
const HIT_KEYS = [
  "entityId",
  "entityType",
  "regNo",
  "entityName",
  "distName",
  "taluka",
  "address",
  "pdate",
  "ptype",
  "description",
  "minarea",
  "maxarea",
  "mincost",
  "maxcost",
] as const;
type Hit = Partial<Record<(typeof HIT_KEYS)[number], unknown>>;

/** "global-search" is global in the unhelpful sense: one index holding
 *  projects, agents, architects, engineers and sole proprietors alike. A
 *  brochure named "360" matched 2,868 of them, and "pashmina" resolved to an
 *  estate agent who happens to live in a building called Venus Pashmina. Only
 *  PROJECT rows can ever be the thing we are looking for, so the rest are
 *  dropped before any of the matching logic gets a chance to be fooled. */
async function search(query: string): Promise<Hit[]> {
  const data = await call<Hit[]>(SEARCH, { query, startWith: 0, dataSize: 25 });
  if (!Array.isArray(data)) return [];
  return data
    .filter((h) => h?.entityId && h?.entityType === "PROJECT" && h?.entityName)
    .map((h) => pick<Hit>(h, HIT_KEYS));
}

/** A registration number read off a brochure is a photocopy of a photocopy:
 *  line-breaks land mid-word ("Corpo-ration"), spacing drifts, and sometimes
 *  only the tail survives. Rather than trust or reject the whole string, try
 *  it verbatim, then de-hyphenated, then reduced to the registration code
 *  itself — the one token in the ID that is short, unique and rarely mangled. */
function idQueries(raw: string): string[] {
  const id = raw.replace(/\s+/g, " ").trim();
  if (!id || /^applied$/i.test(id)) return [];
  const out = [id];
  const dehyphenated = id.replace(/-\s*/g, "");
  if (dehyphenated !== id) out.push(dehyphenated);
  const code = id.match(/\b([A-Z]{2,4}\d{4,6})\b/)?.[1];
  if (code) out.push(code);
  return [...new Set(out)];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Projects a human has already identified, keyed by normalised project name.
 *  Some questions only a person can settle — five different registered projects
 *  are called "The Park", and no amount of string comparison picks ours. Once
 *  someone has looked, that answer is worth keeping: it saves the searches, and
 *  it stops a later run quietly reaching a different conclusion. `entityId:
 *  null` records the equally useful finding that a project is not on RERA at
 *  all, so we stop re-searching for it every time.
 *
 *  This is a lookup table, not a schema — it deliberately does not pre-empt the
 *  local-DB migration that will eventually own this link. */
type Confirmed = {
  entityId: number | null;
  regNo?: string;
  entityName?: string;
  confirmedOn?: string;
  note?: string;
};

function loadConfirmed(): Map<string, Confirmed> {
  const out = new Map<string, Confirmed>();
  if (!existsSync(MATCH_FILE)) return out;
  try {
    const raw = JSON.parse(readFileSync(MATCH_FILE, "utf-8")) as Record<string, Confirmed>;
    for (const [name, rec] of Object.entries(raw)) {
      if (name.startsWith("//")) continue; // comment keys
      out.set(norm(name), rec);
    }
  } catch {
    console.log(`  ! ${MATCH_FILE} is unreadable — continuing without confirmed matches`);
  }
  return out;
}

const CONFIRMED = loadConfirmed();

/** The search index returns the same project twice often enough to matter —
 *  "The Universe" came back as three rows for two projects. */
function dedupeByEntity(hits: Hit[]): Hit[] {
  const seen = new Set<number>();
  return hits.filter((h) => {
    const id = Number(h.entityId);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Words that say nothing about *which* company this is. A brochure says
 *  "HN SAFAL"; RERA says "HN SAFAL INFRA DEVELOPERS PRIVATE LIMITED". Strip
 *  the boilerplate from both and the distinguishing part is what remains. */
const BOILERPLATE = new Set([
  "the",
  "group",
  "groups",
  "llp",
  "pvt",
  "private",
  "ltd",
  "limited",
  "co",
  "company",
  "developer",
  "developers",
  "development",
  "developments",
  "infra",
  "infrastructure",
  "buildcon",
  "builders",
  "build",
  "projects",
  "project",
  "realty",
  "realtors",
  "estate",
  "estates",
  "land",
  "lands",
  "corporation",
  "construction",
  "constructions",
  "associates",
  "enterprise",
  "enterprises",
  "and",
]);

const identityTokens = (name: string) =>
  new Set(
    norm(name)
      .split(" ")
      .filter((t) => t.length > 1 && !BOILERPLATE.has(t)),
  );

/** True when two company names share their distinguishing words. Requires a
 *  real overlap, so "Venus Group" matches "Venus Infrastructure ... Limited"
 *  but not "Sarthi Prospace LLP" — a developer marketing a project it did not
 *  register is a question for a human, not something to paper over. */
function sharesIdentity(a: string, b: string): boolean {
  const left = identityTokens(a);
  const right = identityTokens(b);
  if (!left.size || !right.size) return false;
  const shared = [...left].filter((t) => right.has(t));
  return shared.length >= Math.min(left.size, right.size);
}

/** Words a brochure adds to describe a project rather than to name it. The
 *  search index ANDs every word of a query, so "SWATI SENOR RESIDENTIAL
 *  PROJECT" asks for a registered name containing all four and finds nothing,
 *  while "SWATI SENOR" finds it immediately. These are dropped only from
 *  *queries*; the printed name is left alone. */
const DESCRIPTIVE = new Set([
  "residential",
  "commercial",
  "residency",
  "scheme",
  "phase",
  "wing",
  "block",
  "apartments",
  "apartment",
  "bungalows",
  "villas",
  "flats",
]);

/** Filenames carry the uploader's shorthand as well as the project: version
 *  numbers, "final", "compressed", the word "brochure" itself. What survives
 *  all of that is a word someone typed on purpose. */
const FILENAME_NOISE = new Set([
  "brochure",
  "brochures",
  "final",
  "draft",
  "copy",
  "compressed",
  "small",
  "low",
  "high",
  "res",
  "web",
  "print",
  "new",
  "old",
  "updated",
  "version",
  "pdf",
  "ebrochure",
  "digital",
  "min",
  "merged",
  "combined",
  "scan",
  "scanned",
]);

/** Splits a filename into words a person might have meant, including across
 *  camelCase runs — "capstoneThe Beaumonde Brochure.pdf" hides "Beaumonde"
 *  next to a "capstone" that is glued to the following word. */
function filenameTokens(file: string): string[] {
  const stem = file.replace(/\.[a-z0-9]+$/i, "");
  return [
    ...new Set(
      norm(stem.replace(/([a-z0-9])([A-Z])/g, "$1 $2"))
        .split(" ")
        .filter(
          (t) =>
            t.length > 2 &&
            !/^\d+$/.test(t) &&
            !/^v\d+$/.test(t) &&
            !FILENAME_NOISE.has(t) &&
            !BOILERPLATE.has(t) &&
            !DESCRIPTIVE.has(t),
        ),
    ),
  ];
}

const promoterCache = new Map<number, string | null>();

async function promoterOf(entityId: number): Promise<string | null> {
  if (promoterCache.has(entityId)) return promoterCache.get(entityId)!;
  const prev = await call<PrevListResponse>(`/project_reg/public/getprev-project-list/${entityId}`);
  const promoter = String(prev?.gujrera?.[0]?.promotorName ?? "") || null;
  promoterCache.set(entityId, promoter);
  return promoter;
}

type Match = {
  confidence: "confirmed" | "exact" | "likely" | "candidate" | "not_found" | "not_registered";
  hit?: Hit;
  how: string;
  alternatives: Hit[];
};

async function findProject(job: Job): Promise<Match> {
  // 0. A human already settled this one. Their answer outranks any search.
  const decided = CONFIRMED.get(norm(job.name));
  if (decided) {
    if (decided.entityId === null) {
      return {
        confidence: "not_registered",
        how: decided.note ?? "recorded as not registered on GujRERA",
        alternatives: [],
      };
    }
    return {
      confidence: "confirmed",
      hit: { entityId: decided.entityId, regNo: decided.regNo, entityName: decided.entityName },
      how: `confirmed by hand${decided.confirmedOn ? ` on ${decided.confirmedOn}` : ""}${decided.note ? ` — ${decided.note}` : ""}`,
      alternatives: [],
    };
  }

  // 1. The registration number, if we have one worth trying.
  for (const q of job.reraId ? idQueries(job.reraId) : []) {
    const hits = await search(q);
    if (hits.length === 1) {
      return { confidence: "exact", hit: hits[0], how: `reg no "${q}"`, alternatives: [] };
    }
    if (hits.length > 1) {
      // A code fragment can legitimately hit siblings; prefer the one whose
      // registration number the brochure's string actually contains.
      const exact = hits.find((h) => norm(job.reraId!).includes(norm(String(h.regNo ?? "\0"))));
      if (exact) return { confidence: "exact", hit: exact, how: `reg no "${q}"`, alternatives: [] };
      return {
        confidence: "candidate",
        hit: hits[0],
        how: `reg no "${q}" → ${hits.length} results`,
        alternatives: hits.slice(0, 5),
      };
    }
  }

  // 2. Fall back to the project name — and if the name as printed finds
  //    nothing, ask again without the words that describe the project rather
  //    than name it. Every word of a query has to appear in the record, so
  //    "SWATI SENOR RESIDENTIAL PROJECT" asks for all four and comes back
  //    empty, while "SWATI SENOR" is registered exactly as that. When the
  //    shorter query is the one that answers, it is also the better name to
  //    compare against, so it becomes what we match on.
  //
  //    Some names carry the address too — "SWATI SENOR RESIDENTIAL PROJECT AT
  //    AMBLI ROAD, AHMEDABAD" — so dropping the descriptive words is not
  //    always enough, and the last resort is the leading words alone, since a
  //    project's name comes before its description. That is a broad query, so
  //    a hit from it still has to survive the same tests as any other: sole
  //    exact match with the district agreeing, or a promoter that confirms it.
  const distinctive = norm(job.name)
    .split(" ")
    .filter((t) => t.length > 1 && !DESCRIPTIVE.has(t) && !BOILERPLATE.has(t) && t !== "at");

  let wanted = norm(job.name);
  let hits = await search(job.name);
  for (const relaxed of [distinctive.join(" "), distinctive.slice(0, 2).join(" ")]) {
    if (hits.length || !relaxed || relaxed === wanted) continue;
    hits = await search(relaxed);
    if (hits.length) wanted = relaxed;
  }

  // 2b. Every relaxation above still requires each query word to appear as its
  //     own token, which fails when OCR and RERA disagree about where the
  //     spaces in a name go — "Rashmi Skyscape" in the brochure, "Rashmi Sky
  //     Scape" on the register. Neither the full name nor any word-subset of
  //     it is a token match for the other. The rescue is to search on just the
  //     single most distinctive leading word — loose, but bounded — and accept
  //     a hit only if it is identical to ours once every space is stripped
  //     from both sides. That is not a fuzzy guess; it is the same name.
  const noSpace = (s: string) => norm(s).replace(/ /g, "");
  if (!hits.length && distinctive[0] && distinctive[0].length > 3) {
    const pool = dedupeByEntity(await search(distinctive[0]));
    const identical = pool.filter((h) => noSpace(String(h.entityName ?? "")) === noSpace(job.name));
    if (identical.length === 1) {
      return {
        confidence: "likely",
        hit: identical[0],
        how: `registered as "${identical[0].entityName}" — the same name, spaced differently`,
        alternatives: [],
      };
    }
  }

  const sameName = hits.filter((h) => norm(String(h.entityName ?? "")) === wanted);
  const sameCity = (h: Hit) =>
    !job.city ||
    norm(String(h.distName ?? "")).includes(norm(job.city)) ||
    norm(job.city).includes(norm(String(h.distName ?? "")));

  if (sameName.length === 1 && sameCity(sameName[0])) {
    return {
      confidence: "likely",
      hit: sameName[0],
      how: "exact name, district agrees",
      alternatives: [],
    };
  }

  // 3. The name alone was not enough. Developers name projects after the same
  //    handful of pleasant nouns — five registered projects are called "The
  //    Park" — but a project name and its developer together are usually
  //    unique. Ask the search index that question directly first, since it
  //    costs one request.
  //
  //    The registered name is frequently the brochure's name with the
  //    developer's on the front: a brochure headed "360" by Maruti is
  //    registered as "MARUTI 360", and "pashmina" by Venus as "Venus
  //    Pashmina". So accept a hit that *contains* our name rather than
  //    equalling it — but only when its name also carries the developer's,
  //    which is what keeps "360" from swallowing "7 Views" and "9th Avenue".
  if (job.developer) {
    const developer = job.developer;
    const branded = (h: Hit) => {
      const found = norm(String(h.entityName ?? ""));
      if (found === wanted) return false;
      const containsName = new RegExp(
        `\\b${wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      ).test(found);
      return containsName && sharesIdentity(developer, String(h.entityName ?? ""));
    };

    // Re-read the results already in hand before spending another request. Of
    // the two registered projects called "pashmina", only "Venus Pashmina"
    // carries the brochure's developer, which settles it for free.
    const brandedHere = dedupeByEntity(hits.filter(branded));
    if (brandedHere.length === 1) {
      return {
        confidence: "likely",
        hit: brandedHere[0],
        how: `name + developer "${developer}" → registered as "${brandedHere[0].entityName}"`,
        alternatives: [],
      };
    }

    // Otherwise ask the index. It ANDs the words of the query, so sending the
    // developer verbatim is self-defeating: "Venus Group pashmina" matches
    // nothing at all because no record contains "Group". Send only the words
    // that actually identify the developer.
    const tokens = [...identityTokens(developer)].join(" ");
    if (tokens) {
      const combined = dedupeByEntity(await search(`${tokens} ${job.name}`));
      const named = combined.filter(
        (h) => norm(String(h.entityName ?? "")) === wanted || branded(h),
      );
      if (named.length === 1) {
        return {
          confidence: "likely",
          hit: named[0],
          how: `name + developer "${developer}" → registered as "${named[0].entityName}"`,
          alternatives: [],
        };
      }
    }
  }

  // 4. Still ambiguous, so stop guessing from text and go and read who each
  //    rival's registered promoter actually is. This is the check that tells
  //    "The Park by HN Safal" apart from four other Parks — and it is the only
  //    one that resists a misleading address, since RERA addresses cite
  //    neighbouring landmarks ("Next to A.Shridhar Oxygen Park") that read
  //    exactly like a developer name but are not one.
  if (job.developer) {
    const pool = dedupeByEntity(sameName.length ? sameName : hits).slice(0, 5);
    for (const h of pool) {
      const promoter = await promoterOf(Number(h.entityId));
      if (promoter && sharesIdentity(job.developer, promoter)) {
        return {
          confidence: "likely",
          hit: h,
          how: `registered promoter "${promoter}" matches the brochure's developer`,
          alternatives: [],
        };
      }
    }
  }
  // 5. Nothing in the brochure's own text leads anywhere. A project can be
  //    marketed under one name and registered under another entirely — the
  //    brochure headed "THE CAPSTONE" is registered as "THE BEAUMONDE", which
  //    shares not one word with it. RERA offers no way to walk from a promoter
  //    to their projects (the endpoints for it are all 403), so the only clue
  //    left is the filename someone saved the brochure under, which in that
  //    case was "capstoneThe Beaumonde Brochure.pdf".
  //
  //    A word from a filename is thin evidence, so it is never enough on its
  //    own: the project it turns up is only accepted if its registered
  //    promoter is the brochure's developer. That is the same standard step 4
  //    applies, and it is what separates a rescue from a guess.
  if (!hits.length && job.sourceFile && job.developer) {
    const known = identityTokens(job.name);
    const leads = filenameTokens(job.sourceFile).filter((t) => !known.has(t));
    for (const lead of leads.slice(0, 3)) {
      for (const h of dedupeByEntity(await search(lead)).slice(0, 5)) {
        const promoter = await promoterOf(Number(h.entityId));
        if (promoter && sharesIdentity(job.developer, promoter)) {
          return {
            confidence: "likely",
            hit: h,
            how: `filename mentions "${lead}" → "${h.entityName}", whose registered promoter "${promoter}" is the brochure's developer`,
            alternatives: [],
          };
        }
      }
    }
  }

  const pool = dedupeByEntity(sameName.length ? sameName : hits);
  if (!pool.length)
    return { confidence: "not_found", how: "name search returned nothing", alternatives: [] };
  return {
    confidence: "candidate",
    hit: pool[0],
    how:
      pool.length > 1 && sameName.length
        ? `${pool.length} projects share this name`
        : sameName.length
          ? "name matches but district does not"
          : `no exact name match among ${hits.length} results`,
    alternatives: pool.slice(0, 5),
  };
}

// ─────────────────────────────────────────────────────────── comparison

/** RERA states every area in square metres. Our brochures state them in
 *  whatever the marketing team preferred that year — acres, square feet,
 *  square yards, "3 Million Sq. Ft." — so both sides are normalised to square
 *  metres before anything is called a disagreement. A unit we cannot read is
 *  reported as unreadable, never as a conflict. */
const AREA_UNITS: [RegExp, number][] = [
  [/\bacres?\b/, 4046.8564224],
  [/\bsq\.?\s*(ft|feet|foot)\b|\bsqft\b|\bs\.?f\.?t\b/, 0.09290304],
  [/\bsq\.?\s*(yds?|yards?)\b/, 0.83612736],
  [/\bsq\.?\s*(mt?r?s?|m|metres?|meters?)\b/, 1],
  [/\bhectares?\b/, 10_000],
];

function toSquareMetres(raw: string): number | null {
  const s = raw.toLowerCase().replace(/,/g, "");
  const num = s.match(/(\d+(?:\.\d+)?)/);
  if (!num) return null;
  let value = parseFloat(num[1]);
  if (/\bmillion\b|\bmn\b|\bmillion\+/.test(s)) value *= 1e6;
  else if (/\blakh?s?\b/.test(s)) value *= 1e5;
  const unit = AREA_UNITS.find(([re]) => re.test(s));
  return unit ? value * unit[1] : null;
}

const toInt = (raw: string): number | null => {
  // "119" and "84 units" are counts; "61 prime plots" is one too. "31+ Million
  // Sq. Ft. Area Developed" is a marketing claim wearing a number's clothes,
  // and must not be compared against a project count.
  if (/million|mn\b|lakh|sq|area|acre/i.test(raw)) return null;
  const m = raw.replace(/,/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

type Verdict =
  | "match" // both sides present and agreeing
  | "conflict" // both sides present and disagreeing — the real signal
  | "rera_adds" // OCR blank, RERA has it — the "is this worth building" signal
  | "not_comparable" // both present, but they do not mean the same thing
  | "rera_only"; // RERA has data our schema has no field for

type Row = { label: string; verdict: Verdict; ocr: string; rera: string; note?: string };

const fmt = (n: number) =>
  n >= 10_000 ? Math.round(n).toLocaleString("en-IN") : String(Math.round(n * 100) / 100);

function compareCount(label: string, ocrRaw: string | null, reraVal: unknown): Row | null {
  const rera = reraVal === null || reraVal === undefined ? null : parseInt(String(reraVal), 10);
  if (rera === null || Number.isNaN(rera)) return null;
  if (!ocrRaw) return { label, verdict: "rera_adds", ocr: "—", rera: String(rera) };
  const ocr = toInt(ocrRaw);
  if (ocr === null) {
    return {
      label,
      verdict: "not_comparable",
      ocr: ocrRaw,
      rera: String(rera),
      note: "brochure states an area or a claim, not a count",
    };
  }
  return {
    label,
    verdict: ocr === rera ? "match" : "conflict",
    ocr: String(ocr),
    rera: String(rera),
  };
}

function compareArea(label: string, ocrRaw: string | null, reraSqM: unknown): Row | null {
  const rera = reraSqM === null || reraSqM === undefined ? null : parseFloat(String(reraSqM));
  if (rera === null || Number.isNaN(rera)) return null;
  const reraTxt = `${fmt(rera)} m² (${fmt(rera / 0.09290304)} sq ft)`;
  if (!ocrRaw) return { label, verdict: "rera_adds", ocr: "—", rera: reraTxt };
  const ocr = toSquareMetres(ocrRaw);
  if (ocr === null) {
    return {
      label,
      verdict: "not_comparable",
      ocr: ocrRaw,
      rera: reraTxt,
      note: "no readable unit in the brochure value",
    };
  }
  const drift = Math.abs(ocr - rera) / Math.max(ocr, rera);
  return {
    label,
    verdict: drift <= 0.02 ? "match" : "conflict",
    ocr: `${ocrRaw} = ${fmt(ocr)} m²`,
    rera: reraTxt,
    note:
      drift > 0.02
        ? `${Math.round(drift * 100)}% apart — brochure may describe the whole township, RERA only the registered phase`
        : undefined,
  };
}

// ─────────────────────────────────────────────────────────── per-project pull

const DETAIL_KEYS = [
  "projectName",
  "projectType",
  "projectStatus",
  "projectAddress",
  "projectAddress2",
  "stateName",
  "distName",
  "subDistName",
  "startDateStr",
  "completionDateStr",
  "totAreaOfLand",
  "totCarpetArea",
  "totCoverdArea",
  "totOpenArea",
  "coveredParking",
  "costOfLand",
  "estimatedCost",
  "totalProjectCost",
  "approvingAuthority",
] as const;
const UNIT_KEYS = [
  "totunit",
  "mincararea",
  "maxcararea",
  "averageunit",
  "mincost",
  "maxcost",
  "totcararea",
] as const;
const PREV_KEYS = ["projectName", "projectCurrentStatus", "distName", "typeOfLand"] as const;

/** Only the parts of each response this pilot actually reads. Everything else
 *  these endpoints return — including the personal data noted at the top — has
 *  no name here and so has no way through. */
type Bag = Record<string, unknown>;
type DetailsResponse = { projectDetail?: unknown };
type ProgressRow = { qtr_name?: unknown; project_progress?: unknown };
type PrevListResponse = { pervlist?: unknown[]; gujrera?: { promotorName?: unknown }[] };

async function pull(entityId: number) {
  const details = await call<DetailsResponse>(`/project_reg/public/getproject-details/${entityId}`);
  const units = await call<Bag[]>(`/dashboard/get-all-view-unit-details-by-id/${entityId}`);
  const progress = await call<ProgressRow[]>(`/quarter/get-project-progress/${entityId}`);
  const prev = await call<PrevListResponse>(`/project_reg/public/getprev-project-list/${entityId}`);
  return {
    // `details` also carries englist/acrchlist/dev — named individuals with
    // their contact details. Taking only projectDetail leaves all of it behind.
    detail: pick(details?.projectDetail, DETAIL_KEYS) as Bag,
    units: Array.isArray(units) && units[0] ? (pick(units[0], UNIT_KEYS) as Bag) : {},
    progress: Array.isArray(progress)
      ? progress
          .filter((p) => p?.qtr_name)
          .map((p) => ({ quarter: String(p.qtr_name), percent: Number(p.project_progress) }))
      : [],
    promoter: String(prev?.gujrera?.[0]?.promotorName ?? "") || null,
    previous: Array.isArray(prev?.pervlist)
      ? prev.pervlist.map((p: unknown) => pick(p, PREV_KEYS) as Bag)
      : [],
  };
}

// ─────────────────────────────────────────────────────────── report

const MARK: Record<Verdict, string> = {
  match: "  ok  ",
  conflict: " DIFF ",
  rera_adds: " NEW  ",
  not_comparable: "  --  ",
  rera_only: " INFO ",
};

async function main() {
  let jobs = loadJobs();
  if (ONLY) jobs = jobs.filter((j) => j.name.toLowerCase().includes(ONLY.toLowerCase()));
  if (!jobs.length) {
    console.log(`No extractions found in ${JOB_DIR} — run a brochure through the OCR first.`);
    process.exit(0);
  }

  console.log(`Cross-referencing ${jobs.length} extraction(s) against GujRERA public disclosure.`);
  console.log(`Read-only: nothing is written to disk or to any database.\n`);

  const tally: Record<Match["confidence"], number> = {
    confirmed: 0,
    exact: 0,
    likely: 0,
    candidate: 0,
    not_found: 0,
    not_registered: 0,
  };
  const verdicts: Record<Verdict, number> = {
    match: 0,
    conflict: 0,
    rera_adds: 0,
    not_comparable: 0,
    rera_only: 0,
  };
  const needsHuman: string[] = [];

  for (const job of jobs) {
    const where = [job.city, job.state].filter(Boolean).join(", ");
    console.log(`\n─── ${job.name}${where ? `  (${where})` : ""}`);
    if (VERBOSE)
      console.log(`     ${job.file}${job.reraId ? ` · brochure RERA id: ${job.reraId}` : ""}`);

    const match = await findProject(job);
    tally[match.confidence]++;

    if (!match.hit) {
      console.log(`  ✗ no RERA match — ${match.how}`);
      continue;
    }
    const label =
      match.confidence === "confirmed"
        ? "matched (confirmed by hand)"
        : match.confidence === "exact"
          ? "matched"
          : match.confidence === "likely"
            ? "matched (by name)"
            : "CANDIDATE — needs a human";
    console.log(
      `  ${match.confidence === "candidate" ? "?" : "✓"} ${label}: ${match.hit.entityName} · ${match.hit.regNo ?? "no reg no"}  [entityId ${match.hit.entityId}]`,
    );
    console.log(`     via ${match.how}`);
    if (match.confidence === "candidate") {
      needsHuman.push(job.name);
      // Everything known about each rival, so a person can tell them apart
      // without going to the portal. This is the whole input to the decision
      // that then gets written into rera-matches.json.
      for (const alt of match.alternatives) {
        const area =
          alt.minarea && alt.maxarea ? `units ${alt.minarea}–${alt.maxarea} m²` : "units ?";
        const cost =
          alt.mincost && alt.maxcost
            ? `₹${(Number(alt.mincost) / 1e5).toFixed(1)}–${(Number(alt.maxcost) / 1e5).toFixed(1)} L`
            : "";
        console.log(`       · ${alt.entityName}  [entityId ${alt.entityId}]`);
        console.log(`           ${alt.regNo ?? "no reg no"}`);
        console.log(
          `           ${alt.distName ?? "?"}/${alt.taluka ?? "?"} · ${alt.ptype ?? "?"} · ${alt.pdate ?? "?"}`,
        );
        if (CANDIDATES_ONLY) {
          console.log(`           ${alt.address ?? "no address"}`);
          console.log(`           ${area}${cost ? ` · ${cost}` : ""}`);
        }
      }
      if (CANDIDATES_ONLY) {
        const facts = [
          job.developer && `developer "${job.developer}"`,
          job.units && `${job.units} units`,
          job.towers && `${job.towers} towers`,
          job.plotSize && `plot ${job.plotSize}`,
        ].filter(Boolean);
        console.log(
          `     brochure says: ${facts.length ? facts.join(" · ") : "(nothing to go on)"}`,
        );
      }
      // A candidate is shown, never scored. Diffing an unconfirmed project
      // would put invented conflicts into the summary the pilot is judged on.
      console.log(`     not compared — confirm the project first`);
      continue;
    }

    // --candidates exists to settle the ambiguous ones. Pulling details for
    // projects already matched would just spend requests on a report nobody
    // is reading in that mode.
    if (CANDIDATES_ONLY) continue;

    const data = await pull(Number(match.hit.entityId));
    const rows: Row[] = [];

    const push = (r: Row | null) => {
      if (r) rows.push(r);
    };
    push(compareCount("total units", job.units, data.units.totunit));
    push(compareArea("plot / land area", job.plotSize, data.detail.totAreaOfLand));

    // "Applied" is not a registration number the brochure got wrong — it is the
    // developer saying they had not been issued one yet. Scoring it as a
    // conflict would blame the brochure for being honest.
    const printedId = job.reraId && !/^applied$/i.test(job.reraId) ? job.reraId : null;
    if (printedId) {
      const registered = String(match.hit.regNo ?? "");
      const agree = norm(printedId).includes(norm(registered || "\0"));
      // Same registration code, different surrounding string, means the
      // registration was amended after the brochure went to print — the
      // brochure is stale rather than wrong, and the distinction decides
      // whether a human needs to go and look at anything.
      const code = printedId.match(/\b([A-Z]{2,4}\d{4,6})\b/)?.[1];
      const amended = !agree && !!code && registered.includes(code);
      rows.push({
        label: "RERA registration no",
        verdict: agree ? "match" : "conflict",
        ocr: printedId,
        rera: registered || "—",
        note: agree
          ? undefined
          : amended
            ? `same registration (${code}), but re-issued since the brochure was printed — brochure is stale`
            : "brochure's printed id differs from the registered one",
      });
    } else {
      rows.push({
        label: "RERA registration no",
        verdict: "rera_adds",
        ocr: job.reraId ?? "—",
        rera: String(match.hit.regNo ?? "—"),
      });
    }

    // Towers have no equivalent in any endpoint reached here, so the brochure
    // stays the only source. Recorded so the gap is visible in the report
    // rather than being silently absent.
    if (job.towers) {
      rows.push({
        label: "total towers",
        verdict: "not_comparable",
        ocr: job.towers,
        rera: "—",
        note: "RERA exposes no tower count",
      });
    }

    for (const [label, ocrVal] of [
      ["developer experience", job.experience],
      ["delivered projects", job.delivered],
      ["ongoing projects", job.ongoing],
    ] as const) {
      if (!ocrVal) continue;
      if (toInt(ocrVal) === null) {
        rows.push({
          label,
          verdict: "not_comparable",
          ocr: ocrVal,
          rera: "—",
          note: "brochure states developed area, not a project count",
        });
      }
    }

    // Things RERA holds that our schema has nowhere to put. Not a diff — the
    // point of listing them is to make the product decision visible.
    const carpet = data.detail.totCarpetArea;
    if (carpet)
      rows.push({
        label: "total carpet area",
        verdict: "rera_only",
        ocr: "—",
        rera: `${fmt(Number(carpet))} m²`,
      });
    if (data.detail.totalProjectCost) {
      rows.push({
        label: "declared project cost",
        verdict: "rera_only",
        ocr: "—",
        rera: `₹${(Number(data.detail.totalProjectCost) / 1e7).toFixed(2)} cr`,
      });
    }
    if (data.detail.startDateStr) {
      rows.push({
        label: "registered timeline",
        verdict: job.startDate ? "not_comparable" : "rera_only",
        ocr: job.startDate ?? "—",
        rera: `${data.detail.startDateStr} → ${data.detail.completionDateStr ?? "?"}`,
      });
    }
    const latest = data.progress.at(-1);
    if (latest) {
      rows.push({
        label: "construction progress",
        verdict: "rera_only",
        ocr: "—",
        rera: `${latest.percent.toFixed(1)}% as of ${latest.quarter}`,
      });
    }
    if (data.promoter)
      rows.push({
        label: "registered promoter",
        verdict: "rera_only",
        ocr: job.developer ?? "—",
        rera: data.promoter,
      });
    if (data.previous.length) {
      const done = data.previous.filter((p) =>
        /complet/i.test(String(p.projectCurrentStatus ?? "")),
      ).length;
      rows.push({
        label: "developer track record",
        verdict: "rera_only",
        ocr: "—",
        rera: `${data.previous.length} prior project(s) filed, ${done} completed`,
      });
    }

    // "brochure:" and "RERA:" are stacked in one column so the two sources can
    // be read against each other at a glance — that comparison is the report.
    const gutter = " ".repeat(5 + 8 + 1 + 22);
    for (const row of rows) {
      verdicts[row.verdict]++;
      console.log(`     [${MARK[row.verdict]}] ${row.label.padEnd(22)}brochure: ${row.ocr}`);
      console.log(`${gutter}    RERA: ${row.rera}`);
      if (row.note) console.log(`${gutter}          ↳ ${row.note}`);
    }
  }

  console.log("\n══════════ SUMMARY ══════════");
  console.log(`extractions checked  : ${jobs.length}`);
  console.log(`  confirmed by hand  : ${tally.confirmed}`);
  console.log(`  matched on reg no  : ${tally.exact}`);
  console.log(`  matched on name    : ${tally.likely}`);
  console.log(`  candidates only    : ${tally.candidate}   ← never auto-accepted`);
  console.log(`  known not on RERA  : ${tally.not_registered}`);
  console.log(`  no match at all    : ${tally.not_found}`);
  console.log(`\nfield outcomes across matched projects:`);
  console.log(`  agree              : ${verdicts.match}`);
  console.log(
    `  disagree           : ${verdicts.conflict}   ← each one is a brochure or a portal being wrong`,
  );
  console.log(
    `  RERA fills a blank : ${verdicts.rera_adds}   ← what integrating would actually buy us`,
  );
  console.log(`  not comparable     : ${verdicts.not_comparable}`);
  console.log(`  RERA-only, no field: ${verdicts.rera_only}   ← would need new schema to keep`);
  if (needsHuman.length) {
    console.log(
      `\nneeds a human to confirm the project (${needsHuman.length}): ${needsHuman.join(", ")}`,
    );
  }
  console.log(
    `\n${callCount} request(s) to ${HOST}. Figures above are from RERA's public disclosure.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
