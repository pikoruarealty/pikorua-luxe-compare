import { queryOptions } from "@tanstack/react-query";
import { listDevelopers } from "@/api/functions/admin-developers.functions";

export const DEVELOPERS_KEY = ["admin", "developers"] as const;

export const developersQueryOptions = () =>
  queryOptions({
    queryKey: DEVELOPERS_KEY,
    queryFn: () => listDevelopers(),
    staleTime: 10_000,
    retry: false,
  });
