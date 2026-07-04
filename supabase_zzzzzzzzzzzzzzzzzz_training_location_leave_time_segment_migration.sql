begin;

create or replace function public.get_training_location_leave_event_time(
  p_start_time text,
  p_end_time text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_start_time text := nullif(btrim(coalesce(p_start_time, '')), '');
  v_end_time text := nullif(btrim(coalesce(p_end_time, '')), '');
  v_start_minutes integer;
  v_end_minutes integer;
begin
  if v_start_time is null and v_end_time is null then
    return '09:00 - 12:00';
  end if;

  if v_start_time is null then
    v_start_time := '09:00';
  end if;

  if v_end_time is null then
    return v_start_time;
  end if;

  v_start_minutes := public.extract_time_minutes(v_start_time, 1);
  v_end_minutes := public.extract_time_minutes(v_end_time, 1);

  if v_start_minutes is not null
    and v_end_minutes is not null
    and v_start_minutes < 720
    and v_end_minutes > 720
    and v_end_minutes <= 750
  then
    v_end_time := '12:00';
  end if;

  return concat_ws(' - ', v_start_time, v_end_time);
end;
$$;

create or replace function public.list_training_location_roster(p_training_date date)
returns table (
  member_id uuid,
  name text,
  role text,
  team_group text,
  jersey_number text,
  fee_billing_mode text,
  is_on_leave boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_training_date date := coalesce(p_training_date, (now() at time zone 'Asia/Taipei')::date);
begin
  perform public.assert_training_locations_permission('VIEW');

  return query
  select
    tm.id,
    tm.name::text,
    tm.role::text,
    tm.team_group::text,
    tm.jersey_number::text,
    tm.fee_billing_mode::text,
    exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = tm.id
        and public.leave_request_overlaps_event(
          lr.start_date,
          lr.end_date,
          lr.leave_time_segment,
          v_training_date,
          public.get_training_location_leave_event_time(null, null)
        )
    ) as is_on_leave
  from public.team_members_safe tm
  where tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('離隊', '退隊')
  order by
    case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
    tm.team_group nulls last,
    tm.name;
end;
$$;

create or replace function public.list_training_location_admin_sessions(
  p_from date default null,
  p_to date default null
)
returns table (
  session_id uuid,
  title text,
  training_date date,
  start_time text,
  end_time text,
  status text,
  note text,
  created_at timestamptz,
  updated_at timestamptz,
  venue_count integer,
  assignment_count integer,
  venues jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_from date := coalesce(p_from, (v_today - interval '14 days')::date);
  v_to date := coalesce(p_to, (v_today + interval '45 days')::date);
begin
  perform public.assert_training_locations_permission('VIEW');

  return query
  select
    s.id,
    s.title::text,
    s.training_date,
    s.start_time::text,
    s.end_time::text,
    s.status::text,
    s.note::text,
    s.created_at,
    s.updated_at,
    coalesce(venue_counts.venue_count, 0),
    coalesce(venue_counts.assignment_count, 0),
    coalesce(venue_rows.venues, '[]'::jsonb)
  from public.training_location_sessions s
  left join lateral (
    select
      count(distinct sv.id)::integer as venue_count,
      count(a.id)::integer as assignment_count
    from public.training_location_session_venues sv
    left join public.training_location_assignments a on a.session_venue_id = sv.id
    where sv.session_id = s.id
  ) venue_counts on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', sv.id,
        'venue_id', sv.venue_id,
        'title', coalesce(nullif(btrim(sv.title), ''), s.title),
        'training_date', coalesce(sv.training_date, s.training_date),
        'start_time', coalesce(nullif(btrim(sv.start_time), ''), s.start_time),
        'end_time', coalesce(nullif(btrim(sv.end_time), ''), s.end_time),
        'venue_name', sv.venue_name,
        'venue_address', sv.venue_address,
        'venue_maps_url', sv.venue_maps_url,
        'attendance_event_id', attendance_event.id,
        'sort_order', sv.sort_order,
        'note', coalesce(sv.note, s.note),
        'member_ids', coalesce(assignment_rows.member_ids, '[]'::jsonb),
        'assignments', coalesce(assignment_rows.assignments, '[]'::jsonb)
      )
      order by sv.sort_order asc, sv.created_at asc
    ) as venues
    from public.training_location_session_venues sv
    left join lateral (
      select ae.id
      from public.attendance_events ae
      where ae.training_location_session_venue_id = sv.id
      order by ae.created_at desc
      limit 1
    ) attendance_event on true
    left join lateral (
      select
        jsonb_agg(a.member_id order by tm.role, tm.name) as member_ids,
        jsonb_agg(
          jsonb_build_object(
            'member_id', tm.id,
            'name', tm.name,
            'role', tm.role,
            'team_group', tm.team_group,
            'jersey_number', tm.jersey_number,
            'fee_billing_mode', tm.fee_billing_mode,
            'is_on_leave', exists (
              select 1
              from public.leave_requests lr
              where lr.user_id = tm.id
                and public.leave_request_overlaps_event(
                  lr.start_date,
                  lr.end_date,
                  lr.leave_time_segment,
                  coalesce(sv.training_date, s.training_date),
                  public.get_training_location_leave_event_time(
                    coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), '')),
                    coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), ''))
                  )
                )
            )
          )
          order by tm.role, tm.name
        ) as assignments
      from public.training_location_assignments a
      join public.team_members_safe tm on tm.id = a.member_id
      where a.session_venue_id = sv.id
    ) assignment_rows on true
    where sv.session_id = s.id
  ) venue_rows on true
  where s.training_date between v_from and v_to
  order by s.training_date asc, coalesce(s.start_time, '23:59') asc, s.created_at desc;
