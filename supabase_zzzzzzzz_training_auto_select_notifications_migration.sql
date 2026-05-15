begin;

alter table public.training_session_settings
  add column if not exists auto_select_enabled boolean not null default false;

alter table public.push_dispatch_events
  add column if not exists body text;

alter table public.push_dispatch_events
  add column if not exists match_id uuid references public.matches(id) on delete set null;

alter table public.push_dispatch_events
  add column if not exists target_user_id uuid references public.profiles(id) on delete cascade;

alter table public.push_dispatch_events
  add column if not exists target_member_ids uuid[];

create index if not exists idx_push_dispatch_events_target_user_created
  on public.push_dispatch_events (target_user_id, created_at desc)
  where target_user_id is not null;

create index if not exists idx_push_dispatch_events_training_targeted
  on public.push_dispatch_events (created_at desc)
  where feature = 'training' and action = 'VIEW';

drop function if exists public.list_training_sessions(uuid);

create or replace function public.list_training_sessions(p_member_id uuid default null)
returns table (
  session_id uuid,
  match_id uuid,
  match_name text,
  match_date date,
  match_time text,
  location text,
  category_group text,
  manual_status text,
  registration_start_at timestamptz,
  registration_end_at timestamptz,
  capacity integer,
  point_cost integer,
  auto_select_enabled boolean,
  published_at timestamptz,
  selected_count integer,
  applied_count integer,
  is_registration_open boolean,
  registration_id uuid,
  registration_status text,
  point_status text,
  is_blocked boolean,
  block_reason text,
  selected_members jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_manage boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_can_manage := public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE');

  if p_member_id is not null
    and not v_can_manage
    and not public.is_profile_linked_to_member(p_member_id)
  then
    raise exception 'member not linked to current profile';
  end if;

  return query
  select
    tss.id as session_id,
    m.id as match_id,
    m.match_name::text,
    m.match_date,
    m.match_time::text,
    m.location::text,
    m.category_group::text,
    coalesce(tss.manual_status, 'draft')::text as manual_status,
    tss.registration_start_at,
    tss.registration_end_at,
    tss.capacity,
    coalesce(tss.point_cost, 1) as point_cost,
    coalesce(tss.auto_select_enabled, false) as auto_select_enabled,
    tss.published_at,
    coalesce(reg_counts.selected_count, 0) as selected_count,
    coalesce(reg_counts.applied_count, 0) as applied_count,
    (
      tss.id is not null
      and public.is_training_registration_window_open(
        tss.manual_status,
        tss.registration_start_at,
        tss.registration_end_at
      )
    ) as is_registration_open,
    my_reg.id as registration_id,
    my_reg.status::text as registration_status,
    my_reg.point_status::text as point_status,
    coalesce(block_state.is_blocked, false) as is_blocked,
    block_state.reason as block_reason,
    case
      when tss.id is not null
        and (
          v_can_manage
          or (tss.published_at is not null and tss.published_at <= now())
        )
      then coalesce(selected_roster.members, '[]'::jsonb)
      else '[]'::jsonb
    end as selected_members
  from public.matches m
  left join public.training_session_settings tss
    on tss.match_id = m.id
  left join lateral (
    select
      count(*) filter (where tr.status = 'selected')::integer as selected_count,
      count(*) filter (where tr.status in ('applied', 'selected', 'waitlisted'))::integer as applied_count
    from public.training_registrations tr
    where tr.session_id = tss.id
  ) reg_counts on true
  left join public.training_registrations my_reg
    on my_reg.session_id = tss.id
   and my_reg.member_id = p_member_id
  left join lateral (
    select
      true as is_blocked,
      coalesce(nullif(b.reason, ''), '上次特訓未到，下一場暫停報名')::text as reason
    from public.training_no_show_blocks b
    where b.member_id = p_member_id
      and b.status = 'active'
      and (
        b.blocked_session_id = tss.id
        or (
          b.blocked_session_id is null
          and public.get_next_training_session_id(b.source_session_id) = tss.id
        )
      )
    order by b.created_at desc
    limit 1
  ) block_state on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'member_id', tm.id,
        'name', tm.name,
        'role', tm.role,
        'team_group', tm.team_group,
        'jersey_number', tm.jersey_number
      )
      order by tm.role, tm.name
    ) as members
    from public.training_registrations selected_reg
    join public.team_members tm
      on tm.id = selected_reg.member_id
    where selected_reg.session_id = tss.id
      and selected_reg.status = 'selected'
  ) selected_roster on true
  where m.match_level = '特訓課'
    and (v_can_manage or tss.id is not null)
  order by m.match_date asc, coalesce(m.match_time, '') asc, m.match_name asc;
end;
$$;

