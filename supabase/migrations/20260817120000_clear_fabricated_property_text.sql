-- The retired advantagesFor/expertNoteFor/amenitiesFor/taglineFor generators
-- (src/lib/property-derivations.ts) wrote deterministic template text into
-- these columns during the initial migrate-properties.ts seed. Strip that
-- output by exact fingerprint, so a brochure gap goes back to reading as
-- not_stated rather than a plausible-looking sentence nobody wrote. Matching
-- is exact/closed-set, not a blanket clear, so any real tagline/amenity/
-- advantage/expert-note text entered since via the admin edit form
-- (src/server/property-write.server.ts) is left untouched.

update public.properties
set tagline = null
where tagline in (
  'Luxury residences on ' || location || '.',
  'Private bungalow address in ' || location || '.',
  'Plotted enclave at ' || location || '.'
);

update public.properties
set expert_note = null
where expert_note like
  '%in a tightly held micro-market — a considered pick for discerning buyers in Ahmedabad''s luxury corridor.';

update public.properties
set amenities = '{}'
where amenities = array[
  'Infinity Pool', 'Sky Lounge', 'Spa & Wellness', 'Concierge 24/7',
  'Banquet Hall', 'Cinema Lounge', 'Fitness Studio', 'EV Charging'
]::text[]
or amenities = array[
  'Private Garden', 'Plunge Pool', 'Home Automation', 'Driver & Staff Quarters',
  'Private Elevator', '24/7 Concierge', 'EV Charging', 'Landscaped Forecourt'
]::text[]
or amenities = array[
  'Gated Community', 'Landscaped Avenues', '24/7 Security', 'Underground Utilities',
  'Clubhouse Access', 'Jogging Track'
]::text[];

-- advantagesFor mixed a handful of fixed literals with real brochure
-- highlights (r.highlights) in the same array; strip only the fixed lines.
update public.properties
set advantages = (
  select coalesce(array_agg(a), '{}')
  from unnest(advantages) as a
  where a not in (
    'Curated luxury apartment living',
    'Standalone bungalow with private grounds',
    'Build-to-suit plotted development',
    'Early-bird pricing window open',
    'Move-in ready, zero wait',
    'Handover within months'
  )
  and a not like '% — premium West Ahmedabad address'
)
where exists (
  select 1
  from unnest(advantages) as a
  where a in (
    'Curated luxury apartment living',
    'Standalone bungalow with private grounds',
    'Build-to-suit plotted development',
    'Early-bird pricing window open',
    'Move-in ready, zero wait',
    'Handover within months'
  )
  or a like '% — premium West Ahmedabad address'
);
