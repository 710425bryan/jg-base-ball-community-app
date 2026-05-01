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
  v_today_event_id uuid := null;
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

  select
    ae.id,
    jsonb_build_object(
      'id', ae.id,
      'title', ae.title,
      'date', ae.date,
      'eventType', ae.event_type
    )
  into v_today_event_id, v_today_event
  from public.attendance_events ae
  where ae.date = v_today
  order by
    case
      when ae.training_session_id is not null or ae.event_type = '特訓課' then 0
      else 1
    end,
    ae.created_at asc
  limit 1;

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
    where v_today_event_id is not null
      and ar.event_id = v_today_event_id
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
    'todayLeaveNames', v_leave_names,
    'todayLeaveCount', v_leave_count
  );
end;
$$;

revoke all on function public.get_dashboard_today_attendance_status(date) from public;
grant execute on function public.get_dashboard_today_attendance_status(date) to authenticated, service_role;

create or replace function public.get_public_landing_snapshot(p_today date default current_date)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with target_day as (
    select coalesce(p_today, current_date) as day
  ),
  upcoming_matches as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'match_name', m.match_name,
          'opponent', m.opponent,
          'match_date', m.match_date,
          'match_time', m.match_time,
          'location', m.location,
          'category_group', m.category_group
        )
        order by m.match_date asc, m.match_time asc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        matches.id,
        matches.match_name,
        matches.opponent,
        matches.match_date,
        matches.match_time,
        matches.location,
        matches.category_group
      from public.matches
      cross join target_day td
      where matches.match_date >= td.day
      order by matches.match_date asc, matches.match_time asc
      limit 3
    ) m
  ),
  recent_announcements as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'title', a.title,
          'content', a.content,
          'created_at', a.created_at,
          'is_pinned', a.is_pinned,
          'image_url', a.image_url
        )
        order by a.is_pinned desc, a.created_at desc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        ann.id,
        ann.title,
        ann.content,
        ann.created_at,
        ann.is_pinned,
        ann.image_url
      from public.announcements ann
      order by ann.is_pinned desc, ann.created_at desc
      limit 3
    ) a
  )
  select jsonb_build_object(
    'todayEvent', null,
    'todayLeaveNames', '[]'::jsonb,
    'todayLeaveCount', 0,
    'upcomingMatches', coalesce((select payload from upcoming_matches), '[]'::jsonb),
    'latestAnnouncements', coalesce((select payload from recent_announcements), '[]'::jsonb)
  );
$$;

revoke all on function public.get_public_landing_snapshot(date) from public;
grant execute on function public.get_public_landing_snapshot(date) to anon, authenticated, service_role;

commit;
