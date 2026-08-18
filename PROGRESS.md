# PropCompare v2 — progress & handoff

Read this first if you're picking this branch up. It tracks where we are against the
phased plan and records the judgment calls already made, so you don't have to re-litigate
them or accidentally undo something deliberate.

**Full plan (source of truth for scope/ordering):** `okay-so-we-have-declarative-waterfall.md`
— ask whoever wrote it for a copy if you don't have one; it's not checked into this repo.

**Branch:** `core-features-addon`, based on `main` (which is itself `security-and-cosmetics`
fast-forwarded in). Nothing here is pushed to `origin` yet — this branch does not exist on
the remote. **Never commit to `main` directly.**

---

## Status at a glance

- [x] **Phase 0 — Merge and stop the live bleeding** — DONE
- [x] **Phase 1 — The canonical dictionary** — DONE (this session, uncommitted)
- [x] **Phase 2 — Comparison depth on the v2 contract** — done, uncommitted; only the
      live-DB acceptance test remains open
- [ ] Phase 3 — Load the 26 brochures and flip v1 → v2
- [ ] Phase 4 — Extraction accuracy
- [x] Phase 5 — Verification & PropScore — landed dark on `main` by the other developer
      (PR `phase-5-verification-propscore`, commit `0e1762a`), behind `V2_PROPSCORE=0`. See
      note below — it was built ahead of schedule, against Phase 1's not-yet-existent
      tables, and stays off until Phase 1 + Phase 3 + their own migration are all in.
- [ ] Phase 6 — Reviews with real content & site-visit verification
- [ ] Phase 7 — Developer intelligence (first real revenue)
- [ ] Phase 8 — Depth then breadth

Each phase ships independently and is worth shipping on its own; v1 keeps serving real
traffic the whole time (all v2 feature flags are `0`/off). The only flag flip is Phase 3,
gated on v2 rendering every row v1 renders.

---

## Phase 0 — done, with the decisions that were made along the way

All 8 tasks closed, verified against the plan's Part 8 checklist, and committed
(`Close Phase 0: budget bounds, real content only, activity events, cleanup`).

1. **Fast-forwarded `main` to `security-and-cosmetics`**, flags stay off. `core-features-addon`
   rebased on top (was a no-op).
2. **`getDetailedProperties` is session-gated; `getProperties` returns shell columns only.**
   Confirmed with a live unauthenticated `curl` — rejected, zero property data in the response.
3. **8 of 12 repositories guarded with `assertConsumerPayloadSafe`.** The other 4 were left
   unguarded _deliberately_ — they don't carry consumer-facing gated fields. If you're adding
   a new repository, check whether it needs this guard before assuming it doesn't.
