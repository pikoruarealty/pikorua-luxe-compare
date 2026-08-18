import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { GitCompareArrows, MapPin } from "lucide-react";

import { getRecommendations } from "@/api/functions/recommendations.functions";
import type { RecommendationItem } from "@/contracts/consumer";
import { useActivityLog } from "@/hooks/use-activity-log";
import { readStoredCataloguePreference } from "@/lib/preferences-storage";

/**
 * Surfaces catalogue matches for the visitor's own saved preferences that
 * are not part of the current comparison. Public-tier data only — no
 * session/unlock required, matching `getRecommendations`.
 */
export function MissingAlternatives({ comparisonSlugs }: { comparisonSlugs: string[] }) {
  const recommend = useServerFn(getRecommendations);
  const logActivity = useActivityLog();
  const [items, setItems] = useState<RecommendationItem[] | null>(null);

  useEffect(() => {
    const preference = readStoredCataloguePreference();
    if (!preference) return;
    let cancelled = false;
    recommend({ data: preference })
      .then((response) => {
        if (!cancelled) setItems(response);
      })
      .catch(() => {
        if (!cancelled) setItems(null);
      });
    return () => {
      cancelled = true;
    };
  }, [recommend]);

  if (!items || comparisonSlugs.length >= 3) return null;
  const alternatives = items
    .filter((item) => !comparisonSlugs.includes(item.property.slug))
    .slice(0, 3);
  if (!alternatives.length) return null;

  return (
    <section className="mt-10">
      <p className="text-xs tracking-[0.18em] text-champagne uppercase">
        Also matches your preferences
      </p>
      <h2 className="mt-2 font-display text-2xl font-bold">Projects not in this comparison</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {alternatives.map((item) => (
          <article
            key={item.property.slug}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              {item.property.heroImageUrl ? (
                <img
                  src={item.property.heroImageUrl}
                  alt={item.property.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Approved media pending
                </div>
              )}
            </div>
            <h3 className="mt-3 font-display text-lg font-bold">{item.property.name}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {item.property.locality ?? item.property.cityName}
            </p>
            <p className="mt-2 text-sm font-semibold">
              {item.property.priceBandLabel ?? "Price band pending"}
            </p>
            <Link
              to="/compare"
              search={{ ids: [...comparisonSlugs, item.property.slug].join(","), shared: false }}
              onClick={() => logActivity("alternative_clicked", item.property.slug)}
              className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border border-champagne px-4 text-xs font-semibold text-champagne"
            >
              <GitCompareArrows className="h-3.5 w-3.5" /> Add to compare
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
