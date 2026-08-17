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

- [x] **Phase 0 — Merge and stop the live bleeding** — DONE (this session)
- [ ] **Phase 1 — The canonical dictionary** — NOT STARTED, up next
- [ ] Phase 2 — Comparison depth on the v2 contract
- [ ] Phase 3 — Load the 26 brochures and flip v1 → v2
- [ ] Phase 4 — Extraction accuracy
- [ ] Phase 5 — Verification & PropScore
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
   unguarded *deliberately* — they don't carry consumer-facing gated fields. If you're adding
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
     content living in the *same* `tagline`/`amenities`/`advantages`/`expert_note` columns
     (the admin edit form writes real data there too, and there's no reliable way to tell
     "migration-seeded, never touched" from "migration-seeded, later edited" —
     `updateProperty` never sets `created_by`). Instead there's a content-fingerprinted
     migration, `supabase/migrations/20260817120000_clear_fabricated_property_text.sql`,
     that nulls/strips *only* the generator's known exact-match literal strings, leaving
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
     constraint name (`customer_activity_event_type_check`) for the *original* unnamed
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
same array drives both the quiz's selectable buttons *and* the internal matching math, so
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

## Phase 1 — up next, not started

Per the plan: closes issues 3, 4, 5, 6, 7 (all of Part 3 — read that section before
starting). Scope: per-basis variant areas, widened typed fields, amenity catalog,
specification catalog, `ceilingHeightBasis`, a synonym table, canonical unit conversion
that retains the raw string. Ships as one additive PR against `schemas/property.v1.json`
plus one migration; regenerate both generated contracts; `bun run schema:check` must be
green.

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
