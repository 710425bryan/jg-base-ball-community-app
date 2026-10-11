-- Function definitions read from qwxzwomzoyfkorbwsscv on 2026-10-11.
-- Schema only: no production profile, registration, point, or secret values.
-- Preserve deployed return types/auto-selection/location fields in migration tests.

CREATE OR REPLACE FUNCTION public.apply_training_attendance_result(p_event_id uuid, p_member_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_next_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('attendance', 'EDIT')
    or public.has_app_permission('training', 'EDIT')
  ) then
    raise exception 'attendance:EDIT or training:EDIT permission required';
  end if;

  select training_session_id
  into v_session_id
  from public.attendance_events
  where id = p_event_id;

  if v_session_id is null then
    return;
  end if;

  if p_status = '缺席' then
    v_next_session_id := public.get_next_training_session_id(v_session_id);

    insert into public.training_no_show_blocks (
      member_id,
      source_session_id,
      blocked_session_id,
      status,
      reason
    )
    values (
      p_member_id,
      v_session_id,
      v_next_session_id,
      'active',
      '特訓課未到，下一場暫停報名'
    )
    on conflict (member_id, source_session_id) where status = 'active'
    do update set
      blocked_session_id = excluded.blocked_session_id,
      reason = excluded.reason,
      updated_at = timezone('utc', now());
  elsif p_status in ('出席', '請假') then
    update public.training_no_show_blocks
    set
      status = 'waived',
      waived_by = v_user_id,
      waived_at = timezone('utc', now()),
      resolved_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where member_id = p_member_id
      and source_session_id = v_session_id
      and status = 'active';
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.cancel_training_registration(p_registration_id uuid)
 RETURNS training_registrations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_registration public.training_registrations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_registration
  from public.training_registrations
  where id = p_registration_id;

  if v_registration.id is null then
    raise exception 'training registration not found';
  end if;

  if not public.is_profile_linked_to_member(v_registration.member_id)
    and not public.has_app_permission('training', 'EDIT')
  then
    raise exception 'training registration is not cancellable by current profile';
  end if;

  if v_registration.point_status = 'spent' then
    raise exception 'spent training points cannot be cancelled';
  end if;

  update public.training_registrations
  set
    status = 'cancelled',
    point_status = case when point_status = 'reserved' then 'released' else point_status end,
    cancelled_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = p_registration_id
  returning *
  into v_registration;

  return v_registration;
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_training_attendance_event(p_session_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_match public.matches%rowtype;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  select m.*
  into v_match
  from public.training_session_settings tss
  join public.matches m
    on m.id = tss.match_id
  where tss.id = p_session_id
    and m.match_level = '特訓課';

  if v_match.id is null then
    raise exception 'training session not found';
  end if;

  select id
  into v_event_id
  from public.attendance_events
  where training_session_id = p_session_id
  limit 1;

  if v_event_id is null then
    insert into public.attendance_events (
      title,
      date,
      event_type,
      created_by,
      training_session_id
    )
    values (
      coalesce(nullif(v_match.match_name, ''), '特訓課點名'),
      v_match.match_date,
      '特訓課',
      v_user_id,
      p_session_id
    )
    returning id
    into v_event_id;
  end if;

  insert into public.attendance_records (
    event_id,
    member_id,
    status
  )
  select
    v_event_id,
    tr.member_id,
    '待點名'
  from public.training_registrations tr
  where tr.session_id = p_session_id
    and tr.status = 'selected'
  on conflict (event_id, member_id) do nothing;

  return v_event_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_training_match_with_settings(p_match_name text, p_match_date date, p_match_time text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_category_group text DEFAULT NULL::text, p_registration_start_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_registration_end_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_manual_status text DEFAULT 'draft'::text, p_capacity integer DEFAULT NULL::integer, p_point_cost integer DEFAULT 1, p_auto_select_enabled boolean DEFAULT false)
 RETURNS training_session_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.create_training_registration(p_session_id uuid, p_member_id uuid, p_note text DEFAULT NULL::text)
 RETURNS training_registrations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.current_profile_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now())
  limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.delete_player_point_transactions(p_transaction_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_transaction_ids uuid[];
  v_found_count integer := 0;
  v_blocked_count integer := 0;
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not coalesce(public.has_app_permission('training', 'DELETE'), false) then
    raise exception 'training DELETE permission required';
  end if;

  select array_agg(distinct ids.transaction_id)
  into v_transaction_ids
  from unnest(coalesce(p_transaction_ids, array[]::uuid[])) as ids(transaction_id)
  where ids.transaction_id is not null;

  if v_transaction_ids is null or cardinality(v_transaction_ids) = 0 then
    raise exception 'transaction_ids are required';
  end if;

  with locked_transactions as (
    select ppt.id
    from public.player_point_transactions ppt
    where ppt.id = any(v_transaction_ids)
    for update
  )
  select count(*)
  into v_found_count
  from locked_transactions;

  if v_found_count <> cardinality(v_transaction_ids) then
    raise exception 'some point transactions were not found';
  end if;

  select count(*)
  into v_blocked_count
  from public.player_point_transactions ppt
  where ppt.id = any(v_transaction_ids)
    and (
      ppt.source <> 'manual'
      or ppt.related_session_id is not null
      or ppt.related_registration_id is not null
      or ppt.idempotency_key is not null
    );

  if v_blocked_count > 0 then
    raise exception '只能刪除手動建立的點數紀錄';
  end if;

  with point_delta as (
    select
      ppt.member_id,
      coalesce(sum(ppt.delta), 0)::integer as delta_to_remove
    from public.player_point_transactions ppt
    where ppt.id = any(v_transaction_ids)
    group by ppt.member_id
  )
  select count(*)
  into v_blocked_count
  from point_delta pd
  where public.get_player_point_balance(pd.member_id) - pd.delta_to_remove
    < public.get_player_reserved_training_points(pd.member_id);

  if v_blocked_count > 0 then
    raise exception '刪除後可用點數不足，仍有已錄取保留點數。';
  end if;

  delete from public.player_point_transactions ppt
  where ppt.id = any(v_transaction_ids);

  get diagnostics v_deleted_count = ROW_COUNT;
  return v_deleted_count;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_next_training_session_id(p_source_session_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with source_session as (
    select
      tss.id,
      m.match_date,
      coalesce(m.match_time, '') as match_time
    from public.training_session_settings tss
    join public.matches m
      on m.id = tss.match_id
    where tss.id = p_source_session_id
  )
  select next_session.id
  from source_session src
  join public.training_session_settings next_session
    on next_session.id <> src.id
  join public.matches next_match
    on next_match.id = next_session.match_id
  where next_match.match_level = '特訓課'
    and (
      next_match.match_date > src.match_date
      or (
        next_match.match_date = src.match_date
        and coalesce(next_match.match_time, '') > src.match_time
      )
    )
  order by next_match.match_date asc, coalesce(next_match.match_time, '') asc
  limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.get_player_available_training_points(p_member_id uuid, p_exclude_registration_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.get_player_point_balance(p_member_id)
    - public.get_player_reserved_training_points(p_member_id, p_exclude_registration_id);
$function$;
CREATE OR REPLACE FUNCTION public.get_player_point_balance(p_member_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(delta), 0)::integer
  from public.player_point_transactions
  where member_id = p_member_id;
$function$;
CREATE OR REPLACE FUNCTION public.get_player_reserved_training_points(p_member_id uuid, p_exclude_registration_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(tss.point_cost), 0)::integer
  from public.training_registrations tr
  join public.training_session_settings tss
    on tss.id = tr.session_id
  where tr.member_id = p_member_id
    and tr.status = 'selected'
    and tr.point_status = 'reserved'
    and (p_exclude_registration_id is null or tr.id <> p_exclude_registration_id);
$function$;
CREATE OR REPLACE FUNCTION public.get_training_registration_notification_diagnostics(p_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 20));
  v_settings jsonb;
  v_cron jsonb;
  v_sessions jsonb;
  v_events jsonb;
  v_push_targets jsonb;
  v_config jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE')
  ) then
    raise exception 'training management permission required';
  end if;

  v_config := public.get_training_registration_notification_config();
  v_settings := v_config - 'function_url' - 'authorization' - 'sync_secret';

  with jobs as (
    select
      j.jobid,
      j.jobname,
      j.schedule,
      j.active,
      left(coalesce(j.command, ''), 500) as command_preview
    from cron.job j
    where j.jobname = 'training-registration-notification-checker'
    order by j.jobid
  ),
  runs as (
    select
      jrd.runid,
      jrd.jobid,
      jrd.status,
      left(coalesce(jrd.return_message, ''), 800) as return_message,
      jrd.start_time,
      jrd.end_time
    from cron.job j
    join cron.job_run_details jrd
      on jrd.jobid = j.jobid
    where j.jobname = 'training-registration-notification-checker'
    order by jrd.start_time desc
    limit 10
  )
  select jsonb_build_object(
    'job_exists', exists (select 1 from jobs),
    'jobs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'jobid', jobid,
            'jobname', jobname,
            'schedule', schedule,
            'active', active,
            'command_preview', command_preview
          )
          order by jobid
        )
        from jobs
      ),
      '[]'::jsonb
    ),
    'recent_runs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'runid', runid,
            'jobid', jobid,
            'status', status,
            'return_message', return_message,
            'start_time', start_time,
            'end_time', end_time
          )
          order by start_time desc
        )
        from runs
      ),
      '[]'::jsonb
    )
  )
  into v_cron;

  with recent_sessions as (
    select
      tss.id as session_id,
      tss.match_id,
      tss.manual_status,
      tss.registration_start_at,
      tss.registration_end_at,
      tss.capacity,
      coalesce(tss.point_cost, 1) as point_cost,
      m.match_name,
      m.match_date,
      m.match_time,
      m.location,
      m.match_level,
      coalesce(reg_counts.selected_count, 0) as selected_count
    from public.training_session_settings tss
    join public.matches m
      on m.id = tss.match_id
    left join lateral (
      select count(*)::integer as selected_count
      from public.training_registrations tr
      where tr.session_id = tss.id
        and tr.status = 'selected'
    ) reg_counts on true
    order by
      tss.registration_start_at desc nulls last,
      m.match_date desc nulls last,
      tss.created_at desc
    limit v_limit
  ),
  session_diagnostics as (
    select
      rs.*,
      array_remove(array[
        case when rs.match_level <> '特訓課' then 'not_training_match' end,
        case when rs.manual_status <> 'open' then 'manual_status_not_open' end,
        case when rs.registration_start_at is null then 'registration_start_missing' end,
        case when rs.registration_start_at is not null and rs.registration_start_at > now() then 'registration_start_future' end,
        case when rs.registration_end_at is not null and rs.registration_end_at < now() then 'registration_end_expired' end
      ], null) as blockers,
      pde.event_key as event_key,
      pde.created_at as event_created_at
    from recent_sessions rs
    left join lateral (
      select
        pde.event_key,
        pde.created_at
      from public.push_dispatch_events pde
      where pde.feature = 'training'
        and pde.action = 'VIEW'
        and pde.event_key like ('training_registration_open:' || rs.session_id::text || ':%')
      order by pde.created_at desc
      limit 1
    ) pde on true
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'session_id', session_id,
      'match_id', match_id,
      'match_name', match_name,
      'match_date', match_date,
      'match_time', match_time,
      'location', location,
      'match_level', match_level,
      'manual_status', manual_status,
      'registration_start_at', registration_start_at,
      'registration_end_at', registration_end_at,
      'capacity', capacity,
      'point_cost', point_cost,
      'selected_count', selected_count,
      'open_event_key_prefix', 'training_registration_open:' || session_id::text || ':',
      'open_event_exists', event_key is not null,
      'open_event_key', event_key,
      'open_event_created_at', event_created_at,
      'blockers', to_jsonb(blockers),
      'trigger_state', case
        when event_key is not null then 'duplicate'
        when cardinality(blockers) = 0 then 'ready'
        else 'blocked'
      end
    )
    order by registration_start_at desc nulls last, match_date desc nulls last
  ), '[]'::jsonb)
  into v_sessions
  from session_diagnostics;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'event_key', event_key,
      'title', title,
      'body', body,
      'url', url,
      'match_id', match_id,
      'created_at', created_at
    )
    order by created_at desc
  ), '[]'::jsonb)
  into v_events
  from (
    select
      pde.event_key,
      pde.title,
      pde.body,
      pde.url,
      pde.match_id,
      pde.created_at
    from public.push_dispatch_events pde
    where pde.feature = 'training'
      and pde.action = 'VIEW'
      and (
        pde.event_key like 'training_registration_open:%'
        or pde.event_key like 'training_registration_deadline:%'
      )
    order by pde.created_at desc
    limit 10
  ) recent_events;

  with permission_roles as (
    select distinct arp.role_key
    from public.app_role_permissions arp
    where arp.feature = 'training'
      and arp.action in ('VIEW', 'CREATE', 'EDIT', 'DELETE')
    union
    select 'ADMIN'::text
  ),
  eligible_members as (
    select tm.id
    from public.team_members_safe tm
    where tm.role in ('球員', '校隊')
      and coalesce(tm.status, '') <> '退隊'
  ),
  target_users as (
    select distinct p.id
    from public.profiles p
    where coalesce(p.is_active, true)
      and (p.access_start is null or p.access_start <= now())
      and (p.access_end is null or p.access_end >= now())
      and (
        p.role in (select role_key from permission_roles)
        or exists (
          select 1
          from unnest(coalesce(p.linked_team_member_ids, array[]::uuid[])) linked(member_id)
          join eligible_members em
            on em.id = linked.member_id
        )
      )
  )
  select jsonb_build_object(
    'active_training_users', coalesce((select count(*) from target_users), 0),
    'enabled_subscriptions', coalesce((
      select count(*)
      from public.web_push_subscriptions wps
      join target_users tu
        on tu.id = wps.user_id
      where wps.enabled = true
    ), 0)
  )
  into v_push_targets;

  return jsonb_build_object(
    'generated_at', timezone('utc', now()),
    'settings', v_settings,
    'cron', v_cron,
    'recent_sessions', coalesce(v_sessions, '[]'::jsonb),
    'recent_events', coalesce(v_events, '[]'::jsonb),
    'push_targets', coalesce(v_push_targets, jsonb_build_object(
      'active_training_users', 0,
      'enabled_subscriptions', 0
    ))
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.grant_player_points(p_member_ids uuid[], p_delta integer, p_reason text DEFAULT NULL::text)
 RETURNS SETOF player_point_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
  ) then
    raise exception 'training CREATE or EDIT permission required';
  end if;

  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    raise exception 'member_ids are required';
  end if;

  if coalesce(p_delta, 0) = 0 then
    raise exception 'delta must not be 0';
  end if;

  if p_delta < 0 and exists (
    select 1
    from unnest(p_member_ids) as member_id
    where public.get_player_point_balance(member_id) + p_delta
      < public.get_player_reserved_training_points(member_id)
  ) then
    raise exception 'point adjustment would make available points negative';
  end if;

  return query
  insert into public.player_point_transactions (
    member_id,
    delta,
    reason,
    source,
    created_by
  )
  select
    distinct member_id,
    p_delta,
    nullif(btrim(p_reason), ''),
    'manual',
    v_user_id
  from unnest(p_member_ids) as member_id
  returning *;
