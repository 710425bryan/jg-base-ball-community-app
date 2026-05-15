begin;

alter table public.attendance_events
  add column if not exists training_location_session_id uuid,
  add column if not exists training_location_session_venue_id uuid;

alter table public.attendance_events
  drop constraint if exists attendance_events_training_location_session_id_fkey,
  drop constraint if exists attendance_events_training_location_session_venue_id_fkey;

alter table public.attendance_events
  add constraint attendance_events_training_location_session_id_fkey
    foreign key (training_location_session_id)
    references public.training_location_sessions(id)
    on delete set null,
  add constraint attendance_events_training_location_session_venue_id_fkey
    foreign key (training_location_session_venue_id)
    references public.training_location_session_venues(id)
    on delete cascade;

drop index if exists attendance_events_training_location_session_id_uidx;

create index if not exists attendance_events_training_location_session_idx
  on public.attendance_events (training_location_session_id)
  where training_location_session_id is not null;

create unique index if not exists attendance_events_training_location_session_venue_id_uidx
  on public.attendance_events (training_location_session_venue_id)
  where training_location_session_venue_id is not null;

drop function if exists public.create_training_location_attendance_event(uuid);
drop function if exists public.list_training_location_admin_sessions(date, date);

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
        'venue_name', sv.venue_name,
        'venue_address', sv.venue_address,
        'venue_maps_url', sv.venue_maps_url,
        'attendance_event_id', attendance_event.id,
        'sort_order', sv.sort_order,
        'note', sv.note,
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
            'is_on_leave', exists (
              select 1
              from public.leave_requests lr
              where lr.user_id = tm.id
                and lr.start_date <= s.training_date
                and coalesce(lr.end_date, lr.start_date) >= s.training_date
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

create or replace function public.sync_training_location_attendance_records(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_event record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('training_locations', 'EDIT')
    or public.has_app_permission('attendance', 'EDIT')
  ) then
    raise exception 'training_locations:EDIT or attendance:EDIT permission required';
  end if;

  select
    ae.training_location_session_id,
    ae.training_location_session_venue_id,
    s.id as session_id,
    s.title as session_title,
    s.training_date,
    sv.id as session_venue_id,
    sv.venue_name
  into v_event
  from public.attendance_events ae
  left join public.training_location_sessions s
    on s.id = ae.training_location_session_id
  left join public.training_location_session_venues sv
    on sv.id = ae.training_location_session_venue_id
  where ae.id = p_event_id;

  if v_event.session_id is null then
    return;
  end if;

  update public.attendance_events
  set title = case
        when v_event.session_venue_id is not null then concat(v_event.session_title, ' - ', v_event.venue_name, '點名')
        else concat(v_event.session_title, '點名')
      end,
      date = v_event.training_date,
      event_type = '練習'
  where id = p_event_id;

  delete from public.attendance_records ar
  where ar.event_id = p_event_id
    and not exists (
      select 1
      from public.training_location_assignments a
      where a.session_id = v_event.session_id
        and (
          v_event.session_venue_id is null
          or a.session_venue_id = v_event.session_venue_id
        )
        and a.member_id = ar.member_id
    );

  insert into public.attendance_records (
    event_id,
    member_id,
    status
  )
  select
    p_event_id,
    a.member_id,
    '待點名'
  from public.training_location_assignments a
  join public.team_members tm
    on tm.id = a.member_id
  where a.session_id = v_event.session_id
    and (
      v_event.session_venue_id is null
      or a.session_venue_id = v_event.session_venue_id
    )
    and tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('離隊', '退隊')
    and not exists (
      select 1
      from public.attendance_records ar
      where ar.event_id = p_event_id
        and ar.member_id = a.member_id
    );
end;
$$;

create or replace function public.save_training_location_session(
  p_session_id uuid,
  p_title text,
  p_training_date date,
  p_start_time text,
  p_end_time text,
  p_status text,
  p_note text,
  p_venues jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'draft');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_venues jsonb := coalesce(p_venues, '[]'::jsonb);
  v_venue jsonb;
  v_venue_id uuid;
  v_input_session_venue_id uuid;
  v_session_venue_id uuid;
  v_venue_name text;
  v_venue_address text;
  v_venue_maps_url text;
  v_member_id uuid;
  v_sort_order integer;
  v_kept_session_venue_ids uuid[] := '{}'::uuid[];
  v_attendance_event record;
begin
  if p_session_id is null then
    perform public.assert_training_locations_permission('CREATE');
  else
    perform public.assert_training_locations_permission('EDIT');
  end if;

  if v_title is null then
    raise exception 'title is required';
  end if;

  if p_training_date is null then
    raise exception 'training_date is required';
  end if;

  if v_status not in ('draft', 'published', 'archived') then
    raise exception 'unsupported status';
  end if;

  if v_status = 'published' and jsonb_array_length(v_venues) = 0 then
    raise exception 'published sessions require at least one venue';
  end if;

  if p_session_id is null then
    insert into public.training_location_sessions (
      title,
      training_date,
      start_time,
      end_time,
      status,
      note,
      created_by,
      updated_by
    )
    values (
      v_title,
      p_training_date,
      nullif(btrim(coalesce(p_start_time, '')), ''),
      nullif(btrim(coalesce(p_end_time, '')), ''),
      v_status,
      nullif(btrim(coalesce(p_note, '')), ''),
      v_user_id,
      v_user_id
    )
    returning id
    into v_session_id;
  else
    update public.training_location_sessions
    set title = v_title,
        training_date = p_training_date,
        start_time = nullif(btrim(coalesce(p_start_time, '')), ''),
        end_time = nullif(btrim(coalesce(p_end_time, '')), ''),
        status = v_status,
        note = nullif(btrim(coalesce(p_note, '')), ''),
        updated_by = v_user_id,
        updated_at = timezone('utc', now())
    where id = p_session_id
    returning id
    into v_session_id;

    if v_session_id is null then
      raise exception 'training location session not found';
    end if;
  end if;

  delete from public.training_location_assignments
  where session_id = v_session_id;

  for v_venue, v_sort_order in
    select value, ordinality::integer
    from jsonb_array_elements(v_venues) with ordinality
  loop
    v_session_venue_id := null;
    v_input_session_venue_id := nullif(v_venue ->> 'id', '')::uuid;
    v_venue_name := nullif(btrim(coalesce(v_venue ->> 'venue_name', v_venue ->> 'name', '')), '');
    v_venue_address := nullif(btrim(coalesce(v_venue ->> 'venue_address', v_venue ->> 'address', '')), '');
    v_venue_maps_url := nullif(btrim(coalesce(v_venue ->> 'venue_maps_url', v_venue ->> 'maps_url', '')), '');
    v_venue_id := nullif(v_venue ->> 'venue_id', '')::uuid;

    if v_venue_name is null then
      raise exception 'venue_name is required';
    end if;

    if v_venue_id is null then
      insert into public.training_venues (
        name,
        address,
        maps_url,
        sort_order,
        is_active,
        created_by,
        updated_at
      )
      values (
        v_venue_name,
        v_venue_address,
        v_venue_maps_url,
        v_sort_order * 10,
        true,
        v_user_id,
        timezone('utc', now())
      )
      on conflict (name) do update
        set address = coalesce(nullif(excluded.address, ''), public.training_venues.address),
            maps_url = coalesce(nullif(excluded.maps_url, ''), public.training_venues.maps_url),
            updated_at = timezone('utc', now())
      returning id
      into v_venue_id;
    end if;

    if v_input_session_venue_id is not null then
      update public.training_location_session_venues
      set venue_id = v_venue_id,
          venue_name = v_venue_name,
          venue_address = v_venue_address,
          venue_maps_url = v_venue_maps_url,
          sort_order = coalesce(nullif(v_venue ->> 'sort_order', '')::integer, v_sort_order * 10),
          note = nullif(btrim(coalesce(v_venue ->> 'note', '')), ''),
          updated_at = timezone('utc', now())
      where id = v_input_session_venue_id
        and session_id = v_session_id
      returning id
      into v_session_venue_id;
    end if;

    if v_session_venue_id is null then
      insert into public.training_location_session_venues (
        session_id,
        venue_id,
        venue_name,
        venue_address,
        venue_maps_url,
        sort_order,
        note
      )
      values (
        v_session_id,
        v_venue_id,
        v_venue_name,
        v_venue_address,
        v_venue_maps_url,
        coalesce(nullif(v_venue ->> 'sort_order', '')::integer, v_sort_order * 10),
        nullif(btrim(coalesce(v_venue ->> 'note', '')), '')
      )
      returning id
      into v_session_venue_id;
    end if;

    v_kept_session_venue_ids := array_append(v_kept_session_venue_ids, v_session_venue_id);

    for v_member_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_venue -> 'member_ids', '[]'::jsonb)) as member_value(value)
    loop
      if not exists (
        select 1
        from public.team_members tm
        where tm.id = v_member_id
          and tm.role in ('球員', '校隊')
          and coalesce(tm.status, '') not in ('離隊', '退隊')
      ) then
        raise exception 'member % is not an active player', v_member_id;
      end if;

      insert into public.training_location_assignments (
        session_id,
        session_venue_id,
        member_id,
        assigned_by
      )
      values (
        v_session_id,
        v_session_venue_id,
        v_member_id,
        v_user_id
      )
      on conflict (session_id, member_id) do update
        set session_venue_id = excluded.session_venue_id,
            assigned_by = excluded.assigned_by,
            updated_at = timezone('utc', now());
    end loop;
  end loop;

  delete from public.training_location_session_venues sv
  where sv.session_id = v_session_id
    and not (sv.id = any(v_kept_session_venue_ids));

  for v_attendance_event in
    select ae.id
    from public.attendance_events ae
    where ae.training_location_session_id = v_session_id
  loop
    perform public.sync_training_location_attendance_records(v_attendance_event.id);
  end loop;

  return v_session_id;
