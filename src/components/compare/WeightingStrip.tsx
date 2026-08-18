import { useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";

import { getGatedPropScore } from "@/api/functions/propscore.functions";
import type { GatedPropScorePayload } from "@/contracts/consumer";
import { SCORE_DIMENSIONS, SCORE_DIMENSION_LABELS, type ScoreDimension } from "@/domain/propscore";
import { useActivityLog } from "@/hooks/use-activity-log";

/**
 * Part 2's "weighting strip re-ranks live" control. Only meaningful once
 * PropScore data is loaded (post-unlock) — the ranked list is derived
 * entirely from verified, sourced dimension scores, never a fabricated
 * composite.
 */
export function WeightingStrip({
  properties,
}: {
  properties: Array<{ slug: string; name: string }>;
}) {
  const logActivity = useActivityLog();
  const [weights, setWeights] = useState<Record<ScoreDimension, number>>(
    () =>
      Object.fromEntries(SCORE_DIMENSIONS.map((dimension) => [dimension, 3])) as Record<
        ScoreDimension,
        number
      >,
  );
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queries = useQueries({
    queries: properties.map((property) => ({
      queryKey: ["propscore", property.slug],
      queryFn: () => getGatedPropScore({ data: { slug: property.slug } }),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const setWeight = (dimension: ScoreDimension, value: number) => {
    setWeights((current) => {
      const next = { ...current, [dimension]: value };
      if (changeTimer.current) clearTimeout(changeTimer.current);
      changeTimer.current = setTimeout(() => {
        logActivity("weighting_changed", null, { weights: next });
      }, 600);
      return next;
    });
  };

  const ranked = useMemo(() => {
    return properties
      .map((property, index) => {
        const score = queries[index]?.data as GatedPropScorePayload | undefined;
        if (!score) return { slug: property.slug, name: property.name, weighted: null };
        let weightedSum = 0;
        let weightTotal = 0;
        for (const dimension of score.dimensions) {
          if (dimension.score === null) continue;
          const weight = weights[dimension.key];
          if (!weight) continue;
          weightedSum += dimension.score * weight;
          weightTotal += weight;
        }
        return {
          slug: property.slug,
          name: property.name,
          weighted: weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null,
        };
      })
      .sort((a, b) => (b.weighted ?? -1) - (a.weighted ?? -1));
  }, [properties, queries, weights]);

  if (properties.length < 2) return null;

  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-champagne" />
        <h2 className="font-display text-lg font-bold">Weight what matters to you</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Adjust how much each verified dimension counts. The ranking below re-computes from your own
        weighting, live — it is never a fixed PropCompare ranking.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {SCORE_DIMENSIONS.map((dimension) => (
          <label key={dimension} className="block text-xs">
            <span className="flex items-center justify-between text-muted-foreground">
              {SCORE_DIMENSION_LABELS[dimension]}
              <span className="text-foreground">{weights[dimension]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={5}
              step={1}
              value={weights[dimension]}
              onChange={(event) => setWeight(dimension, Number(event.target.value))}
              className="mt-2 w-full accent-champagne"
              aria-label={`Weight for ${SCORE_DIMENSION_LABELS[dimension]}`}
            />
          </label>
        ))}
      </div>
      <ol className="mt-6 space-y-2">
        {ranked.map((item, index) => (
          <li
            key={item.slug}
            className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5 text-sm"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {index + 1}
              </span>
              {item.name}
            </span>
            <span className="font-semibold">
              {item.weighted === null ? "Not enough verified data" : `${item.weighted}/100`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
