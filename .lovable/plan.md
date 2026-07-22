# Homepage Structural Refinement

Goal: turn the homepage from three loosely-stacked blocks (hero → comparison → collection) into one continuous editorial composition with clear rhythm, anchored navigation, and a refined visual hierarchy — without changing functionality.

## 1. Global rhythm & layout shell

- Introduce a single max-width container token (`max-w-[1320px] mx-auto px-6 sm:px-10`) and apply consistently across hero, comparison, and collection.
- Standardize vertical spacing: `py-20 sm:py-28` between major sections, `mb-12` for section headers.
- Add a thin champagne hairline + numeric chapter mark before each section ("01 — The Suite", "02 — The Collection") for editorial cadence.

## 2. Hero (top band)

- Tighten headline block: serif display H1 with controlled measure (`max-w-[18ch]`), supporting deck in body sans below.
- Replace the loose tagline/CTA stack with a 2-column asymmetric grid on `lg:` (60/40): left = title + deck + primary action, right = small "What's inside" mini-index linking to `#comparison` and `#collection`.
- Add subtle scroll-cue (animated chevron + "Scroll to compare" microcopy).

## 3. Comparison Suite (middle band)

- Wrap the entire suite (slot picker + matrix) in a single bordered "folio" card with consistent inner padding so the slot picker and matrix feel like one object instead of two stacked widgets.
- Slot picker: convert to a horizontal toolbar with property pills + a clear "Reset" affordance on the right; move the "Add property" search inline.
- Matrix:
  - Sticky header row (property avatars) when scrolling inside the matrix.
  - Increase row vertical padding to `py-6`, deepen section dividers, drop the per-row hover bg (too noisy at scale).
  - Section labels gain a left gold rule + roman numeral.
  - Legend chips move to the matrix toolbar (top-right of folio) instead of floating above.
- Gallery section at the bottom of the matrix gets a clear header ("Visual Reference") and uses the same scroll-mt anchor used by the Best-badge jump.

## 4. The Collection (bottom band)

- Add a sticky in-section subnav: count, sort, filter chips ("All · 4 BHK · 5 BHK · Penthouse · Duplex"), and the existing "Edit preferences" pill — all in one horizontal bar.
- List rows: tighten to a 3-column grid `grid-cols-[360px_minmax(0,1fr)_auto]` (image · info · actions) with stronger column rule between info and actions.
- Reduce visual weight of the slideshow progress dots; promote project name typography one step.
- Add a divider with section number between consecutive rows instead of a card border — feels more editorial, less catalog.

## 5. Connective tissue

- Persistent left-edge progress rail (desktop only, `hidden lg:block`) showing 01/02/03 dots that highlight as user scrolls — clickable to jump.
- Refine `StickyCompareTray` to match new folio styling (same border-radius, same champagne hairline).
- Smooth scroll offsets via `scroll-mt-28` on every section anchor so sticky header doesn't clip headings.

## 6. Light/dark parity

- Audit every new surface for light-mode contrast using the deepened espresso/antique-gold tokens already in `styles.css`.
- Ensure new dividers use `border-champagne/20` (auto-mapped to bronze in light mode).

## Technical notes

- Files touched:
  - `src/routes/index.tsx` — section wrappers, chapter marks, subnav, progress rail.
  - `src/components/compare/ComparisonBoard.tsx` — folio wrapper, toolbar consolidation, sticky header, spacing tokens.
  - `src/components/compare/SlotPicker.tsx` (or equivalent) — inline toolbar layout.
  - `src/components/property/PropertyListRow.tsx` — 3-column grid, divider treatment.
  - `src/components/layout/Header.tsx` — anchor links to new section IDs.
  - `src/styles.css` — add `--container-max` token + `.chapter-rule` utility.
- No logic, data, routing, or auth changes. Pure presentation refinement.
- No new dependencies.
