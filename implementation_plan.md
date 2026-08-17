# PropCompare — Implementation Plan (v2)

> Supersedes the previous version of this file entirely. That version was written
> against `brochure-extractor/` and the v1 flat schema, both of which no longer exist.

---

## Context

PropCompare compares luxury residences side by side. 26 Ahmedabad projects, a genuinely
deep 971-line comparison table, a two-role admin/developer portal, and a brochure OCR
pipeline.

Three things prompted this plan:

1. **The funnel was inverted and the gate was theatre.** A five-screen signup wall before
   a single property, while the entire catalogue already sat in the anonymous SSR payload.
2. **Reputation fragility.** Buyers here decide on ₹3–20 Cr. Template-generated
   "advisory" text and exact prices on public surfaces are not bugs, they are brand risk.
   "advisory" text and exact prices on public surfaces are not bugs, they are brand risk.
3. **A parallel branch turned out to be a second version of the product.**
   `security-and-cosmetics` is 23 commits / 242 files / +19,852 lines ahead of `main`,
   and implements roughly 70–80% of what this plan previously proposed — often better.
   Reviewed in full; findings in Part 1.

**Intended outcome:** one honest, crawlable, low-friction comparison product on the v2
canonical data layer, where the gate sits at the moment of highest intent, gated data is
genuinely withheld server-side, every published claim is traceable to a source, and the
comparison depth that makes the product worth using survives the migration.

---

# PART 0 — BINDING DECISIONS

These are final. Where they conflict with what is implemented on
`security-and-cosmetics`, **these win** and his code changes.

### Ours, unchanged
| # | Decision |
|---|---|
| D1 | **No exact price on any consumer surface, ever.** Exact figures stay server-side for filtering and band computation. |
| D2 | **Price band is public.** Band label ships in the public tier and on SEO pages. |
| D3 | **`rate` is gated but visible.** It is the basic valuation rate, not the asking price. A verified user sees it, labelled *"basic rate — excludes floor rise, parking, club membership, GST and registration"*. Anonymous visitors never receive it. |
| D4 | Locked rows render **skeleton bars**, never plausible fake numbers. Blur is CSS; a devtools edit defeats it, and fabricated figures next to a real developer's name are a false price claim. |
| D5 | Signup is **phone → OTP, two screens.** Name/email/profession are optional and post-unlock. A phone-only profile is valid. |
| D6 | Computed differentials first, PropScore next. **Fair Value is off the roadmap permanently.** |
| D7 | Extraction correction sits with **our own team**. Developer self-serve only once the product has proven itself. |
| D8 | Dropped for good: the 8-score system, gamified "Battle" UI, the buyer-identity quiz, "500+ data points", the 1M-registered-users target. |
| D9 | One canonical dictionary governs the extractor and the app, generated from a single source. Synonyms map into it; everything outside it is not captured. |

### Overrides of the branch
| # | Branch does | We do instead | Why |
|---|---|---|---|
| O1 | `FORBIDDEN_CONSUMER_KEYS` bans `rate` from every consumer payload | `rate` is permitted **in the gated tier only**, via an explicit gated-payload assertion that differs from the public one | D3. A signed-in user seeing the valuation reference is the product. |
| O2 | `publicPropertySummarySchema` has no price or band field at all; consumers get only `budgetFit` | Public tier carries **`priceBandLabel`**; `budgetFit` stays as an additional signal | D2. `budgetFit` alone cannot answer "what does this cost roughly", which is the first question every buyer asks. |
| O3 | v2 comparison contract carries 6 facts | Comparison contract carries the **full nine-section depth** (Part 3) | Comparison is the product. A 6-fact card is a regression, not a migration. |
| O4 | `property_amenities.amenity_code` / `property_specifications.specification_code` are free text | Both constrained to **controlled vocabularies** | Free-text codes are the unbounded-amenity problem one level down. |
| O5 | `configuration_variants` holds **one** area per variant | A variant holds **one area per basis** | `carpet ÷ super_built_up` is our core differential and is impossible in the current shape. |
| O6 | `classifyBudgetFit` ignores `minimumRupees`; `BUDGET_BANDS` has gaps | Bands are contiguous; `fit` is bounded on both sides | A ₹1 Cr project ranking "within" for a ₹20 Cr buyer is wrong for this segment. |