4. **`BUDGET_BANDS` widened from 13 to 21 bands, now contiguous** (each band's minimum equals
   the previous band's maximum — every rupee amount from 1 Cr up falls in exactly one band).
   **`classifyBudgetFit` is now symmetric**: it used to only check the upper bound against
   the budget maximum; it now also checks the lower bound against the budget minimum, with a
   20%-overshoot/undershoot threshold on both sides producing
   `within / slightly_above / well_above / slightly_below / well_below / unknown`. Full test
   coverage of the boundary math is in `src/domain/recommendation.test.ts`.
5. **The four fabricated-content generators are gone** (`advantagesFor`, `expertNoteFor`,
   `amenitiesFor`, `taglineFor` — deleted from `src/lib/property-derivations.ts`).
   `scripts/migrate-properties.ts` no longer calls them; it now only uses real per-project
   `amenities`/`highlights` data, empty array if there's none.
   - **Decision, deviating from the plan's literal wording:** the plan said "null the DB
     columns." Doing that as a blanket `UPDATE` would have destroyed real admin-authored
     content living in the _same_ `tagline`/`amenities`/`advantages`/`expert_note` columns
     (the admin edit form writes real data there too, and there's no reliable way to tell
     "migration-seeded, never touched" from "migration-seeded, later edited" —
     `updateProperty` never sets `created_by`). Instead there's a content-fingerprinted
     migration, `supabase/migrations/20260817120000_clear_fabricated_property_text.sql`,
     that nulls/strips _only_ the generator's known exact-match literal strings, leaving
     everything else alone.
   - **This migration has NOT been run against the live database.** It exists as a file only.
     Run it (and verify the fingerprints still match what's actually in prod) before
     trusting that the fabricated text is gone from the live site.
   - Three v1 compare components (`AmenitiesSection`, `AdvantagesSection`, `ExpertVerdict`)
     got an early-return guard so a property with no real content for that field renders
     nothing, rather than a blank/broken-looking section — this matters because v1 is still
     the live UI (all v2 flags off) and will be until Phase 3.
   - `src/data/properties.ts` was deleted as dead code, found while tracing every caller of
     the four generators (zero real importers).
6. **Activity events wired up**: `compare_open`, `gate_shown`, `gate_unlocked`,
   `alternative_clicked`, `weighting_changed` are now actually emitted, not just declared.
   `gate_shown`/`gate_unlocked`/`compare_open` fire from `src/routes/compare.tsx`.
   `alternative_clicked` and `weighting_changed` are wired to the closest existing real UI in
   `V2CataloguePage.tsx` (add-to-compare on an alternative-configuration row; the sort
   dropdown) since their "real" Phase 2 UI (`WeightingStrip`, `MissingAlternatives`) doesn't
   exist yet — expect to revisit these call sites once that UI is built.
   - New migration `supabase/migrations/20260817130000_expand_customer_activity_events.sql`
     widens the `customer_activity_event_type_check` CHECK constraint to accept all 11 event
     values. **Also not yet run against the live database.**
   - **Unverified risk:** this migration assumes Postgres's default auto-generated
     constraint name (`customer_activity_event_type_check`) for the _original_ unnamed
     inline CHECK constraint from `20260720120000_customer_activity.sql`. If the live schema
     names it differently, the `DROP CONSTRAINT IF EXISTS` silently no-ops and the following
     `ADD CONSTRAINT` can then fail on a duplicate name. **Verify the actual constraint name
     against the live DB before/during deploy.**
7. **`HANDOFF-CODEX.md` refreshed.** It was stale (referenced a different machine's file
   paths, a branch already merged, and its "remaining work" list was mostly already done).
   It now reflects what's actually true in the current tree — verified by grep/read, not
   assumed — and answers all 5 of its open owner questions directly in the file. Read it if
   you want the security-audit history; it's no longer where active work is tracked (this
   file is).
8. **Housekeeping:**
   - `.gitignore` now excludes `WORK-SPLIT.md` and similar ad-hoc working notes.
   - Confirmed there's no stale `/property-ocr-suite/` ignore entry — correct, since that
     service now lives in-repo.
   - The 14 tracked `.docx` source brochures were `git mv`'d from the repo root into
     `docs/source-documents/` (not deleted — Phase 3 re-extracts from them). No code
     referenced the old root paths.

**Full verification loop passed:** `tsc --noEmit` clean, `bun run lint` clean, `bun run test`
93/93, `check-consumer-boundaries` clean, production `bun run build` succeeded, no
fabricated template strings or gated fields (`baseSalePriceRupees`, carpet area) found in
client-facing code.

### Post-Phase-0 follow-up: budget band selection vs. classification

After Phase 0 shipped, we noticed closing the `BUDGET_BANDS` gaps had a side effect: the
same array drives both the quiz's selectable buttons _and_ the internal matching math, so
fixing the real dead-end (a ₹2.5 Cr buyer had no button at all) also expanded the quiz from
~13 buttons to 21 — three narrow, near-duplicate-feeling buttons like `₹9–10.5Cr` /
`₹10.5–11Cr` / `₹11–12Cr` in a row.

**Decision:** decoupled the two jobs (commit `409f91c`). `BudgetBand` now has an optional
`selectable?: false` flag; the 8 gap-filler bands (`2_3_cr`, `5.5_6_cr`, `7_8_cr`,
`10.5_11_cr`, `12_13_cr`, `15.5_16_cr`, `17_18_cr`, `20.5_21_cr`) are marked non-selectable.
`SELECTABLE_BUDGET_BANDS` (a filtered export) is what `V2CataloguePage.tsx`'s quiz renders —
back to the original ~13 round-number choices. `BUDGET_BANDS` (the full 21) is still what
`classifyBudgetFit`/`getBudgetBand`/recommendation ranking use, so no rupee value is ever
unclassifiable. A buyer whose real budget falls in a gap (e.g. ₹2.5 Cr) picks the closest
visible band and still sees near-miss properties surface as "slightly above/below" via the
existing ±20% tolerance in `classifyBudgetFit` — that tolerance is what actually closes the
gap for the buyer, not exposing every narrow band as a button.

If you add more gap-filler bands later, remember: `selectable: false` keeps them out of the
quiz; omit the flag (or don't set it) to make a band choosable.

### Post-Phase-0 follow-up: hosting config cleanup

`vercel.json` and `wrangler.jsonc` were leftover from a prior hosting setup and contradicted
the plan's GCP-VM-only deploy target; the actual deploy is Docker (`Dockerfile` sets
`NITRO_PRESET=node-server`) via `ops/deploy-slot.sh` / `.github/workflows/deploy-production.yml`.
Both files removed; `vite.config.ts`'s comment and README's Deployment section updated to
describe the real path. The Vercel/Cloudflare preset fallbacks in `vite.config.ts` were left
in place (harmless, Docker always overrides `NITRO_PRESET` explicitly) rather than ripped out,
since that's a behavior change beyond a cleanup pass.

### Left open, not part of Phase 0's scope, but real

- The two new SQL migrations above are written but **not executed against the live DB**, and
  the constraint-name assumption in `20260817130000_expand_customer_activity_events.sql` is
  still unverified against the live schema — no DB credentials were available in this session
  to check it. Verify before/during next deploy.

---

## Phase 1 — done, uncommitted

Closes issues 3, 4, 5, 6, 7 (all of Part 3). Purely additive — nothing in `src/` reads or
writes any of it yet; wiring the live publish path onto these fields is Phase 2's job.

- `schemas/property.v1.json` widened: `area_unit` gained `acre`/`gaj`; a new
  `ceilingHeightBasis` type (`clear` / `slab_to_slab` / `not_stated`); 32 new fields
  covering project structure, construction/specification, developer track record, timeline,
  and per-variant bathrooms/balconies/servant room/floor plan page. Split into `public` vs.
  a new `gated` visibility tier, matching the two-tier consumer model in Part 2.1.
- `scripts/generate-property-contracts.ts` regenerated both `src/generated/property-contract.ts`
  (new `canonicalGatedPropertySchema`, `.strict()`) and the Python contract
  (`CanonicalGatedProperty`). Added a `stringArray` field type and an `AreaUnit` type export
  needed by `src/domain/units.ts`.
- New migration `supabase/migrations/20260818120000_canonical_dictionary.sql`: widens
  `area_unit`; new `ceiling_height_basis` enum; new tables `configuration_variant_areas`
  (one area row per basis per variant — override O5), `property_publication_details` (1:1
  per publication version, ~35 columns each with its own `field_state`),
  `configuration_variant_rooms`, `amenity_catalog` (~43 seeded codes/8 groups),
  `specification_catalog` (6 seeded codes), `field_synonyms` (seeded from the plan's literal
  list). FK'd `property_amenities`/`property_specifications` onto the new catalogs. RLS +
  `service_role` grants on all 6 new tables, same pattern as every other v2 table.
  **Run against the live database 2026-08-18** (see "Live DB migration" note below).
- `src/db/schema.ts` mirrors the migration exactly; `scripts/check-drizzle-schema.ts` updated
  with the new migration filename and 6 table names.
- `src/domain/units.ts` (+ test): pure `toSqFt` / `fromSqFt` / `convertArea` canonical unit
  conversion (sq_m ×10.7639, sq_yd/gaj ×9, acre ×43,560). Not wired into the OCR pipeline —
  that's Phase 4.
- **Deliberate deviation from the plan's literal wording:** Part 3.1 says the existing
  `configuration_variants` area columns should become "a generated view over
  basis='super_built_up'" for one release. Postgres can't make a stored column a computed
  view in place, and nothing reads them as a view today. Left as writable scalar columns;
  repointing them onto `configuration_variant_areas` is Phase 2's job.
- **Cross-branch integration note:** the other developer's already-merged Phase 5 code
  (`src/repositories/propscore.repository.server.ts`) has raw SQL written dark against this
  migration's `configuration_variant_areas` table, hardcoding the FK column name
  `variant_id`. Caught before commit; the column is named `variant_id` (not
  `configuration_variant_id`) in both the migration and the Drizzle mirror to match. This
  also matches the plan's own literal Part 3.1 column name.

**Full verification loop passed:** `tsc --noEmit` clean, `bun run lint` clean, `bun run test`
21/21 files · 96/96 tests (including the new `units.test.ts`), `bun run check` clean,
`bun run db:drift` clean, production `bun run build` succeeded. `bun run schema:check`
regenerates cleanly but currently reports a diff against the last commit — expected, since
this work is uncommitted; it will pass once committed.

**Still open before Phase 1 is fully closed:**
- Decide how/when to reconcile `core-features-addon` with `origin/main`'s Phase 5 commits
  (34 files, dark behind `V2_PROPSCORE`) — plan is to finish Phase 1 first, then merge `main`
  in, since Phase 1 is small and additive and doing it first avoids carrying Phase 5's diff
  through Phase 1 edits.

### Live DB migration — 2026-08-18

First live-database access this project, via the Supabase connection pooler (direct
`db.<ref>.supabase.co` is IPv6-only and unreachable from this network; used
`aws-1-ap-southeast-2.pooler.supabase.com:6543` with the `postgres.<project-ref>` username
format instead — `DATABASE_URL` in `.env` reflects this). The live project had no
`supabase_migrations.schema_migrations` tracking table at all — migrations had never been
run through the normal CLI flow — so before touching anything, diffed the live schema
(`information_schema`) against every migration file to work out what was actually applied.

Result: the first 9 migrations (base schema through `customer_activity_summary`) matched the
live schema exactly. The 10 migrations from `v2_canonical_foundation` through this session's
own `canonical_dictionary` had never been applied — this is real, live data (33 properties,
11 profiles, 192 activity rows), so each of the 10 was applied in its own transaction, in
order, stopping immediately on any failure. All 10 applied cleanly (the only output was
harmless `NOTICE`s from `DROP ... IF EXISTS` skipping objects that were never there on a
schema this far behind). Verified after: 48 tables present (matches the 36 Drizzle-mirrored
canonical tables plus the 12 pre-existing ones), `drizzle-kit check` clean, and the original
9 tables' row counts unchanged. The new property-level v2 tables (`configuration_variants`,
`property_publication_details`, `property_score_versions`) are empty as expected — the
migrations' own seed data populated the catalog tables (`markets`, `configuration_options`,
`amenity_catalog`, `specification_catalog`, `field_synonyms`), but loading real property rows
into the new schema is Phase 3's job, not this migration's.

