import { HERO } from "./landing-content";
import { PropertyCarousel3D } from "./PropertyCarousel3D";
import { scrollToId } from "@/lib/scroll-to-id";

/**
 * Copy on the left, a spinnable ring of homes on the right.
 *
 * Unlike the earlier split-photograph treatment this follows the active theme,
 * so it needs no hardcoded colours — the ambient washes are mixed from
 * `--foreground` and resolve correctly in both light and dark.
 */
export function LandingHero({ onPrimary }: { onPrimary?: () => void }) {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-20">
      {/* Ambient washes — soft, monochrome, theme-derived. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_7%,transparent),transparent_70%)] blur-3xl" />
        <div className="absolute top-16 -right-40 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand)_12%,transparent),transparent_70%)] blur-3xl" />
      </div>

      <div className="container-lux relative">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1fr] lg:gap-10">
          {/* min-w-0 is load-bearing: grid items default to min-width:auto, so
              the non-wrapping headline below would otherwise set this column's
              minimum and push the whole grid past the container, where the
              section's overflow-hidden silently clips it. */}
          <div className="min-w-0">
            <p
              className="tracking-luxury font-label"
              style={{ fontSize: "var(--step--2)", color: "var(--brand-strong)" }}
            >
              {HERO.eyebrow}
            </p>

            {/* Line breaks are set explicitly rather than left to a `ch`
                measure: Instrument Serif's `ch` (the width of "0") is far
                narrower than its average glyph, so a max-width in ch
                under-measures and the headline ragged-wraps. nowrap only from
                `sm` up — on a phone the scale shrinks and lines may break. */}
            <h1 className="mt-5" style={{ fontSize: "var(--step-4)" }}>
              <span className="block sm:whitespace-nowrap">{HERO.headlineLead}</span>
              <span className="block sm:whitespace-nowrap">
                {HERO.headlineMid}{" "}
                <span className="landing-italic" style={{ color: "var(--brand-strong)" }}>
                  {HERO.headlineAccent}
                </span>
                .
              </span>
            </h1>

            <p
              className="text-muted-foreground mt-6 max-w-[38ch] leading-relaxed"
              style={{ fontSize: "var(--step-0)" }}
            >
              {HERO.standfirst}
            </p>

            <button
              type="button"
              onClick={onPrimary ?? (() => scrollToId("preferences"))}
              className="foil tracking-luxury mt-9 rounded-full px-8 py-4 text-[12px] font-semibold transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-px"
            >
              {HERO.primaryCta}
            </button>
          </div>

          {/* Bleeds past the container on wide screens so the ring reads as a
              carousel continuing off-frame rather than a boxed widget. */}
          <div className="min-w-0 lg:-mr-[8vw]">
            <PropertyCarousel3D />
          </div>
        </div>
      </div>
    </section>
  );
}