create or replace function public.create_training_registration(
  p_session_id uuid,
  p_member_id uuid,
  p_note text default null
)
returns public.training_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.training_session_settings%rowtype;
  v_existing public.training_registrations%rowtype;
  v_registration public.training_registrations%rowtype;
  v_available_points integer;
  v_selected_count integer := 0;
  v_target_status text := 'applied';
  v_target_point_status text := 'none';
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_profile_linked_to_member(p_member_id) then
    raise exception 'member not linked to current profile';
  end if;

  select tss.*
  into v_settings
  from public.training_session_settings tss
  join public.matches m
    on m.id = tss.match_id
  where tss.id = p_session_id
    and m.match_level = '特訓課';

  if v_settings.id is null then
    raise exception 'training session not found';
  end if;

  if not public.is_training_registration_window_open(
    v_settings.manual_status,
    v_settings.registration_start_at,
    v_settings.registration_end_at
  ) then
    raise exception 'training registration is not open';
  end if;

  if exists (
    select 1
    from public.training_no_show_blocks b
    where b.member_id = p_member_id
      and b.status = 'active'
      and (
        b.blocked_session_id = p_session_id
        or (
          b.blocked_session_id is null
          and public.get_next_training_session_id(b.source_session_id) = p_session_id
        )
      )
  ) then
    raise exception 'member is blocked from this training session';
  end if;

  v_available_points := public.get_player_available_training_points(p_member_id);

  if v_available_points < v_settings.point_cost then
    raise exception 'not enough training points';
  end if;

  select *
  into v_existing
  from public.training_registrations
  where session_id = p_session_id
    and member_id = p_member_id;

  if v_existing.id is not null then
    if v_existing.status in ('applied', 'selected', 'waitlisted') then
      raise exception 'member already registered for this training session';
    end if;

    if v_existing.point_status = 'spent' then
      raise exception 'training points were already spent for this registration';
    end if;
  end if;

  if coalesce(v_settings.auto_select_enabled, false) then
    if v_settings.capacity is not null then
      select count(*)::integer
      into v_selected_count
      from public.training_registrations tr
      where tr.session_id = p_session_id
        and tr.status = 'selected'
        and (v_existing.id is null or tr.id <> v_existing.id);
    end if;

    if v_settings.capacity is null or v_selected_count < v_settings.capacity then
      v_target_status := 'selected';
      v_target_point_status := 'reserved';
    end if;
  end if;

  if v_existing.id is not null then
    update public.training_registrations
    set
      status = v_target_status,
      point_status = v_target_point_status,
      note = nullif(btrim(p_note), ''),
      applied_by = v_user_id,
      selected_by = null,
      selected_at = case when v_target_status = 'selected' then timezone('utc', now()) else null end,
      cancelled_at = null,
      updated_at = timezone('utc', now())
    where id = v_existing.id
    returning *
    into v_registration;
  else
    insert into public.training_registrations (
      session_id,
      member_id,
      status,
      point_status,
      note,
      applied_by,
      selected_at
    )
    values (
      p_session_id,
      p_member_id,
      v_target_status,
      v_target_point_status,
      nullif(btrim(p_note), ''),
      v_user_id,
      case when v_target_status = 'selected' then timezone('utc', now()) else null end
    )
    returning *
    into v_registration;
  end if;

  return v_registration;
end;
$$;

drop function if exists public.upsert_training_session_settings(uuid, timestamptz, timestamptz, text, integer, integer);

create or replace function public.upsert_training_session_settings(
  p_match_id uuid,
  p_registration_start_at timestamptz default null,
  p_registration_end_at timestamptz default null,
  p_manual_status text default 'draft',
  p_capacity integer default null,
  p_point_cost integer default 1,
  p_auto_select_enabled boolean default false
)
returns public.training_session_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.training_session_settings%rowtype;
  v_settings public.training_session_settings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_existing
  from public.training_session_settings
  where match_id = p_match_id;

  if v_existing.id is null then
    if not public.has_app_permission('training', 'CREATE') then
      raise exception 'training:CREATE permission required';
    end if;
  elsif not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  if not exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.match_level = '特訓課'
  ) then
    raise exception 'match must be a 特訓課';
  end if;

  if p_manual_status not in ('draft', 'open', 'paused', 'closed', 'finalized') then
    raise exception 'invalid training manual status';
  end if;

  if p_capacity is not null and p_capacity <= 0 then
    raise exception 'capacity must be greater than 0';
  end if;

  if coalesce(p_point_cost, 1) < 0 then
    raise exception 'point_cost must not be negative';
  end if;

  if p_registration_start_at is not null
    and p_registration_end_at is not null
    and p_registration_end_at < p_registration_start_at
  then
    raise exception 'registration_end_at must be on or after registration_start_at';
  end if;

  insert into public.training_session_settings (
    match_id,
    registration_start_at,
    registration_end_at,
    manual_status,
    capacity,
    point_cost,
    auto_select_enabled,
    created_by
  )
  values (
    p_match_id,
    p_registration_start_at,
    p_registration_end_at,
    p_manual_status,
    p_capacity,
    coalesce(p_point_cost, 1),
    coalesce(p_auto_select_enabled, false),
    v_user_id
  )
  on conflict (match_id) do update
  set
    registration_start_at = excluded.registration_start_at,
    registration_end_at = excluded.registration_end_at,
    manual_status = excluded.manual_status,
    capacity = excluded.capacity,
    point_cost = excluded.point_cost,
    auto_select_enabled = excluded.auto_select_enabled,
    finalized_at = case
      when excluded.manual_status = 'finalized' then coalesce(public.training_session_settings.finalized_at, timezone('utc', now()))
      else public.training_session_settings.finalized_at
    end,
    updated_at = timezone('utc', now())
  returning *
  into v_settings;

  return v_settings;
