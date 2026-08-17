-- `compare_open` was already accepted here but never emitted anywhere in the
-- app; `gate_shown` / `gate_unlocked` / `alternative_clicked` /
-- `weighting_changed` are new events the compare/recommendation surfaces now
-- log. Idempotent: safe to re-run.

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
      'weighting_changed'
    )
  );
