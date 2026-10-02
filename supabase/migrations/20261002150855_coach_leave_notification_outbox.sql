begin;

-- Run the complete coach-leave core migration first. Fail before creating
-- functions or moving the existing feed when the installation is incomplete.
do $prerequisites$
begin
  if to_regclass('public.coach_leave_requests') is null
    or to_regclass('public.coach_schedule_templates') is null
    or to_regprocedure('public.save_coach_leave_request(jsonb,boolean,uuid)') is null
    or not exists (
      select 1 from pg_attribute
      where attrelid=to_regclass('public.push_dispatch_events')
        and attname='coach_leave_payload' and atttypid='jsonb'::regtype and not attisdropped
    ) then
    raise exception using errcode='55000',
      message='教練請假前置 migration 尚未完整套用。',
      hint='請先完整執行 supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql（包含 COMMIT），成功後再執行本檔；不要只補 coach_leave_payload 欄位。';
  end if;
  if to_regclass('public.push_dispatch_deliveries') is null
    or to_regclass('public.web_push_subscriptions') is null
    or to_regprocedure('public.get_notification_feed(integer,boolean)') is null then
    raise exception using errcode='55000',
      message='教練請假通知所需的共用 Outbox 或通知中心尚未建立。',
      hint='請依 docs/MIGRATIONS.md 確認既有通知基線後再執行本檔。';
  end if;
end;
$prerequisites$;

-- This audience is shared by the feed and every delivery attempt. It never
-- grants access to the private leave reason.
create or replace function private.can_receive_coach_leave_notification(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and coalesce(p.is_active, true)
      and (p.access_start is null or p.access_start <= now())
      and (p.access_end is null or p.access_end >= now())
      and (btrim(p.role) = 'ADMIN' or exists (
        select 1 from public.app_role_permissions a
        where a.role_key = btrim(p.role) and a.action = 'VIEW'
          and (a.feature = 'coach_leave_requests' or (
            a.feature = 'coach_schedules'
            and upper(btrim(p.role)) in ('COACH','HEAD_COACH','教練','總教練')
          ))
      ))
  );
$$;

create or replace function private.coach_leave_notification_link(p_user_id uuid, p_payload jsonb)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.profiles p where p.id=p_user_id and (
      btrim(p.role)='ADMIN' or exists (select 1 from public.app_role_permissions a
        where a.role_key=btrim(p.role) and a.feature='coach_leave_requests' and a.action='VIEW')
    )
  ) then '/coach-leave-requests?highlight_leave_id=' || (p_payload->>'leave_id')
    else '/coach-schedules?month=' || left(p_payload->>'start_date',7) end;
$$;
revoke all on function private.can_receive_coach_leave_notification(uuid),
  private.coach_leave_notification_link(uuid,jsonb) from public, anon, authenticated;