end;
$$;

create or replace function public.create_training_location_venue_attendance_event(p_session_venue_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_location record;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training_locations', 'EDIT') then
    raise exception 'training_locations:EDIT permission required';
  end if;

  if not public.has_app_permission('attendance', 'CREATE') then
    raise exception 'attendance:CREATE permission required';
  end if;

  select
    s.id as session_id,
    s.title,
    s.training_date,
    sv.id as session_venue_id,
    sv.venue_name
  into v_location
  from public.training_location_session_venues sv
  join public.training_location_sessions s
    on s.id = sv.session_id
  where sv.id = p_session_venue_id;

  if v_location.session_venue_id is null then
    raise exception 'training location venue not found';
  end if;

  if not exists (
    select 1
    from public.training_location_assignments a
    where a.session_venue_id = p_session_venue_id
  ) then
    raise exception 'training location venue requires at least one assigned member';
  end if;

  select id
  into v_event_id
  from public.attendance_events
  where training_location_session_venue_id = p_session_venue_id
  limit 1;

  if v_event_id is null then
    insert into public.attendance_events (
      title,
      date,
      event_type,
      created_by,
      training_location_session_id,
      training_location_session_venue_id
    )
    values (
      concat(v_location.title, ' - ', v_location.venue_name, '點名'),
      v_location.training_date,
      '練習',
      v_user_id,
      v_location.session_id,
      p_session_venue_id
    )
    returning id
    into v_event_id;
  end if;

  perform public.sync_training_location_attendance_records(v_event_id);

  return v_event_id;
end;
$$;

create or replace function public.list_training_location_attendance_members(p_event_id uuid)
returns table (
  id uuid,
  name text,
  avatar_url text,
  role text,
  jersey_number text,
  status text,
  team_group text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('attendance', 'VIEW') then
    raise exception 'attendance:VIEW permission required';
  end if;

  return query
  select
    tm.id,
    tm.name::text,
    tm.avatar_url::text,
    tm.role::text,
    tm.jersey_number::text,
    tm.status::text,
    tm.team_group::text
  from public.attendance_events ae
  join public.training_location_assignments a
    on a.session_id = ae.training_location_session_id
   and (
      (ae.training_location_session_venue_id is not null and a.session_venue_id = ae.training_location_session_venue_id)
      or (ae.training_location_session_venue_id is null and ae.training_location_session_id is not null)
   )
  join public.team_members_safe tm
    on tm.id = a.member_id
  where ae.id = p_event_id
    and ae.training_location_session_id is not null
  order by
    case when tm.role = '球員' then 0 when tm.role = '校隊' then 1 else 2 end,
    tm.team_group nulls last,
    tm.name;
end;
$$;

revoke all on function public.list_training_location_admin_sessions(date, date) from public;
revoke all on function public.list_training_location_admin_sessions(date, date) from anon;
grant execute on function public.list_training_location_admin_sessions(date, date) to authenticated, service_role;

revoke all on function public.save_training_location_session(uuid, text, date, text, text, text, text, jsonb) from public;
revoke all on function public.save_training_location_session(uuid, text, date, text, text, text, text, jsonb) from anon;
grant execute on function public.save_training_location_session(uuid, text, date, text, text, text, text, jsonb) to authenticated, service_role;

revoke all on function public.sync_training_location_attendance_records(uuid) from public;
revoke all on function public.sync_training_location_attendance_records(uuid) from anon;
revoke all on function public.sync_training_location_attendance_records(uuid) from authenticated;
grant execute on function public.sync_training_location_attendance_records(uuid) to service_role;

revoke all on function public.create_training_location_venue_attendance_event(uuid) from public;
revoke all on function public.create_training_location_venue_attendance_event(uuid) from anon;
grant execute on function public.create_training_location_venue_attendance_event(uuid) to authenticated, service_role;

revoke all on function public.list_training_location_attendance_members(uuid) from public;
revoke all on function public.list_training_location_attendance_members(uuid) from anon;
grant execute on function public.list_training_location_attendance_members(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
