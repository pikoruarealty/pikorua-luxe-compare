import { queryOptions } from "@tanstack/react-query";
import { listSubmissions, getSubmission } from "@/api/functions/admin-submissions.functions";

export const SUBMISSIONS_KEY = ["admin", "submissions"] as const;

export const submissionsQueryOptions = () =>
  queryOptions({
    queryKey: SUBMISSIONS_KEY,
    queryFn: () => listSubmissions(),
    staleTime: 10_000,
    retry: false,
  });

export const submissionDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...SUBMISSIONS_KEY, id],
    queryFn: () => getSubmission({ data: { id } }),
    staleTime: 10_000,
    retry: false,
  });