create or replace function public.initialize_coach_leave_notification_deliveries(p_event_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_event public.push_dispatch_events%rowtype; v_count integer;
begin
  select * into v_event from public.push_dispatch_events
    where id=p_event_id and feature='coach_leave_requests' and action='VIEW'
      and event_key like 'coach_leave:%' and dispatch_mode='outbox'
      and dispatch_status='processing' for update;
  if not found then raise exception 'Coach leave event is not claimed'; end if;
  insert into public.push_dispatch_deliveries(event_id,subscription_id,user_id,endpoint,subscription,provider)
  select v_event.id,s.id,s.user_id,s.endpoint,s.subscription,null::text
    from public.web_push_subscriptions s
    where s.enabled and private.can_receive_coach_leave_notification(s.user_id)
    on conflict (event_id,subscription_id) do nothing;
  get diagnostics v_count = row_count;
  perform public.finalize_coach_leave_notification_outbox_event(p_event_id);
  return v_count;
end;
$$;

create or replace function public.release_coach_leave_notification_outbox_event(p_event_id uuid,p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.push_dispatch_events set dispatch_status='pending',locked_at=null,
    last_error=left(p_error,500),updated_at=now()
    where id=p_event_id and feature='coach_leave_requests' and dispatch_mode='outbox'
      and dispatch_status='processing';
$$;

-- Refresh ownership, permission, subscription and target URL immediately
-- before sending; a delivery snapshot is never authorization.
create or replace function public.get_coach_leave_notification_delivery(p_delivery_id uuid,p_attempt_count integer)
returns table(id uuid,event_id uuid,subscription_id uuid,user_id uuid,endpoint text,
  subscription jsonb,provider text,attempt_count integer,title text,body text,url text)
language sql stable security definer set search_path = '' as $$
  select d.id,d.event_id,s.id,s.user_id,s.endpoint,s.subscription,d.provider,d.attempt_count,
    e.title,e.body,private.coach_leave_notification_link(s.user_id,e.coach_leave_payload)
    from public.push_dispatch_deliveries d join public.push_dispatch_events e on e.id=d.event_id
      join public.web_push_subscriptions s on s.id=d.subscription_id and s.user_id=d.user_id
    where d.id=p_delivery_id and d.status='processing' and d.attempt_count=p_attempt_count
      and e.feature='coach_leave_requests' and e.event_key like 'coach_leave:%'
      and s.enabled and private.can_receive_coach_leave_notification(s.user_id);
$$;
revoke all on function public.initialize_coach_leave_notification_deliveries(uuid),
  public.release_coach_leave_notification_outbox_event(uuid,text),
  public.get_coach_leave_notification_delivery(uuid,integer) from public,anon,authenticated;
grant execute on function public.initialize_coach_leave_notification_deliveries(uuid),
  public.release_coach_leave_notification_outbox_event(uuid,text),
  public.get_coach_leave_notification_delivery(uuid,integer) to service_role;

create or replace function public.claim_coach_leave_notification_outbox_events(
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
      and pde.feature = 'coach_leave_requests'
      and pde.action = 'VIEW'
      and pde.event_key like 'coach_leave:%'
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

create or replace function public.claim_coach_leave_notification_deliveries(
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
declare
  v_interrupted_event_id uuid;
begin
  for v_interrupted_event_id in
    with interrupted as (
      update public.push_dispatch_deliveries d
      set status = 'failed', locked_at = null,
        last_error = coalesce(d.last_error, 'delivery interrupted after final attempt'),
        updated_at = timezone('utc', now())
      where d.status = 'processing'
        and exists (select 1 from public.push_dispatch_events e where e.id=d.event_id and e.feature='coach_leave_requests' and e.event_key like 'coach_leave:%')
        and d.attempt_count >= 6
        and d.locked_at < timezone('utc', now()) - interval '5 minutes'
      returning d.event_id
    ) select distinct interrupted.event_id from interrupted
  loop
    perform public.finalize_coach_leave_notification_outbox_event(v_interrupted_event_id);
  end loop;

  -- Another legacy worker can terminate stale deliveries, or this worker may
  -- stop after recording sent but before finalizing the parent event.
  for v_interrupted_event_id in
    select e.id from public.push_dispatch_events e
    where e.feature='coach_leave_requests' and e.event_key like 'coach_leave:%'
      and e.dispatch_mode='outbox' and e.dispatch_status in ('processing','retrying')
      and exists (select 1 from public.push_dispatch_deliveries d where d.event_id=e.id)
      and not exists (select 1 from public.push_dispatch_deliveries d where d.event_id=e.id and d.status in ('pending','processing'))
    order by e.created_at,e.id limit 100
  loop
    perform public.finalize_coach_leave_notification_outbox_event(v_interrupted_event_id);
  end loop;

  return query
  with candidates as (
    select d.id
    from public.push_dispatch_deliveries d
    join public.push_dispatch_events pde on pde.id = d.event_id
    where pde.dispatch_mode = 'outbox'
      and pde.feature = 'coach_leave_requests'
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

create or replace function public.finalize_coach_leave_notification_outbox_event(
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
    and pde.dispatch_mode = 'outbox'
    and pde.feature = 'coach_leave_requests';
end;
$$;

revoke all on function public.claim_coach_leave_notification_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.claim_coach_leave_notification_outbox_events(integer) to service_role;

revoke all on function public.claim_coach_leave_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_coach_leave_notification_deliveries(integer) to service_role;

revoke all on function public.finalize_coach_leave_notification_outbox_event(uuid) from public, anon, authenticated;
grant execute on function public.finalize_coach_leave_notification_outbox_event(uuid) to service_role;


-- Preserve the currently deployed feed implementation, including later
-- targeted notification sources, instead of copying an old definition.
alter function public.get_notification_feed(integer,boolean) set schema private;
alter function private.get_notification_feed(integer,boolean) rename to notification_feed_before_coach_leave;
revoke all on function private.notification_feed_before_coach_leave(integer,boolean) from public,anon,authenticated;

create index if not exists coach_leave_notification_feed_created_idx
  on public.push_dispatch_events(created_at desc, event_key)
  where feature='coach_leave_requests' and action='VIEW' and event_key like 'coach_leave:%';

create or replace function public.get_notification_feed(p_limit integer default 10,p_include_fee_reminders boolean default false)
returns table(id text,source text,title text,body text,created_at timestamptz,link text,highlight_member_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_limit integer := greatest(1,least(coalesce(p_limit,10),50));
begin
  if v_user is null or public.current_profile_role() is null then
    raise exception using errcode='42501',message='Not authenticated';
  end if;
  return query select f.* from (
    select old.* from private.notification_feed_before_coach_leave(v_limit,p_include_fee_reminders) old
    union all
    select latest.* from (
      select e.event_key,'coach_leave'::text,e.title,e.body,e.created_at,
        private.coach_leave_notification_link(v_user,e.coach_leave_payload),null::uuid
        from public.push_dispatch_events e
        where e.feature='coach_leave_requests' and e.action='VIEW' and e.event_key like 'coach_leave:%'
          and private.can_receive_coach_leave_notification(v_user)
        order by e.created_at desc,e.event_key limit v_limit
    ) latest
  ) f order by f.created_at desc,f.id limit v_limit;
end;
$$;
revoke all on function public.get_notification_feed(integer,boolean) from public,anon;
grant execute on function public.get_notification_feed(integer,boolean) to authenticated;

-- Cron deployment: the existing Outbox prerequisites provide cron/net/Vault.
-- Missing configuration skips dispatch but leaves durable events pending.
select cron.unschedule(jobid) from cron.job where jobname='coach-leave-notification-outbox-worker';
select cron.schedule('coach-leave-notification-outbox-worker','* * * * *',
  $job$ do $cron$
  declare v_url text; v_auth text; v_secret text;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name='coach_leave_outbox_function_url' limit 1;
    select decrypted_secret into v_auth from vault.decrypted_secrets where name='coach_leave_outbox_authorization' limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name='coach_leave_outbox_secret' limit 1;
    if coalesce(v_url,'')='' or coalesce(v_auth,'')='' or coalesce(v_secret,'')='' then
      raise notice 'Coach leave outbox Vault configuration is incomplete'; return;
    end if;
    perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json',
      'Authorization',v_auth,'x-sync-secret',v_secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
  end $cron$; $job$);
notify pgrst,'reload schema';
commit;
