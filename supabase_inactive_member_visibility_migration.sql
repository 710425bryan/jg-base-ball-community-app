begin;

drop function if exists public.list_my_payment_members();

create or replace function public.list_my_payment_members()
returns table (
  member_id uuid,
  name text,
  role text,
  billing_mode text,
  is_linked boolean,
  balance_amount integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  return query
  select
    team_members.id,
    team_members.name::text,
    team_members.role::text,
    public.get_effective_payment_billing_mode(
      team_members.role::text,
      team_members.fee_billing_mode::text
    ) as billing_mode,
    team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) as is_linked,
    public.get_player_balance_unchecked(team_members.id) as balance_amount
  from public.profiles
  join public.team_members
    on (
      team_members.role in ('校隊', '球員')
      and coalesce(team_members.status, '在隊') not in ('退隊', '離隊')
      and coalesce(team_members.is_inactive_or_graduated, false) = false
      and (
        team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        or public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
      )
    )
  where profiles.id = v_user_id
  order by
    case when team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) then 0 else 1 end,
    case when team_members.role = '校隊' then 0 when team_members.fee_billing_mode = 'monthly_fixed' then 1 else 2 end,
    team_members.name asc;
end;
$$;

create or replace function public.list_my_leave_members()
returns table (
  member_id uuid,
  name text,
  role text,
  is_linked boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  return query
  select
    team_members.id,
    team_members.name::text,
    team_members.role::text,
    true as is_linked
  from public.profiles
  join public.team_members
    on team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  where profiles.id = v_user_id
    and coalesce(team_members.status, '在隊') not in ('退隊', '離隊')
    and coalesce(team_members.is_inactive_or_graduated, false) = false
  order by
    case
      when team_members.role = '校隊' then 0
      when team_members.role = '球員' then 1
      else 2
    end,
    team_members.name asc;
end;
$$;

create or replace function public.create_my_leave_requests(
  p_member_id uuid,
  p_records jsonb
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  leave_type text,
  start_date date,
  end_date date,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_name text;
  v_member_role text;
  v_record jsonb;
  v_leave_type text;
  v_start_date date;
  v_end_date date;
  v_reason text;
  v_inserted public.leave_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'records must be a non-empty array';
  end if;

  select team_members.name::text, team_members.role::text
  into v_member_name, v_member_role
  from public.team_members
  where team_members.id = p_member_id
    and coalesce(team_members.status, '在隊') not in ('退隊', '離隊')
    and coalesce(team_members.is_inactive_or_graduated, false) = false;

  if v_member_name is null then
    raise exception 'member not found or inactive';
  end if;

  for v_record in
    select value
    from jsonb_array_elements(p_records)
  loop
    v_leave_type := nullif(btrim(v_record ->> 'leave_type'), '');
    v_start_date := nullif(v_record ->> 'start_date', '')::date;
    v_end_date := coalesce(nullif(v_record ->> 'end_date', '')::date, v_start_date);
    v_reason := nullif(btrim(v_record ->> 'reason'), '');

    if v_leave_type is null then
      raise exception 'leave_type is required';
    end if;

    if v_start_date is null then
      raise exception 'start_date is required';
    end if;

    if v_end_date is null then
      raise exception 'end_date is required';
    end if;

    if v_end_date < v_start_date then
      raise exception 'end_date must be on or after start_date';
    end if;

    insert into public.leave_requests (
      user_id,
      leave_type,
      start_date,
      end_date,
      reason
    )
    values (
      p_member_id,
      v_leave_type,
      v_start_date,
      v_end_date,
      v_reason
    )
    returning *
    into v_inserted;

    id := v_inserted.id;
    member_id := p_member_id;
    member_name := v_member_name;
    member_role := v_member_role;
    leave_type := v_inserted.leave_type::text;
    start_date := v_inserted.start_date;
    end_date := v_inserted.end_date;
    reason := v_inserted.reason::text;
    created_at := v_inserted.created_at;

    return next;
  end loop;

  return;
end;
$$;

create or replace function public.get_dashboard_today_attendance_status(p_today date default current_date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, current_date);
  v_today_event_ids uuid[] := array[]::uuid[];
  v_today_events jsonb := '[]'::jsonb;
  v_today_event jsonb := null;
  v_leave_names jsonb := '[]'::jsonb;
  v_leave_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('leave_requests', 'VIEW') then
    raise exception 'leave_requests:VIEW permission required';
  end if;

  with ordered_events as (
    select
      ae.id,
      ae.title,
      ae.date,
      ae.event_type,
      ae.created_at,
      case
        when ae.training_session_id is not null or ae.event_type = '特訓課' then 0
        else 1
      end as sort_priority
    from public.attendance_events ae
    where ae.date = v_today
  ),
  event_payloads as (
    select
      oe.id,
      oe.title,
      oe.created_at,
      oe.sort_priority,
      jsonb_build_object(
        'id', oe.id,
        'title', oe.title,
        'date', oe.date,
        'eventType', oe.event_type
      ) as payload
    from ordered_events oe
  )
  select
    coalesce(array_agg(ep.id order by ep.sort_priority, ep.created_at asc, ep.title asc, ep.id asc), array[]::uuid[]),
    coalesce(jsonb_agg(ep.payload order by ep.sort_priority, ep.created_at asc, ep.title asc, ep.id asc), '[]'::jsonb),
    coalesce(jsonb_agg(ep.payload order by ep.sort_priority, ep.created_at asc, ep.title asc, ep.id asc), '[]'::jsonb)->0
  into v_today_event_ids, v_today_events, v_today_event
  from event_payloads ep;

  with leave_members as (
    select
      tm.id as member_id,
      coalesce(nullif(tm.name, ''), '未命名球員') as member_name
    from public.leave_requests lr
    join public.team_members tm
      on tm.id = lr.user_id
    where lr.start_date <= v_today
      and lr.end_date >= v_today
      and coalesce(tm.status, '在隊') not in ('退隊', '離隊')
      and coalesce(tm.is_inactive_or_graduated, false) = false

    union

    select
      tm.id as member_id,
      coalesce(nullif(tm.name, ''), '未命名球員') as member_name
    from public.attendance_records ar
    join public.team_members tm
      on tm.id = ar.member_id
    where ar.event_id = any(v_today_event_ids)
      and ar.status = '請假'
      and coalesce(tm.status, '在隊') not in ('退隊', '離隊')
      and coalesce(tm.is_inactive_or_graduated, false) = false
  ),
  leave_member_names as (
    select distinct on (member_id) member_name
    from leave_members
    order by member_id, member_name
  )
  select
    coalesce(jsonb_agg(member_name order by member_name), '[]'::jsonb),
    count(*)::integer
  into v_leave_names, v_leave_count
  from leave_member_names;

  return jsonb_build_object(
    'todayEvent', v_today_event,
    'todayEvents', v_today_events,
    'todayLeaveNames', v_leave_names,
    'todayLeaveCount', v_leave_count
  );
end;
$$;

revoke all on function public.list_my_payment_members() from public;
revoke all on function public.list_my_leave_members() from public;
revoke all on function public.create_my_leave_requests(uuid, jsonb) from public;
revoke all on function public.get_dashboard_today_attendance_status(date) from public;
grant execute on function public.list_my_payment_members() to authenticated, service_role;
grant execute on function public.list_my_leave_members() to authenticated, service_role;
grant execute on function public.create_my_leave_requests(uuid, jsonb) to authenticated, service_role;
grant execute on function public.get_dashboard_today_attendance_status(date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
