# PropCompare v2 — progress & handoff

Read this first if you're picking this branch up. It tracks where we are against the
phased plan and records the judgment calls already made, so you don't have to re-litigate
them or accidentally undo something deliberate.

**Full plan (source of truth for scope/ordering):** `okay-so-we-have-declarative-waterfall.md`
— ask whoever wrote it for a copy if you don't have one; it's not checked into this repo.

**Current implementation branch:** `phase-7-developer-intelligence`, based on the Phase 6
merge on `main` (`0bdd28f`). **Never commit to `main` directly.**

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
- [x] Phase 6 — Reviews with real content & site-visit verification — merged to `main`
- [x] Phase 7 — Developer intelligence — implementation landed dark on
      `phase-7-developer-intelligence`; migration/IAM rollout and pilot data remain
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

- ~~The two new SQL migrations above are written but **not executed against the live DB**~~ —
  resolved 2026-08-18: both ran as part of the 10-migration batch (see "Live DB migration"
  below). The constraint-name assumption in `20260817130000_expand_customer_activity_events.sql`
  was also verified directly against the live schema: `pg_constraint` confirms
  `customer_activity_event_type_check` is still the actual name on `public.customer_activity`,
  and its definition now lists all 11 event values, so the migration's `DROP CONSTRAINT IF
