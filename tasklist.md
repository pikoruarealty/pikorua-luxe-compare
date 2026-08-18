# PropCompare v2 — phase-wise task list

Derived from `okay-so-we-have-declarative-waterfall.md` (Part 6, cross-referenced with
Parts 3–5). This file tracks task-level status per phase and is kept up to date as work
lands — check `PROGRESS.md` for the narrative decisions behind each checked box.

Division of labour (Part 9): **us** = Phase 1–4 (vocabulary, comparison contract, the
26-property load, extraction accuracy). **Him** = `src/db/**`, `src/repositories/**`,
`src/domain/**`, migrations, infra/ops, CI, v2 route components, plus Phases 5–8.
`schemas/property.v1.json` is the one shared file — additive changes only, one PR at a time.

---

## Phase 0 — Merge and stop the live bleeding
**Status: DONE**

- [x] Fast-forward `main` to `security-and-cosmetics`, flags off
- [x] Session-gate `getDetailedProperties`; `getProperties` returns shell columns only
- [x] Guard remaining repositories with `assertConsumerPayloadSafe`
- [x] Close `BUDGET_BANDS` gaps; bound `classifyBudgetFit` on `minimumRupees`
- [x] Delete `advantagesFor`/`expertNoteFor`/`amenitiesFor`/`taglineFor`; stop seeding them
- [x] Emit `compare_open`, `gate_shown`, `gate_unlocked`, `alternative_clicked`,
      `weighting_changed`
- [x] Refresh `HANDOFF-CODEX.md`
- [x] `.gitignore` working notes; confirm `/property-ocr-suite/` ignore status

## Phase 1 — The canonical dictionary
**Status: DONE (merged into `core-features-addon`, not yet on `main`)**

- [x] 3.1 — `configuration_variant_areas` child table (one area row per basis per variant)
- [x] 3.2 — widen the dictionary: project structure, construction, developer, timeline,
      per-variant fields — all with `field_state`
- [x] 3.2 — `ceilingHeightBasis` (`clear` / `slab_to_slab` / `not_stated`)
- [x] 3.3 — `amenity_catalog` (~40 codes/8 groups) + FK from `property_amenities`
- [x] 3.4 — `specification_catalog` + FK from `property_specifications`
- [x] 3.5 — `field_synonyms` table, seeded
- [x] 3.5 — canonical unit conversion (`src/domain/units.ts`): sq_m, sq_yd, acre, gaj → sq_ft
- [x] Regenerate both contracts (`schema:generate`); `schema:check` green once committed
- [x] Drizzle mirror (`src/db/schema.ts`) + `check-drizzle-schema.ts` updated; `db:drift` green
- [x] Run the migration against a real database — all 10 pending migrations
      (`v2_canonical_foundation` through `canonical_dictionary`) applied cleanly to the live
      Supabase project via the pooler connection, each in its own transaction; verified via
      `information_schema` (48 tables now present, matches the 36 mirrored + originals) and
      `drizzle-kit check`. Zero data loss on the 9 pre-existing tables (33 properties, 11
      profiles, 192 activity rows all intact). Catalog tables (`markets`,
      `configuration_options`, `amenity_catalog`, `specification_catalog`, `field_synonyms`)
      seeded by the migrations themselves; property-level v2 tables
      (`configuration_variants`, `property_publication_details`, `property_score_versions`)
      are empty, as expected — populating them is Phase 3's job.
- [ ] Push branch / open PR against `main`

## Phase 2 — Comparison depth on the v2 contract
**Status: DONE except the live-DB acceptance test**

- [x] Extend `consumerComparisonPropertySchema` to carry the Phase 1 vectors
- [x] Add `priceBandLabel` to the public summary (override O2)
- [x] New gated payload for `rate` + `rateAreaBasis`, with its own `assertConsumerPayloadSafe`
      call (override O1) — implemented as `assertGatedComparisonPayloadSafe`, called per
      property's `gated` subtree after the public-scan pass
- [x] Port `ComparisonMatrixTable`'s nine sections onto the new contract
      (`ComparisonMatrixTableV2.tsx`)
