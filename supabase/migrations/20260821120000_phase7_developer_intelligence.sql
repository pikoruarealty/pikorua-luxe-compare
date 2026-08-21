-- Phase 7: manually managed developer-intelligence access and the explicit
-- comparison-feedback event. This migration is isolated from Phase 1's
-- canonical property dictionary and is safe to re-run.

CREATE TABLE IF NOT EXISTS public.developer_intelligence_entitlements (
  developer_id uuid PRIMARY KEY REFERENCES public.admin_profiles (id) ON DELETE CASCADE,
  access_level text NOT NULL CHECK (access_level IN ('trial', 'paid')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  managed_by uuid NOT NULL REFERENCES public.admin_profiles (id) ON DELETE RESTRICT,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS developer_intelligence_entitlements_status_idx
  ON public.developer_intelligence_entitlements (status, ends_at);

DROP TRIGGER IF EXISTS update_developer_intelligence_entitlements_updated_at
  ON public.developer_intelligence_entitlements;
CREATE TRIGGER update_developer_intelligence_entitlements_updated_at
  BEFORE UPDATE ON public.developer_intelligence_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT ALL ON public.developer_intelligence_entitlements TO service_role;
ALTER TABLE public.developer_intelligence_entitlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_activity
  DROP CONSTRAINT IF EXISTS customer_activity_event_type_check;

ALTER TABLE public.customer_activity
  ADD CONSTRAINT customer_activity_event_type_check CHECK (
    event_type IN (
      'signup',
      'quiz_completed',
      'property_view',
      'compare_add',
      'compare_open',
      'favorite_add',
      'contact_click',
      'gate_shown',
      'gate_unlocked',
      'alternative_clicked',
      'weighting_changed',
      'comparison_feedback'
    )
  );