end;
$function$;
CREATE OR REPLACE FUNCTION public.has_app_permission(p_feature text, p_action text DEFAULT 'VIEW'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_role := public.current_profile_role();

  if v_role is null then
    return false;
  end if;

  if v_role = 'ADMIN' then
    return true;
  end if;

  return exists (
    select 1
    from public.app_role_permissions arp
    where arp.role_key = v_role
      and arp.feature = coalesce(p_feature, '')
      and arp.action = coalesce(nullif(p_action, ''), 'VIEW')
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.invoke_training_registration_notification_once(p_dry_run boolean DEFAULT false, p_limit integer DEFAULT 20, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_config jsonb := '{}'::jsonb;
  v_url text;
  v_authorization text;
  v_secret text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_request_id bigint;
  v_queued_at timestamptz := timezone('utc', now());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  v_config := public.get_training_registration_notification_config();
  v_url := nullif(v_config->>'function_url', '');
  v_authorization := nullif(v_config->>'authorization', '');
  v_secret := nullif(v_config->>'sync_secret', '');

  if v_url is null then
    raise exception 'app.training_registration_notification_function_url is not set';
  end if;

  if v_authorization is null then
    raise exception 'app.training_registration_notification_authorization is not set';
  end if;

  if v_secret is null then
    raise exception 'app.training_registration_notification_secret is not set';
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', v_authorization,
      'x-sync-secret', v_secret
    )),
    body := jsonb_build_object(
      'source', 'manual_rpc',
      'triggered_by', v_user_id,
      'dry_run', coalesce(p_dry_run, false),
      'force_resend', not coalesce(p_dry_run, false),
      'limit', v_limit,
      'now', coalesce(p_now, now()),
      'checks', 'registration_open_and_deadline_reminder'
    ),
    timeout_milliseconds := 60000
  )
  into v_request_id;

  return jsonb_build_object(
    'queued', true,
    'request_id', v_request_id,
    'dry_run', coalesce(p_dry_run, false),
    'force_resend', not coalesce(p_dry_run, false),
    'limit', v_limit,
    'queued_at', v_queued_at
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.list_my_training_members()
 RETURNS TABLE(member_id uuid, name text, role text, team_group text, point_balance integer, reserved_points integer, available_points integer, active_block_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    tm.id,
    tm.name::text,
    tm.role::text,
    tm.team_group::text,
    public.get_player_point_balance(tm.id),
    public.get_player_reserved_training_points(tm.id),
    public.get_player_available_training_points(tm.id),
    (
      select count(*)::integer
      from public.training_no_show_blocks b
      where b.member_id = tm.id
        and b.status = 'active'
    ) as active_block_count
  from public.profiles p
  join public.team_members tm
    on tm.id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
  where p.id = v_user_id
  order by
    case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
    tm.name asc;
end;
$function$;
CREATE OR REPLACE FUNCTION public.list_player_point_transactions(p_member_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, member_id uuid, member_name text, delta integer, reason text, source text, related_session_id uuid, related_registration_id uuid, created_by uuid, created_by_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_can_manage boolean := false;
begin
  if auth.uid() is null then
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
    ppt.id,
    ppt.member_id,
    tm.name::text as member_name,
    ppt.delta,
    ppt.reason::text,
    ppt.source::text,
    ppt.related_session_id,
    ppt.related_registration_id,
    ppt.created_by,
    coalesce(p.nickname, p.name)::text as created_by_name,
    ppt.created_at
  from public.player_point_transactions ppt
  join public.team_members tm
    on tm.id = ppt.member_id
  left join public.profiles p
    on p.id = ppt.created_by
  where (
    p_member_id is not null and ppt.member_id = p_member_id
  ) or (
    p_member_id is null
    and (
      v_can_manage
      or public.is_profile_linked_to_member(ppt.member_id)
    )
  )
  order by ppt.created_at desc
  limit 200;
end;
$function$;
CREATE OR REPLACE FUNCTION public.list_training_admin_registrations(p_session_id uuid)
 RETURNS TABLE(registration_id uuid, session_id uuid, member_id uuid, member_name text, member_role text, team_group text, jersey_number text, status text, point_status text, note text, applied_by uuid, applied_by_name text, selected_by uuid, selected_at timestamp with time zone, created_at timestamp with time zone, point_balance integer, reserved_points integer, available_points integer, training_location_id uuid, training_location_name text, training_time text, coach_names text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE')
  ) then
    raise exception 'training management permission required';
  end if;

  return query
  select
    tr.id,
    tr.session_id,
    tr.member_id,
    tm.name::text,
    tm.role::text,
    tm.team_group::text,
    tm.jersey_number::text,
    tr.status::text,
    tr.point_status::text,
    tr.note::text,
    tr.applied_by,
    coalesce(p.nickname, p.name)::text as applied_by_name,
    tr.selected_by,
    tr.selected_at,
    tr.created_at,
    public.get_player_point_balance(tr.member_id),
    public.get_player_reserved_training_points(tr.member_id),
    public.get_player_available_training_points(tr.member_id),
    tla.session_venue_id,
    tl.location_name::text,
    tl.training_time::text,
    tl.coach_names::text
  from public.training_registrations tr
  join public.team_members tm
    on tm.id = tr.member_id
  left join public.profiles p
    on p.id = tr.applied_by
  left join public.training_location_assignments tla
    on tla.registration_id = tr.id
  left join public.training_locations tl
    on tl.id = tla.session_venue_id
  where tr.session_id = p_session_id
  order by
    case tr.status
      when 'selected' then 0
      when 'applied' then 1
      when 'waitlisted' then 2
      when 'rejected' then 3
      else 4
    end,
    tm.role,
    tm.name
  limit 200;
end;
$function$;
CREATE OR REPLACE FUNCTION public.list_training_sessions(p_member_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(session_id uuid, match_id uuid, match_name text, match_date date, match_time text, location text, category_group text, manual_status text, registration_start_at timestamp with time zone, registration_end_at timestamp with time zone, capacity integer, point_cost integer, auto_select_enabled boolean, published_at timestamp with time zone, selected_count integer, applied_count integer, is_registration_open boolean, registration_id uuid, registration_status text, point_status text, is_blocked boolean, block_reason text, selected_members jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.process_training_session_automation(p_today date DEFAULT NULL::date)
 RETURNS TABLE(spent_count integer, skipped_count integer, released_block_count integer, finalized_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Taipei')::date);
  v_row record;
  v_spent_count integer := 0;
  v_skipped_count integer := 0;
  v_released_block_count integer := 0;
  v_finalized_count integer := 0;
  v_idempotency_key text;
  v_row_count integer := 0;
begin
  if auth.uid() is not null
    and not public.has_app_permission('training', 'EDIT')
  then
    raise exception 'training:EDIT permission required';
  end if;

  for v_row in
    select
      tr.id as registration_id,
      tr.member_id,
      tr.session_id,
      tss.point_cost,
      m.match_date
    from public.training_registrations tr
    join public.training_session_settings tss
      on tss.id = tr.session_id
    join public.matches m
      on m.id = tss.match_id
    where tr.status = 'selected'
      and tr.point_status = 'reserved'
      and m.match_date <= v_today
  loop
    v_idempotency_key := 'training_spend:' || v_row.registration_id::text;

    if v_row.point_cost = 0 then
      update public.training_registrations
      set
        point_status = 'spent',
        updated_at = timezone('utc', now())
      where id = v_row.registration_id;

      v_spent_count := v_spent_count + 1;
    elsif exists (
      select 1
      from public.player_point_transactions ppt
      where ppt.idempotency_key = v_idempotency_key
    ) then
      update public.training_registrations
      set
        point_status = 'spent',
        updated_at = timezone('utc', now())
      where id = v_row.registration_id;

      v_spent_count := v_spent_count + 1;
    elsif public.get_player_point_balance(v_row.member_id) >= v_row.point_cost then
      insert into public.player_point_transactions (
        member_id,
        delta,
        reason,
        source,
        related_session_id,
        related_registration_id,
        idempotency_key
      )
      values (
        v_row.member_id,
        -1 * v_row.point_cost,
        '特訓課錄取扣點',
        'system_spend',
        v_row.session_id,
        v_row.registration_id,
        v_idempotency_key
      )
      on conflict (idempotency_key) do nothing;

      update public.training_registrations
      set
        point_status = 'spent',
        updated_at = timezone('utc', now())
      where id = v_row.registration_id;

      v_spent_count := v_spent_count + 1;
    else
      v_skipped_count := v_skipped_count + 1;
    end if;
  end loop;

  update public.training_no_show_blocks b
  set
    status = 'served',
    resolved_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.training_session_settings blocked_session
  join public.matches blocked_match
    on blocked_match.id = blocked_session.match_id
  where b.status = 'active'
    and b.blocked_session_id = blocked_session.id
    and blocked_match.match_date < v_today;

  get diagnostics v_released_block_count = row_count;

  update public.training_no_show_blocks b
  set
    status = 'served',
    resolved_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.training_session_settings blocked_session
  join public.matches blocked_match
    on blocked_match.id = blocked_session.match_id
  where b.status = 'active'
    and b.blocked_session_id is null
    and public.get_next_training_session_id(b.source_session_id) = blocked_session.id
    and blocked_match.match_date < v_today;

  get diagnostics v_row_count = row_count;
  v_released_block_count := v_released_block_count + v_row_count;

  update public.training_session_settings tss
  set
    manual_status = 'finalized',
    finalized_at = coalesce(tss.finalized_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  from public.matches m
  where m.id = tss.match_id
    and m.match_level = '特訓課'
    and m.match_date < v_today
    and tss.manual_status <> 'finalized';

  get diagnostics v_finalized_count = row_count;

  spent_count := v_spent_count;
  skipped_count := v_skipped_count;
  released_block_count := v_released_block_count;
  finalized_count := v_finalized_count;
  return next;
end;
$function$;
CREATE OR REPLACE FUNCTION public.publish_training_selection(p_session_id uuid)
 RETURNS training_session_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_settings public.training_session_settings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  update public.training_session_settings
  set
    published_at = coalesce(published_at, timezone('utc', now())),
    manual_status = case when manual_status in ('draft', 'open', 'paused') then 'closed' else manual_status end,
    updated_at = timezone('utc', now())
  where id = p_session_id
  returning *
  into v_settings;

  if v_settings.id is null then
    raise exception 'training session not found';
  end if;

  return v_settings;
end;
$function$;
CREATE OR REPLACE FUNCTION public.review_training_registration(p_registration_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS training_registrations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_registration public.training_registrations%rowtype;
  v_settings public.training_session_settings%rowtype;
  v_available_points integer;
  v_selected_count integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  if p_status not in ('applied', 'selected', 'waitlisted', 'rejected', 'cancelled') then
    raise exception 'invalid registration status';
  end if;

  select *
  into v_registration
  from public.training_registrations
  where id = p_registration_id;

  if v_registration.id is null then
    raise exception 'training registration not found';
  end if;

  if v_registration.point_status = 'spent' and p_status <> 'selected' then
    raise exception 'spent training registration cannot be changed away from selected';
  end if;

  select *
  into v_settings
  from public.training_session_settings
  where id = v_registration.session_id;

  if p_status = 'selected' then
    if v_settings.capacity is not null then
      select count(*)::integer
      into v_selected_count
      from public.training_registrations
      where session_id = v_registration.session_id
        and status = 'selected'
        and id <> p_registration_id;

      if v_selected_count >= v_settings.capacity then
        raise exception 'training capacity is full';
      end if;
    end if;

    v_available_points := public.get_player_available_training_points(
      v_registration.member_id,
      p_registration_id
    );

    if v_available_points < v_settings.point_cost then
      raise exception 'not enough available training points to select this member';
    end if;
  end if;

  update public.training_registrations
  set
    status = p_status,
    point_status = case
      when p_status = 'selected' and point_status <> 'spent' then 'reserved'
      when p_status in ('rejected', 'cancelled') and point_status = 'reserved' then 'released'
      when p_status in ('applied', 'waitlisted') and point_status = 'reserved' then 'released'
      else point_status
    end,
    note = coalesce(nullif(btrim(p_note), ''), note),
    selected_by = case when p_status = 'selected' then v_user_id else selected_by end,
    selected_at = case when p_status = 'selected' then timezone('utc', now()) else selected_at end,
    cancelled_at = case when p_status = 'cancelled' then timezone('utc', now()) else cancelled_at end,
    updated_at = timezone('utc', now())
  where id = p_registration_id
  returning *
  into v_registration;

  return v_registration;
end;
$function$;
CREATE OR REPLACE FUNCTION public.upsert_training_session_settings(p_match_id uuid, p_registration_start_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_registration_end_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_manual_status text DEFAULT 'draft'::text, p_capacity integer DEFAULT NULL::integer, p_point_cost integer DEFAULT 1, p_auto_select_enabled boolean DEFAULT false)
 RETURNS training_session_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.notification_feed_before_coach_leave(p_limit integer DEFAULT 10, p_include_fee_reminders boolean DEFAULT false)
 RETURNS TABLE(id text, source text, title text, body text, created_at timestamp with time zone, link text, highlight_member_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;CREATE OR REPLACE FUNCTION public.get_training_registration_notification_config()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_config jsonb := '{}'::jsonb;
  v_url text;
  v_authorization text;
  v_secret text;
  v_url_source text := 'missing';
  v_authorization_source text := 'missing';
  v_secret_source text := 'missing';
begin
  select coalesce(ss.value, '{}'::jsonb)
  into v_config
  from public.system_settings ss
  where ss.key = 'training_registration_notification';

  v_config := coalesce(v_config, '{}'::jsonb);

  if nullif(current_setting('app.training_registration_notification_function_url', true), '') is not null then
    v_url := nullif(current_setting('app.training_registration_notification_function_url', true), '');
    v_url_source := 'db_setting';
  elsif nullif(v_config->>'function_url', '') is not null then
    v_url := nullif(v_config->>'function_url', '');
    v_url_source := 'system_settings';
  else
    v_url := 'https://qwxzwomzoyfkorbwsscv.supabase.co/functions/v1/send-training-registration-notifications';
    v_url_source := 'project_default';
  end if;

  if nullif(current_setting('app.training_registration_notification_authorization', true), '') is not null then
    v_authorization := nullif(current_setting('app.training_registration_notification_authorization', true), '');
    v_authorization_source := 'db_setting';
  elsif nullif(v_config->>'authorization', '') is not null then
    v_authorization := nullif(v_config->>'authorization', '');
    v_authorization_source := 'system_settings';
  end if;

  if nullif(current_setting('app.training_registration_notification_secret', true), '') is not null then
    v_secret := nullif(current_setting('app.training_registration_notification_secret', true), '');
    v_secret_source := 'db_setting';
  elsif nullif(v_config->>'sync_secret', '') is not null then
    v_secret := nullif(v_config->>'sync_secret', '');
    v_secret_source := 'system_settings';
  end if;

  return jsonb_build_object(
    'function_url', v_url,
    'authorization', v_authorization,
    'sync_secret', v_secret,
    'function_url_configured', v_url is not null,
    'function_url_source', v_url_source,
    'authorization_configured', v_authorization is not null,
    'authorization_source', v_authorization_source,
    'secret_configured', v_secret is not null,
    'secret_source', v_secret_source
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.has_due_training_registration_notifications(p_now timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with eligible_sessions as (
    select
      tss.id as session_id,
      tss.registration_start_at,
      tss.registration_end_at,
      tss.capacity,
      coalesce(selected_counts.selected_count, 0) as selected_count
    from public.training_session_settings tss
    join public.matches m
      on m.id = tss.match_id
    left join lateral (
      select count(*)::integer as selected_count
      from public.training_registrations tr
      where tr.session_id = tss.id
        and tr.status = 'selected'
    ) selected_counts on true
    where m.match_level = '特訓課'
      and tss.manual_status = 'open'
      and tss.registration_start_at is not null
      and tss.registration_start_at <= p_now
      and (
        tss.registration_end_at is null
        or tss.registration_end_at >= p_now
      )
  ),
  due_open as (
    select 1
    from eligible_sessions es
    where not exists (
      select 1
      from public.push_dispatch_events pde
      where pde.feature = 'training'
        and pde.action = 'VIEW'
        and pde.event_key = (
          'training_registration_open:'
          || es.session_id::text
          || ':'
          || (to_jsonb(es.registration_start_at)#>>'{}')
        )
    )
  ),
  due_deadline as (
    select 1
    from eligible_sessions es
    where es.registration_end_at is not null
      and es.registration_end_at > p_now
      and es.registration_end_at - p_now <= interval '24 hours'
      and (
        coalesce(es.capacity, 0) <= 0
        or es.selected_count < es.capacity
      )
      and not exists (
        select 1
        from public.push_dispatch_events pde
        where pde.feature = 'training'
          and pde.action = 'VIEW'
          and pde.event_key = (
            'training_registration_deadline:'
            || es.session_id::text
            || ':'
            || (to_jsonb(es.registration_end_at)#>>'{}')
          )
      )
  )
  select exists (
    select 1 from due_open
    union all
    select 1 from due_deadline
  );
$function$
;