EXISTS` did not silently no-op.

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

**Follow-up verification — 2026-08-18 (later the same day):** with DB access now routine,
closed out the one item still flagged as unverified from Phase 0: the constraint-name
assumption in `20260817130000_expand_customer_activity_events.sql`. Queried `pg_constraint`
directly — `customer_activity_event_type_check` is confirmed still the real constraint name on
`public.customer_activity`, and its live definition lists all 11 event values, so the
migration's `DROP CONSTRAINT IF EXISTS` found and replaced the right constraint rather than
silently no-op'ing. Also swept the standing rule ("RLS enabled with zero policies") across the
whole live schema: all 46 `public` tables have `relrowsecurity = true` and `pg_policies` has
zero rows — holds project-wide, not just on the tables touched this session.

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
  disabled). The live-DB _connectivity_ blocker is gone as of the 2026-08-18 migration run
  above, but the v2 property tables (`configuration_variants`,
  `property_publication_details`, etc.) are still empty — no property has been loaded through
  the canonical schema yet. This test needs at least one real property published through
  Phase 3's workflow before it can run meaningfully; it isn't a DB-access problem anymore, it's
  a data problem.

  **Confirmed directly, 2026-08-19.** Ran `bun run dev` against the live DB with
  `V2_CATALOGUE`/`V2_COMPARISON` on and hit `/compare?ids=pashmina,avant` (two real, existing
  properties). Got a 500: `consumerComparisonSchema`'s `properties: z.array(...).min(2)` threw
  "Array must contain at least 2 element(s)" because `findConsumerComparison` inner-joins
  `propertyPublicationVersions` and `configurationVariants` per property and both tables are
  empty, so the query returned zero rows for both slugs. Confirms the diagnosis above with a
  real repro rather than just table-emptiness inspection — nothing to fix here, this closes
  once Phase 3 publishes real properties.

---

## Phase 3 — load the 26 and flip (started: diff/classification tooling)

**Diff/classification tool — 2026-08-18.** Before touching live brochures, built the
exception-only-review machinery §5.1 describes, since it doesn't depend on the OCR service or
real brochure files being available.

- `src/lib/extraction-diff.ts`: `classifyDiffs(current, response, isFailingValidation?)` runs
  `brochure-field-mapping.ts`'s existing `buildMergeRows` (the closest existing analog — a
  saved-vs-incoming row differ already used by the admin merge UI) and layers a classification
  on top rather than building a second diff engine. Every row lands in one of:
  `failing` (a Phase 4 cross-field validator rejected it — sorts first regardless of
  confidence; Phase 4 doesn't exist yet, so this is reachable only via the optional
  `isFailingValidation` predicate hook, wired for when those validators land) → `conflict` (an
  existing value the brochure disagrees with — never assumed to be wrong) → `gap_fill` (a
  genuinely blank field, but confidence too low to trust unattended) → `cosmetic` (a
  case/whitespace-only difference, deprioritised, not treated as a real conflict) →
  `silent_accept` (a genuine gap at ≥0.85 extraction confidence — the only category that skips
  human review). Configuration-variant rows (per-basis areas, room dimensions) don't trace back
  to a single scalar `ExtractedField`, so they carry `confidence: null` and can never
  silently auto-accept even when found.
- `buildReviewReport(diffs)` produces the "N auto-accepted, M need you" card §5.1 describes
  closing a brochure review with, plus counts for failed-validation and conflicting rows when
  present.
- `scripts/check-extraction-diff.ts`: assertion-script coverage in the project's existing
  narrative-`assert` style (not vitest), wired into `bun run check` right after
  `check-mapping.ts`. Covers: confident gap fill auto-accepts; low-confidence gap needs review;
  a disagreeing value is a conflict, not an assumed correction; a case-only difference reads as
  cosmetic, not a real conflict; a configuration-variant row never auto-accepts regardless of
  confidence; a field flagged by the `isFailingValidation` hook sorts first ahead of an
  ordinary conflict; the report card counts line up and auto-accepted rows never also appear in
  the review queue.

**Full verification loop passed:** `tsc --noEmit` clean, `bun run lint` clean, `bun run test`
114/114 (unchanged — the new script isn't a vitest file), `bun run check` clean including the
new script (`review report : 1 auto-accepted, 4 need you, 1 conflicting with a saved value.`),
production `bun run build` succeeded.

**Still open:** everything else in Phase 3 — re-extracting the 26 real brochures through
`property-ocr-suite`, running them through this review tool per-brochure, publishing with real
provenance, the v1-vs-v2 side-by-side render gate, and the flag flip. All of that needs the OCR
service running and real brochure files, neither exercised yet this session.

### GujRERA cross-reference side-work — 2026-08-24 (separate session, local-only)

Not a Phase 3 checklist item on its own, but directly feeds "publish with real provenance":
built a standalone pipeline (`scripts/rera-pilot.ts` → `rera-brochures.ts` → `rera-enrich.ts`)
that matches each already-OCR'd property against GujRERA's public JSON API
(`gujrera.gujarat.gov.in`, unauthenticated, one-connection-at-a-time rate limiting), downloads
the single registered brochure PDF per match, and pre-fills a small, deliberately-scoped set of
RERA-only facts the LLM extractor can never see on the brochure itself: registered
start→completion timeline, construction progress %, and developer track record (reusing
existing `developer.total_delivered_projects`/`ongoing_projects` fields; two new schema fields,
`rera.registered_completion_date` and `rera.construction_progress`, added to `schema.py` +
`frontend/app.js` only — deliberately kept out of `wire_schema.py`/`prompts.py` since the LLM
never fills them). Registered promoter, total carpet area, and declared project cost were
considered and explicitly excluded from this pass.

- Match coverage: all **25** unique properties on disk (of 27 files; 2 are duplicate
  re-uploads of already-counted properties — left untouched, not this pipeline's call to
  delete). Every match is human-confirmed in `scripts/rera-matches.json`, including one
  (NORTH PARK) where the brochure carries no reg. no. at all and the match relies on the
  registered promoter agreeing with the brochure's stated developer — verified against the
  physical brochure by the project owner before being accepted.
- 21 of 25 projects now have their registered brochure PDF downloaded
  (`property-ocr-suite/backend/storage/rera-brochures/`, gitignored); 18 of those newly got
  one or more of the 3 enrichment fields filled where the job JSON still had them blank
  (never overwrites a found/verified value).
- UI verified end-to-end with a headless-browser pass (Playwright): both new RERA fields
  render correctly in the review form with proper confidence styling.
- **This is entirely local-file work** — job JSONs on disk and this repo's own scripts/matches
  file. It has not touched Supabase, the submission workflow, or any `V2_*`-gated table; it's
  upstream prep for whenever Phase 3's "re-extract the 26" and "publish with real provenance"
  steps actually run. Full decision log in memory (`project_rera_integration_decisions`) in
  case this continues in a different session.

### Local Postgres stood up, 16 of 25 published — 2026-08-23

**Target-database decision (owner's, explicit):** skip the "seed Supabase first" intermediate
step. Stand up the real PostgreSQL locally now and treat it as the actual target; the same
migrations get replayed on the hosted GCP VM later so the two stay in sync. This supersedes
the earlier "seeding into Supabase paused" posture — live Supabase is not where this lands.

What made that viable: every v2 repository (`publication`, `comparison`, `catalogue`,
`review`, `propscore`, `developer-intelligence`) is pure Drizzle over the postgres-js driver
with **zero** `supabaseAdmin` references. The Supabase JS client is confined to the v1/admin
layer. So the canonical publish path runs on stock Postgres with no code change at all.

Two files were needed to make Supabase-authored migrations replay on stock Postgres:

- `ops/db/bootstrap.sql` — idempotent prelude creating the `anon`/`authenticated`/
  `service_role` roles (every migration GRANTs to them), an `auth.users` shim (`admin_profiles.id`
  has an FK onto it), a `storage.buckets` shim (two migrations INSERT a bucket row), and
  `supabase_migrations.schema_migrations`. Deliberately a shim, not a re-implementation —
  migrating actual auth off Supabase is separate, unstarted work.
- `ops/db/migrate.sh` — replays `supabase/migrations/*.sql` in filename order, each
  `--single-transaction`, records the version, skips already-applied, `--dry-run` supported.

Forking the migrations was the alternative and was rejected: the hosted database already ran
those exact files, and editing them would guarantee drift between the two servers. Both new
files are written to run unchanged on the VM.

Result: all 21 migrations applied clean, 52 public tables, `check-drizzle-schema.ts` clean
across 37 mirrored canonical tables. Catalogue seeds present (1 enabled market, 11
`configuration_options` kinds, 43 amenities, 6 specifications, 19 field synonyms).

**The loader — `scripts/load-brochures.ts`.** "Re-extract all 26" turned out to be a stale
framing (confirmed with the owner): the job JSONs on disk *are* the extraction output, already
human-checked and RERA-enriched. What had never happened was feeding any of it into the
submission workflow. The loader does exactly that and nothing more — it calls
`saveDeveloperRevision` → `submitDeveloperWorkflow` → `publishWorkflow`, the same three
repository functions the developer portal calls, so a loaded property is indistinguishable
from a real developer submission approved by a reviewer. No second write path exists to drift.
`--plan` writes nothing to the database and dumps a per-property plan JSON; `--publish` loads;
`--name` filters. Dedupes the 27 on-disk jobs to 25 by loose name key, keeping the richest.

Published: **16 of 25** — 16 properties, 16 publication versions, 16 publication details,
76 configuration variants, 532 variant rooms, 16 workflows in `published`.

Two mechanical mapping bugs surfaced during the plan run and were fixed in
`brochure-field-mapping.ts` (a `COERCE` table applied in the FIELD_MAP loop); they took the
ready count from 10 to 16:
- `category` arrived as brochure prose ("Residential Apartments", "Luxury Villas") where the
  form takes one of a fixed set;
- `reraUrl` arrived bare ("gujrera.gujarat.gov.in") where a URL was required.
A value the coercion can't represent is now dropped rather than written through as-is — an
unusable value in a typed field fails validation much later, far from the brochure that caused
it. `bucketFor()` was examined and deliberately left alone: it already reports out-of-range
BHK counts as dropped for a human to decide, which is the correct behaviour.

**Blocked — 9 properties, all needing an owner decision, not a code fix:**

1. *Over-length prose (4): ANAMIKA High Point, Anurita, SHANTIGRAM, Vaikunth.* Flooring /
   bath-fittings / room-dimension strings run 204–488 chars against a 200-char cap. The cap is
   `MAX_SHORT_TEXT` (`property-schema.ts`) and `gatedText(200)` (`publication.ts`) only — the
   DB columns are unconstrained `text`, so raising it is additive with no migration. Truncating
   silently would drop brochure content, which the standing rules forbid.
2. *Out-of-taxonomy configurations (3): RIVIERA SELECT (6 BHK ×3), THE WEST PARK (1 BHK),
   SHANTIGRAM (2 BHK).* The canonical taxonomy has `2_bhk`–`7_bhk` but the form exposes only
   five buckets, and 1 BHK has no canonical option at all.
3. *Genuinely empty or unlabelled (4, overlapping): AMARIS (2 configs with blank `bhk_type`),
   Anurita, Shaligram Luxuria, The Universe (0 configs extracted); plus THE PARK's junk
   "Reception" config row.* `publicationRevisionSchema` requires `configurations.min(1)`, so a
   zero-config property cannot publish by design.

**Finding — area coverage is thin, and some of it is recoverable.** Of 142 configurations
across the corpus, only **39 carry any area value**, and `configuration_variant_areas` came out
at 21 rows across 76 published variants. `private.commercial_terms` is 0 — no extraction
carries a price or a rate, so `publishWorkflow` correctly writes no commercial row.

The area gap is partly an extractor miss, not a brochure gap. For GODREJ ALTUS variant "101",
`carpet_area` is `found: false`, while the sibling `variant_label` evidence string reads
`"101 R.C.A.=181.55 SQ.MT."` — the number is on the page and was not picked up. **15 of the
103 area-less configurations have an area sitting in a sibling field's evidence string**
(Rashmi Skyscape, GODREJ ALTUS), in R.C.A. Sq.Mts, convertible with the existing
`src/domain/units.ts`. This matters more than the raw count suggests: area is the field
`findConsumerComparison` reads (`basis='super_built_up'`), so it drives the comparison surface.
Recovering these is a Phase 4 extractor fix, not something to paper over in the loader.

**Two latent defects found, deliberately not fixed yet** (both touch shared mapping code, both
change what reaches the DB, so they want a decision first):
- `possessionConfirmedAsOf` is never populated from OCR. FIELD_MAP maps
  `basics.possession_confirmed_as_of` → `possessionAsOf`, but `buildPublicationRevision` reads
  `values.possessionConfirmedAsOf`. These are documented as *distinct* fields in
  `property-schema.ts`, so this is a genuine mismatch, not a naming quirk.
- The two RERA fields added last session (`rera.registered_completion_date`,
  `rera.construction_progress`) have no corresponding `PropertyFormValues` field, so that
  enrichment cannot reach the database through this path at all.

**Verification of the one shared-file change:** `check-mapping.ts` passes, `tsc --noEmit`
clean, `bun run test` 28 files / 133 tests pass. Note `bun run check` is **already red** on
`check-brochures.ts` ("a layout or a printed size is being lost") — proven pre-existing by
stashing the change and getting byte-identical output. That violates the standing "check clean
before every merge to `main`" rule and needs fixing before this branch merges.

Still open in Phase 3 after this: the exception-only review itself (§5.1, per brochure via
`extraction-diff.ts`) — the owner's stated remaining work — then the staging flag flip, the
v1-parity + mobile render gate, and the production cutover.

### The blockers cleared, 20 of 25 published, `check` green — 2026-08-23

Everything above under "Blocked" except the genuinely-empty bucket is resolved, plus a live
data-correctness bug that the first load had already written to the database.

**Areas were being stored ten times too small.** `mapConfiguration` parsed the number out of
the brochure's raw string and then labelled it `unit: "sq_ft"` unconditionally. A brochure
printing `133.23 SQ.MT.` published as `133.230 sq_ft` — a 1,434 sq ft home listed at 133 sq ft.
Confirmed against the live rows before the fix. It lands on the exact field
`findConsumerComparison` ranks by, so it was the worst thing in the corpus. Fixed with
`parseAreaSqFtOrNull` in `publication-mapping.server.ts`: the unit is read off the brochure's
own words (`sq.mt`/`sq.mtr`/`sq.mts`/`gaj`/`sq.yd`/`acre`, with the spellings the corpus
actually uses) and converted through the existing `toSqFt`. No stated unit still means sq ft.
`rawText` keeps the brochure's words either way, so a reviewer can always see the page.

A companion bug in the same function: a room's `areaValue` took the first number out of a
dimension pair, publishing an 18 sq ft living room from `"18x14"`. It now yields `null` rather
than inventing an area — multiplying the pair would be a computed number presented as a
brochure fact.

**The form's bucket list was narrower than the taxonomy it feeds.** `CONFIG_BUCKETS` held
3/4/5/penthouse/duplex while `configuration_kind` runs `2_bhk`–`7_bhk`, so every 2 and 6 BHK
layout a brochure printed was dropped on the way in and six live listings were thinner than
their own brochures. Widened to eight buckets — no migration, no generated-file edit, the enum
and the generated contract already had them. `tsc` then found all seven hardcoded five-bucket
sites, which is the type system doing its job. 1 BHK stays out: it has no canonical option, so
there is nowhere for it to land, and `bucketFor` still routes it to a human.

**Prose caps raised** from 200 to `MAX_SPEC_TEXT` (600) for flooring / bath fittings /
construction quality / room dimensions. Those columns are unconstrained `text`; the cap was a
validation ceiling that rejected four brochures outright for printing a sentence where the
form expected a label.

**Carpet areas recovered from unit labels.** Some plan books print the unit number and its
RERA carpet area as one caption — `"101 R.C.A.=181.55 SQ.MT."`. The model took the unit number
as the label, quoted the caption as that label's *evidence*, and reported `carpet_area` as not
found. `recover_carpet_area_from_label` (normalizer.py, inside `normalize()`) lifts it,
searching evidence as well as value — evidence is the better source, being verbatim page text.
It only fills a blank, keeps the brochure's unit, and flags `derived=True`.
`scripts/backfill_carpet_area.py` imports that same function so the corpus and future
extractions cannot drift; it filled 9 across 2 files and re-runs as a no-op. The earlier
"15 recoverable" figure in the section above was from a looser rule — the real count is 9.

**Republished: 20 of 25.** The 16 already in the database carried the unconverted areas and
were missing their new 2/6/7 BHK rows, and `publishWorkflow` allocates a fresh `slug-<uuid>`
rather than replacing, so the loader-produced tables were truncated and all 20 published
clean. Now: 20 properties, 20 publication versions, **98 configuration variants** (was 76),
**44 variant areas** (was 21), 686 variant rooms. Variants by kind: 2_bhk 6, 3_bhk 19,
4_bhk 43, 5_bhk 16, 6_bhk 3, 7_bhk 1, penthouse 6, duplex 4 — the 2/6/7 rows are layouts that
did not exist in the database before. Verified: `133.23 SQ.MT.` now stores `1434.074 sq_ft`.

**Still blocked, 5, and it is the same genuine bucket:** AMARIS, Anurita, Shaligram Luxuria,
The Universe, THE WEST PARK — zero configurations extracted, and `publicationRevisionSchema`
requires `configurations.min(1)` by design. This needs the owner to decide between
hand-correcting through the existing `VariantOverrides` mechanism and leaving them unpublished
if the brochures genuinely have no floor plans. Not a code fix either way.

**`bun run check` is green.** Two separate problems were behind the red:
- `check-mapping.ts` asserted that a stated 2 BHK must be *dropped*. That was true when the
  form had no 2 BHK bucket and is now wrong. The assertions were rewritten around 1 BHK, which
  is what genuinely has nowhere to land — the case the check was really about.
- `check-brochures.ts` failed on any non-zero count over a live corpus. It could never be
  green: the 13 unidentified layouts are real brochure ambiguities (a bungalow's basement
  sheet, an unlabelled `"Type : A ( 201 )"`, a clubhouse `"Reception"`) that only a human
  reading the page can settle. It now measures against `scripts/brochure-gaps.baseline.json`
  and fails on an *increase* — a new plan-book convention the mapping stopped handling, which
  is the regression it was always meant to catch. A decrease also fails, telling you to lower
  the baseline so the gain is held. Every number stays printed.

**`scripts/review-queue.ts` (`bun run review:queue`)** builds the §5.1 worklist for the review
that remains. It runs the same `classifyDiffs` / `buildReviewReport` the review UI uses, so the
queue and the screen cannot disagree, and dedupes by property name the way the loader does so
one property run twice is one review. It writes nothing. Current state across the 25:
**315 auto-accepted, 824 fields needing a human** — 212 failed a backend consistency check,
4 conflict with a saved value, 607 are uncertain gaps — plus 13 unidentified layouts and 11
bedroom shortfalls. Ordered worst-first: pashmina (62 flagged), THE KIMANA TOWERS (38),
Rashmi Skyscape (32), EMINENCE 96 (32) lead it.

Verification: `tsc --noEmit` clean, `bun run test` 28 files / 138 tests, `bun run check` green,
backend `.venv/Scripts/python.exe -m pytest` 166 passed.

**For the other developer:** the area-unit conversion and the one-line `BUCKET_TO_KIND`
addition are in `src/domain/**`, which is their territory.

---

## Cross-cutting — mobile comparison UX (started 2026-08-18)

**Audit.** `ComparisonMatrixTableV2.tsx`'s property-name header was `hidden md:grid` — fully
invisible below the `md` breakpoint — so a phone visitor scrolling down through the matrix's
nine sections lost track of which of the 2–3 columns belonged to which property. Below `md`,
rows fell back to a plain `flex` row with no minimum column width, so long content (room
dimension lists, specification lists) clipped or wrapped illegibly in whatever space was left
after the label. `SectionLabel`, the footnote paragraph, and the gallery row's "Photo" label
were separate, non-grid markup that would only ever have been viewport-width once horizontal
scrolling was introduced, leaving a visible gap on the right of those bands once the table
became wider than the screen.

**Design decision.** Asked the user to choose between three mobile layout patterns: horizontal
scroll with a sticky label column, stacked per-property cards, or a swipeable single column with
a field picker. Chose horizontal scroll + sticky label column — closest to the existing grid
markup, least engineering/interaction novelty, and works cleanly for the product's 2–3-property
comparisons.

**Implementation** (`src/components/compare/ComparisonMatrixTableV2.tsx`):

- Replaced the `hidden md:grid` header / flex-below-`md` row fallback with one unconditional
  CSS grid at every breakpoint: `grid-cols-[130px_minmax(150px,1fr)_minmax(150px,1fr)(_minmax(150px,1fr))]`
  — fixed minimum column widths so a narrow phone triggers horizontal scroll on the value
  columns rather than squeezing them unreadable.
- Label column (`Row`'s first cell) is `sticky left-0` — pinned while the property-value
  columns scroll underneath it. Per the user's clarification mid-implementation ("just the
  table should be scrollable"), only the inner `overflow-x-auto` region scrolls; the outer page
  layout is untouched.
- Property-name header row is `sticky top-[58px]` — matches `SiteHeader`'s scrolled-state
  height (`scrolled` flips at `scrollY > 12`, well before the table is in view) — so the header
  stays visible while scrolling down through the sections, keeping column identity legible the
  whole way down.
- `SectionLabel`, the footnote row, and the gallery's "Photo" label now render as
  `grid ${gridTpl}` with a `col-span-full` inner element, so their background spans the same
  scrollable width as the data rows instead of stopping at the original viewport edge.
- Existing global CSS (`src/styles.css` `.compare-row[class*="sticky"]` shadow, scoped to
  `@media (max-width: 767px)`) already expected this pattern — left as-is; it now shows the
  scroll-affordance shadow below `md` as originally designed, no changes needed there.

**Verification:** `tsc --noEmit` clean, `bun run lint` clean, `bun run test` 114/114 unaffected
(no test touches this component). **Not yet done:** real-device or emulated-viewport visual
verification — this repo has no component-render test harness (no React Testing
Library/jsdom; `vitest.config.ts` runs `environment: "node"`) and the live `/compare` v2 route
needs Phase 3's property data before `V2Comparison` renders with real props. Revisit once
either lands. The legacy `ComparisonMatrixTable` (v1) was deliberately left untouched per the
plan — port only if v1 keeps serving traffic past the Phase 3 cutover.

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

## Phase 7 — developer intelligence implementation landed dark

Phase 7 adds an isolated, manually managed trial/paid entitlement, aggregate-only BigQuery and
local analytics adapters, a five-session privacy floor, explicit structured comparison feedback,
30-day per-project developer dashboards, owner access controls and the permanent
`/methodology/developer-intelligence` independence policy. `V2_DEVELOPER_INTELLIGENCE` defaults
off. Payment cannot change PropScore, recommendations, verification, moderation or catalogue
order.

The Phase 7 migration and Terraform IAM changes have not been applied to production. Deploy in
the documented order: migration and IAM with the flag off, telemetry validation, flag enablement
with no active entitlements, then one time-bound pilot entitlement after a project reaches the
five-session reporting floor.

---

## Supabase retirement plan — Phase A (started 2026-08-26)

Separate initiative from the phases above: retiring Supabase entirely (Postgres, Auth, Storage)
onto the GCP VM's self-hosted Postgres and GCS, in four independently-deployable phases per
`melodic-petting-codd.md` (owner's plan; not checked into this repo). Full file:line findings
backing this phase live in `SUPABASE_CUTOVER_NOTES.md` (repo root, untracked scratch notes).

Order is fixed and must not be skipped: **A** (profiles/admin_profiles/customer_activity → local
Postgres) → **B** (property-images storage → GCS) → **C** (collapse V1/V2 properties, retire
dead V1 code) → **D** (staff/admin/developer auth rebuild on better-auth). Each phase ships and
is verified live before the next starts.

### Phase A, sub-phase 1A — schema + non-auth call sites (in progress, not yet deployed)

**Live-schema correction before writing anything:** the plan assumed `admin_profiles`/`profiles`
needed new columns and a widened `role` CHECK. Queried the actual local dev Postgres schema
directly first — `ops/db/migrate.sh` replays *all* 24 migration files (not just the 9
`check-drizzle-schema.ts` tracks), so the physical tables already carry every column the plan
wanted, including the widened CHECK (`20260816120000_v2_canonical_foundation.sql`). Only
`src/db/schema.ts`'s Drizzle mirror was a bare stub. This cut the actual migration need down to
two `DROP TABLE IF EXISTS` statements for confirmed-dead tables.

- `src/db/schema.ts`: widened `adminProfiles` and `profiles` from bare stubs to their full real
  columns (matching what's already live), added `customerActivity` (previously absent from the
  Drizzle mirror entirely) with its 12-value event-type CHECK.
- `scripts/check-drizzle-schema.ts`: registered all three tables' migration files + table names
  so `bun run db:drift` actually covers them (it silently didn't before).
- New repositories, all Drizzle-over-`getDatabase()`, no `supabaseAdmin`:
  `src/repositories/profile.repository.server.ts`,
  `src/repositories/customer-activity.repository.server.ts`,
  `src/repositories/admin-profile.repository.server.ts` (the last one is written but **not yet
  wired in** — see 1B below).
- Swapped every non-admin `supabaseAdmin.from("profiles"|"customer_activity")` call site onto the
  new repositories: `src/api/functions/customers.functions.ts`,
  `src/api/functions/activity.functions.ts`, `src/api/functions/profile.functions.ts` (all 7
  handlers), `src/server/developer-intelligence-analytics.server.ts`.
  `customers.functions.ts`'s `getAdminStats` is now a deliberate hybrid — customer/activity
  counts on local Postgres, `properties`/`property_submissions` counts stay on `supabaseAdmin`
  until Phase C.
- `src/api/functions/profile-email.functions.test.ts` updated to mock the new repository
  functions instead of `supabaseAdmin`; still asserts the same thing (an exact-equality lookup,
  never a wildcard-style pattern match).
- New migration `supabase/migrations/20260826120000_drop_dead_identity_tables.sql`: drops
  `profile_email_conflicts` (one-time audit artifact from the 2026-08-14 email-uniqueness
  migration, job already done) and `field_provenance` (schema for a feature that was never wired
  up, zero inserts ever). Both confirmed dead by grepping `src/` and `scripts/` for every
  reference. **Destructive — not yet run against any live database. Needs explicit owner
  sign-off before this ships**, even though both tables are confirmed dead, per the standing
  rule on hard-to-revert steps.

**Deliberately left alone, deferred to 1B:** `admin_profiles` reads/writes.
`admin-auth-middleware.ts`'s role lookup, and `admin-developers.functions.ts`
(`listDevelopers`/`createDeveloper`/`setDeveloperActive`) all key off the *same id* as the
Supabase Auth user (`createDeveloper` literally does `supabaseAdmin.auth.admin.createUser()` then
inserts `admin_profiles` with that user's id). Moving any of this to local Postgres before local
`admin_profiles` has been backfilled with matching ids would either orphan new developer accounts
or lock out real staff logins on deploy. 1B is: write `scripts/backfill-local-identity.ts`
(idempotent, dry-run default, reports id conflicts rather than overwriting — known conflict case:
`scripts/load-brochures.ts`'s synthetic `brochure-reviewer@pikorua.dev`/`owner@propcompare.local`
rows already exist locally with different ids than their real hosted-Supabase counterparts), run
it on the VM, verify, *then* wire `admin-profile.repository.server.ts` into
`admin-auth-middleware.ts` and `admin-developers.functions.ts` as its own commit/deploy.

**Verification (1A only, local):** `tsc --noEmit` clean, `bun run lint` clean, `bun run test`
138/138 (28 files), `bun run db:drift` clean (40 mirrored tables). `bun run check` was not used
as the verification gate here — `check-brochures.ts` (one of its five sub-scripts) is
independently red on unmodified `main` (an "unparsed sizes: 3, up from 2" OCR-corpus regression,
confirmed pre-existing by stashing this session's changes and getting byte-identical output) —
unrelated to this work, tracked separately, not blocking this phase.

Owner signed off on the `DROP TABLE` migration (drop both, recommended). Committed and pushed to
`main` (commit `2936765`); the CI-gated `deploy-shared-vm.yml` workflow deployed it automatically.

**Post-deploy verification (2026-08-26) — passed:**
- `supabase_migrations.schema_migrations` shows `20260826120000` applied at `2026-08-25 20:01:40 UTC`.
- `\dt public.profile_email_conflicts` / `\dt public.field_provenance` both report no such relation —
  both dead tables are gone.
- `docker compose ... ps`: `db` healthy (32h uptime, unaffected — migration ran via a throwaway
  container, not a restart), `web-blue` healthy (3 min old container — picked up the new image),
  `ocr-api`/`ocr-worker` healthy.

**1A is done and live.** Next: write `scripts/backfill-local-identity.ts` and ship 1B
(`admin_profiles` → local Postgres, wiring `admin-auth-middleware.ts` and
`admin-developers.functions.ts`), which finishes Phase A.

### Phase A, sub-phase 1B — admin_profiles + auth-middleware role lookup (2026-08-26)

**Correction to the earlier note above:** the local synthetic `admin_profiles` rows from
`load-brochures.ts`'s `ensureAccounts()` are `brochure-import@propcompare.local` and
`owner@propcompare.local` (confirmed by querying local Postgres directly), not
`brochure-reviewer@pikorua.dev` as previously assumed. Neither email collides with a real
hosted-Supabase staff account, so there was no actual id conflict to resolve — just a backfill.

- `scripts/backfill-local-identity.ts`: reads every row from hosted Supabase `admin_profiles`
  (owner + 5 developers + 1 legacy test-role row = 7 rows, confirmed via a direct query), upserts
  each into local Postgres **keyed on the same id** (also seeding the local `auth.users` shim
  those rows FK onto, same pattern as `ensureAccounts()`). Idempotent, dry-run by default
  (`--apply` to write). Ran dry-run then `--apply` after owner sign-off — 7 clean inserts, zero
  email/role conflicts. Re-ran to confirm idempotency: second run showed the same 7 rows as no-op
  updates, nothing new written. **This ran against `.env`'s `DATABASE_URL`, which is a native
  Windows Postgres service on 127.0.0.1:5433 — local dev data only, not a tunnel to the VM (the
  VM's `db` service publishes no host port at all, see below).** That mistaken assumption caused
  a real post-deploy bug — see "Post-deploy incident" below.
  Owner noted they may only hold working credentials for 1-2 of these 7 accounts — expected, some
  are dormant/test rows; the backfill mirrors what Supabase actually has regardless, both for
  correctness and because a future cleanup pass can safely delete/deactivate unused ones later.
- `admin-profile.repository.server.ts`: added `listDeveloperProfiles`, `insertDeveloperProfile`
  (also seeds the `auth.users` shim row, mirroring `ensureAccounts()`), `setDeveloperActive`.
- `admin-auth-middleware.ts`'s `requireAdminAuth`: role lookup now calls
  `getAdminProfileById` (local Postgres) instead of `supabaseAdmin.from("admin_profiles")`. JWT
  verification (who the request is) stays on Supabase Auth until the Phase D rebuild — only the
  role/is_active lookup moved. This gates every admin/developer/owner request, so it's the
  highest-risk change in 1B.
- `admin-developers.functions.ts`: `listDevelopers`'s `admin_profiles` read moved to local
  Postgres; `createDeveloper`'s profile insert and `setDeveloperActive`'s update moved to local
  Postgres (auth-user creation/deletion stays on `supabaseAdmin.auth.admin.*` — identity creation
  is still Supabase-side until Phase D). Also fixed a pre-existing bug found while touching this
  file: `listDevelopers` was reading `developer_intelligence_entitlements` via `supabaseAdmin`,
  but `setDeveloperIntelligenceEntitlement`/`upsertEntitlement` had always written that table via
  Drizzle/local Postgres only — the two were reading and writing different databases, so the
  owner dashboard's intelligence-access column was stale/wrong for any Supabase-only developer.
  Added `listAllEntitlements()` to `developer-intelligence.repository.server.ts` and switched the
  read to match the write. `developer_submission_counts` (a view over V1 `property_submissions`,
  which has no local equivalent) deliberately stays on `supabaseAdmin` — Phase C scope.

**Verification (local):** `tsc --noEmit` clean, `bun run lint` clean (one prettier fix on the new
script, applied), `bun run test` 138/138 (28 files), `bun run db:drift` clean (40 mirrored tables).

**Deployed and verified live (2026-08-26).** Owner login works (Supabase Auth password reset via
`seed-owner.ts` still applies — that's a separate system, see below). Confirmed VM checkout at
`83c7872` and the running `web-blue` image built from it (`grep`'d the bundled
`admin-auth-middleware-*.mjs` inside the container — confirmed it calls the new
`getAdminProfileById`, not the old `supabaseAdmin` read).

### Post-deploy incident: backfill silently wrote to the wrong database (2026-08-26)

The Developers page failed live with `Unauthorized: not an active admin` for the owner, right
after a screenshot showed a *successful* login. Root cause took a full trace to find because
every individual layer checked out fine in isolation:
- `getAdminProfileById(ownerId)` called directly via `.env`'s `DATABASE_URL` → correct row,
  `isActive: true`.
- VM `git log` → correctly at `83c7872`.
- Bundled code inside the running container → confirmed calling the new local-Postgres path.
- `DATABASE_URL` inside the `web-blue` container → `postgresql://propcompare:***@db:5432/propcompare`,
  and that role is table owner + superuser + `bypassrls`, so RLS wasn't it either.
- The one test that actually mattered: running `getAdminProfileById(ownerId)` **from inside the
  container itself, against its own `DATABASE_URL`** → returned `null`. Querying the real `db`
  container directly (`docker compose exec db psql`) confirmed `admin_profiles` only had 3 rows
  in production — the owner and the other 5 real accounts were never there.

**Cause:** `.env`'s local `DATABASE_URL` (`postgresql://postgres:admin@127.0.0.1:5433/propcompare`)
is a **native Windows Postgres service running on this machine**, seeded independently during
Phase 3 brochure-loading work (see `project_ocr_extractions_pending` memory) — it is *not* an SSH
tunnel into the VM. The VM's `db` container publishes no host port at all (confirmed in
`docker-compose.production.yml`); the only ways to reach the real production database are
`docker compose exec db psql` on the VM, or a script run *on* the VM. The two databases share a
schema and some coincidentally-similar seed data (both had synthetic `brochure-import@propcompare.local`
/ `owner@propcompare.local` rows from `ensureAccounts()`, but with **different ids** — that's
what made them look like the same database at a glance). Local dev's DB has never been the VM's
DB. `scripts/backfill-local-identity.ts --apply` ran against the local machine, not the VM —
every write it made this session landed in the wrong place.

**Fix:** re-fetched the same 7 rows fresh from hosted Supabase, generated `INSERT ... ON CONFLICT`
SQL by hand (skipping the one row — `brochure-reviewer@pikorua.dev` — that was already correctly
seeded in production from earlier 1A-era work), and ran it directly against the VM via
`docker compose exec db psql`. Verified: Developers page now lists all 6 real accounts
(owner + `samarth1`/`xyz`/`abc`/`brochure-reviewer`/`dev@test.local`) with correct submission
counts and active status.

**Standing rule going forward:** local dev's `DATABASE_URL` is local-only. Any script that must
write to production data goes through a command handed to the user to run on the VM — never
assume a local script reaches production, even if it "worked last time." See
`feedback_local_db_not_vm_tunnel` memory.

Phase A is now fully done and verified live.

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
