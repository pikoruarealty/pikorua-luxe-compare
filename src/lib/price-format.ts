import type { Property } from "@/types/property";

/** The catalogue's derived price summary — "X Cr onwards", or a sentinel when
 *  no configuration on the project carries a price. See buildPriceSummary in
 *  property-derivations.ts (DB path: properties.price_summary). */
const NO_PRICE = /price on request/i;

/**
 * Buyer-facing price for a residence.
 *
 * The catalogue has always derived a summary figure (it drives the budget
 * matching and the in/near/far range badges on the comparison table), but the
 * public surfaces used to print a hardcoded "On Request" — so the app filtered
 * and colour-coded residences against a budget it refused to show. This returns
 * the real figure where one exists and falls back to "On Request" only when it
 * genuinely doesn't.
 *
 * The fallback is deliberately short: it sits under a "Pricing" label, where
 * the stored "Price on Request" sentinel would read as "Pricing / Price on
 * Request".
 */
export function priceLabel(property: Pick<Property, "pricePerSqft">): string {
  const summary = property.pricePerSqft?.trim();
  if (!summary || NO_PRICE.test(summary)) return "On Request";
  return summary;
}

/** True when a real figure is available — for callers that want to vary
 *  surrounding copy rather than just print the value. */
export function hasPrice(property: Pick<Property, "pricePerSqft">): boolean {
  return priceLabel(property) !== "On Request";
}
