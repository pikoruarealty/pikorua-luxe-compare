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
- [x] Push branch / open PR against `main` — merged directly to `main` 2026-08-19
      (`a219672`), skipping the PR step per explicit instruction for this one merge

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
      with JS disabled. **Actually blocked, not just unattempted** — confirmed 2026-08-19 by
      running the dev server against the live DB with `V2_CATALOGUE`/`V2_COMPARISON` on and
      hitting `/compare?ids=pashmina,avant`: `findConsumerComparison`
      (`comparison.repository.server.ts`) inner-joins `propertyPublicationVersions` and
      `configurationVariants` on every property, both empty until Phase 3 publishes, so the
      query returns zero rows and `consumerComparisonSchema`'s `.min(2)` throws
      ("Array must contain at least 2 element(s)") before anything renders. This test cannot
      pass before Phase 3 populates those tables — same blocker as the mobile-UX manual
      verification below, not a separate gap.

## Cross-cutting — Mobile comparison UX (bug fix, not phase-gated)
**Status: IN PROGRESS — flagged 2026-08-18, blocks the Phase 3 cutover regardless of where
Phase 3 itself stands, since the comparison table is the product's core surface**

The comparison table (both the live `ComparisonMatrixTable` and the in-progress
`ComparisonMatrixTableV2.tsx`) was broken on mobile: the property-name header was entirely
`hidden` below `md`, so scrolling down 30+ rows lost track of which column belonged to which
property, and 2–3 columns were squeezed into a flex row with no minimum width, clipping room
lists and specs.

- [x] Audit every section of the matrix table at common phone widths (360–430px) and list
      every field/row that disappears, overflows, or clips — done against
      `ComparisonMatrixTableV2.tsx`: header row `hidden md:grid` (property names invisible on
      mobile), `Row`'s flex fallback had no minimum column width (long room-dimension and
      specification lists clipped), `SectionLabel`/gallery/footnote blocks were viewport-width
      rather than content-width once scrolling was introduced
- [x] Decide the mobile layout pattern — user chose horizontal-scroll-with-sticky-label-column
      over stacked cards or a swipeable single column (closest to existing markup, works for
      2–3 properties, least novel interaction to learn)
- [x] Apply it to `ComparisonMatrixTableV2.tsx` first (Phase 2, already built): unconditional
      CSS grid at every breakpoint (`grid-cols-[130px_minmax(150px,1fr)...]`, no more `hidden
      md:grid`/flex fallback), label column `sticky left-0`, property-name header row `sticky
      top-[58px]` (matches `SiteHeader`'s scrolled height) so it stays visible while scrolling
      down, and `SectionLabel`/the footnote row/gallery label now span the same grid tracks
      (`col-span-full`) so their background fills the full scrollable width instead of
      stopping at the viewport edge. Port to legacy `ComparisonMatrixTable` deferred per the
      original plan (only worth it if v1 keeps serving traffic past the cutover).
- [ ] Manually verify on a real phone or device emulation, not just a resized desktop browser
      window — blocked for now: this repo has no component-render test harness (no
      React Testing Library/jsdom, `vitest.config.ts` runs `environment: "node"`), and the
      live v2 comparison route needs Phase 3's property data to render `V2Comparison` with
      real props. Re-attempt once either lands.
- [x] Add this to the Phase 3 cutover gate: v2 must render every row v1 renders **and** be
      usable on mobile, before the flag flip — folded into Phase 3's existing gate line below
      rather than kept as a separate item

## Phase 3 — Load the 26 and flip
**Status: STARTED**

- [x] Diff re-extracted values against current rows; classify every difference as fix or
      regression, don't assume — `src/lib/extraction-diff.ts` (`classifyDiffs`,
      `buildReviewReport`), built on top of `brochure-field-mapping.ts`'s `buildMergeRows`/
      `extractedFieldList` rather than a new engine. Categories: `failing` (Phase 4 hook, not
      yet wired to real validators) → `conflict` → `gap_fill` → `cosmetic`, plus
      `silent_accept` for genuine gaps at ≥0.85 confidence — matches §5.1's review order and
      "N auto-accepted, M need you" report-card format. Configuration-variant rows (areas,
      rooms) never silently auto-accept since they don't trace back to one scalar
      `ExtractedField`. Covered by `scripts/check-extraction-diff.ts`, wired into `bun run check`.
- [ ] Re-extract all 26 brochures through `property-ocr-suite` into the submission workflow
- [ ] Exception-only review per brochure (§5.1 — target ~70–80% silent auto-accept), using the
      diff/classification tool above
- [ ] Publish all 26; every field carries real provenance and an honest `field_state`
- [ ] Flip `V2_CATALOGUE`, `V2_COMPARISON`, `V2_REVIEWS` together in staging first
- [ ] **Gate: v2 must render every row v1 renders, and be usable on mobile, before the
      flip** — side-by-side screenshot diff, plus a real-phone/emulated-viewport pass on the
      comparison table (see Cross-cutting — Mobile comparison UX above)
- [ ] Cut over in production; retire the v1 read path

## Phase 4 — Extraction accuracy
**Status: (a), forced-review, (e) and the pytest requirement are DONE. (b) and (c) are
deliberately deferred — see notes below. Runs in parallel with Phases 1–3, is the
constraint on everything after Phase 3**

- [x] (a) Cross-field arithmetic validators: `price ÷ super_built_up ≈ rate` (±5%);
      `carpet < built_up < super_built_up`; `carpet ÷ super_built_up` ∈ 0.50–0.80;
      `Σ room areas ≤ carpet`; `totalUnits ≈ towers × floors × unitsPerFloor` (±15%);
      `unitsPerAcre ≈ totalUnits ÷ plot-in-acres`; area increases 3→4→5 BHK;
      `possession > proposedStartDateRera`; RERA ID format; sanity envelopes
      (`property-ocr-suite/backend/app/cross_field_validators.py`, plus duplicate-label
      detection in `extractor.py`)
- [x] A failed rule forces review regardless of model confidence — a flagged field is never
      pre-ticked in `ExtractedFieldsReview.tsx`, confidence notwithstanding; its warning
      surfaces next to the specific field/dimension it's about, not as a global dump
- [ ] (b) Golden set: 10–15 hand-verified brochures across formats, committed as ground
      truth, with a per-field accuracy report; record baseline before changing anything —
      **deferred**: overlaps with the Phase 3 26-brochure verification pass, start after that
- [ ] (c) Two-pass consensus on a single document (different chunk boundaries; agree+valid
      → auto-accept, disagree → review with both candidates) — **skipped for now**: roughly
      doubles LLM API cost per brochure going forward, not just for re-extraction. Revisit if
      the golden set's per-field accuracy shows it's actually needed
- [x] (e) Learning loop: store `(developer, format fingerprint, field, extracted, corrected,
      page)` per correction; format-specific hints for the same developer's next brochure
      (`app/learning_hints.py`, corrections captured by diffing OCR defaults against the
      final submitted form in `AddPropertyFlow.tsx`, optional developer name at upload)
- [x] `pytest`: every validation rule has a passing and a failing case; deliberately corrupt
      a fixture (6.57 → 65.7) and confirm the rate-check catches it (`test_cross_field_validators.py`
      and friends); `test_learning_hints.py` covers the (e) module

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
