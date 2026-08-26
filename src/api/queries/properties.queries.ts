import { queryOptions } from "@tanstack/react-query";
import { getAllPropertiesForAdmin } from "@/api/functions/properties.functions";

export const PROPERTIES_KEY = ["properties"] as const;

export const adminPropertiesQueryOptions = () =>
  queryOptions({
    queryKey: ["admin", "properties"],
    queryFn: () => getAllPropertiesForAdmin(),
    staleTime: 10_000,
    retry: false,
  });
