begin;

-- Privileged roster reads must go through a permission-checked function before
-- raw table SELECT is hardened in the follow-up migration.
create or replace function public.list_team_members_for_edit()
returns setof public.team_members
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and (
      auth.uid() is null
      or not public.has_app_permission('players', 'EDIT')
    )
  then
    raise exception using
      errcode = '42501',
      message = 'players:EDIT permission required';
  end if;

  return query
  select tm.*
  from public.team_members tm
  order by tm.role, tm.name;
end;
$$;

revoke all on function public.list_team_members_for_edit() from public, anon;
grant execute on function public.list_team_members_for_edit() to authenticated, service_role;

alter table public.push_dispatch_events
  add column if not exists dispatch_mode text not null default 'direct';

alter table public.push_dispatch_events
  add column if not exists dispatch_status text not null default 'recorded';

alter table public.push_dispatch_events
  add column if not exists locked_at timestamptz;

alter table public.push_dispatch_events
  add column if not exists completed_at timestamptz;

alter table public.push_dispatch_events
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.push_dispatch_events
  add column if not exists last_error text;

alter table public.push_dispatch_events
  add column if not exists target_count integer not null default 0;

alter table public.push_dispatch_events
  add column if not exists sent_count integer not null default 0;

alter table public.push_dispatch_events
  add column if not exists expired_count integer not null default 0;

alter table public.push_dispatch_events
  add column if not exists failed_count integer not null default 0;

alter table public.push_dispatch_events
  add column if not exists provider_counts jsonb not null default '{}'::jsonb;

grant select, insert, update, delete on public.push_dispatch_events to service_role;

create index if not exists idx_push_dispatch_events_outbox_due
  on public.push_dispatch_events (created_at, locked_at)
  where dispatch_mode = 'outbox'
    and dispatch_status in ('pending', 'processing');

create table if not exists public.push_dispatch_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.push_dispatch_events(id) on delete cascade,
  subscription_id uuid not null,
  user_id uuid not null,
  endpoint text not null,
  subscription jsonb not null,
  provider text,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint push_dispatch_deliveries_event_subscription_key
    unique (event_id, subscription_id)
);

create index if not exists idx_push_dispatch_deliveries_due
  on public.push_dispatch_deliveries (next_attempt_at, locked_at)
  where status in ('pending', 'processing');

create index if not exists idx_push_dispatch_deliveries_event
  on public.push_dispatch_deliveries (event_id, status);

alter table public.push_dispatch_deliveries enable row level security;

revoke all on public.push_dispatch_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.push_dispatch_deliveries to service_role;

create or replace function public.enqueue_team_member_notification_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_dispatch_events (
    event_key,
    feature,
    action,
    title,
    body,
    url,
    dispatch_mode,
    dispatch_status
  )
  values (
    'team_member:' || new.id::text,
    'players',
    'VIEW',
    '[新進通知] 歡迎 ' || new.name || ' 入隊！',
    '新增球員：' || new.name || '（' || coalesce(nullif(new.role, ''), '球員') || '）',
    '/players',
    'outbox',
    'pending'
  );

  return new;
end;
$$;

drop trigger if exists team_members_enqueue_notification_outbox on public.team_members;
create trigger team_members_enqueue_notification_outbox
after insert on public.team_members
for each row
execute function public.enqueue_team_member_notification_outbox();

revoke all on function public.enqueue_team_member_notification_outbox() from public, anon, authenticated;

create or replace function public.claim_team_member_notification_outbox_events(
  p_limit integer default 25
)
returns table (
  id uuid,
  event_key text,
  feature text,
  action text,
  title text,
  body text,
  url text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select pde.id
    from public.push_dispatch_events pde
    where pde.dispatch_mode = 'outbox'
      and pde.feature = 'players'
      and pde.action = 'VIEW'
      and pde.event_key like 'team_member:%'
      and (
        pde.dispatch_status = 'pending'
        or (
          pde.dispatch_status = 'processing'
          and pde.locked_at < timezone('utc', now()) - interval '5 minutes'
        )
      )
    order by pde.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 25)
  ), claimed as (
    update public.push_dispatch_events pde
    set
      dispatch_status = 'processing',
      locked_at = timezone('utc', now()),
      updated_at = timezone('utc', now()),
      last_error = null
    from candidates c
    where pde.id = c.id
    returning
      pde.id,
      pde.event_key,
      pde.feature,
      pde.action,
      pde.title,
      pde.body,
      pde.url,
      pde.created_at
  )
  select
    c.id,
    c.event_key,
    c.feature,
    c.action,
    c.title,
    c.body,
    c.url,
    c.created_at
  from claimed c
  order by c.created_at;
end;
$$;

