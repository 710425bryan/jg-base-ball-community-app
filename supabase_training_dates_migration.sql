begin;

create table if not exists public.training_month_date_settings (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  training_dates date[] not null default '{}'::date[],
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_month_date_settings_month_start_check check (date_trunc('month', month_start)::date = month_start)
);

create index if not exists idx_push_dispatch_events_training_dates
  on public.push_dispatch_events (created_at desc)
  where feature = 'training_dates';

insert into public.app_role_permissions (role_key, feature, action)
values
  ('ADMIN', 'training_dates', 'VIEW'),
  ('ADMIN', 'training_dates', 'EDIT')
on conflict (role_key, feature, action) do nothing;

alter table public.training_month_date_settings enable row level security;

drop policy if exists "training_month_date_settings_select_view" on public.training_month_date_settings;
create policy "training_month_date_settings_select_view"
  on public.training_month_date_settings
  for select
  using (public.has_app_permission('training_dates', 'VIEW'));

drop policy if exists "training_month_date_settings_insert_edit" on public.training_month_date_settings;
create policy "training_month_date_settings_insert_edit"
  on public.training_month_date_settings
  for insert
  with check (public.has_app_permission('training_dates', 'EDIT'));

drop policy if exists "training_month_date_settings_update_edit" on public.training_month_date_settings;
create policy "training_month_date_settings_update_edit"
  on public.training_month_date_settings
  for update
  using (public.has_app_permission('training_dates', 'EDIT'))
  with check (public.has_app_permission('training_dates', 'EDIT'));

drop policy if exists "training_month_date_settings_delete_edit" on public.training_month_date_settings;
create policy "training_month_date_settings_delete_edit"
  on public.training_month_date_settings
  for delete
  using (public.has_app_permission('training_dates', 'EDIT'));

grant select, insert, update, delete on public.training_month_date_settings to authenticated, service_role;

create or replace function public.assert_training_dates_permission(p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training_dates', p_action) then
    raise exception 'training_dates:% permission required', p_action;
  end if;
end;
$$;

create or replace function public.get_default_training_month_dates(p_month date)
returns date[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(day_value::date order by day_value::date), '{}'::date[])
  from generate_series(
    date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date,
    (date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date)) + interval '1 month - 1 day')::date,
    interval '1 day'
  ) as day_value
  where extract(dow from day_value) = 6;
$$;

