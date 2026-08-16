ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS analytics_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.analytics_opt_out IS
  'When true, optional behavioral analytics events must not be published or retained.';

CREATE INDEX IF NOT EXISTS profiles_analytics_opt_out_idx
  ON public.profiles (id) WHERE analytics_opt_out = true;

-- Identifiable legacy OLTP analytics is transitional and must not outlive its
-- short operational window while the Pub/Sub/BigQuery pipeline is introduced.
CREATE INDEX IF NOT EXISTS customer_activity_retention_idx
  ON public.customer_activity (created_at);
