-- Reference data required before `scripts/load-brochures.ts --publish` can run.
-- Not created by any supabase/migrations file — was seeded by hand during local
-- development. Idempotent: safe to re-run against an already-seeded database.

insert into markets (state_code, state_name, city_code, city_name, is_enabled)
values ('GJ', 'Gujarat', 'ahmedabad', 'Ahmedabad', true)
on conflict do nothing;

insert into configuration_options (kind, display_name, sort_order)
values
  ('2_bhk', '2 BHK', 20),
  ('3_bhk', '3 BHK', 30),
  ('4_bhk', '4 BHK', 40),
  ('5_bhk', '5 BHK', 50),
  ('6_bhk', '6 BHK', 60),
  ('7_bhk', '7 BHK', 70),
  ('penthouse', 'Penthouse', 80),
  ('duplex', 'Duplex', 90),
  ('villa', 'Villa', 100),
  ('bungalow', 'Bungalow', 110),
  ('plot', 'Plot', 120)
on conflict do nothing;
