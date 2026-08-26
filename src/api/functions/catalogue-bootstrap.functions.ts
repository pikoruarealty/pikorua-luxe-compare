import { createServerFn } from "@tanstack/react-start";

export const getCatalogueBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  const { isFeatureEnabled } = await import("@/server/feature-flags.server");
  const { getPublishedCatalogueMarkets } =
    await import("@/repositories/catalogue-bootstrap.repository.server");
  return {
    comparisonEnabled: isFeatureEnabled("V2_COMPARISON"),
    markets: await getPublishedCatalogueMarkets(),
  };
});