- [x] `V2Comparison.tsx` becomes a shell around the matrix table, not a replacement for it
- [x] Build `UnlockGate` (skeleton bars, D4) — non-blocking banner, user-initiated unlock
- [x] Build `WeightingStrip` — live per-visitor re-ranking from real PropScore dimension
      scores/weights, never a fabricated composite; shows "Not enough verified data" instead
      of a number when nothing scoreable is weighted
- [x] Build `WhyThisWins` — deliberately not a winner card; only surfaces per-dimension leads
      when every compared property has a `"complete"`-status, sourced score and the gap
      clears a real margin (5 pts); empty state otherwise
- [x] Build `MissingAlternatives` — public-tier (no unlock needed), reads the visitor's saved
      catalogue preference, surfaces up to 3 non-duplicate catalogue matches with an
      "Add to compare" action
- [x] Re-point `alternative_clicked`/`weighting_changed` events at their real Phase 2 UI —
      removed the Phase 0 placeholder emissions from `V2CataloguePage.tsx`'s sort dropdown and
      alternate-configuration click; now fired from `WeightingStrip`'s slider changes (debounced)
      and `MissingAlternatives`'s "Add to compare" click
- [ ] Acceptance test: `/compare` with no session shows no carpet areas, no room dimensions,
      no rate, no prices; `priceBandLabel` present, `baseSalePriceRupees` absent. Deep rows
      fill in place after phone-only unlock, no navigation. `/compare/a-vs-b` renders SSR
      with JS disabled. (Not yet manually verified against a live DB this session.)

## Cross-cutting — Mobile comparison UX (bug fix, not phase-gated)
**Status: NOT STARTED — flagged 2026-08-18, blocks the Phase 3 cutover regardless of where
Phase 3 itself stands, since the comparison table is the product's core surface**

The comparison table (both the live `ComparisonMatrixTable` and the in-progress
`ComparisonMatrixTableV2.tsx`) is currently broken on mobile: fields disappear, columns
overflow off-screen, and the layout is not usable for comparing specs side by side on a
phone — which is most of this product's actual traffic.

- [ ] Audit every section of the matrix table at common phone widths (360–430px) and list
      every field/row that disappears, overflows, or clips
- [ ] Decide the mobile layout pattern (e.g. horizontal-scroll-with-sticky-label-column vs.
      stacked per-property cards vs. swipeable single-column) — a real design decision, not
      a squeeze-the-existing-table fix
- [ ] Apply it to `ComparisonMatrixTableV2.tsx` first (Phase 2, already built) since it's the
      one going live at the Phase 3 cutover; port the same pattern back to the legacy
      `ComparisonMatrixTable` only if v1 keeps serving traffic long enough to be worth it
- [ ] Manually verify on a real phone or device emulation, not just a resized desktop browser
      window — Chrome DevTools mobile emulation misses real touch/viewport quirks
- [ ] Add this to the Phase 3 cutover gate: v2 must render every row v1 renders **and** be
      usable on mobile, before the flag flip

## Phase 3 — Load the 26 and flip
**Status: NOT STARTED**

- [ ] Re-extract all 26 brochures through `property-ocr-suite` into the submission workflow
- [ ] Exception-only review per brochure (§5.1 — target ~70–80% silent auto-accept)
- [ ] Publish all 26; every field carries real provenance and an honest `field_state`
- [ ] Diff re-extracted values against current rows; classify every difference as fix or
      regression, don't assume
- [ ] Flip `V2_CATALOGUE`, `V2_COMPARISON`, `V2_REVIEWS` together in staging first
- [ ] **Gate: v2 must render every row v1 renders before the flip** — side-by-side screenshot
      diff
- [ ] Cut over in production; retire the v1 read path

## Phase 4 — Extraction accuracy
**Status: NOT STARTED — runs in parallel with Phases 1–3, is the constraint on everything
after Phase 3**

