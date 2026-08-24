import { SHOWCASE } from "./landing-content";
import { SHOWCASE_GRID } from "@/lib/landing-assets";

/**
 * The staggered image band near the foot of the page.
 *
 * These become links through to individual residences — the markup is already
 * a `figure` per home with real alt text, so wiring each one to
 * `/residence/$id` later is a matter of wrapping it in a `Link`, not rebuilding
 * it. Until then they are presentational and carry no interactive affordance,
 * so nothing here promises a click that does not happen.
 */
export function PropertyShowcase() {
  return (
    <section className="relative py-[var(--space-section)]" data-page="landing">
      <div className="container-lux">
        <p
          className="tracking-luxury font-label"
          style={{ fontSize: "var(--step--2)", color: "var(--brand-strong)" }}
        >
          {SHOWCASE.eyebrow}
        </p>
        <h2 className="mt-5" style={{ fontSize: "var(--step-4)" }}>
          <span className="block sm:whitespace-nowrap">
            {SHOWCASE.headline}{" "}
            <span className="landing-italic text-muted-foreground">
              {SHOWCASE.headlineEmphasis}
            </span>
          </span>
        </h2>

        {/* Staggered rather than a flush four-up row — the alternating offset
            keeps it from reading as a stock feature grid. */}
        <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
          {SHOWCASE_GRID.map((image, index) => (
            <figure
              key={image.src}
              className="landing-frame"
              style={{ transform: index % 2 === 1 ? "translateY(1.75rem)" : undefined }}
            >
              <img
                src={image.src}
                alt={image.alt}
                width={1200}
                height={1500}
                loading="lazy"
                decoding="async"
                className="aspect-[4/5] w-full object-cover transition-transform duration-700 hover:scale-[1.04]"
              />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
