import { queryOptions } from "@tanstack/react-query";
import type { Property } from "@/types/property";
import { getProperties, getAllPropertiesForAdmin } from "./properties.functions";

export const PROPERTIES_KEY = ["properties"] as const;

// Property data changes rarely (only via the admin portal), so a short staleTime
// avoids a refetch on every route transition despite router defaultPreloadStaleTime: 0.
export const propertiesQueryOptions = () =>
  queryOptions({
    queryKey: PROPERTIES_KEY,
    queryFn: () => getProperties(),
    staleTime: 60_000,
  });

export const adminPropertiesQueryOptions = () =>
  queryOptions({
    queryKey: ["admin", "properties"],
    queryFn: () => getAllPropertiesForAdmin(),
    staleTime: 10_000,
    retry: false,
  });

/** Resolve a property by its slug id from an already-loaded list. */
export const findPropertyById = (
  properties: Property[] | undefined,
  id: string | undefined,
): Property | undefined => (id ? properties?.find((p) => p.id === id) : undefined);
