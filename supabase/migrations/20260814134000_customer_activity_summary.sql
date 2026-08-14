-- Pre-aggregate activity for the owner customer list. The detailed drawer
-- still loads a bounded timeline for one selected customer.

CREATE OR REPLACE VIEW public.customer_activity_summary
WITH (security_invoker = true)
AS
SELECT
  profile_id,
  count(*)::bigint AS activity_count,
  max(created_at) AS last_active_at
FROM public.customer_activity
WHERE profile_id IS NOT NULL
GROUP BY profile_id;

REVOKE ALL ON public.customer_activity_summary FROM anon, authenticated;
GRANT SELECT ON public.customer_activity_summary TO service_role;
