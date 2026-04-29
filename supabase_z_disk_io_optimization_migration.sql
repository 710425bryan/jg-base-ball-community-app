begin;

create index if not exists matches_match_date_time_idx
  on public.matches (match_date, match_time);

create index if not exists attendance_events_date_created_at_idx
  on public.attendance_events (date, created_at desc);

create index if not exists attendance_records_event_member_idx
  on public.attendance_records (event_id, member_id);

create index if not exists leave_requests_date_user_idx
  on public.leave_requests (start_date, end_date, user_id);

create index if not exists monthly_fees_period_member_idx
  on public.monthly_fees (year_month, member_id);

create index if not exists quarterly_fees_period_created_at_idx
  on public.quarterly_fees (year_quarter, created_at desc);

create index if not exists quarterly_fees_member_ids_gin_idx
  on public.quarterly_fees using gin (member_ids);

create index if not exists quarterly_fees_status_created_at_idx
  on public.quarterly_fees (status, created_at desc);

create index if not exists equipment_transactions_equipment_created_at_idx
  on public.equipment_transactions (equipment_id, created_at desc);

create index if not exists equipment_transactions_member_status_created_at_idx
  on public.equipment_transactions (member_id, payment_status, created_at desc);

create index if not exists equipment_transactions_request_item_idx
  on public.equipment_transactions (request_item_id);

create index if not exists equipment_purchase_requests_status_updated_at_idx
  on public.equipment_purchase_requests (status, updated_at desc);

create index if not exists equipment_purchase_requests_member_updated_at_idx
  on public.equipment_purchase_requests (member_id, updated_at desc);

create index if not exists equipment_purchase_request_items_request_equipment_idx
  on public.equipment_purchase_request_items (request_id, equipment_id);

create index if not exists equipment_payment_submissions_status_created_at_idx
  on public.equipment_payment_submissions (status, created_at desc);

