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
/** Different people typed the same place differently — "Gujarat" in one
 *  property, "GUJARAT" in another — and grouping on the raw string showed them
 *  as two separate choices. Names are folded case-insensitively, and the
 *  nicest-looking spelling wins as the label. */
function displayName(candidates: Iterable<string>): string {
  let best = "";
  for (const raw of candidates) {
    const name = raw.trim();
    if (!name) continue;
    if (!best) {
      best = name;
      continue;
    }
    // A mixed-case spelling reads better than a shouted one.
    const bestIsShouty = best === best.toUpperCase();
    const nameIsShouty = name === name.toUpperCase();
    if (bestIsShouty && !nameIsShouty) best = name;
  }
  if (best && best === best.toUpperCase()) {
    // Nothing but all-caps — title-case it rather than shout at the visitor.
    return best
      .toLowerCase()
      .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return best;
}

export function getAvailableLocations(properties: Property[]): LocationGroup[] {
  // key = lowercased state, value = every spelling seen + its cities by key
  const states = new Map<string, { spellings: string[]; cities: Map<string, string[]> }>();

  for (const p of properties) {
    const stateKey = (p.state ?? "").trim().toLowerCase();
    const cityKey = (p.city ?? "").trim().toLowerCase();
    if (!stateKey) continue;

    let entry = states.get(stateKey);
    if (!entry) {
      entry = { spellings: [], cities: new Map() };
      states.set(stateKey, entry);
    }
    entry.spellings.push(p.state);
    if (!cityKey) continue;
    const seen = entry.cities.get(cityKey) ?? [];
    seen.push(p.city);
    entry.cities.set(cityKey, seen);
  }

  return Array.from(states.values())
    .map((entry) => ({
      state: displayName(entry.spellings),
      cities: Array.from(entry.cities.values())
        .map((spellings) => displayName(spellings))
        .sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.state.localeCompare(b.state));
}

export function getStates(properties: Property[]): string[] {
  return getAvailableLocations(properties).map((g) => g.state);
}

export function getCitiesForState(properties: Property[], state: string): string[] {
  return getAvailableLocations(properties).find((g) => g.state === state)?.cities ?? [];
}
