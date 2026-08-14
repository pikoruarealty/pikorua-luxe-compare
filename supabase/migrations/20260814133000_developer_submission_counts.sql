-- Keep the owner developer list proportional to the number of developers,
-- rather than transferring and repeatedly scanning every submission row.

CREATE OR REPLACE VIEW public.developer_submission_counts
WITH (security_invoker = true)
AS
SELECT
  developer_id,
  count(*)::bigint AS total_submissions,
  count(*) FILTER (WHERE status = 'pending')::bigint AS pending_submissions
FROM public.property_submissions
GROUP BY developer_id;

REVOKE ALL ON public.developer_submission_counts FROM anon, authenticated;
GRANT SELECT ON public.developer_submission_counts TO service_role;
