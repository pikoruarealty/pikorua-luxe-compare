# PropCompare security remediation — handoff

You are continuing a phased security remediation of `e:\PropCompare\pikorua-luxe-compare`.
Phases 0–4 are **done, tested, committed and pushed**. Phases 5, 6, 7 and a lint cleanup remain.
Read this whole document before touching anything.

---

## 1. Where things stand

- **Branch: `security-and-cosmetics`** (pushed to `origin`). **Do not commit to `main`** — the
  owner asked for this explicitly.
- Working tree is clean. All 9 commits are pushed.
- Current HEAD: `fd86e0c Stop handing the session cookie to other sites`

```
fd86e0c Stop handing the session cookie to other sites          <- Phase 4
bd3f893 Add the rate-limiting layer this app never had          <- Phase 3
c959246 Close the OCR service to the internet                   <- Phase 2
f278f17 Bind phone verification to the number the code was sent to  <- Phase 1 (the critical one)
2abb7a1 Finish the groundwork: pytest path, Upstash, Vitest      <- Phase 0
f3401ed Add a test runner that can reach the auth paths          <- Phase 0
fb8e04e Delete the superseded brochure-extractor service         <- Phase 0
02eb29e Merge the OCR service branch into main                   <- Phase 0
791c257 Let the OCR service live on main                         <- Phase 0
```

**Green baseline you must not regress:**
- `bun run test` → **30 passed** (4 files)
- `pytest` → **115 passed**
- `bunx tsc --noEmit` → **clean**
- `bunx eslint .` → **40 problems**, all pre-existing `prettier/prettier` CRLF issues in files
  nobody has touched. Baseline before this work was 44. Never let this number go up.

---

## 2. Environment — read this or you will waste time

**Windows. PowerShell.** Bun was installed during the last session but is **not on PATH**.
Prefix every command:

```powershell
$env:Path = "C:\Users\adati\.bun\bin;$env:Path"
```

**Toolchain gotchas that already cost time:**

1. `bun install` **hangs** on postinstall scripts (sharp/playwright binaries). Always use
   `bun install --ignore-scripts` / `bun add --ignore-scripts`. Node modules are already
   installed; you shouldn't need to reinstall.
2. **pytest cannot write to the system temp dir** (sandbox permission error on
   `C:\Users\adati\AppData\Local\Temp\pytest-of-adati`). Any test using `tmp_path` needs an
   explicit basetemp:
   ```powershell
   $env:SERVICE_API_KEY = "test-boot-key"
   property-ocr-suite\backend\.venv\Scripts\python.exe -m pytest property-ocr-suite\backend\tests -q --basetemp="C:\Users\adati\AppData\Local\Temp\claude\pytest-tmp"
   ```
   `SERVICE_API_KEY` must be set or **importing `app.config` raises by design** (that is the H-2 fix).
3. **PowerShell mangles multi-line `git commit -m` here-strings.** A line beginning with `../`
   got parsed as a pathspec and the commit failed. Write the message to a file and use
   `git commit -F <file>`.
4. `bun run check` **fails on `check-brochures.ts`** — it reads real OCR job data from
   `property-ocr-suite/backend/storage/jobs`, which is gitignored runtime state that has never
   existed in this checkout. **This is pre-existing, not something you broke.** The other two
   check scripts pass: run them individually.
   ```powershell
   bun run scripts/check-mapping.ts ; bun run scripts/check-polling.ts
   ```
5. Running the dev server regenerates `src/routeTree.gen.ts`. It is auto-generated — `git checkout --`
   it rather than committing it.

**Verification loop for every phase:**
```powershell
$env:Path = "C:\Users\adati\.bun\bin;$env:Path"
bunx tsc --noEmit                       # must be silent
bun run test                            # must be >= 30 passed
bunx eslint <only the files you changed> # must be silent
bunx eslint . 2>&1 | Select-String "problems"   # must not exceed 40
```

---

## 3. Non-negotiable working rules

These came from the owner or from the codebase's own conventions. Follow them.