---

## Phase 2 — comparison depth on the v2 contract (done except the live-DB acceptance test)

Closes the contract/repository/UI slice of Part 6, including `WeightingStrip`, `WhyThisWins`,
`MissingAlternatives`, and re-pointing `alternative_clicked`/`weighting_changed` at real UI.

- `src/contracts/consumer.ts`: `publicPropertySummarySchema` gained `priceBandLabel`
  (override O2); `gatedComparisonPropertySchema` carries the full Phase 1 vector set plus
  plain (non-`gatedField`-wrapped) `rateRupeesPerSqFt`/`rateAreaBasis` on each gated
  configuration (override O1). `GATED_ALLOWED_KEYS` and `assertGatedComparisonPayloadSafe`
  added alongside the existing `assertConsumerPayloadSafe`, so the gated `rate` exception is
  scoped to the gated subtree only — it stays forbidden everywhere else in the consumer
  payload.
- `src/domain/budget.ts`: added `priceBandLabelForRupees(rupees)`, deriving the public label
  from a private rupee figure without ever returning the figure itself.
- `src/repositories/comparison.repository.server.ts`: rewritten. `findConsumerComparison`
  takes `profileId: string | null` — public tier renders unconditionally, `gated` is `null`
  only when there's no session. Area now reads from `configuration_variant_areas` filtered to
  `basis = 'super_built_up'`, not the legacy scalar columns on `configuration_variants` — this
  was the repointing flagged as "Phase 2's job" in the Phase 1 notes above. `priceBandLabel`
  per property is derived from `Math.min()` of that property's variants' current
  `commercialTerms.privateUpperBoundRupees`. Response is assembled with the two-step
  assertion: full payload scanned with every `gated` forced `null`, then each non-null
  `gated` subtree scanned separately with the gated allowlist.
