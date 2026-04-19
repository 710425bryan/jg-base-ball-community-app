begin;

create table if not exists public.push_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  feature text,
  action text,
  title text,
  url text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint push_dispatch_events_event_key_key unique (event_key)
);

create index if not exists idx_push_dispatch_events_created_at
  on public.push_dispatch_events (created_at desc);

alter table public.push_dispatch_events enable row level security;

grant select, insert, delete on public.push_dispatch_events to service_role;

commit;
