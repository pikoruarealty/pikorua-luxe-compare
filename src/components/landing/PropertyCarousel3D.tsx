import { useCallback, useEffect, useRef } from "react";

import { CAROUSEL } from "@/lib/landing-assets";

/** Degrees of drift per millisecond — one full turn takes about 50 seconds. */
const AUTO_SPEED = 0.0072;
/** Screen pixels to degrees when dragging. */
const DRAG_SENSITIVITY = 0.22;
/** Per-16ms multiplier applied to fling velocity once the pointer is released. */
const FRICTION = 0.94;
/** Below this the fling is over and ambient drift resumes. */
const REST_VELOCITY = 0.0006;

const STEP = 360 / CAROUSEL.length;

/**
 * A ring of property cards you can spin like a globe.
 *
 * The rotation is written straight to the element's transform from a rAF loop
 * rather than held in React state: at 60fps this would otherwise re-render the
 * whole subtree every frame, and — more importantly — a state value that only
 * exists on the client would have to differ from the server's first paint. The
 * ring is declared at `rotateY(0deg)` in CSS, so SSR and hydration agree and
 * the drift starts afterwards.
 */
export function PropertyCarousel3D() {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const angle = useRef(0);
  /** Degrees per millisecond carried over from a fling. */
  const velocity = useRef(0);
  const dragging = useRef(false);
  const hovering = useRef(false);
  const lastX = useRef(0);
  const lastTime = useRef(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let previous = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      // Clamped so a backgrounded tab doesn't resume with one enormous step.
      const elapsed = Math.min(now - previous, 64);
      previous = now;

      if (!dragging.current) {
        if (Math.abs(velocity.current) > REST_VELOCITY) {
          angle.current += velocity.current * elapsed;
          velocity.current *= Math.pow(FRICTION, elapsed / 16);
        } else if (!reduceMotion.matches && !hovering.current) {
          // Ambient drift. Pauses under a cursor so the visitor can actually
          // look at a card, and never runs for reduced-motion users.
          angle.current += AUTO_SPEED * elapsed;
        }
      }

      if (ringRef.current) {
        ringRef.current.style.transform = `rotateY(${angle.current.toFixed(3)}deg)`;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    velocity.current = 0;
    lastX.current = event.clientX;
    lastTime.current = performance.now();
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const now = performance.now();
    const delta = (event.clientX - lastX.current) * DRAG_SENSITIVITY;
    angle.current += delta;
    // Feeds the fling that continues after release.
    velocity.current = delta / Math.max(now - lastTime.current, 1);
    lastX.current = event.clientX;
    lastTime.current = now;
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div
      className="carousel-viewport carousel-mask relative w-full select-none"
      style={{ height: "calc(var(--card-w) * 1.55)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
      /* Decorative: the homes themselves are listed below with real names and
         data, so a screen reader gains nothing from eight unlabelled photos. */
      aria-hidden
    >
      <div className="carousel-depth w-full">
        <div ref={ringRef} className="carousel-ring h-full w-full">
          {CAROUSEL.map((image, index) => (
            <figure
              key={image.src}
              className="carousel-card"
              style={{
                transform: `rotateY(${index * STEP}deg) translateZ(var(--card-radius))`,
              }}
            >
              <img
                src={image.src}
                alt=""
                width={900}
                height={1200}
                // The first card is the one facing the visitor at rest, so it is
                // the LCP candidate; the rest are angled away or behind.
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : undefined}
                decoding="async"
                draggable={false}
              />
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