end;
$$;

create or replace function public.list_my_week_training_locations(p_week_start date default null)
returns table (
  session_id uuid,
  member_id uuid,
  member_name text,
  title text,
  training_date date,
  start_time text,
  end_time text,
  venue_name text,
  venue_address text,
  venue_maps_url text,
  is_on_leave boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_week_start date := coalesce(
    p_week_start,
    (v_today - ((extract(isodow from v_today)::integer - 1) * interval '1 day'))::date
  );
  v_linked_ids uuid[] := '{}'::uuid[];
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.linked_team_member_ids, array[]::uuid[])
  into v_linked_ids
  from public.profiles p
  where p.id = v_user_id;

  return query
  select
    s.id,
    tm.id,
    tm.name::text,
    coalesce(nullif(btrim(sv.title), ''), s.title)::text,
    coalesce(sv.training_date, s.training_date),
    coalesce(nullif(btrim(sv.start_time), ''), s.start_time)::text,
    coalesce(nullif(btrim(sv.end_time), ''), s.end_time)::text,
    sv.venue_name::text,
    sv.venue_address::text,
    sv.venue_maps_url::text,
    exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = tm.id
        and public.leave_request_overlaps_event(
          lr.start_date,
          lr.end_date,
          lr.leave_time_segment,
          coalesce(sv.training_date, s.training_date),
          public.get_training_location_leave_event_time(
            coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), '')),
            coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), ''))
          )
        )
    ) as is_on_leave
  from public.training_location_assignments a
  join public.training_location_sessions s on s.id = a.session_id
  join public.training_location_session_venues sv on sv.id = a.session_venue_id
  join public.team_members_safe tm on tm.id = a.member_id
  where a.member_id = any(v_linked_ids)
    and s.status = 'published'
    and coalesce(sv.training_date, s.training_date) between v_week_start and (v_week_start + interval '6 days')::date
  order by coalesce(sv.training_date, s.training_date) asc,
    coalesce(nullif(btrim(sv.start_time), ''), s.start_time, '23:59') asc,
    tm.name;
end;
$$;

create or replace function public.list_training_location_notification_targets(
  p_target_date date,
  p_session_id uuid default null
)
returns table (
  user_id uuid,
  session_id uuid,
  session_updated_at timestamptz,
  member_id uuid,
  member_name text,
  title text,
  training_date date,
  start_time text,
  end_time text,
  venue_name text,
  venue_address text,
  venue_maps_url text,
  is_on_leave boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_date date := coalesce(p_target_date, ((now() at time zone 'Asia/Taipei')::date + 1));
begin
  return query
  select
    p.id,
    s.id,
    s.updated_at,
    tm.id,
    tm.name::text,
    coalesce(nullif(btrim(sv.title), ''), s.title)::text,
    coalesce(sv.training_date, s.training_date),
    coalesce(nullif(btrim(sv.start_time), ''), s.start_time)::text,
    coalesce(nullif(btrim(sv.end_time), ''), s.end_time)::text,
    sv.venue_name::text,
    sv.venue_address::text,
    sv.venue_maps_url::text,
    false as is_on_leave
  from public.training_location_assignments a
  join public.training_location_sessions s on s.id = a.session_id
  join public.training_location_session_venues sv on sv.id = a.session_venue_id
  join public.team_members tm on tm.id = a.member_id
  join public.profiles p on a.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
  where s.status = 'published'
    and (
      (p_session_id is not null and p_target_date is null)
      or coalesce(sv.training_date, s.training_date) = v_target_date
    )
    and (p_session_id is null or s.id = p_session_id)
    and coalesce(p.is_active, true) is not false
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now())
    and tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('退隊', '離隊')
    and not exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = a.member_id
        and public.leave_request_overlaps_event(
          lr.start_date,
          lr.end_date,
          lr.leave_time_segment,
          coalesce(sv.training_date, s.training_date),
          public.get_training_location_leave_event_time(
            coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), '')),
            coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), ''))
          )
        )
    )
  order by p.id,
    coalesce(sv.training_date, s.training_date),
    coalesce(nullif(btrim(sv.start_time), ''), s.start_time, '23:59'),
    tm.name;
end;
$$;

revoke all on function public.get_training_location_leave_event_time(text, text) from public;
revoke all on function public.get_training_location_leave_event_time(text, text) from anon;
revoke all on function public.list_training_location_roster(date) from public;
revoke all on function public.list_training_location_roster(date) from anon;
revoke all on function public.list_training_location_admin_sessions(date, date) from public;
revoke all on function public.list_training_location_admin_sessions(date, date) from anon;
revoke all on function public.list_my_week_training_locations(date) from public;
revoke all on function public.list_my_week_training_locations(date) from anon;
revoke all on function public.list_training_location_notification_targets(date, uuid) from public;
revoke all on function public.list_training_location_notification_targets(date, uuid) from anon;

grant execute on function public.get_training_location_leave_event_time(text, text) to authenticated, service_role;
grant execute on function public.list_training_location_roster(date) to authenticated, service_role;
grant execute on function public.list_training_location_admin_sessions(date, date) to authenticated, service_role;
grant execute on function public.list_my_week_training_locations(date) to authenticated, service_role;
grant execute on function public.list_training_location_notification_targets(date, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