### Adopted from the branch (better than what we proposed)
- **`field_state` is five states**, not three: `stated · not_stated · explicitly_not_offered · not_applicable · pending_review`.
- **The JSON schema is the authority**, generating both TS and Python — not `schema.py` generating TS.
- **`private.commercial_terms` is a separate Postgres schema**, not a column flag.
- **`area_basis` already distinguishes `carpet` from `rera_carpet`.**
- The three-layer consumer boundary: `.strict()` zod → `assertConsumerPayloadSafe` → `scripts/check-consumer-boundaries.ts` in `bun run check`.

### Settled forks
- **Target: widen v2, then flip once.** v1 keeps serving until v2 is a strict superset,
  then a single cutover retires v1. No indefinite dual-running.
- **Data load: re-extract all 26 through the OCR pipeline** into the submission workflow.
  The legacy rows contain template-generated text with no source; a SQL backfill would
  have to invent provenance, which is the exact failure we are eliminating.

---

# PART 1 — WHERE THINGS ACTUALLY STAND

## 1.1 Branch state
`merge-base(main, security-and-cosmetics) == main HEAD == core-features-addon HEAD == a2d97c2`.
23 ahead, **0 behind** — a pure fast-forward, zero conflicts today.
`core-features-addon` has no commits of its own.

## 1.2 Live in production (v1, flags off)
- 26 properties, flat `properties` table (~50 columns).
- `ComparisonMatrixTable.tsx` (971 ln) — nine sections, per-row winner highlighting,
  glossary popovers, multi-variant columns, sqft/sqyd/gaj toggle.
