import { queryOptions } from "@tanstack/react-query";
import { getAllV2PropertiesForAdmin } from "@/api/functions/property-v2-admin.functions";

export const PROPERTIES_KEY = ["properties"] as const;

export const adminPropertiesQueryOptions = () =>
  queryOptions({
    queryKey: ["admin", "properties"],
    queryFn: () => getAllV2PropertiesForAdmin(),
    staleTime: 10_000,
    retry: false,
  });