end;
$$;

drop function if exists public.create_training_match_with_settings(text, date, text, text, text, timestamptz, timestamptz, text, integer, integer);

create or replace function public.create_training_match_with_settings(
  p_match_name text,
  p_match_date date,
  p_match_time text default null,
  p_location text default null,
  p_category_group text default null,
  p_registration_start_at timestamptz default null,
  p_registration_end_at timestamptz default null,
  p_manual_status text default 'draft',
  p_capacity integer default null,
  p_point_cost integer default 1,
  p_auto_select_enabled boolean default false
)
returns public.training_session_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_match_id uuid;
  v_settings public.training_session_settings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'CREATE') then
    raise exception 'training:CREATE permission required';
  end if;

  if nullif(btrim(p_match_name), '') is null then
    raise exception 'match_name is required';
  end if;

  if p_match_date is null then
    raise exception 'match_date is required';
  end if;

  if p_manual_status not in ('draft', 'open', 'paused', 'closed', 'finalized') then
    raise exception 'invalid training manual status';
  end if;

  if p_capacity is not null and p_capacity <= 0 then
    raise exception 'capacity must be greater than 0';
  end if;

  if coalesce(p_point_cost, 1) < 0 then
    raise exception 'point_cost must not be negative';
  end if;

  if p_registration_start_at is not null
    and p_registration_end_at is not null
    and p_registration_end_at < p_registration_start_at
  then
    raise exception 'registration_end_at must be on or after registration_start_at';
  end if;

  insert into public.matches (
    match_name,
    opponent,
    match_date,
    match_time,
    location,
    category_group,
    match_level,
    home_score,
    opponent_score,
    coaches,
    players,
    note,
    photo_url,
    absent_players,
    lineup,
    current_lineup,
    inning_logs,
    batting_stats,
    pitching_stats,
    current_batter_name,
    current_inning,
    current_b,
    current_s,
    current_o,
    base_1,
    base_2,
    base_3,
    bat_first,
    show_lineup_intro,
    show_line_score,
    show_3d_field,
    line_score_data
  )
  values (
    nullif(btrim(p_match_name), ''),
    '特訓課',
    p_match_date,
    coalesce(nullif(btrim(p_match_time), ''), ''),
    nullif(btrim(p_location), ''),
    nullif(btrim(p_category_group), ''),
    '特訓課',
    0,
    0,
    '',
    '',
    '',
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '',
    '一上',
    0,
    0,
    0,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    '{}'::jsonb
  )
  returning id
  into v_match_id;

  insert into public.training_session_settings (
    match_id,
    registration_start_at,
    registration_end_at,
    manual_status,
    capacity,
    point_cost,
    auto_select_enabled,
    created_by
  )
  values (
    v_match_id,
    p_registration_start_at,
    p_registration_end_at,
    p_manual_status,
    p_capacity,
    coalesce(p_point_cost, 1),
    coalesce(p_auto_select_enabled, false),
    v_user_id
  )
  returning *
  into v_settings;

  return v_settings;
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
    select * from training_location_items
    union all
    select * from fee_reminder_items
  ) feed
  order by feed.created_at desc
  limit (select feed_limit from limit_settings);
end;
$$;

revoke all on function public.list_training_sessions(uuid) from public;
grant execute on function public.list_training_sessions(uuid) to authenticated, service_role;

revoke all on function public.create_training_registration(uuid, uuid, text) from public;
grant execute on function public.create_training_registration(uuid, uuid, text) to authenticated;

revoke all on function public.upsert_training_session_settings(uuid, timestamptz, timestamptz, text, integer, integer, boolean) from public;
grant execute on function public.upsert_training_session_settings(uuid, timestamptz, timestamptz, text, integer, integer, boolean) to authenticated, service_role;

revoke all on function public.create_training_match_with_settings(text, date, text, text, text, timestamptz, timestamptz, text, integer, integer, boolean) from public;
grant execute on function public.create_training_match_with_settings(text, date, text, text, text, timestamptz, timestamptz, text, integer, integer, boolean) to authenticated, service_role;

revoke all on function public.get_notification_feed(integer, boolean) from public;
grant execute on function public.get_notification_feed(integer, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