- **Never commit to `main`.** Branch is `security-and-cosmetics`.
- **Prove every security fix.** The established discipline: after writing a regression test,
  temporarily restore the vulnerable code (`git show HEAD:path > path`), confirm the test
  **fails**, then restore the fix and confirm it passes. A test that passes against both the old
  and new code proves nothing. This caught a real false-positive last session (a `/not verified/i`
  regex that also matched "Email not verified").
- **Comments explain *why*, never *what*.** This is the repo's strongest convention. Match it.
  Look at `src/api/functions/otp.functions.ts` or any migration header for the register.
- **Migrations must be idempotent** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`), must `GRANT ALL ... TO service_role`,
  must `ENABLE ROW LEVEL SECURITY` with **zero policies** (deny-by-default is deliberate —
  everything goes through service-role server functions), and must open with a prose header
  explaining why the change exists. Canonical example:
  `supabase/migrations/20260719120000_admin_portal_schema.sql` lines 1–17.
- **Do not touch auto-generated files**: `src/integrations/supabase/types.ts`,
  `src/integrations/supabase/client.ts`, `src/integrations/supabase/auth-middleware.ts`,
  `src/routeTree.gen.ts`. (`admin-auth-middleware.ts` IS hand-maintained and fine to edit.)
- **Only format files you changed.** `bunx prettier --write .` would rewrite ~40 untouched files
  and bury the real diff.
- **Server-only code lives in `src/server/**`** and is imported with `await import(...)` from
  inside handlers, never at module top level — `vite.config.ts` `importProtection` errors
  otherwise. Type-only imports (`import type`) are fine at top level because they're erased.
- `useSession` is h3's composable, **not** a React hook. `react-hooks/rules-of-hooks` false-positives
  on it; the established fix is a scoped `/* eslint-disable react-hooks/rules-of-hooks */` block
  with a comment. See `src/api/functions/profile.functions.ts:29-44`.

---

## 4. What was already fixed (so you don't redo it)

Source of truth is the audit artifact: 1 Critical, 4 High, 14 Medium, 11 Low, plus 6 findings
discovered during verification (`N-*`).

| ID | Status | Where |
|---|---|---|
| **C-1** phone OTP not bound to the number | **FIXED** | `otp.functions.ts`, `profile.functions.ts`, new `server/session.server.ts` |
| **H-1** arbitrary file write via upload filename | **FIXED** | `property-ocr-suite/backend/app/main.py` |
| **H-2** OCR auth fails open when key unset | **FIXED** | `main.py`, `config.py` (now refuses to boot) |
| **H-3** email OTP brute-force via cookie replay | **FIXED** | counter moved to Redis, keyed on server-issued `challengeId` |
| **H-4** no rate limit on OTP send | **FIXED** | new `server/rate-limit.server.ts` |
| **M-1** resend cooldown in caller's cookie | **FIXED** | rate limiter |
| **M-3** unbounded anonymous activity writes | **FIXED** (rate limit only — see Phase 5 for `metadata` size) | `activity.functions.ts` |
| **M-6** OCR image endpoint unauthenticated | **FIXED** | scoped signed ticket + path containment |
| **M-7** `sameSite: "none"`, no CSRF defence | **FIXED** | now `lax` + Origin check middleware |
| **M-8** no upload size/count cap | **FIXED** | `MAX_UPLOAD_BYTES`, `MAX_FILES` |
| **M-10** admin token in localStorage | **MITIGATED** (CSP added, report-only) | `server/security-headers.server.ts` |
| **M-13** open account-enumeration oracle | **FIXED** | rate limiter |
| **M-14** wide-open CORS on OCR | **FIXED** | `ALLOWED_ORIGINS` allowlist |
| **L-1** claims carry no type | **FIXED** | `signClaim(typ, ...)` / `readClaim(typ, ...)` |
| **N-1** SSRF prefix-match leaked `X-Service-Key` | **FIXED** | parsed-origin comparison |
| **N-3** `updateProfile` email collision | **PARTLY FIXED** — see Phase 5 note |
| **N-4** `readClaim` 500s on malformed token | **FIXED** | decode moved inside try |
| **N-5** unencoded 2Factor URL, no timeout | **FIXED** | |
| **N-6** cancel endpoint never called | **FIXED** | `cancelBrochureExtraction` |

**New infrastructure you should reuse, not reinvent:**
- `src/server/rate-limit.server.ts` — `enforce(POLICIES.X, subject)`, `clientIp()`, `POLICIES`.
  Policies declare `failClosed`. Missing Upstash config is a hard error unless
  `ALLOW_UNLIMITED_LOCAL=1`.
- `src/server/session.server.ts` — **the single home for all cookie options**. Five duplicated
  definitions were consolidated here. `PendingSession`, `VisitorSession`, `EmailOtpSession`.
- `src/server/origin-check.server.ts` — `assertSameOrigin(request)`.
- `src/server/security-headers.server.ts` — `securityHeaders()`, CSP report-only until `CSP_ENFORCE=1`.
- `src/lib/utils.ts:13` — `safeHttpUrl()` already exists. Reuse it in Phase 5 (L-7).

---

## 5. REMAINING WORK

### Phase 5 — Input bounds and payload size

**M-2 (a): add length caps to the property schema.**
`src/lib/property-schema.ts` is Zod with **no `.max()` anywhere** — ~45 unbounded strings plus
unbounded arrays (`amenities` L81, `advantages` L82, `notableDeliveredProjects` L116, and five
`configs` buckets L117–123, each `z.array(configDetailSchema)`).
- Add `.max()` to every string: ~200 for names/labels, ~5,000 for `expertNote` and
  `developerBackground`.
- Add `.max()` to every array (a sane cap: 100 amenities, 20 configs per bucket).
- Add a serialised-payload cap in `submitPropertyForReview`
  (`src/api/functions/developer-properties.functions.ts:230`) as a backstop.
- Callers that `.parse()` this schema: `property-crud.functions.ts:48,70`,
  `developer-properties.functions.ts:187,197,230`, `components/admin/PropertyForm.tsx:93`.

**M-2 (b): slim the root-loader payload.** This is the bigger half and the owner explicitly
chose it (option "Limits + slim the root payload").
`src/routes/__root.tsx:105-110` calls `getProperties()`, which has **no `.limit()`** and selects
all ~55 columns (`properties.functions.ts:19` `PROPERTY_COLUMNS`, query at L185-196). The entire
published catalogue is serialised into the SSR payload of **every document request on every
route** — including `/admin/*`, `/account`, `/favorites`.
- Add a `PROPERTY_LIST_COLUMNS` projection of only the fields the listing and compare views read.
- Have `src/routes/residence.$id.tsx` fetch the full row per-route.
- **Keep `PropertiesProvider`'s synchronous contract** — `src/context/PropertiesContext.tsx`
  documents a no-first-paint-flash requirement, and `README.md:99-113` documents the design.
  Don't break it.

**M-9: image upload cap exceeds the platform body limit.**
`src/api/functions/property-images.functions.ts:4` — `MAX_BASE64_LENGTH = 11_000_000` (~8MB image,
~11MB JSON body) but Vercel caps server-function bodies at 4.5MB, documented in this repo's own
comment at `brochure-extract.functions.ts:58-68`. Every upload over ~3.3MB fails with a platform
error while the UI promises 8MB.
- Make it env-driven (`MAX_IMAGE_UPLOAD_BYTES`, default ~4MB) so it can be raised on the GCP VM
  without a code change. Have the client-side message read the same constant.

**L-2: verify image magic bytes.** Same file, L5 `ALLOWED` content types are caller-declared and
never checked against the bytes. `image/svg+xml` is correctly excluded so there's no stored XSS
today, but the allowlist is the only thing preventing one and the bucket is public.

**L-3: `saveQuizAnswers` does no shape validation.**
`profile.functions.ts` — validator only checks `"answers" in data`, then casts `as never` into
`quiz_answers`, which the admin panel renders. Validate against `QuizAnswersDTO`.

**L-7: `imageUrl` / `gallery.*` unvalidated.** `property-schema.ts:68-77` — free text, never passed
through `safeHttpUrl`. Not script-executable in `<img src>` but a developer can point them at an
external host and track visitors. Validate scheme at **write** time. Same for `reraUrl` (L95),
which is only guarded at render time in one component.

**M-3 remainder:** `activity.functions.ts` `metadata` is accepted on `typeof === "object"` alone —
any shape, any size — into a jsonb column. Rate limiting is done; add a size/depth cap.

**N-3 remainder (my finding, partly fixed):** `updateProfile` now lowercases the email and
rejects one already held by another profile. It still lets a signed-in user set an address they
have **not** verified. The full fix needs a verify-new-email flow in `src/routes/account.tsx`
(send OTP to the new address, then require a fresh `emailToken` matching it). **Ask the owner
whether they want that UI work** before building it.

---

### Phase 6 — Authorization and data integrity

**M-5: brochure jobs have no ownership check.**
`getBrochureExtractionProgress`, `getBrochureExtraction`, `importBrochureImage` are gated by
`requireAdminAuth` — *any* active admin, including any developer — and take `jobId` from the client
with no check it belongs to the caller. IDs are 48 bits (`uuid4().hex[:12]`) so not enumerable,
but the authorisation check is simply absent.
**The website never persists the jobId** (it lives only in a component closure), so this needs a
small `brochure_jobs` table mapping `job_id -> admin_profile_id`, written when the upload ticket
is issued in `createBrochureUploadTicket`.

**M-11: `deleteProperty` breaks on any property with submissions.**
`supabase/migrations/20260719120000_admin_portal_schema.sql`:
- L105 `property_id uuid REFERENCES public.properties (id)` — **no `ON DELETE`** → `NO ACTION`,
  so the raw FK violation is surfaced to the admin verbatim.
- L83 `created_by uuid REFERENCES public.admin_profiles (id)` — same omission.
- L42 `admin_profiles.created_by` — same.
The repo's own pattern is already correct at L37 (`ON DELETE CASCADE` from `auth.users`) and in
`20260720120000_customer_activity.sql:17`. Write a **new idempotent migration** adding the right
clauses. Decide per-FK: `SET NULL` for `property_id` preserves the audit trail; `CASCADE` doesn't.

**M-12: unescaped LIKE wildcards reach `ilike()`.**
`profile.functions.ts` — `EMAIL_RE` permits `%` and `_`, which reach `.ilike("email", ...)` live at
three sites (search for `.ilike("email"`). `checkAccountExists` is public: a probe of `%@%.%`
matches every profile on file.
**Preferred fix:** add a case-folded unique index on `profiles.email` and switch these to `.eq()`.
There is no unique index on that column today, which is also why `completeLogin` needs its
`matches.length > 1` fallback. Note one site discards the query `error`, so a failure reads as
"no owners".

**M-4 + N-2: geocoding.**
`src/api/functions/distance.functions.ts:18-26` — `lastCallAt` is a module-global read-then-write
with no lock, so concurrent callers all sleep together then fire simultaneously; the 1 req/sec
Nominatim policy the comment cites is not enforced, and it's per-isolate anyway.
`propertyGeoCache` (L11) is keyed on a **caller-supplied `id`** with a **caller-supplied `address`**,
unauthenticated — anyone can poison a property's cached coordinates for later visitors (N-2).
**Per the code's own comment at L8-10: add `lat`/`lng` columns to `properties` and geocode once at
write time.** That removes the cache entirely and kills N-2. Only the visitor's own address then
needs a live lookup. (Rate limiting is already applied to both endpoints.)

**Also check:** `property-images.functions.ts:16` uses `requireAdminAuth`, not `requireOwnerAuth`,
so any developer can upload into the public bucket. Confirm with the owner whether that's intended.

---

### Phase 7 — Low-severity cleanup

| ID | Fix |
|---|---|
| L-4 | Stop rethrowing raw Supabase `error.message` from public functions — leaks column/table/constraint names. ~15 sites: `properties.functions.ts:193,207`, `property-crud.functions.ts:62,81,94,110,130`, `customers.functions.ts:62,112`, `admin-developers.functions.ts:25,84,105`, `property-images.functions.ts:57`, `profile.functions.ts:193`. Log server-side, return generic text. |
| L-5 | `src/lib/error-capture.ts` keeps the last error in a module-level global with a 5s TTL — one isolate, one slot, so under concurrency request A's stack is attributed to request B's 500 page. Scope it to the request. |
| L-6 | `admin-developers.functions.ts:56` — `createDeveloper` accepts any 8+ char password, no complexity or breach check, owner sets it on the developer's behalf. Add strength rules + forced first-login rotation. |
| L-8 | `admin-developers.functions.ts:27-42` — `listDevelopers` loads the **entire** `property_submissions` table with no filter/limit, then `.filter()` inside `.map()` (quadratic). Replace with a grouped count query. Its submissions-query error is silently discarded too. |
| L-9 | `getCustomers`, `getProperties`, `getAllPropertiesForAdmin` have no pagination. `getCustomers` also pulls every `customer_activity` row into memory. (Phase 5 partly covers `getProperties`.) |
| L-10 | `property-crud.functions.ts:19-44` — `uniqueSlug` issues up to 198 sequential round-trips, and is **TOCTOU**: check and insert aren't atomic, so two concurrent creates can both pass. Use one query + DB unique constraint with retry-on-conflict. |
| L-11 | `google-auth.functions.ts` — validate `azp` alongside `aud`. Minor. |

---

### Phase 8 — Lint cleanup (the "cosmetics" half of the branch name)

`bunx eslint .` reports **40 pre-existing errors**, all `prettier/prettier`, all CRLF-related
(`␍⏎` in the messages), in files this work never touched:
`src/integrations/supabase/types.ts` (auto-generated), `src/lib/price-format.ts`,
`src/routes/developer.submissions.$id.tsx`, `src/components/onboarding/AuthFlow.tsx`.

Root cause is a line-ending mismatch on this Windows checkout, not bad code. Options — **ask the
owner which they want**:
1. `bunx prettier --write .` and commit the reformat (large diff, touches an auto-generated file).
2. Add `.gitattributes` with `* text=auto eol=lf` and normalise, which fixes the cause.
3. Leave it.

Do this **last**, in its own commit, so it never obscures a security diff.

---

## 6. Things to ask the owner before building

1. **N-3 remainder** — do they want the verify-new-email UI flow in `account.tsx`?
2. **M-11** — `SET NULL` or `CASCADE` for `property_submissions.property_id`?
3. **Phase 8** — which lint option above?
4. **`property-images` auth** — should developers be able to upload, or owner-only?
5. **Upstash** — they chose it and the code + env placeholders are in, but confirm they have
   actually created the database and set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
   Until then local runs need `ALLOW_UNLIMITED_LOCAL=1` in `.env` or **sign-in will fail closed**.

## 7. Deliberately out of scope (flagged, not done)

- Moving admin sessions off `localStorage` (`client.ts` is marked auto-generated; CSP is the
  mitigation).
- Splitting `SESSION_SECRET` into a separate cookie-sealing password and HMAC claim key. One
  secret currently does both jobs, so rotating either invalidates both.
- The OCR service's in-memory progress dict (`main.py` ~L143) — never evicted, breaks on restart
  and on more than one instance. **Becomes a real problem exactly when they move to the GCP VM.**
- Enforcing the CSP. It ships report-only; flip `CSP_ENFORCE=1` only after checking the browser
  console for violations on a real page load.

## 8. Reference

- Full plan file: `C:\Users\adati\.claude\plans\https-claude-ai-code-artifact-84b91e9f-5-elegant-lemur.md`
- Audit artifact: https://claude.ai/code/artifact/84b91e9f-53d7-41ec-ae87-059b0f40da49
- Deploy context: Vercel + Supabase today, **moving to a GCP VM** for production. Do not
  introduce anything Vercel- or Cloudflare-specific.
