import { LandingHero } from "./LandingHero";

/**
 * The marketing stack shared by both `/` code paths — V1 (`IndexContent`) and
 * V2 (`V2CataloguePage`).
 *
 * It is the hero and nothing else. The requirements form has to be the very
 * next thing a visitor sees, so no explainer sections sit between them; the
 * developer marquee is placed by each branch after its own results instead.
 *
 * Two invariants, both load-bearing:
 *
 *  1. This renders NEITHER SiteHeader NOR SiteFooter. Both branches already
 *     mount their own; adding a third here would duplicate the fixed nav.
 *  2. Nothing under `src/components/landing/` may read a clock, a random
 *     number, or storage during render, so server and client markup agree.
 *
 * `data-page="landing"` is the scope for the editorial serif and the carousel
 * variables in styles.css. It is set here and nowhere else, which keeps the
 * admin, developer, legal and methodology routes on Plus Jakarta Sans.
 */
export function LandingSections({ onPrimary }: { onPrimary?: () => void }) {
  return (
    <div data-page="landing">
      <LandingHero onPrimary={onPrimary} />
    </div>
  );
}
