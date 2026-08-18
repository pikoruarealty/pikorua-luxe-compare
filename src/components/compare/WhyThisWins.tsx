import { useQueries } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { getGatedPropScore } from "@/api/functions/propscore.functions";
import type { GatedPropScorePayload } from "@/contracts/consumer";
import { SCORE_DIMENSION_LABELS, type ScoreDimension } from "@/domain/propscore";

/** Only a lead of this many points on a fully-scored, sourced dimension is
 *  surfaced — small gaps are noise, not a claim worth making. */
const LEAD_MARGIN = 5;

interface Lead {
  slug: string;
  name: string;
  dimension: ScoreDimension;
  score: number;
  reason: string | null;
}

/**
 * Deliberately not a "winner" card. Guardrail 2 (no claim without a
 * traceable source) and the "factual differences, without a manufactured
 * winner" positioning mean this only ever states per-dimension, sourced
 * leads — never an overall crowned property.
 */
export function WhyThisWins({ properties }: { properties: Array<{ slug: string; name: string }> }) {
  const queries = useQueries({
    queries: properties.map((property) => ({
      queryKey: ["propscore", property.slug],
      queryFn: () => getGatedPropScore({ data: { slug: property.slug } }),
      staleTime: 60_000,
      retry: false,
    })),
  });

  if (properties.length < 2) return null;
  const scores = queries.map((query) => query.data as GatedPropScorePayload | undefined);
  if (scores.some((score) => !score)) return null;

  const dimensionKeys = scores[0]?.dimensions.map((dimension) => dimension.key) ?? [];
  const leads: Lead[] = [];

  for (const dimensionKey of dimensionKeys) {
    const entries = properties.map((property, index) => ({
      property,
      dimension: scores[index]?.dimensions.find((candidate) => candidate.key === dimensionKey),
    }));
    if (
      entries.some(
        (entry) => entry.dimension?.status !== "complete" || entry.dimension.score === null,
      )
    ) {
      continue;
    }
    const sorted = [...entries].sort(
      (a, b) => (b.dimension?.score ?? 0) - (a.dimension?.score ?? 0),
    );
    const top = sorted[0];
    const second = sorted[1];
    const topScore = top.dimension?.score ?? 0;
    const secondScore = second?.dimension?.score ?? 0;
    if (topScore - secondScore >= LEAD_MARGIN) {
      leads.push({
        slug: top.property.slug,
        name: top.property.name,
        dimension: dimensionKey,
        score: topScore,
        reason: top.dimension?.why[0]?.explanation ?? null,
      });
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-champagne" />
        <h2 className="font-display text-lg font-bold">Where each project leads</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Only differences of {LEAD_MARGIN}+ points on a verified, sourced dimension appear here —
        this is not an overall ranking.
      </p>
      {leads.length ? (
        <ul className="mt-4 space-y-3">
          {leads.map((lead) => (
            <li
              key={`${lead.slug}-${lead.dimension}`}
              className="rounded-xl border border-border p-3 text-sm"
            >
              <p className="font-semibold">
                {lead.name} leads on {SCORE_DIMENSION_LABELS[lead.dimension]} ({lead.score}/100)
              </p>
              {lead.reason && <p className="mt-1 text-xs text-muted-foreground">{lead.reason}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No dimension currently separates these projects by a meaningful, verified margin.
        </p>
      )}
    </section>
  );
}
