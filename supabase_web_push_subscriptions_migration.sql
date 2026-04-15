begin;

create or replace function public.set_web_push_subscription_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  platform text,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint web_push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists idx_web_push_subscriptions_user_id
  on public.web_push_subscriptions (user_id);

create index if not exists idx_web_push_subscriptions_enabled
  on public.web_push_subscriptions (enabled)
  where enabled = true;

drop trigger if exists set_web_push_subscriptions_updated_at on public.web_push_subscriptions;

create trigger set_web_push_subscriptions_updated_at
before update on public.web_push_subscriptions
for each row
execute function public.set_web_push_subscription_updated_at();

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "Users can view their own web push subscriptions." on public.web_push_subscriptions;
create policy "Users can view their own web push subscriptions."
on public.web_push_subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own web push subscriptions." on public.web_push_subscriptions;
create policy "Users can insert their own web push subscriptions."
on public.web_push_subscriptions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own web push subscriptions." on public.web_push_subscriptions;
create policy "Users can update their own web push subscriptions."
on public.web_push_subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own web push subscriptions." on public.web_push_subscriptions;
create policy "Users can delete their own web push subscriptions."
on public.web_push_subscriptions
for delete
using (auth.uid() = user_id);

grant select, insert, update, delete on public.web_push_subscriptions to authenticated;
grant select, insert, update, delete on public.web_push_subscriptions to service_role;

insert into public.web_push_subscriptions (
  user_id,
  endpoint,
  subscription,
  platform,
  user_agent,
  enabled,
  created_at,
  updated_at
)
select
  p.id,
  p.web_push_sub ->> 'endpoint' as endpoint,
  p.web_push_sub,
  'Legacy import' as platform,
  null as user_agent,
  coalesce(p.receive_notifications, true) as enabled,
  coalesce(p.updated_at, timezone('utc', now())) as created_at,
  coalesce(p.updated_at, timezone('utc', now())) as updated_at
from public.profiles p
where p.web_push_sub is not null
  and coalesce(p.web_push_sub ->> 'endpoint', '') <> ''
on conflict (endpoint) do update
set
  user_id = excluded.user_id,
  subscription = excluded.subscription,
  enabled = excluded.enabled,
  updated_at = timezone('utc', now());

commit;
