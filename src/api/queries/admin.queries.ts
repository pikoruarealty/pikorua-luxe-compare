import { queryOptions } from "@tanstack/react-query";
import { getCurrentAdminProfile } from "@/api/functions/admin-auth.functions";

export const ADMIN_ME_KEY = ["admin", "me"] as const;

export const adminMeQueryOptions = () =>
  queryOptions({
    queryKey: ADMIN_ME_KEY,
    queryFn: () => getCurrentAdminProfile(),
    staleTime: 30_000,
    retry: false,
  });
