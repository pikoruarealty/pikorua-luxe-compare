import { useEffect, useRef, useState } from "react";

/**
 * Calculates marquee animation duration from track DOM width so the scroll
 * speed stays constant regardless of how many logos are in the list or how
 * wide the viewport is.
 *
 * @param pixelsPerSecond - Target scroll speed in CSS pixels per second.
 * @returns `{ trackRef, duration }` — attach `trackRef` to the scrolling
 *   element; `duration` is the computed number of seconds (null on first
 *   render before measurement).
 */
export function useMarqueeSpeed(pixelsPerSecond: number = 110) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      // The track holds two identical copies of the list, so scrollWidth is
      // 2× the actual content width. We animate by −50 % (one full copy),
      // so travel distance = scrollWidth / 2.
      const halfWidth = track.scrollWidth / 2;
      if (halfWidth > 0) {
        setDuration(halfWidth / pixelsPerSecond);
      }
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [pixelsPerSecond]);

  return { trackRef, duration };
}
