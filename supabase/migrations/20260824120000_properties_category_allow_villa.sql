-- The Villa category was added at the application layer (property-schema.ts)
-- in 4b4a550 but the DB-level CHECK constraint was never updated to match,
-- so publishing any Villa-category property fails on insert.
alter table public.properties
  drop constraint if exists properties_category_check;

alter table public.properties
  add constraint properties_category_check
  check (category = any (array['Apartment', 'Villa', 'Bungalow', 'Plots']));
