import { useCallback, useEffect, useRef } from "react";

import { CAROUSEL } from "@/lib/landing-assets";

/** Degrees of drift per millisecond — one full turn takes about 50 seconds. */
const AUTO_SPEED = 0.0072;
/** Screen pixels to degrees while dragging. */
const DRAG_SENSITIVITY = 0.22;
/** Screen pixels to degrees while merely hovering — deliberately gentler. */
const HOVER_SENSITIVITY = 0.11;
/** Per-16ms multiplier applied to fling velocity once the pointer is released. */
const FRICTION = 0.94;
/** Below this the fling is over and ambient drift takes back over. */
const REST_VELOCITY = 0.0006;

const STEP = 360 / CAROUSEL.length;
const RADIANS = Math.PI / 180;

/**
 * A ring of framed prints, lit like a gallery wall.
 *
 * Three ways to turn it, layered:
 *   - it drifts on its own, always;
 *   - moving a cursor across it steers it, gently, on top of that drift;
 *   - pressing and dragging takes full control and flings it with momentum.
 *
 * Both the rotation and the per-card lighting are written straight to element
 * styles from one rAF loop rather than held in React state: at 60fps that would
 * re-render the whole subtree every frame, and a client-only state value would
 * have to differ from the server's first paint. The ring is declared at
 * `rotateY(0deg)` in CSS, so SSR and hydration agree and motion starts after.
 */
export function PropertyCarousel3D() {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const angle = useRef(0);
  /** Degrees per millisecond carried over from a fling. */
  const velocity = useRef(0);
  const dragging = useRef(false);
  /** True once we have a cursor position to measure movement against. */
  const tracking = useRef(false);
  const lastX = useRef(0);
  const lastTime = useRef(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let previous = performance.now();
    let frame = 0;

    /**
     * Lights each card by how square-on it is to the viewer. `facing` is the
     * cosine of the card's own heading: 1 when it faces us, 0 edge-on, negative
     * once it has turned away (where backface-visibility hides it anyway).
     *
     * This is the difference between a ring of flat images and something that
     * reads as a lit object — the front print is bright and saturated, the ones
     * turning away sink into the dark.
     */
    const light = () => {
      for (let index = 0; index < cardRefs.current.length; index += 1) {
        const card = cardRefs.current[index];
        if (!card) continue;
        const facing = Math.cos((angle.current + index * STEP) * RADIANS);
        const lit = Math.max(0, facing);
        card.style.opacity = (0.34 + 0.66 * lit).toFixed(3);
        // Brightness and saturation fall off as a card turns, and it goes soft
        // with it — real optics hold one plane in focus, and that single cue
        // does more for the sense of depth than any amount of shadow.
        card.style.filter =
          `brightness(${(0.74 + 0.26 * lit).toFixed(3)})` +
          ` saturate(${(0.76 + 0.24 * lit).toFixed(3)})` +
          ` blur(${(2.1 * (1 - lit)).toFixed(2)}px)`;
      }
    };

    const tick = (now: number) => {
      // Clamped so a backgrounded tab doesn't resume with one enormous step.
      const elapsed = Math.min(now - previous, 64);
      previous = now;

      if (!dragging.current) {
        if (Math.abs(velocity.current) > REST_VELOCITY) {
          angle.current += velocity.current * elapsed;
          velocity.current *= Math.pow(FRICTION, elapsed / 16);
        } else if (!reduceMotion.matches) {
          // Ambient drift. Runs even under the cursor — hovering steers the
          // ring rather than stopping it. Never runs for reduced-motion users,
          // for whom only their own drag moves it.
          angle.current += AUTO_SPEED * elapsed;
        }
      }

      if (ringRef.current) {
        ringRef.current.style.transform = `rotateY(${angle.current.toFixed(3)}deg)`;
      }
      light();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    tracking.current = true;
    velocity.current = 0;
    lastX.current = event.clientX;
    lastTime.current = performance.now();
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    const x = event.clientX;

    // First sighting of this pointer — record where it is and wait for the next
    // event, so the ring doesn't jump by the full distance from the last one.
    if (!tracking.current) {
      tracking.current = true;
      lastX.current = x;
      lastTime.current = now;
      return;
    }

    const travelled = x - lastX.current;
    if (dragging.current) {
      const delta = travelled * DRAG_SENSITIVITY;
      angle.current += delta;
      // Feeds the fling that continues after release.
      velocity.current = delta / Math.max(now - lastTime.current, 1);
    } else if (event.pointerType === "mouse") {
      // Hover steering. No momentum is banked: let go of the mouse and the ring
      // simply carries on drifting, rather than coasting off from a stray flick.
      angle.current += travelled * HOVER_SENSITIVITY;
    }

    lastX.current = x;
    lastTime.current = now;
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onPointerLeave = useCallback(() => {
    tracking.current = false;
  }, []);

  return (
    <div className="carousel-scene">
      <div
        className="carousel-viewport carousel-mask relative w-full select-none"
        style={{ height: "calc(var(--card-h) * 1.34)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={onPointerLeave}
        /* Decorative: the homes appear below with real names and data, so a
           screen reader gains nothing from eight unlabelled photographs. */
        aria-hidden
      >
        <div className="carousel-depth w-full">
          <div ref={ringRef} className="carousel-ring h-full w-full">
            {CAROUSEL.map((image, index) => (
              <figure
                key={image.src}
                ref={(node) => {
                  cardRefs.current[index] = node;
                }}
                className="carousel-card"
                style={{
                  transform: `rotateY(${index * STEP}deg) translateZ(var(--card-radius))`,
                }}
              >
                <div className="carousel-plate">
                  <img
                    src={image.src}
                    alt=""
                    width={900}
                    height={1200}
                    // The first card faces the visitor at rest, so it is the LCP
                    // candidate; the rest are angled away or behind it.
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : undefined}
                    decoding="async"
                    draggable={false}
                  />
                </div>
                {/* Same file, so it is already in cache — the browser decodes
                    once and paints the mirrored copy from the same bitmap. */}
                <div className="carousel-reflection">
                  <img src={image.src} alt="" loading="lazy" decoding="async" draggable={false} />
                </div>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