create or replace function public.get_training_month_dates(p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
  v_setting public.training_month_date_settings%rowtype;
  v_dates date[];
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_setting
  from public.training_month_date_settings
  where month_start = v_month_start;

  if v_setting.id is null then
    v_dates := public.get_default_training_month_dates(v_month_start);
    return jsonb_build_object(
      'month_start', v_month_start,
      'training_dates', to_jsonb(v_dates),
      'note', null,
      'is_default', true,
      'updated_at', null
    );
  end if;

  select coalesce(array_agg(date_value order by date_value), '{}'::date[])
  into v_dates
  from unnest(coalesce(v_setting.training_dates, '{}'::date[])) as date_value
  where date_trunc('month', date_value)::date = v_month_start;

  return jsonb_build_object(
    'month_start', v_month_start,
    'training_dates', to_jsonb(v_dates),
    'note', v_setting.note,
    'is_default', false,
    'updated_at', v_setting.updated_at
  );
end;
$$;

create or replace function public.ensure_training_month_date_setting(p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
  v_dates date[] := public.get_default_training_month_dates(v_month_start);
  v_setting public.training_month_date_settings%rowtype;
  v_created boolean := false;
begin
  insert into public.training_month_date_settings (
    month_start,
    training_dates,
    note,
    created_by,
    updated_by,
    updated_at
  )
  values (
    v_month_start,
    v_dates,
    null,
    null,
    null,
    timezone('utc', now())
  )
  on conflict (month_start) do nothing
  returning *
  into v_setting;

  if v_setting.id is not null then
    v_created := true;
  else
    select *
    into v_setting
    from public.training_month_date_settings
    where month_start = v_month_start;
  end if;

  return jsonb_build_object(
    'success', true,
    'created', v_created,
    'month_start', v_month_start,
    'training_dates', to_jsonb(coalesce(v_setting.training_dates, v_dates)),
    'note', v_setting.note,
    'updated_at', v_setting.updated_at
  );
end;
$$;

create or replace function public.save_training_month_dates(
  p_month date,
  p_training_dates date[],
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
  v_previous_dates date[];
  v_next_dates date[];
  v_added_dates date[];
  v_removed_dates date[];
  v_setting public.training_month_date_settings%rowtype;
  v_changed boolean := false;
begin
  perform public.assert_training_dates_permission('EDIT');

  select coalesce(array_agg(distinct date_value order by date_value), '{}'::date[])
  into v_next_dates
  from unnest(coalesce(p_training_dates, '{}'::date[])) as input_date(date_value)
  where date_trunc('month', date_value)::date = v_month_start;

  select coalesce(training_dates, public.get_default_training_month_dates(v_month_start))
  into v_previous_dates
  from public.training_month_date_settings
  where month_start = v_month_start;

  if v_previous_dates is null then
    v_previous_dates := public.get_default_training_month_dates(v_month_start);
  end if;

  select coalesce(array_agg(date_value order by date_value), '{}'::date[])
  into v_previous_dates
  from unnest(v_previous_dates) as previous_date(date_value)
  where date_trunc('month', date_value)::date = v_month_start;

  v_changed := v_previous_dates <> v_next_dates;

  select coalesce(array_agg(date_value order by date_value), '{}'::date[])
  into v_added_dates
  from unnest(v_next_dates) as next_date(date_value)
  where not (date_value = any(v_previous_dates));

  select coalesce(array_agg(date_value order by date_value), '{}'::date[])
  into v_removed_dates
  from unnest(v_previous_dates) as previous_date(date_value)
  where not (date_value = any(v_next_dates));

  insert into public.training_month_date_settings (
    month_start,
    training_dates,
    note,
    created_by,
    updated_by,
    updated_at
  )
  values (
    v_month_start,
    v_next_dates,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_user_id,
    v_user_id,
    timezone('utc', now())
  )
  on conflict (month_start) do update
    set training_dates = excluded.training_dates,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc', now())
  returning *
  into v_setting;

  return jsonb_build_object(
    'success', true,
    'changed', v_changed,
    'month_start', v_setting.month_start,
    'training_dates', to_jsonb(v_next_dates),
    'added_dates', to_jsonb(v_added_dates),
    'removed_dates', to_jsonb(v_removed_dates),
    'note', v_setting.note,
    'updated_at', v_setting.updated_at
  );
end;
$$;

create or replace function public.list_training_date_notification_targets(p_month_start date)
returns table (
  user_id uuid,
  member_id uuid,
  member_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select distinct
    p.id,
    tm.id,
    tm.name::text
  from public.profiles p
  join public.team_members_safe tm
    on tm.id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
  where coalesce(p.is_active, true) is not false
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now())
    and tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('離隊', '退隊')
  order by p.id, tm.name;
end;
$$;

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
    select * from training_items
    union all
    select * from training_date_items
    union all
    select * from training_location_items
    union all
    select * from fee_reminder_items
  ) feed
  order by feed.created_at desc
  limit (select feed_limit from limit_settings);
end;
$$;

create or replace function public.get_my_home_snapshot(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_taipei_now timestamp := now() at time zone 'Asia/Taipei';
  v_today date := coalesce(p_today, v_taipei_now::date);
  v_current_time time := case
    when coalesce(p_today, v_taipei_now::date) = v_taipei_now::date then v_taipei_now::time
    else '00:00'::time
  end;
  v_week_start date := (v_today - ((extract(isodow from v_today)::integer - 1) * interval '1 day'))::date;
  v_linked_ids uuid[] := '{}'::uuid[];
  v_members jsonb := '[]'::jsonb;
  v_next_event jsonb := null;
  v_today_leaves jsonb := '[]'::jsonb;
  v_training_locations jsonb := '[]'::jsonb;
  v_training_month_dates jsonb := '[]'::jsonb;
  v_payment_summary jsonb;
  v_equipment_summary jsonb;
  v_recent_notifications jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(profiles.linked_team_member_ids, array[]::uuid[])
  into v_linked_ids
  from public.profiles
  where profiles.id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tm.id,
        'name', tm.name,
        'role', tm.role,
        'team_group', tm.team_group,
        'status', tm.status,
        'jersey_number', tm.jersey_number,
        'avatar_url', tm.avatar_url
      )
      order by
        case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
        tm.name
    ),
    '[]'::jsonb
  )
  into v_members
  from public.team_members_safe tm
  where tm.id = any(v_linked_ids)
    and tm.role in ('球員', '校隊');

  select to_jsonb(event_row)
  into v_next_event
  from (
    with event_candidates as (
      select
        m.id,
        'match'::text as type,
        coalesce(nullif(m.match_name, ''), nullif(m.opponent, ''), '賽事')::text as title,
        m.match_date::date as event_date,
        (mt.start_token)::time as event_start_time,
        coalesce(
          (mt.end_token)::time,
          case
            when mt.start_token is not null then ((mt.start_token)::time + interval '2 hours')::time
            else '23:59'::time
          end
        ) as event_end_time,
        m.match_date::text as date,
        nullif(m.match_time, '')::text as time,
        nullif(m.location, '')::text as location,
        nullif(m.opponent, '')::text as opponent,
        nullif(m.category_group, '')::text as category_group,
        nullif(m.match_level, '')::text as match_level,
        nullif(m.coaches, '')::text as coaches,
        nullif(m.players, '')::text as players,
        format('/calendar?match_id=%s', m.id::text) as route
      from public.matches m
      cross join lateral (
        select
          substring(nullif(m.match_time, '') from '([0-9]{1,2}:[0-5][0-9])') as start_token,
          substring(nullif(m.match_time, '') from '[0-9]{1,2}:[0-5][0-9][[:space:]]*[-~－—–][[:space:]]*([0-9]{1,2}:[0-5][0-9])') as end_token
      ) mt
      where m.match_date >= v_today
    )
    select
      id,
      type,
      title,
      date,
      time,
      location,
      opponent,
      category_group,
      match_level,
      coaches,
      players,
      route
    from event_candidates
    where event_date > v_today
      or event_end_time > v_current_time
    order by event_date asc, coalesce(event_start_time, '23:59'::time) asc
    limit 1
  ) event_row;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', lr.id,
        'member_id', tm.id,
        'member_name', tm.name,
        'leave_type', lr.leave_type,
        'start_date', lr.start_date,
        'end_date', lr.end_date,
        'reason', lr.reason
      )
      order by tm.name, lr.start_date
    ),
    '[]'::jsonb
  )
  into v_today_leaves
  from public.leave_requests lr
  join public.team_members_safe tm on tm.id = lr.user_id
  where lr.user_id = any(v_linked_ids)
    and lr.start_date <= v_today
    and lr.end_date >= v_today;

  if to_regprocedure('public.list_my_week_training_locations(date)') is not null then
    execute $sql$
      select coalesce(
        jsonb_agg(to_jsonb(location_row) order by location_row.training_date, location_row.start_time, location_row.member_name),
        '[]'::jsonb
      )
      from public.list_my_week_training_locations($1) location_row
    $sql$
    into v_training_locations
    using v_week_start;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', date_row.date_value::text,
        'weekday', concat('週', (array['日','一','二','三','四','五','六'])[extract(dow from date_row.date_value)::integer + 1]),
        'label', concat(extract(month from date_row.date_value)::integer, '/', extract(day from date_row.date_value)::integer, ' 週', (array['日','一','二','三','四','五','六'])[extract(dow from date_row.date_value)::integer + 1]),
        'is_today', date_row.date_value = v_today,
        'is_past', date_row.date_value < v_today
      )
      order by date_row.date_value
    ),
    '[]'::jsonb
  )
  into v_training_month_dates
  from (
    select value::date as date_value
    from jsonb_array_elements_text(public.get_training_month_dates(v_today)->'training_dates') as date_value(value)
  ) date_row;

  with official_due as (
    select
      mf.member_id,
      tm.name::text as member_name,
      'monthly'::text as billing_mode,
      mf.year_month::text as period_label,
      coalesce(mf.payable_amount, 0)::integer as amount,
      coalesce(mf.status, 'unpaid')::text as status,
      mf.updated_at
    from public.monthly_fees mf
    join public.team_members_safe tm on tm.id = mf.member_id
    where mf.member_id = any(v_linked_ids)
      and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'monthly'
      and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')

    union all

    select
      matched_member.id as member_id,
      matched_member.name::text as member_name,
      'quarterly'::text as billing_mode,
      qf.year_quarter::text as period_label,
      coalesce(qf.amount, 0)::integer as amount,
      coalesce(qf.status, 'pending_review')::text as status,
      qf.updated_at
    from public.quarterly_fees qf
    join lateral (
      select tm.id, tm.name
      from public.team_members_safe tm
      where tm.id = any(v_linked_ids)
        and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
        and (
          tm.id = qf.member_id
          or tm.id = any(coalesce(qf.member_ids, array[]::uuid[]))
        )
      order by tm.name
      limit 1
    ) matched_member on true
    where (
        qf.member_id = any(v_linked_ids)
        or coalesce(qf.member_ids, array[]::uuid[]) && v_linked_ids
      )
      and coalesce(qf.status, 'pending_review') not in ('paid', 'approved')
  ),
  pending_submissions as (
    select count(*)::integer as total
    from public.profile_payment_submissions pps
    where pps.member_id = any(v_linked_ids)
      and pps.status = 'pending_review'
  ),
  next_due_row as (
    select *
    from official_due
    order by updated_at desc nulls last, period_label desc
    limit 1
  )
  select jsonb_build_object(
    'unpaid_count', coalesce(count(*) filter (where status = 'unpaid'), 0),
    'pending_review_count', coalesce(count(*) filter (where status = 'pending_review'), 0) + coalesce((select total from pending_submissions), 0),
    'total_unpaid_amount', coalesce(sum(amount) filter (where status = 'unpaid'), 0),
    'next_due', coalesce((select to_jsonb(next_due_row) from next_due_row), 'null'::jsonb)
  )
  into v_payment_summary
  from official_due;

  with request_rows as (
    select
      r.id,
      r.member_id,
      tm.name::text as member_name,
      r.status::text,
      count(ri.id)::integer as item_count,
      coalesce(sum(coalesce(ri.unit_price_snapshot, 0) * coalesce(ri.quantity, 0)), 0)::integer as total_amount,
      r.updated_at
    from public.equipment_purchase_requests r
    join public.team_members_safe tm on tm.id = r.member_id
    left join public.equipment_purchase_request_items ri on ri.request_id = r.id
    where r.member_id = any(v_linked_ids)
      and r.status not in ('rejected', 'cancelled')
    group by r.id, r.member_id, tm.name, r.status, r.updated_at
  ),
  equipment_payment_rows as (
    select
      t.id,
      t.member_id,
      coalesce(t.payment_status, 'unpaid')::text as payment_status,
      coalesce(coalesce(t.unit_price, e.purchase_price, 0) * coalesce(t.quantity, 0), 0)::integer as total_amount
    from public.equipment_transactions t
    join public.equipment e on e.id = t.equipment_id
    left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
    left join public.equipment_purchase_requests r on r.id = ri.request_id
    where t.member_id = any(v_linked_ids)
      and t.transaction_type = 'purchase'
      and (
        t.request_item_id is null
        or (
          t.request_item_id is not null
          and r.status = 'picked_up'
        )
      )
      and coalesce(t.payment_status, 'unpaid') in ('unpaid', 'pending_review')
  ),
  latest_request_row as (
    select *
    from request_rows
    order by updated_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'active_request_count', coalesce((select count(*) from request_rows where status in ('pending', 'approved', 'ready_for_pickup')), 0),
    'ready_for_pickup_count', coalesce((select count(*) from request_rows where status = 'ready_for_pickup'), 0),
    'picked_up_unpaid_count', coalesce((select count(*) from equipment_payment_rows where payment_status = 'unpaid'), 0),
    'pending_payment_count', coalesce((select count(*) from equipment_payment_rows where payment_status = 'pending_review'), 0),
    'unpaid_amount', coalesce((select sum(total_amount) from equipment_payment_rows where payment_status = 'unpaid'), 0),
    'latest_request', coalesce((select to_jsonb(latest_request_row) from latest_request_row), 'null'::jsonb)
  )
  into v_equipment_summary;

  select coalesce(jsonb_agg(to_jsonb(feed_row) order by feed_row.created_at desc), '[]'::jsonb)
  into v_recent_notifications
  from public.get_notification_feed(5) feed_row;

  return jsonb_build_object(
    'members', v_members,
    'next_event', v_next_event,
    'today_leaves', v_today_leaves,
    'training_locations', v_training_locations,
    'training_month_dates', v_training_month_dates,
    'payment_summary', v_payment_summary,
    'equipment_summary', v_equipment_summary,
    'recent_notifications', v_recent_notifications,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.assert_training_dates_permission(text) from public;
revoke all on function public.assert_training_dates_permission(text) from anon;
grant execute on function public.assert_training_dates_permission(text) to authenticated, service_role;

revoke all on function public.get_default_training_month_dates(date) from public;
revoke all on function public.get_default_training_month_dates(date) from anon;
grant execute on function public.get_default_training_month_dates(date) to authenticated, service_role;

revoke all on function public.get_training_month_dates(date) from public;
revoke all on function public.get_training_month_dates(date) from anon;
grant execute on function public.get_training_month_dates(date) to authenticated, service_role;

revoke all on function public.ensure_training_month_date_setting(date) from public;
revoke all on function public.ensure_training_month_date_setting(date) from anon;
revoke all on function public.ensure_training_month_date_setting(date) from authenticated;
grant execute on function public.ensure_training_month_date_setting(date) to service_role;

revoke all on function public.save_training_month_dates(date, date[], text) from public;
revoke all on function public.save_training_month_dates(date, date[], text) from anon;
grant execute on function public.save_training_month_dates(date, date[], text) to authenticated, service_role;

revoke all on function public.list_training_date_notification_targets(date) from public;
revoke all on function public.list_training_date_notification_targets(date) from anon;
revoke all on function public.list_training_date_notification_targets(date) from authenticated;
grant execute on function public.list_training_date_notification_targets(date) to service_role;

revoke all on function public.get_notification_feed(integer, boolean) from public;
revoke all on function public.get_notification_feed(integer, boolean) from anon;
grant execute on function public.get_notification_feed(integer, boolean) to authenticated, service_role;

revoke all on function public.get_my_home_snapshot(date) from public;
revoke all on function public.get_my_home_snapshot(date) from anon;
grant execute on function public.get_my_home_snapshot(date) to authenticated, service_role;

create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'training-month-date-defaults-daily';

select cron.schedule(
  'training-month-date-defaults-daily',
  '5 16 * * *',
  $$
  select public.ensure_training_month_date_setting((now() at time zone 'Asia/Taipei')::date);
  $$
);

notify pgrst, 'reload schema';

commit;
