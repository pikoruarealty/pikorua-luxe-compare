-- Email identity lookups must be exact and backed by a database invariant.
--
-- Application writes already case-fold addresses, but the original profiles
-- table never enforced uniqueness and login compensated with ILIKE. Besides
-- allowing duplicate identities, ILIKE interpreted `%` and `_` from public
-- input as wildcards. Normalising existing rows and making non-null addresses
-- unique lets every login path use an indexed equality lookup instead.

UPDATE public.profiles
SET email = nullif(lower(trim(email)), '')
WHERE email IS NOT NULL
  AND email IS DISTINCT FROM nullif(lower(trim(email)), '');

-- Legacy rows can share an email because phone was originally the only unique
-- identity. Keep the address on the oldest profile (the first account to claim
-- it), record every displaced mapping for owner audit, and leave those other
-- accounts accessible through their unique phone numbers. Do not merge rows:
-- quiz answers and activity belong to the individual phone-backed accounts.
CREATE TABLE IF NOT EXISTS public.profile_email_conflicts (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  duplicate_email text NOT NULL,
  retained_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.profile_email_conflicts TO service_role;
ALTER TABLE public.profile_email_conflicts ENABLE ROW LEVEL SECURITY;

WITH ranked AS (
  SELECT
    id,
    email,
    first_value(id) OVER (
      PARTITION BY email
      ORDER BY created_at ASC, id ASC
    ) AS retained_profile_id,
    row_number() OVER (
      PARTITION BY email
      ORDER BY created_at ASC, id ASC
    ) AS email_rank
  FROM public.profiles
  WHERE email IS NOT NULL
)
INSERT INTO public.profile_email_conflicts (
  profile_id,
  duplicate_email,
  retained_profile_id
)
SELECT id, email, retained_profile_id
FROM ranked
WHERE email_rank > 1
ON CONFLICT (profile_id) DO UPDATE
SET
  duplicate_email = excluded.duplicate_email,
  retained_profile_id = excluded.retained_profile_id,
  recorded_at = now();

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY email
      ORDER BY created_at ASC, id ASC
    ) AS email_rank
  FROM public.profiles
  WHERE email IS NOT NULL
)
UPDATE public.profiles AS profile
SET email = NULL
FROM ranked
WHERE profile.id = ranked.id
  AND ranked.email_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx
  ON public.profiles (email)
  WHERE email IS NOT NULL;

GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