- [ ] (a) Cross-field arithmetic validators: `price ÷ super_built_up ≈ rate` (±5%);
      `carpet < built_up < super_built_up`; `carpet ÷ super_built_up` ∈ 0.50–0.80;
      `Σ room areas ≤ carpet`; `totalUnits ≈ towers × floors × unitsPerFloor` (±15%);
      `unitsPerAcre ≈ totalUnits ÷ plot-in-acres`; area increases 3→4→5 BHK;
      `possession > proposedStartDateRera`; RERA ID format; sanity envelopes
- [ ] A failed rule forces review regardless of model confidence
- [ ] (b) Golden set: 10–15 hand-verified brochures across formats, committed as ground
      truth, with a per-field accuracy report; record baseline before changing anything
- [ ] (c) Two-pass consensus on a single document (different chunk boundaries; agree+valid
      → auto-accept, disagree → review with both candidates)
- [ ] (e) Learning loop: store `(developer, format fingerprint, field, extracted, corrected,
      page)` per correction; format-specific hints for the same developer's next brochure
- [ ] `pytest`: every validation rule has a passing and a failing case; deliberately corrupt
      a fixture (6.57 → 65.7) and confirm the rate-check catches it

## Phase 5 — Verification & PropScore
**Status: DONE (landed dark on `main` ahead of schedule, by the other developer)**

- [x] RERA cross-check domain (`src/domain/rera-verification.ts`)
- [x] PropScore composite domain — 5 sub-scores: Space, Privacy/Density, Specification,
      Developer, Possession (`src/domain/propscore.ts`)
- [x] Connectivity/POI repository (`src/repositories/connectivity.repository.server.ts`)
- [x] Admin verification console (`src/routes/admin.verification.tsx`)
- [x] Methodology published on a permanent URL (`src/routes/methodology.propscore.tsx`)
- [x] Gated consumer contract (`gatedPropScoreSchema` in `src/contracts/consumer.ts`)
- [ ] Flip `V2_PROPSCORE` on — blocked until Phase 1 is on `main`, Phase 3 has published real
      data, their own migration (`20260817140000_phase5_verification_propscore.sql`) has run,
      landmarks are curated, and score explanations pass manual review

## Phase 6 — Reviews with real content & site-visit verification
**Status: NOT STARTED**

- [ ] Structured review form (not stars): sales experience, carpet-vs-promised,
      construction, density, noise, approach, negotiation
- [ ] Verification tiers with evidence requirements
- [ ] Developer right of reply (already built — wire it to the new review shape)
- [ ] Our own field verification on the top 15 projects

## Phase 7 — Developer intelligence (first real revenue)
**Status: NOT STARTED**

- [ ] Per-project dashboard: comparison volume, most-compared-against, chosen/rejected
      reasons, band positioning, sentiment
- [ ] Sold as intelligence, not ranking
- [ ] Policy: ranking and score are never for sale — publish this as policy, not just practice

## Phase 8 — Depth then breadth
**Status: NOT STARTED**

- [ ] Ahmedabad to ~100 deeply-covered projects before any second city
- [ ] Surat and Vadodara as a replicability test
- [ ] City/place selector UI: design it as a real multi-city switcher from the start (not an
      Ahmedabad-only control retrofitted later) — flagged 2026-08-18. Selecting any city other
      than Ahmedabad shows a "coming soon" page rather than an empty/broken catalogue. Keep
      the actual data-coverage work scoped to Ahmedabad only until this phase; the UI just
      needs to not misrepresent what's covered.

---

**Not scheduled, ever:** Fair Value, AI advisor, gamification, mobile location-awareness.

## Standing rules (every phase)
- No exact price on any consumer surface, ever. No published claim without a traceable
  source. Score/ranking never purchasable. No fabricated data in the client payload,
  including behind the gate. A brochure gap publishes as `not_stated`, never inferred.
- Never commit to `main` directly. Migrations idempotent, RLS enabled with zero policies.
- Never touch generated files (`src/routeTree.gen.ts`,
  `src/integrations/supabase/types.ts`, `src/generated/**`).
- `bun run lint`, `bun run test`, production `bun run build` clean before every merge to
  `main`.