- `src/repositories/recommendation.repository.server.ts`: added the same `priceBandLabel`
  computation so `recommendationItemSchema.parse()` doesn't throw at runtime under `.strict()`
  — this wouldn't have been caught by `tsc` since the input is a plain object literal typed
  `unknown` going into `.parse()`.
- `src/api/functions/comparison-page.functions.ts`: rewritten to drop the old all-or-nothing
  `authRequired` gate (`findSafeComparisonIdentities`). `getV2ComparisonPage` now always
  returns a comparison; the gated subtree is `null` per-property based on session state.
  `src/repositories/comparison-page.repository.server.ts` deleted — it only existed to serve
  the old gate and had no other callers.
- `src/routes/compare.tsx`: the v2 path no longer walls the whole page behind sign-in. Split
  `ComparePage` into a thin dispatcher plus `LegacyComparePage` (unchanged v1-style auth-wall
  behaviour, preserved as-is) and `V2ComparePage` (renders `V2Comparison` immediately; public
  tier is always visible, gated rows render skeletons until unlock). This was a deliberate
  architecture fix, not a refactor for its own sake: the previous v2 route reused the v1
  full-page block, which contradicts D4/D5 (skeleton rows in place, user-initiated unlock,
  no page-level wall).
- `src/components/compare/ComparisonMatrixTableV2.tsx` (new): the nine-section matrix ported
  onto the two-tier contract. Public cells (`Plain`) render immediately from
  `PublicPropertySummary`/`publicFacts`/public `configurations`. Gated cells route through a
  generic `GatedText` helper that renders a `SkeletonBar` when `gated` is `null` (D4 — never a
  fabricated number), `"Not stated"` vs `"Not offered"` distinctly per `field_state`
  (guardrail 8), or the formatted value once unlocked.
