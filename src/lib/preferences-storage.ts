export const CATALOGUE_PREFERENCES_STORAGE_KEY = "propcompare:v2-preferences";

export interface StoredCataloguePreference {
  marketId: string;
  configurationOptionIds: string[];
  budgetBandId: string;
}

export function readStoredCataloguePreference(): StoredCataloguePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CATALOGUE_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCataloguePreference>;
    if (
      typeof parsed.marketId !== "string" ||
      typeof parsed.budgetBandId !== "string" ||
      !Array.isArray(parsed.configurationOptionIds)
    ) {
      return null;
    }
    return {
      marketId: parsed.marketId,
      budgetBandId: parsed.budgetBandId,
      configurationOptionIds: parsed.configurationOptionIds.filter(
        (id): id is string => typeof id === "string",
      ),
    };
  } catch {
    return null;
  }
}