- **Already fixed on the branch, live regardless of flags:** `toConsumerProperty()`
  ([properties.functions.ts:193](src/api/functions/properties.functions.ts#L193)) nulls
  `price` and `rate` on every variant, forces `pricePerSqft: "Price on Request"`, and
  blanks `advantages` / `expertNote` at the server boundary.
  `getComparisonBootstrap` gates `/compare` behind a session.
- **Still open:** `getProperties` and `getDetailedProperties`
  ([:211](src/api/functions/properties.functions.ts#L211),
  [:225](src/api/functions/properties.functions.ts#L225)) have no middleware and still ship
  every carpet area, room dimension and specification to anonymous visitors.

## 1.3 Complete but dark (v2, flags off)
24 tables, a separate `private` schema, generated TS+Python contracts, Drizzle, atomic
publication, durable OCR on GCS, preference-led catalogue, moderated reviews, consented
enquiries, privacy/a11y/MFA, and a GCP production foundation. Wired at
[index.tsx:76](src/routes/index.tsx#L76), [compare.tsx:48](src/routes/compare.tsx#L48),
[residence.$id.tsx:152](src/routes/residence.$id.tsx#L152).

## 1.4 The open issue register

| # | Issue | Where | Severity | Phase |
|---|---|---|---|---|
| 1 | **v2 has no data and no way to get any.** `properties.current_publication_version_id` is written only by `publishWorkflow()` ([publication.repository.server.ts:217](src/repositories/publication.repository.server.ts#L217)). No backfill exists. Every v2 repository `innerJoin`s on it, so all queries return zero rows. `V2_CATALOGUE=1` today = empty site. | migration + repositories | **Blocking** | 3 |
| 2 | **v2 comparison is 6 facts.** `consumerComparisonPropertySchema` is `.strict()`; `V2Comparison.tsx` is 183 ln rendering Location, Price, Budget fit, Area, Rating, Verification. v1 renders nine sections. | `src/contracts/consumer.ts`, `src/components/compare/V2Comparison.tsx` | **Critical** | 2 |
| 3 | **A variant can hold only one area.** `configuration_variants` has a single `area_value`/`area_basis`. Carpet efficiency (`carpet ÷ super_built_up`) — our headline differential — cannot be expressed. | `20260816120000_v2_canonical_foundation.sql` | **Critical** | 1 |
| 4 | **No amenity vocabulary.** `property_amenities.amenity_code` is free text. One project's 60 amenities and another's 8 remain incomparable. | same migration | High | 1 |
| 5 | **No specification vocabulary.** `property_specifications.specification_code` is free text — the whole Construction & Amenities and Developer blocks have no canonical home. | same migration | High | 1 |
| 6 | **The dictionary is 16 fields; the app renders ~38 + 15 per variant.** Project structure (towers/floors/units), density, open space, clubhouse, ceiling height, developer record are all missing or hidden in untyped `public_snapshot` / `public_facts` jsonb. | `schemas/property.v1.json` | High | 1 |
| 7 | **No `ceiling_height_basis`.** Slab-to-slab and clear height differ by ~1 ft; comparing across bases is a confident wrong answer. | `schemas/property.v1.json` | High | 1 |
| 8 | v1 `getDetailedProperties` / `getProperties` unauthenticated, full depth to anonymous | `properties.functions.ts` | High | 0 |
| 9 | `assertConsumerPayloadSafe` guards 2 of 11 repositories (`comparison`, `recommendation` only) | `src/repositories/` | Medium | 0 |
| 10 | `BUDGET_BANDS` gaps (₹2–3, 5.5–6, 7–8, 10.5–11, 12–13, 15.5–16, 17–18, 20.5–21 Cr) — a ₹2.5 Cr buyer has no band to pick | [budget.ts](src/domain/budget.ts) | Medium | 0 |
| 11 | `classifyBudgetFit` ignores `minimumRupees` — a ₹1 Cr project reads "within" for a ₹20 Cr buyer and ranks top | [recommendation.ts](src/domain/recommendation.ts) | Medium | 0 |
| 12 | Fabricated-text generators still exist: `advantagesFor`, `expertNoteFor`, `amenitiesFor`, `taglineFor` still run in `scripts/migrate-properties.ts`, output still in DB columns and visible in admin | `src/lib/property-derivations.ts` | Medium | 0 |
| 13 | No arithmetic cross-check between independently extracted numbers (`price ÷ superBuiltUp ≈ rate`) | `property-ocr-suite/backend` | High | 4 |
| 14 | No golden set, no per-field accuracy measurement — no prompt or model change can be evaluated | `property-ocr-suite/backend/tests` | High | 4 |
| 15 | No external verification (RERA cross-check) | — | Med | 5 |
| 16 | `compare_open` defined in the migration, never emitted — the key funnel step is unmeasured | `20260720120000_customer_activity.sql` | High | 0 |
| 17 | `HANDOFF-CODEX.md` stale (written at `fd86e0c`, 10 commits ago); §6 has 5 unanswered owner questions | repo root | Low | 0 |
| 18 | Working notes (`WORK-SPLIT.md` and similar) must stay untracked | `.gitignore` | Low | 0 |

## 1.5 Deliberately still not built
Reviews exist as schema + moderation but have zero content. Developer intelligence
dashboard, site-visit verification, POI/connectivity, and all-inclusive cost components
are unstarted — Phases 5–7.

---

# PART 2 — THE FLOW

```
arrive → real page, no modal
       → one inline row: city · budget band · configuration   (optional, skippable)
       → browse freely (public tier only)
       → pick 2–3 → Compare
       → shell rows readable, deep rows as skeleton bars
         (deep values were never sent to the browser)
       → "Unlock the full comparison" → phone + OTP   (2 screens)
       → deep rows fill in place. Same page. No quiz, no redirect.
       → weighting strip re-ranks live:
         [ Space · Location · Privacy · Specification · Developer · Possession ]
       → name / email / profession optional, later, or never
```

The quiz does not disappear — it **moves and changes character**, from tollbooth to a
control on the results, which is less annoying and strictly more useful.

## 2.1 The two tiers

Enforced server-side. Gated fields are **absent from the response object**, not hidden.

**PUBLIC** — SSR'd, crawlable, no session:
name · developer · property type · locality · city · state · possession date · RERA
registration · hero image + gallery · configuration kinds offered · **super built-up area
per configuration** · canonical amenity vector · project structure counts (towers /
floors / units) · rating average + published review count · **`priceBandLabel`** ·
`budgetFit` · `verificationDate`

**GATED** — verified session, separate server function:
per-variant **carpet + built-up + super built-up** · room dimensions · bathrooms /
balconies / servant room · full specification vector · density · clubhouse size · ceiling
height + basis · developer track record · computed differentials · PropScore + breakdown ·
distance estimate · **`rateRupeesPerSqFt` + `rateAreaBasis`** (O1/D3)

**NEVER sent to a consumer, at any tier:** `baseSalePriceRupees`,
`privateLowerBoundRupees`, `privateUpperBoundRupees`. Admin and developer portals keep them.

## 2.2 SEO
Public `/compare/<slug-a>-vs-<slug-b>` carries the public tier. With D1 in force these
pages compete on space, spec, density, possession certainty and developer record rather
than on price — a better differentiator and one 99acres cannot easily copy.

---

# PART 3 — THE DATA SHAPE (the core work)

`schemas/property.v1.json` is the single authority. `scripts/generate-property-contracts.ts`
regenerates `src/generated/property-contract.ts` and
`property-ocr-suite/backend/app/generated/property_contract.py`; `bun run schema:check`
fails CI on drift. **Every change in this part is additive and lands in that one file plus
its migration.**

## 3.1 Fix the variant shape (issue #3, override O5)
A variant must hold one area **per basis**. Replace the single
`area_value`/`area_basis`/`area_unit`/`area_state` columns with a child table:

```
configuration_variant_areas
  variant_id · basis (area_basis) · value numeric · unit (area_unit) · state (field_state)
  UNIQUE (variant_id, basis)
```

Existing columns stay for one release as a generated view over `basis = 'super_built_up'`
so nothing breaks mid-migration. Only then does `carpet ÷ super_built_up` become
expressible, and with it every differential in §3.5.

## 3.2 Widen the dictionary (issues #6, #7)
Promote from untyped `public_snapshot` / `public_facts` jsonb into typed fields:

**Project structure:** `plotSize` + unit · `totalTowers` · `totalFloors` ·
`unitsPerFloor` · `totalUnits` · `unitsPerAcre` · `openSpacePercent` · `parkingLevels` ·
`podiumStructure` · `liftsPerTower` · `clubhouseSizeSqFt`
**Construction:** `internalCeilingHeightFt` + **`ceilingHeightBasis`
(`clear | slab_to_slab | not_stated`)** · `constructionQuality` · `flooringType` ·
`windowGlazing` · `bathSanitaryFittings` · `vrvAcProvision` · `geyserProvision`
**Developer:** `experienceYears` · `deliveredProjects` · `ongoingProjects` ·
`notableDeliveredProjects` · `background`
**Timeline:** `proposedStartDateRera` · `possessionConfirmedAsOf`
**Per variant:** `bathrooms` · `balconies` · `servantRoom` · room dimensions ·
`floorPlanPage`

Each carries a `field_state`. Target ~40 top-level + ~15 per variant — not more fields
than we have, the same fields with types and states.

## 3.3 Amenity vocabulary (issue #4, override O4)
~40 canonical codes in 8 groups, seeded as an `amenity_catalog` table with a FK from
`property_amenities.amenity_code`:

| Group | Codes |
|---|---|
| Wellness | gym · yoga_deck · spa · salon · steam_sauna |
| Water | swimming_pool · kids_pool · temperature_controlled_pool · jacuzzi |
| Sports | indoor_games · squash · tennis · badminton · cricket_net · golf_simulator · skating_rink |
| Social | banquet_hall · party_lawn · amphitheatre · cafe · library · co_working · guest_rooms · mini_theatre |
| Family | kids_play_area · creche · senior_citizen_zone · pet_zone |
| Outdoor | jogging_track · landscaped_garden · terrace_garden · ev_charging |
| Safety | cctv · multi_tier_security · video_door_phone · fire_fighting · gated_entry |
| Building services | power_backup · stp · rainwater_harvesting · waste_management · service_lift · visitor_parking |

- A 60-amenity brochure collapses into the vector; surplus goes to `amenities_other`,
  **displayed but never compared and never scored**.
- An 8-amenity brochure produces `not_stated` for the rest — honestly distinct from
  `explicitly_not_offered`.
- The printed phrase is kept as `display_name` for that project ("Infinity Pool" displays,
  `swimming_pool` compares).

This is what makes "a perfect spot in between" mechanical rather than editorial: the
taxonomy is the ceiling, the state vector is the floor, and neither depends on how
verbose a developer's marketing team was.

## 3.4 Specification vocabulary (issue #5, override O4)
Same treatment for `property_specifications.specification_code` — a
`specification_catalog` seeded from §3.2's Construction block, so two projects describing
the same thing land on the same code.

## 3.5 Synonyms, units, and two traps
- **Synonym table**, explicit and testable, not implicit in prompt descriptions:
  `super_built_up` ← Saleable/Sellable/Super Area/SBA/Chargeable;
  `carpet` ← RERA Carpet/Net Usable; `rate` ← Basic Rate/Base Rate/BSP;
  `total_units` ← No. of Apartments/Total Homes; `total_floors` ← Storeys/Levels/G+N;
  `open_space` ← Open Area/Green Cover; `plot_size` ← Land Parcel/Site Area.
- **Canonical units.** Every measurement stores a canonical number **and** the raw printed
  string: `areaSqFt: 2450` / `areaRaw: "228 sq m"` / `areaUnit: "sq_m"`.
  sq m ×10.7639, sq yd ×9, acre ×43,560, gaj = sq yd.
- **Two traps — never merge these:** slab-to-slab ≠ floor-to-ceiling (hence
  `ceilingHeightBasis`); "carpet" ≠ RERA carpet (hence `area_basis` already separating
  `carpet` from `rera_carpet`). Efficiency ratios run only on `rera_carpet`.

## 3.6 Explicitly refused
| Field | Decision |
|---|---|
| `expert_note` | **Never extracted.** Model-composed prose is the same fabrication risk as `expertNoteFor()`, laundered through the pipeline. Human editorial later, or nothing. |
| `highlights` | Kept, **relabelled "What the developer claims"**, visually separated, never scored, never used in a differential. |
| `tagline` | Only when actually printed on the cover, attributed to the developer. Never generated. |
| Marketing adjectives in spec fields | Rejected by validator — a spec value that is pure adjective with no measurement fails. |
| Anything outside the dictionary | Not captured. A 12-page lifestyle essay contributes exactly the dictionary fields and nothing else. |

---

# PART 4 — COMPUTABLE METRICS

Every one is arithmetic over fields we hold, which is why every one is defensible.

| Metric | Formula | Feeds |
|---|---|---|
| Carpet efficiency % | `rera_carpet ÷ super_built_up` | Space |
| Usable area delta | carpet(A) − carpet(B) at matched configuration | "18% more carpet" |
| Density | `unitsPerAcre`; `totalUnits ÷ (towers × floors)` | Privacy |
| Lift adequacy | `liftsPerTower ÷ unitsPerFloor` | Privacy |
| Open space % | `openSpacePercent` | Privacy |
| Clubhouse per unit | `clubhouseSizeSqFt ÷ totalUnits` | Amenity depth |
| Specification index | populated spec codes + named brands | Specification |
| Possession certainty | months from `possessionConfirmedAsOf` + `proposedStartDateRera` vs status | Possession |
| Developer delivery ratio | `delivered ÷ (delivered + ongoing)`, weighted by `experienceYears` | Developer |
| Config breadth | distinct variants offered | Choice |
| Price band | server-side from min/max variant price | Filtering + `priceBandLabel` |

**No ₹-denominated public metric beyond the band.** That constraint forces us to compete
on the substance nobody else quantifies.

---

# PART 5 — EXTRACTION ACCURACY

The pipeline is better than "an OCR service" suggests: hybrid text+vision, evidence rows
with page and verbatim snippet, `temperature=0` against a strict schema, source weighting
by document kind, cross-document voting, and — added on the branch — area and room
validation tests, floor-plan detection and page selection. What is missing:

**(a) Cross-field arithmetic** (issue #13). `price ÷ super_built_up ≈ rate` (±5%) is three
independently extracted numbers checking each other and catches a misread digit
(6.57 → 65.7) almost every time. Plus: `carpet < built_up < super_built_up`;
`carpet ÷ super_built_up` ∈ 0.50–0.80; `Σ room areas ≤ carpet`;
`totalUnits ≈ towers × floors × unitsPerFloor` (±15%);
`unitsPerAcre ≈ totalUnits ÷ plot-in-acres`; area increases 3→4→5 BHK;
`possession > proposedStartDateRera`; RERA ID format; sanity envelopes (area
500–15,000 sqft, price ₹0.3–100 Cr, floors 1–60, ceiling 8–20 ft).
**A failed rule forces review regardless of model confidence.** Self-reported confidence
is structurally blind to a misread digit — the model is confident about what it saw.

**(b) A golden set** (issue #14). 10–15 hand-verified brochures across formats, committed
as ground truth, with a per-field accuracy report. Without it no prompt, model or
threshold change can be evaluated, and the confidence threshold stays a guess forever.
Record the baseline **before** changing anything.

**(c) Two-pass consensus on a single document.** The merger can already represent
agreement and alternatives but never receives them on a single upload. Run twice with
different chunk boundaries; agree + validate → auto-accept; disagree → review with both
candidates shown.

**(d) RERA cross-check** (issue #15). GujRERA publishes registered carpet areas, promoter
name and declared completion date. This is genuine third-party verification, and where the
two disagree **that disagreement is itself publishable** — "brochure says 2,450 sq ft
carpet, RERA registration says 2,290" is exactly what a buyer cannot get anywhere else.

**(e) A learning loop.** Every review correction stored as
`(developer, format fingerprint, field, extracted, corrected, page)`. The same developer's
next brochure gets format-specific hints, and measured per-field accuracy lets the
auto-accept set widen on evidence rather than optimism.

## 5.1 Low-hassle review (D7)
Goal is **our minutes per brochure**, not adversarial controls nobody needs yet.
- **Exception-only.** Fields that validate, clear the measured confidence bar and have
  two-pass agreement are auto-accepted and never shown. Target ~70–80% silent — a person
  sees ~15 items, not ~60.
- **Evidence inline** — a crop of the page image around the snippet next to the value.
  Reviewing must never mean opening the PDF and hunting. Pages already render at 150 DPI
  and evidence rows already carry the page number; the crop is a bounding box away.
- **Sorted by consequence:** failed validation → conflicts → missing required → low
  confidence. Cosmetic last.
- **One-key accept/fix**, no modal per field.
- **Never block on the optional.** Publish with amenities incomplete; never with a failing
  carpet/super-built-up check.
- **Show the report card** — "12 auto-accepted, 4 need you, 1 failed a consistency check".

## 5.2 What this does not fix
Extraction is bounded by what the brochure prints. Brochures omit carpet area, say "sizes
indicative", give super built-up only. No pipeline invents those. The honest answer is
`not_stated` in the UI plus RERA as a second source. **Coverage gaps are never filled by
inference** — that is the fabricated-`expertNote` failure, harder to spot.

---

# PART 6 — PHASES

Each phase ships independently and is worth shipping alone.
v1 keeps serving throughout; the flag flip is Phase 3.

### Phase 0 — Merge and stop the live bleeding *(days)*
Closes issues 8, 9, 10, 11, 12, 16, 17, 18.
1. **Fast-forward `main` to `security-and-cosmetics` now**, flags off. Zero conflicts
   today; every day of delay risks that. All v2 is dark, so this is not a release.
   Rebase `core-features-addon` (currently a no-op).
2. Session-gate `getDetailedProperties`; split `getProperties` to shell columns only.
3. Guard the remaining 9 repositories with `assertConsumerPayloadSafe`.
4. Close the `BUDGET_BANDS` gaps; bound `classifyBudgetFit` on `minimumRupees`.
5. Delete `advantagesFor` / `expertNoteFor` / `amenitiesFor` / `taglineFor` at source and
   stop `scripts/migrate-properties.ts` writing them; null the DB columns.
6. Emit `compare_open`, plus `gate_shown`, `gate_unlocked`, `alternative_clicked`,
   `weighting_changed`.
7. Refresh `HANDOFF-CODEX.md`; answer its 5 open questions.
8. `.gitignore` working notes (`WORK-SPLIT.md` and siblings). Confirm
   `/property-ocr-suite/` ignore status is correct now that the service lives in-repo.

### Phase 1 — The canonical dictionary *(the core work)*
Closes issues 3, 4, 5, 6, 7. All of Part 3.
Per-basis variant areas · widened typed fields · amenity catalog · specification catalog ·
`ceilingHeightBasis` · synonym table · canonical unit conversion with raw string retained.
One additive PR against `schemas/property.v1.json` + one migration, regenerate both
contracts, `schema:check` green.

### Phase 2 — Comparison depth on the v2 contract
Closes issue 2, override O3.
Extend `consumerComparisonPropertySchema` to carry the Phase 1 vectors. Add
`priceBandLabel` to the public summary (O2) and `rate` + `rateAreaBasis` to a new gated
payload with its own assertion (O1). Port `ComparisonMatrixTable`'s nine sections onto the
new contract; `V2Comparison.tsx` becomes the shell around it, not the replacement for it.
Add `UnlockGate` (skeleton bars, D4), `WeightingStrip`, `WhyThisWins`,
`MissingAlternatives`.

### Phase 3 — Load the 26 and flip
Closes issue 1.
Re-extract all 26 brochures through `property-ocr-suite` into the submission workflow;
review exception-only (§5.1); publish. Every field lands with real provenance and an
honest `field_state`. Then flip `V2_CATALOGUE`, `V2_COMPARISON`, `V2_REVIEWS` in one
cutover and retire the v1 read path.
**Gate: v2 must render every row v1 renders before the flip.**

### Phase 4 — Extraction accuracy
Closes issues 13, 14. Part 5 (a)(b)(c)(e). Runs in parallel with Phases 1–3 — it is the
constraint on everything after Phase 3.

### Phase 5 — Verification & PropScore
Closes issue 15. RERA cross-check. Five defensible sub-scores (Space, Privacy/Density,
Specification, Developer, Possession) plus a weighted composite. **Methodology published
on a permanent URL.** Every score carries its "why". POI/connectivity.

### Phase 6 — Reviews with real content & site-visit verification
Structured review form (not stars): sales experience, carpet-vs-promised, construction,
density, noise, approach, negotiation. Verification tiers with evidence requirements.
Developer right of reply (already built). Our own field verification on the top 15.

### Phase 7 — Developer intelligence *(first real revenue)*
Per-project dashboard: comparison volume, most-compared-against, chosen/rejected reasons,
band positioning, sentiment. Sold as intelligence, not ranking.
**Ranking and score are not for sale — published as policy.**

### Phase 8 — Depth then breadth
Ahmedabad to ~100 deeply-covered projects before any second city. Then Surat and Vadodara
as a replicability test.

**Not scheduled, ever:** Fair Value, AI advisor, gamification, mobile location-awareness.

---

# PART 7 — GUARDRAILS & NORTH STAR

1. No exact price on any consumer surface, ever.
2. No published claim without a traceable source.
3. Score and ranking are never purchasable. Visibility may be.
4. No fabricated data in the client payload, including behind blur.
5. Negative reviews are not removable on developer request; developers get a reply.
6. Sponsored placement is always labelled.
7. No measurement field publishes while a validation rule on it is failing.
8. A gap in the brochure publishes as `not_stated`, never as an inferred value.

**North star: completed comparisons per weekly active user**, with unlock-conversion as
the health metric. Not registered users, not leads, not pageviews.
Supporting: comparison start rate · unlock conversion · comparisons per session ·
alternatives-explored rate · save & share rate · return-within-14-days.

---

# PART 8 — VERIFICATION

**Phase 0** — In a private window, `view-source` on `/` and a residence page: grep for a
literal price, for `rate`, and for the retired template strings ("premium West Ahmedabad
address", "discerning buyers"). Zero hits. `curl` `getDetailedProperties` unauthenticated
→ rejected. `bun run check` (including `check-consumer-boundaries`) and `bun run test`
green. `git log main` shows the fast-forward with no merge commit.

**Phase 1** — `bun run schema:generate` then `schema:check` green; both generated
contracts regenerate cleanly. Feed one brochure printing sq m and one printing sq ft;
both land on comparable canonical numbers, each keeping its raw string. Take the longest
and shortest amenity lists; both produce the same 40-slot vector, difference expressed as
`not_stated`, surplus in `amenities_other` and excluded from scoring. A project whose
brochure says "no servant room" renders `explicitly_not_offered`; a silent one renders
`not_stated` — visibly different. A variant can hold carpet **and** super built-up
simultaneously.

**Phase 2** — Network tab on `/compare` with no session: **no carpet areas, no room
dimensions, no rate, no prices** in the response. This is the acceptance test that
matters. `priceBandLabel` present; `baseSalePriceRupees` absent. After phone-only unlock,
deep rows fill in place with no navigation, and `rate` appears with its qualifier.
`/compare/a-vs-b` renders server-side with JS disabled. Side-by-side screenshot: every v1
row present in v2.

**Phase 3** — All 26 published with a `source_document_id` on every measurement field.
Diff re-extracted values against the current rows — **every difference is either a fix or
a regression; review the list rather than assuming.** Flip the flags in staging first.

**Phase 4** — `pytest`: every validation rule has a passing and a failing case.
Deliberately corrupt a fixture (6.57 → 65.7) and confirm `price ÷ superBuiltUp ≈ rate`
catches it. Record golden-set baseline accuracy before any change. Feed a brochure with a
layout unlike any in the golden set; configuration rows still come out whole. Time a real
review — more than ~20 fields per brochure means exception filtering is not tuned.

**Ongoing** — `bun run lint`, `bun run test` and a production `bun run build` clean before
each merge to `main`. Never commit to `main` directly.

---

# PART 9 — DIVISION OF LABOUR

Split by **layer**, not feature — that is what keeps two people out of the same files.

**Him:** `src/db/**`, `src/repositories/**`, `src/domain/**`, `supabase/migrations/**`,
`infra/**`, `ops/**`, `.github/**`, `scripts/check-*`, the v2 route components.
Plus HANDOFF phases 5–8 and the flag rollout.

**Us:** the canonical vocabulary work (Phase 1), the comparison contract and table
(Phase 2), the 26-property load (Phase 3), and the extraction-accuracy layer (Phase 4) —
`validators.py`, `tests/golden/`, the accuracy harness, RERA cross-check.

**The one shared file:** `schemas/property.v1.json`. Everything downstream is generated
from it, so a conflict there is a conflict everywhere.
**Rule: additive changes only, one PR at a time, never in parallel.**

### Standing rules (from `HANDOFF-CODEX.md`, still binding)
Never commit to `main` directly. Migrations idempotent, `GRANT ALL … TO service_role`,
RLS enabled with **zero policies** — deny-by-default is deliberate. Never touch generated
files (`src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`, `src/generated/**`).
Server-only code lives in `src/server/**` and is imported with `await import(…)` inside
handlers. Prove every security fix by temporarily restoring the vulnerable code and
confirming the regression test fails. Format only files you changed. Deploy target is a
GCP VM — introduce nothing Vercel- or Cloudflare-specific.