create table if not exists public.team_members_cache_meta (
  id boolean primary key default true check (id),
  row_count bigint not null default 0,
  latest_changed_at timestamptz,
  version bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.team_members_cache_meta enable row level security;

revoke all on public.team_members_cache_meta from public;
revoke all on public.team_members_cache_meta from anon, authenticated;
grant select, insert, update on public.team_members_cache_meta to service_role;

insert into public.team_members_cache_meta (
  id,
  row_count,
  latest_changed_at,
  version,
  updated_at
)
select
  true,
  count(*)::bigint,
  max(coalesce(tm.updated_at, tm.created_at)),
  1,
  timezone('utc', now())
from public.team_members tm
on conflict (id) do update
set
  row_count = excluded.row_count,
  latest_changed_at = excluded.latest_changed_at,
  version = greatest(public.team_members_cache_meta.version, 1),
  updated_at = excluded.updated_at;

create or replace function public.refresh_team_members_cache_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_members_cache_meta (
    id,
    row_count,
    latest_changed_at,
    version,
    updated_at
  )
  select
    true,
    count(*)::bigint,
    max(coalesce(tm.updated_at, tm.created_at)),
    coalesce((select version + 1 from public.team_members_cache_meta where id = true), 1),
    timezone('utc', now())
  from public.team_members tm
  on conflict (id) do update
  set
    row_count = excluded.row_count,
    latest_changed_at = excluded.latest_changed_at,
    version = public.team_members_cache_meta.version + 1,
    updated_at = excluded.updated_at;

  return null;
end;
$$;

drop trigger if exists refresh_team_members_cache_meta_after_change on public.team_members;
create trigger refresh_team_members_cache_meta_after_change
after insert or update or delete on public.team_members
for each statement
execute function public.refresh_team_members_cache_meta();

create or replace function public.get_team_members_cache_meta()
returns table (
  row_count bigint,
  latest_changed_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('players', 'VIEW') then
    raise exception 'players:VIEW permission required';
  end if;

  return query
  select
    meta.row_count,
    meta.latest_changed_at
  from public.team_members_cache_meta meta
  where meta.id = true;
end;
$$;

drop function if exists public.get_notification_feed(integer);

create or replace function public.get_notification_feed(
  p_limit integer default 10,
  p_include_fee_reminders boolean default false
)
returns table (
  id text,
  source text,
  title text,
  body text,
  created_at timestamptz,
  link text,
  highlight_member_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_permissions text[] := '{}'::text[];
  v_is_admin boolean := false;
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = v_user_id;

  v_is_admin := v_role = 'ADMIN';

  if not v_is_admin and v_role is not null then
    select coalesce(array_agg(arp.feature), '{}'::text[])
    into v_permissions
    from public.app_role_permissions arp
    where arp.role_key = v_role
      and arp.action = 'VIEW';
  end if;

  return query
  with limit_settings as (
    select v_limit as feed_limit
  ),
  leave_items as (
    select
      lr.id::text as id,
      'leave'::text as source,
      format('[新增假單] %s 的%s', coalesce(tm.name, '未知球員'), coalesce(lr.leave_type, '假單')) as title,
      format(
        E'日期：%s ~ %s\n原因：%s',
        lr.start_date,
        lr.end_date,
        coalesce(nullif(lr.reason, ''), '無')
      ) as body,
      lr.created_at,
      format('/leave-requests?highlight_leave_id=%s', lr.id::text) as link,
      null::uuid as highlight_member_id
    from public.leave_requests lr
    left join public.team_members tm on tm.id = lr.user_id
    where v_is_admin or 'leave_requests' = any(v_permissions)
    order by lr.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  member_items as (
    select
      tm.id::text as id,
      'member'::text as source,
      format('[新進通知] 歡迎 %s 入隊！', coalesce(tm.name, '未知球員')) as title,
      format('剛從表單收到了 %s (%s) 的球員資料。', coalesce(tm.name, '未知球員'), coalesce(tm.role, '球員')) as body,
      tm.created_at,
      '/players'::text as link,
      null::uuid as highlight_member_id
    from public.team_members tm
    where v_is_admin or 'players' = any(v_permissions)
    order by tm.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  join_items as (
    select
      ji.id::text as id,
      'join'::text as source,
      format('[入隊詢問] 收到來自 %s 的聯絡', coalesce(ji.parent_name, '未知家長')) as title,
      format('電話: %s。請盡快與家長聯繫！', coalesce(ji.phone, '-')) as body,
      ji.created_at,
      '/join-inquiries'::text as link,
      null::uuid as highlight_member_id
    from public.join_inquiries ji
    where v_is_admin or 'join_inquiries' = any(v_permissions)
    order by ji.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  match_items as (
    select
      pde.id::text as id,
      'match'::text as source,
      coalesce(nullif(pde.title, ''), '明日賽事提醒') as title,
      coalesce(nullif(pde.body, ''), '明天有比賽，請查看賽事資訊。') as body,
      pde.created_at,
      coalesce(
        nullif(pde.url, ''),
        case
          when pde.match_id is not null then format('/match-records?match_id=%s', pde.match_id::text)
          else '/match-records'
        end
      ) as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'matches'
      and pde.action = 'REMINDER'
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  announcement_items as (
    select
      pde.event_key as id,
      'announcement'::text as source,
      coalesce(nullif(pde.title, ''), '系統公告') as title,
      coalesce(nullif(pde.body, ''), '請查看最新公告內容。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/announcements') as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'announcements'
      and pde.action = 'VIEW'
      and (v_is_admin or 'announcements' = any(v_permissions))
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  fee_reminder_snapshot as (
    select public.get_fee_management_reminders() as snapshot
    where p_include_fee_reminders
      and (v_is_admin or 'fees' = any(v_permissions))
  ),
  fee_reminder_items as (
    select
      coalesce(reminder.item->>'id', reminder.item->>'kind') as id,
      case
        when reminder.item->>'kind' in (
          'equipmentPaymentPending',
          'equipmentRequestPending',
          'equipmentRequestInProgress',
          'equipmentUnpaid'
        ) then 'equipment'
        else 'fee'
      end::text as source,
      coalesce(nullif(reminder.item->>'title', ''), '收費待辦提醒') as title,
      coalesce(nullif(reminder.item->>'body', ''), '收費管理有待處理事項。') as body,
      coalesce(nullif(reminder.item->>'created_at', '')::timestamptz, now()) as created_at,
      coalesce(nullif(reminder.item->>'link', ''), '/fees') as link,
      null::uuid as highlight_member_id
    from fee_reminder_snapshot
    cross join lateral jsonb_array_elements(
      coalesce(fee_reminder_snapshot.snapshot->'items', '[]'::jsonb)
    ) as reminder(item)
    limit (select feed_limit from limit_settings)
  )
  select
    feed.id,
    feed.source,
    feed.title,
    feed.body,
    feed.created_at,
    feed.link,
    feed.highlight_member_id
  from (
    select * from leave_items
    union all
    select * from member_items
    union all
    select * from join_items
    union all
    select * from match_items
    union all
    select * from announcement_items
    union all
    select * from fee_reminder_items
  ) feed
  order by feed.created_at desc
  limit (select feed_limit from limit_settings);
end;
$$;

revoke all on function public.get_team_members_cache_meta() from public;
grant execute on function public.get_team_members_cache_meta() to authenticated;

revoke all on function public.get_notification_feed(integer, boolean) from public;
grant execute on function public.get_notification_feed(integer, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
