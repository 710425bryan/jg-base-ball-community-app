begin;

alter table public.push_dispatch_events
  add column if not exists body text;

alter table public.push_dispatch_events
  add column if not exists target_user_id uuid references public.profiles(id) on delete cascade;

alter table public.push_dispatch_events
  add column if not exists target_member_ids uuid[];

create index if not exists idx_push_dispatch_events_fee_payment_reminders
  on public.push_dispatch_events (target_user_id, created_at desc)
  where feature = 'fees'
    and action = 'PAYMENT_REMINDER'
    and target_user_id is not null;

drop function if exists public.get_notification_feed(integer);
drop function if exists public.get_notification_feed(integer, boolean);

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
          when pde.match_id is not null then format('/calendar?match_id=%s', pde.match_id::text)
          else '/calendar'
        end
      ) as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'matches'
      and pde.action = 'REMINDER'
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  match_health_items as (
    select
      pde.event_key as id,
      'match'::text as source,
      coalesce(nullif(pde.title, ''), '賽事提醒排程異常') as title,
      coalesce(nullif(pde.body, ''), '賽事提醒排程需要管理者確認。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/match-records') as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'matches'
      and pde.action = 'HEALTH_ALERT'
      and pde.target_user_id = v_user_id
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
  training_items as (
    select
      pde.event_key as id,
      'training'::text as source,
      coalesce(nullif(pde.title, ''), '特訓課通知') as title,
      coalesce(nullif(pde.body, ''), '特訓課已開放報名，請查看報名資訊。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/training') as link,
      coalesce((pde.target_member_ids)[1], null::uuid) as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'training'
      and pde.action = 'VIEW'
      and (
        (
          pde.target_user_id is null
          and (
            v_is_admin
            or 'training' = any(v_permissions)
            or exists (
              select 1
              from public.profiles current_profile
              where current_profile.id = v_user_id
                and cardinality(coalesce(current_profile.linked_team_member_ids, array[]::uuid[])) > 0
            )
          )
        )
        or pde.target_user_id = v_user_id
      )
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  training_date_items as (
    select
      pde.event_key as id,
      'training_date'::text as source,
      coalesce(nullif(pde.title, ''), '訓練日期異動') as title,
      coalesce(nullif(pde.body, ''), '請查看本月訓練日期。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/dashboard') as link,
      coalesce((pde.target_member_ids)[1], null::uuid) as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'training_dates'
      and pde.action = 'VIEW'
      and pde.target_user_id = v_user_id
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  training_location_items as (
    select
      pde.event_key as id,
      'training_location'::text as source,
      coalesce(nullif(pde.title, ''), '訓練場地通知') as title,
      coalesce(nullif(pde.body, ''), '請查看本週訓練場地配置。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/dashboard') as link,
      coalesce((pde.target_member_ids)[1], null::uuid) as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'training_locations'
      and pde.action = 'VIEW'
      and pde.target_user_id = v_user_id
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  fee_payment_reminder_items as (
    select
      pde.event_key as id,
      'fee_payment_reminder'::text as source,
      coalesce(nullif(pde.title, ''), '繳費提醒') as title,
      coalesce(nullif(pde.body, ''), '請至繳費資訊查看尚未完成的款項。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/my-payments') as link,
      coalesce((pde.target_member_ids)[1], null::uuid) as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'fees'
      and pde.action = 'PAYMENT_REMINDER'
      and pde.target_user_id = v_user_id
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
    select * from match_health_items
    union all
    select * from announcement_items
    union all
    select * from training_items
    union all
    select * from training_date_items
    union all
    select * from training_location_items
    union all
    select * from fee_payment_reminder_items
    union all
    select * from fee_reminder_items
  ) feed
  order by feed.created_at desc
  limit (select feed_limit from limit_settings);
end;
$$;

revoke all on function public.get_notification_feed(integer, boolean) from public;
grant execute on function public.get_notification_feed(integer, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