- `src/components/compare/UnlockGate.tsx` (new): non-blocking banner, not a modal or redirect
  — offers unlock via `requestGatedAuth()` on click. Deliberately not auto-triggered (unlike
  the legacy v1 gate), per D5's two-screen phone→OTP flow being user-initiated.
- `src/components/compare/V2Comparison.tsx`: rewritten from a flat 6-fact summary into a thin
  shell around `ComparisonMatrixTableV2` — hero copy, the `UnlockGate` banner when any
  property's `gated` is `null`, then the matrix, `LocationDistances`, and
  `PropScoreComparison` behind `V2_PROPSCORE`.
- `scripts/check-consumer-boundaries.ts`: dropped `rateRupeesPerSqFt` from the forbidden-token
  list. It's a blunt text scanner over `src/components|routes|stores` predating override O1;
  the token is now a deliberate, contract-enforced exception (gated tier only, verified by
  `assertGatedComparisonPayloadSafe` at the repository boundary), not a leak. The three actual
  private-price columns (`baseSalePriceRupees`, `privateLowerBoundRupees`,
  `privateUpperBoundRupees`) stay forbidden.
- `src/contracts/consumer.test.ts`: the leakage-guard fixture needed `priceBandLabel` added
  to stay valid against the widened `publicPropertySummarySchema`.

**Second batch — the three remaining components and event re-pointing:**
- `src/lib/preferences-storage.ts` (new): pulls the localStorage preference key/shape
  (`propcompare:v2-preferences`) out of `V2CataloguePage.tsx` into a shared module —
  `readStoredCataloguePreference()` — so `MissingAlternatives` can read the same preference
  the catalogue page writes, with defensive JSON/shape validation on read.
- `src/domain/propscore.ts`: added `SCORE_DIMENSION_LABELS` (display labels for the 5
  `ScoreDimension` keys), used by both new PropScore-driven components below.
- `src/components/compare/WeightingStrip.tsx` (new): 5-slider (0–5, default 3) weighting
  control over the PropScore dimensions. Computes a live weighted average per property from
  each property's already-fetched `GatedPropScorePayload.dimensions`, skipping null scores
  and zero-weight dimensions. Shows "Not enough verified data" rather than fabricating a
  number when nothing scoreable is weighted (guardrail 4). Debounces (600ms) a
  `weighting_changed` activity-log call carrying the current weights. Only renders once
  PropScore is unlocked (needs `!locked` — see `V2Comparison.tsx` below).
- `src/components/compare/WhyThisWins.tsx` (new): deliberately not a "winner" card — the
  hero copy already commits to "factual differences, without a manufactured winner"
  (guardrail 2, no claim without a traceable source). For each of the 5 dimensions, only
  surfaces a lead when every compared property has a `"complete"`-status, non-null score for
  that dimension AND the top score clears the second-best by 5+ points; each lead cites the
  dimension's own sourced `why[0].explanation`. Renders an honest empty state when nothing
  clears the bar, never a fabricated differentiator.
