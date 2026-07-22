import type { Property } from "@/types/property";

export interface LocationGroup {
  state: string;
  cities: string[];
}

/**
 * State → cities grouping derived from the live property catalog.
 * Adding a property with a new state/city automatically surfaces it here —
 * no hardcoded list to maintain. Callers pass the catalog in (from
 * `useProperties()`) since it now comes from the database.
 */
export function getAvailableLocations(properties: Property[]): LocationGroup[] {
  const byState = new Map<string, Set<string>>();
  for (const p of properties) {
    if (!byState.has(p.state)) byState.set(p.state, new Set());
    byState.get(p.state)!.add(p.city);
  }
  return Array.from(byState.entries())
    .map(([state, cities]) => ({ state, cities: Array.from(cities).sort() }))
    .sort((a, b) => a.state.localeCompare(b.state));
}

export function getStates(properties: Property[]): string[] {
  return getAvailableLocations(properties).map((g) => g.state);
}

export function getCitiesForState(properties: Property[], state: string): string[] {
  return getAvailableLocations(properties).find((g) => g.state === state)?.cities ?? [];
}