create or replace function public.claim_team_member_notification_deliveries(
  p_limit integer default 100
)
returns table (
  id uuid,
  event_id uuid,
  subscription_id uuid,
  user_id uuid,
  endpoint text,
  subscription jsonb,
  provider text,
  attempt_count integer,
  title text,
  body text,
  url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_dispatch_deliveries d
  set
    status = 'failed',
    locked_at = null,
    last_error = coalesce(d.last_error, 'delivery interrupted after final attempt'),
    updated_at = timezone('utc', now())
  where d.status = 'processing'
    and d.attempt_count >= 6
    and d.locked_at < timezone('utc', now()) - interval '5 minutes';

  return query
  with candidates as (
    select d.id
    from public.push_dispatch_deliveries d
    join public.push_dispatch_events pde on pde.id = d.event_id
    where pde.dispatch_mode = 'outbox'
      and pde.feature = 'players'
      and pde.action = 'VIEW'
      and d.attempt_count < 6
      and (
        (
          d.status = 'pending'
          and d.next_attempt_at <= timezone('utc', now())
        )
        or (
          d.status = 'processing'
          and d.locked_at < timezone('utc', now()) - interval '5 minutes'
        )
      )
    order by d.next_attempt_at, d.created_at
    for update of d skip locked
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
  ), claimed as (
    update public.push_dispatch_deliveries d
    set
      status = 'processing',
      attempt_count = d.attempt_count + 1,
      locked_at = timezone('utc', now()),
      updated_at = timezone('utc', now()),
      last_error = null
    from candidates c
    where d.id = c.id
    returning d.*
  )
  select
    c.id,
    c.event_id,
    c.subscription_id,
    c.user_id,
    c.endpoint,
    c.subscription,
    c.provider,
    c.attempt_count,
    pde.title,
    pde.body,
    pde.url
  from claimed c
  join public.push_dispatch_events pde on pde.id = c.event_id
  order by c.next_attempt_at, c.created_at;
end;
$$;

create or replace function public.finalize_team_member_notification_outbox_event(
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_pending integer := 0;
  v_sent integer := 0;
  v_expired integer := 0;
  v_failed integer := 0;
  v_status text;
  v_provider_counts jsonb := '{}'::jsonb;
  v_last_error text;
begin
  select
    count(*)::integer,
    count(*) filter (where d.status in ('pending', 'processing'))::integer,
    count(*) filter (where d.status = 'sent')::integer,
    count(*) filter (where d.status = 'expired')::integer,
    count(*) filter (where d.status = 'failed')::integer
  into v_total, v_pending, v_sent, v_expired, v_failed
  from public.push_dispatch_deliveries d
  where d.event_id = p_event_id;

  select coalesce(jsonb_object_agg(provider_rows.provider, provider_rows.delivery_count), '{}'::jsonb)
  into v_provider_counts
  from (
    select coalesce(nullif(d.provider, ''), 'Unknown') as provider, count(*)::integer as delivery_count
    from public.push_dispatch_deliveries d
    where d.event_id = p_event_id
    group by coalesce(nullif(d.provider, ''), 'Unknown')
  ) provider_rows;

  select d.last_error
  into v_last_error
  from public.push_dispatch_deliveries d
  where d.event_id = p_event_id
    and d.last_error is not null
  order by d.updated_at desc
  limit 1;

  v_status := case
    when v_total = 0 then 'no_targets'
    when v_pending > 0 then 'retrying'
    when v_failed = 0 then 'completed'
    when v_sent > 0 then 'partial_failed'
    else 'failed'
  end;

  update public.push_dispatch_events pde
  set
    dispatch_status = v_status,
    locked_at = null,
    completed_at = case when v_pending = 0 then timezone('utc', now()) else null end,
    updated_at = timezone('utc', now()),
    last_error = v_last_error,
    target_count = v_total,
    sent_count = v_sent,
    expired_count = v_expired,
    failed_count = v_failed,
    provider_counts = v_provider_counts
  where pde.id = p_event_id
    and pde.dispatch_mode = 'outbox';
end;
$$;

revoke all on function public.claim_team_member_notification_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.claim_team_member_notification_outbox_events(integer) to service_role;

revoke all on function public.claim_team_member_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_team_member_notification_deliveries(integer) to service_role;

revoke all on function public.finalize_team_member_notification_outbox_event(uuid) from public, anon, authenticated;
grant execute on function public.finalize_team_member_notification_outbox_event(uuid) to service_role;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Configure these Vault entries before enabling delivery:
-- team_member_outbox_function_url = https://<project-ref>.supabase.co/functions/v1/process-team-member-notification-outbox
-- team_member_outbox_authorization = Bearer <publishable-or-service-role-jwt>
-- team_member_outbox_secret = <same value as TEAM_MEMBER_OUTBOX_SECRET>
select cron.unschedule(jobid)
from cron.job
where jobname = 'team-member-notification-outbox-worker';

select cron.schedule(
  'team-member-notification-outbox-worker',
  '* * * * *',
  $$
  do $cron$
  declare
    v_url text;
    v_authorization text;
    v_secret text;
  begin
    select nullif(ds.decrypted_secret, '')
    into v_url
    from vault.decrypted_secrets ds
    where ds.name = 'team_member_outbox_function_url'
    limit 1;

    select nullif(ds.decrypted_secret, '')
    into v_authorization
    from vault.decrypted_secrets ds
    where ds.name = 'team_member_outbox_authorization'
    limit 1;

    select nullif(ds.decrypted_secret, '')
    into v_secret
    from vault.decrypted_secrets ds
    where ds.name = 'team_member_outbox_secret'
    limit 1;

    if v_url is null or v_authorization is null or v_secret is null then
      raise notice 'team member outbox Vault settings are incomplete; skip worker call';
      return;
    end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', v_authorization,
        'x-sync-secret', v_secret
      ),
      body := jsonb_build_object(
        'source', 'pg_cron',
        'event_limit', 25,
        'delivery_limit', 100
      ),
      timeout_milliseconds := 55000
    );
  end
  $cron$;
  $$
);

notify pgrst, 'reload schema';

commit;
