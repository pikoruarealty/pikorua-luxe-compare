import { createServerFn } from "@tanstack/react-start";

export const getCatalogueBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  const { isFeatureEnabled } = await import("@/server/feature-flags.server");
  if (!isFeatureEnabled("V2_CATALOGUE")) return { enabled: false as const };
  const { getPublishedCatalogueMarkets } =
    await import("@/repositories/catalogue-bootstrap.repository.server");
  return {
    enabled: true as const,
    comparisonEnabled: isFeatureEnabled("V2_COMPARISON"),
    markets: await getPublishedCatalogueMarkets(),
  };
});
