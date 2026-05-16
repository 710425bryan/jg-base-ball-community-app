begin;

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

    union

    select
      tm.id as member_id,
      coalesce(nullif(tm.name, ''), '未命名球員') as member_name
    from public.attendance_records ar
    join public.team_members tm
      on tm.id = ar.member_id
    where ar.event_id = any(v_today_event_ids)
      and ar.status = '請假'
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

revoke all on function public.get_dashboard_today_attendance_status(date) from public;
grant execute on function public.get_dashboard_today_attendance_status(date) to authenticated, service_role;

commit;
