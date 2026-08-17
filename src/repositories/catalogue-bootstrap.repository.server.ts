import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { assertConsumerPayloadSafe, type CatalogueMarket } from "@/contracts/consumer";
import {
  configurationOptions,
  configurationVariants,
  marketConfigurationOptions,
  markets,
  properties,
  propertyPublicationVersions,
} from "@/db/schema";

export async function getPublishedCatalogueMarkets(): Promise<CatalogueMarket[]> {
  const db = getDatabase();
  const rows = await db
    .selectDistinct({
      marketId: markets.id,
      stateCode: markets.stateCode,
      stateName: markets.stateName,
      cityCode: markets.cityCode,
      cityName: markets.cityName,
      optionId: configurationOptions.id,
      kind: configurationOptions.kind,
      displayName: configurationOptions.displayName,
      sortOrder: configurationOptions.sortOrder,
    })
    .from(markets)
    .innerJoin(
      marketConfigurationOptions,
      and(
        eq(marketConfigurationOptions.marketId, markets.id),
        eq(marketConfigurationOptions.isEnabled, true),
      ),
    )
    .innerJoin(
      configurationOptions,
      eq(marketConfigurationOptions.configurationOptionId, configurationOptions.id),
    )
    .innerJoin(propertyPublicationVersions, eq(propertyPublicationVersions.marketId, markets.id))
    .innerJoin(
      properties,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .innerJoin(
      configurationVariants,
      and(
        eq(configurationVariants.publicationVersionId, propertyPublicationVersions.id),
        eq(configurationVariants.configurationOptionId, configurationOptions.id),
      ),
    )
    .where(eq(markets.isEnabled, true));

  const grouped = new Map<string, CatalogueMarket>();
  for (const row of rows) {
    let market = grouped.get(row.marketId);
    if (!market) {
      market = {
        id: row.marketId,
        stateCode: row.stateCode,
        stateName: row.stateName,
        cityCode: row.cityCode,
        cityName: row.cityName,
        configurations: [],
      };
      grouped.set(row.marketId, market);
    }
    market.configurations.push({
      id: row.optionId,
      kind: row.kind,
      displayName: row.displayName,
      sortOrder: row.sortOrder,
    });
  }
  const response = [...grouped.values()]
    .map((market) => ({
      ...market,
      configurations: market.configurations.sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => a.stateName.localeCompare(b.stateName) || a.cityName.localeCompare(b.cityName));
  assertConsumerPayloadSafe(response);
  return response;
}