- `src/components/compare/MissingAlternatives.tsx` (new): public-tier, no unlock required
  (matches `getRecommendations`, which has no `requireVisitorAuth`). Reads the visitor's
  saved catalogue preference via `readStoredCataloguePreference()`, calls
  `getRecommendations`, filters out properties already in the comparison, and shows up to 3
  alternatives with an "Add to compare" link that appends the slug to `/compare`'s `ids`
  param and logs `alternative_clicked` with the target slug before navigating. Renders
  nothing if there's no stored preference, no results, or the comparison is already full (3).
- `src/components/compare/V2Comparison.tsx`: wired `WeightingStrip`/`WhyThisWins` inside the
  existing `propscoreEnabled` block, additionally gated on `!locked` (both need real
  PropScore data, which only exists post-unlock); wired `MissingAlternatives` unconditionally
  right after (public data, no gating), passing the current comparison's slugs.
- `src/components/catalogue/V2CataloguePage.tsx`: removed the Phase 0 placeholder
  `weighting_changed` emission from the sort dropdown and the placeholder
  `alternative_clicked` emission from the alternate-configuration "Add to compare" click —
  both were semantically mismatched proxies (confirmed against the admin activity-log labels
  "Adjusted ranking weighting" / "Clicked an alternative match"). The real events now fire
  from `WeightingStrip` and `MissingAlternatives` above. Also switched to the shared
  `preferences-storage.ts` constant/type instead of its own local copies.

**Full verification loop passed (both batches):** `tsc --noEmit` clean, `bun run lint` clean,
`bun run test` 25/25 files · 114/114 tests, `bun run check` clean
(mapping/polling/brochure/consumer-boundary scripts), production `bun run build` succeeded.

**Still open before Phase 2 is fully closed:**
- The Part 8 acceptance test (no-session network response has no carpet/room/rate/price
  fields; deep rows fill in place after phone-only unlock with no navigation; SSR with JS
  disabled). The live-DB *connectivity* blocker is gone as of the 2026-08-18 migration run
  above, but the v2 property tables (`configuration_variants`,
  `property_publication_details`, etc.) are still empty — no property has been loaded through
  the canonical schema yet. This test needs at least one real property published through
  Phase 3's workflow before it can run meaningfully; it isn't a DB-access problem anymore, it's
  a data problem.

---

## Phase 5 — implementation foundation landed dark

Phase 5 now has a deterministic `propscore-v1.0.0` domain, manual RERA discrepancy rules,
immutable verification/score/connectivity tables, reviewer-only server operations, stored Google
Routes snapshots, strict gated consumer contracts, residence/comparison panels, a reviewer console
and the permanent `/methodology/propscore` page. `V2_PROPSCORE` defaults off.

The canonical-field adapter intentionally targets Phase 1's additive
`configuration_variant_areas` and `specification_catalog` tables without modifying them. Do not
enable the flag until Phase 1 has landed, Phase 3 has published the source-backed catalogue, the
Phase 5 migration has run, Ahmedabad landmarks are curated, and every score explanation has passed
manual evidence review. Automatic RERA scraping remains prohibited.

---

## Standing rules that apply to every phase (repeat, so nobody has to go find Part 9)

- No exact price on any consumer surface, ever. No published claim without a traceable
  source. Score/ranking is never purchasable. No fabricated data in the client payload,
  including behind the auth gate/blur. A gap in a brochure publishes as `not_stated`, never
  an inferred value.
- Never commit to `main` directly.
- Migrations must be idempotent, `GRANT ALL ... TO service_role`, `ENABLE ROW LEVEL
SECURITY` with zero policies (deny-by-default — everything goes through service-role
  server functions).
- Never touch generated files: `src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`,
  `src/generated/**`.
- Server-only code lives in `src/server/**`, imported via `await import(...)` inside
  handlers, never at module top level.
- Deploy target is a GCP VM. Introduce nothing Vercel- or Cloudflare-specific (see the open
  item above — don't make it worse).
- Only format files you actually changed.
- Verify every task against the plan's Part 8 checklist before moving to the next one.
