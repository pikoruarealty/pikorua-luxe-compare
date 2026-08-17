# PropCompare security remediation — handoff (refreshed)

This document originally tracked the `security-and-cosmetics` branch. That branch has since been
fast-forward-merged into `main`, and nearly everything it left open has since shipped on later
branches. This refresh corrects the status against the current `main` (as of `core-features-addon`,
which branches from it) so nobody re-does finished work or trusts stale file paths.

**Current source of truth for active work is the phased plan at
`C:\Users\Bhavarth\.claude\plans\okay-so-we-have-declarative-waterfall.md`.** This file is now a
closeout record of the original security audit, not a live task list.

---

## 1. What actually shipped since the original handoff

Confirmed directly against the current tree (not from memory):

| ID | Status | Where |
|---|---|---|
| M-2(a) unbounded Zod strings/arrays | **FIXED** | `src/lib/property-schema.ts` — `.max()` present throughout |
| M-2(b) full catalogue in every SSR payload | **FIXED** | `PROPERTY_LIST_COLUMNS` vs `PROPERTY_COLUMNS` split in `properties.functions.ts` |
| M-9 upload cap vs. platform body limit | **FIXED** | `DEFAULT_MAX_IMAGE_UPLOAD_BYTES` now env-driven (`MAX_IMAGE_UPLOAD_BYTES`) |
| L-7 unvalidated `imageUrl`/`reraUrl` | **FIXED** | `property-schema.ts` now runs both through `safeHttpUrl` |
| M-3 remainder — unbounded activity `metadata` | **FIXED** | `activity.functions.ts` — depth/size/item caps, `validateMetadataValue` |
| M-5 brochure jobs had no ownership check | **FIXED** | `supabase/migrations/20260814120000_brochure_job_ownership.sql` — `brochure_jobs` table |
| M-12 unescaped `%`/`_` reaching `.ilike("email")` | **FIXED** | `20260814123000_unique_profile_emails.sql` — case-folded unique index, lookups moved to `.eq()` |
| N-3 remainder — unverified email change | **FIXED** | `profile.functions.ts` `updateProfile` now requires a matching `emailToken` |
| L-4 raw Supabase errors leaking to clients | **FIXED** | `src/lib/safe-error.ts` (`throwSafeError`) used at all former leak sites |
| L-8 `listDevelopers` quadratic in-memory filter | **FIXED** | now joins a `developer_submission_counts` grouped-count view |
| L-11 Google `aud` without `azp` | **FIXED** | `google-auth.functions.ts` checks both |
| M-4 / N-2 geocode cache poisoning | **FIXED** | `properties.latitude`/`longitude` columns, geocoded once at write time; only the visitor's own address does a live lookup |
| Phase 8 lint cleanup | **DONE** | `bun run lint` is clean (0 problems) on current `main` |

**Still genuinely open** (verified by grep, not assumed):

| ID | Status | Where |
|---|---|---|
| **M-11** `property_submissions.property_id` / `.created_by`, `admin_profiles.created_by` have no `ON DELETE` clause | **NOT FIXED** | `20260719120000_admin_portal_schema.sql` lines ~42, 83 — still bare `REFERENCES`, no cascade/set-null. A property delete with existing submissions will still surface a raw FK violation. |
| **L-2** image magic-byte verification | **NOT FIXED** | `property-images.functions.ts` — content type is still caller-declared, never checked against bytes |
| **L-10** `uniqueSlug` TOCTOU / up to ~200 round-trips | **NOT FIXED** | `property-crud.functions.ts` `uniqueSlug` — same sequential-check loop as originally audited |
| `property-images` upload authorization | **UNCHANGED, still open question** | still gated by `requireAdminAuth` (any active admin/developer), not `requireOwnerAuth` |
| `vercel.json` present on `main` | **NOT ADDRESSED** | contradicts the plan's GCP-only deploy target (Part 9); not yet assigned to a task |

Everything else originally listed under Phases 5–7 (L-3 quiz-answer shape validation, L-5
request-scoped error capture, L-6 password strength/rotation, L-9 pagination) was not re-verified
in this pass — check before assuming either way.

---

## 2. Answers to the 5 open owner questions

These were asked in the original handoff (§6) before further work was authorized. Answering them
now against what actually shipped, so the next reader doesn't have to guess intent from the diff:

1. **N-3 — verify-new-email UI flow?** Built and shipped: `updateProfile` now requires a fresh
   `emailToken` proving control of the new address before the change is accepted. No further work
   needed here.
2. **M-11 — `SET NULL` or `CASCADE` for `property_submissions.property_id`?** Not yet decided or
   built. Recommendation, unchanged from the original analysis: `SET NULL` for `property_id`
   (preserves the submission as an audit record after the property is deleted), `CASCADE` for
   `admin_profiles.created_by` references would be wrong too — prefer `SET NULL` there as well so
   deleting an admin doesn't cascade-delete properties/submissions they created. This still needs
   a small idempotent migration; nobody has written it.
3. **Phase 8 — which lint option?** Effectively resolved by attrition: `bun run lint` is clean on
   current `main` with no `.gitattributes` added. Whatever combination of edits happened across the
   v2 work normalized the CRLF files as a side effect. No action needed.
4. **`property-images` auth — developers or owner-only?** Still unresolved. Code still allows any
   active admin (including developers) to upload into the public bucket via `requireAdminAuth`.
   This needs an explicit owner decision, not an inferred one — flagging again rather than guessing.
5. **Upstash — did they provision it?** Cannot verify from the repo alone; `.env.example` still
   only has placeholder values (`UPSTASH_REDIS_REST_URL=https://YOUR-DB.upstash.io`). Whether the
   real `.env` (gitignored, not in this checkout) has live credentials is outside what a file audit
   can confirm — ask the owner directly, or check whether sign-in currently requires
   `ALLOW_UNLIMITED_LOCAL=1` to work locally, which would indicate it's still unset.

---

## 3. Standing rules (still binding, unchanged)

- **Never commit to `main` directly.** All current work happens on `core-features-addon`.
- Migrations must be idempotent, `GRANT ALL ... TO service_role`, and `ENABLE ROW LEVEL SECURITY`
  with zero policies (deny-by-default — everything goes through service-role server functions).
- Don't touch generated files: `src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`,
  `src/generated/**`.
- Server-only code lives in `src/server/**`, imported via `await import(...)` inside handlers.
- Deploy target is a GCP VM. `vercel.json` on `main` is a leftover that should eventually be
  removed or reconciled — see the open item above.
- Only format files you actually changed.
- `useSession` is a server composable, not a React hook — the `react-hooks/rules-of-hooks`
  false-positive on it is fixed with a scoped `/* eslint-disable react-hooks/rules-of-hooks */`
  block, as seen in `email-otp.functions.ts` / `profile.functions.ts`.

---

## 4. Reference

- Live plan: `C:\Users\Bhavarth\.claude\plans\okay-so-we-have-declarative-waterfall.md` — this is
  where current phase status, task ordering, and binding product constraints (no exact price on
  any consumer surface, no fabricated data, score never purchasable, etc.) actually live now.
- This file's original audit source (historical only, branch since merged):
  1 Critical, 4 High, 14 Medium, 11 Low findings plus 6 verification-time findings (`N-*`).
