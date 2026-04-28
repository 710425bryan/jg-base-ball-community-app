begin;

create table if not exists public.location_geocoding_cache (
  id uuid primary key default gen_random_uuid(),
  query_key text not null,
  query text not null,
  label text not null,
  latitude double precision not null,
  longitude double precision not null,
  source text not null,
  provider_payload jsonb,
  hit_count integer not null default 0,
  last_used_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint location_geocoding_cache_query_key_key unique (query_key),
  constraint location_geocoding_cache_latitude_check check (latitude between -90 and 90),
  constraint location_geocoding_cache_longitude_check check (longitude between -180 and 180)
);

create index if not exists idx_location_geocoding_cache_last_used_at
  on public.location_geocoding_cache (last_used_at desc);

alter table public.location_geocoding_cache enable row level security;

grant select, insert, update, delete on public.location_geocoding_cache to service_role;

commit;
