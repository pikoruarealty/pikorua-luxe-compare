import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  calculateV2Distances,
  deleteSavedLocation,
  getSavedLocations,
  saveGoogleLocation,
  searchGoogleLocations,
} from "@/api/functions/locations.functions";

export function LocationDistances({
  properties,
}: {
  properties: Array<{ slug: string; name: string }>;
}) {
  const client = useQueryClient();
  const search = useServerFn(searchGoogleLocations);
  const save = useServerFn(saveGoogleLocation);
  const remove = useServerFn(deleteSavedLocation);
  const calculate = useServerFn(calculateV2Distances);
  const saved = useQuery({ queryKey: ["saved-locations"], queryFn: () => getSavedLocations() });
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ label: string; placeId: string }>>([]);
  const [distances, setDistances] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const selectPlace = async (location: { label: string; placeId: string }, persist: boolean) => {
    setBusy(true);
    try {
      if (persist) {
        await save({ data: location });
        await client.invalidateQueries({ queryKey: ["saved-locations"] });
      }
      const result = await calculate({
        data: { placeId: location.placeId, slugs: properties.map((property) => property.slug) },
      });
      setDistances(result.distancesKm);
      setQuery(location.label);
      setSuggestions([]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not calculate distance");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-5" aria-busy={busy}>
      <div className="flex items-start gap-3">
        <MapPin className="mt-1 h-5 w-5 text-champagne" />
        <div>
          <h2 className="font-display text-xl font-bold">Distance from your location</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            PropCompare stores only your label and Google Place ID. Provider coordinates are used
            transiently and never sent to the browser.
          </p>
        </div>
      </div>
      <div className="relative mt-5 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim().length >= 3) {
              void search({ data: { query } }).then(setSuggestions);
            }
          }}
          placeholder="Search an Indian landmark or neighbourhood"
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-sm"
        />
        <button
          type="button"
          disabled={query.trim().length < 3 || busy}
          onClick={() => void search({ data: { query } }).then(setSuggestions)}
          className="grid h-11 w-11 place-items-center rounded-xl bg-champagne text-lux-black disabled:opacity-40"
          aria-label="Search locations"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 divide-y divide-border rounded-xl border border-border">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              onClick={() => void selectPlace(suggestion, true)}
              className="block w-full px-4 py-3 text-left text-sm hover:bg-muted"
            >
              {suggestion.label}
            </button>
          ))}
          <p className="px-4 py-2 text-right text-xs text-muted-foreground">Powered by Google</p>
        </div>
      )}
      {saved.data && saved.data.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {saved.data.map((location) => (
            <span
              key={location.id}
              className="inline-flex items-center rounded-full border border-border"
            >
              <button
                type="button"
                onClick={() => void selectPlace(location, false)}
                className="px-4 py-2 text-sm"
              >
                {location.label}
              </button>
              <button
                type="button"
                aria-label={`Delete saved location ${location.label}`}
                onClick={async () => {
                  await remove({ data: { id: location.id } });
                  await client.invalidateQueries({ queryKey: ["saved-locations"] });
                }}
                className="pr-3 text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {Object.keys(distances).length > 0 && (
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
          {properties.map((property) => (
            <div key={property.slug} className="rounded-xl border border-border p-4">
              <dt className="text-xs text-muted-foreground">{property.name}</dt>
              <dd className="mt-1 font-semibold">
                {distances[property.slug] === null || distances[property.slug] === undefined
                  ? "Location unavailable"
                  : `About ${distances[property.slug]} km`}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
