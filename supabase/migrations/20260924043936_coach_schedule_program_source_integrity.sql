begin;

-- Stabilize sources while repairing legacy links and installing delete guards.
lock table public.training_location_sessions, public.training_location_session_venues,
  public.coach_schedule_events in share row exclusive mode;

-- Preserve the existing RPC authorization and assignment visibility; add source program labels.
create or replace function public.list_coach_schedule_admin_month(p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := public.coach_schedule_month_start(p_month);
  v_month_end date := (public.coach_schedule_month_start(p_month) + interval '1 month')::date;
  v_zero_uuid constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_events jsonb;
begin
  perform public.assert_coach_schedules_permission('VIEW');

  with location_dates as (
    select distinct coalesce(sv.training_date, s.training_date)::date as schedule_date
    from public.training_location_sessions s
    join public.training_location_session_venues sv on sv.session_id = s.id
    where coalesce(sv.training_date, s.training_date)::date >= v_month_start
      and coalesce(sv.training_date, s.training_date)::date < v_month_end
      and coalesce(s.status, 'draft') <> 'archived'
  ),
  training_date_candidates as (
    select
      'training_date'::text as source_type,
      null::uuid as source_id,
      null::uuid as source_venue_id,
      date_value.value::date as schedule_date,
      '09:00'::text as start_time,
      '12:30'::text as end_time,
      '週六訓練'::text as title,
      '中港國小'::text as location,
      null::text as location_url,
      null::text as legacy_coaches,
      'scheduled'::text as status,
      null::text as note,
      30::integer as source_order
    from jsonb_array_elements_text(public.get_training_month_dates(v_month_start)->'training_dates') as date_value(value)
    where date_value.value::date >= v_month_start
      and date_value.value::date < v_month_end
      and not exists (
        select 1
        from location_dates ld
        where ld.schedule_date = date_value.value::date
      )
  ),
  location_candidates as (
    select
      'training_location'::text as source_type,
      s.id::uuid as source_id,
      sv.id::uuid as source_venue_id,
      coalesce(sv.training_date, s.training_date)::date as schedule_date,
      coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), ''), '09:00')::text as start_time,
      coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), ''), '12:30')::text as end_time,
      coalesce(
        nullif(btrim(sv.title), ''),
        nullif(btrim(s.title), ''),
        '場地訓練'
      )::text as title,
      nullif(btrim(sv.venue_name), '')::text as location,
      nullif(btrim(sv.venue_maps_url), '')::text as location_url,
      null::text as legacy_coaches,
      case when coalesce(s.status, 'draft') = 'archived' then 'cancelled' else 'scheduled' end::text as status,
      coalesce(nullif(btrim(sv.note), ''), nullif(btrim(s.note), ''))::text as note,
      10::integer as source_order
    from public.training_location_sessions s
    join public.training_location_session_venues sv on sv.session_id = s.id
    where coalesce(sv.training_date, s.training_date)::date >= v_month_start
      and coalesce(sv.training_date, s.training_date)::date < v_month_end
      and coalesce(s.status, 'draft') <> 'archived'
  ),
  match_candidates as (
    select
      case when m.match_level = '特訓課' then 'training_class' else 'match' end::text as source_type,
      m.id::uuid as source_id,
      null::uuid as source_venue_id,
      m.match_date::date as schedule_date,
      nullif(substring(nullif(m.match_time, '') from '([0-9]{1,2}:[0-5][0-9])'), '')::text as start_time,
      nullif(
        substring(nullif(m.match_time, '') from '[0-9]{1,2}:[0-5][0-9][[:space:]]*[-~－—–][[:space:]]*([0-9]{1,2}:[0-5][0-9])'),
        ''
      )::text as end_time,
      coalesce(
        nullif(btrim(m.match_name), ''),
        nullif(btrim(m.tournament_name), ''),
        nullif(btrim(m.opponent), ''),
        case when m.match_level = '特訓課' then '特訓課' else '比賽' end
      )::text as title,
      nullif(btrim(m.location), '')::text as location,
      null::text as location_url,
      nullif(btrim(m.coaches), '')::text as legacy_coaches,
      'scheduled'::text as status,
      nullif(btrim(m.note), '')::text as note,
      case when m.match_level = '特訓課' then 20 else 40 end::integer as source_order
    from public.matches m
    where m.match_date >= v_month_start
      and m.match_date < v_month_end
  ),
  candidates as (
    select * from location_candidates
    union all
    select * from match_candidates
    union all
    select * from training_date_candidates
  ),
  candidate_rows as (
    select
      e.id,
      e.created_at,
      e.updated_at,
      (e.id is not null) as is_persisted,
      true as is_candidate,
      c.source_order,
      c.source_type,
      c.source_id,
      c.source_venue_id,
      coalesce(e.schedule_date, c.schedule_date)::date as schedule_date,
      coalesce(nullif(btrim(e.start_time), ''), c.start_time)::text as start_time,
      coalesce(nullif(btrim(e.end_time), ''), c.end_time)::text as end_time,
      coalesce(nullif(btrim(e.title), ''), c.title)::text as title,
      coalesce(nullif(btrim(e.location), ''), c.location)::text as location,
      coalesce(nullif(btrim(e.location_url), ''), c.location_url)::text as location_url,
      coalesce(nullif(btrim(e.legacy_coaches), ''), c.legacy_coaches)::text as legacy_coaches,
      coalesce(nullif(btrim(e.status), ''), c.status)::text as status,
      coalesce(e.note, c.note)::text as note
    from candidates c
    left join public.coach_schedule_events e
      on e.source_type = c.source_type
      and (
        (
          c.source_type = 'training_date'
          and e.source_id is null
          and e.source_venue_id is null
          and e.schedule_date = c.schedule_date
        )
        or (
          c.source_type <> 'training_date'
          and e.source_id = c.source_id
          and coalesce(e.source_venue_id, v_zero_uuid) = coalesce(c.source_venue_id, v_zero_uuid)
        )
      )
  ),
  saved_rows as (
    select
      e.id,
      e.created_at,
      e.updated_at,
      true as is_persisted,
      false as is_candidate,
      case e.source_type
        when 'training_location' then 10
        when 'training_class' then 20
        when 'training_date' then 30
        when 'match' then 40
        else 90
      end as source_order,
      e.source_type,
      e.source_id,
      e.source_venue_id,
      e.schedule_date,
      e.start_time,
      e.end_time,
      e.title,
      e.location,
      e.location_url,
      e.legacy_coaches,
      e.status,
      e.note
    from public.coach_schedule_events e
    where e.schedule_date >= v_month_start
      and e.schedule_date < v_month_end
      and not exists (
        select 1
        from candidate_rows cr
        where cr.id = e.id
      )
  ),
  event_rows as (
    select * from candidate_rows
    union all
    select * from saved_rows
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', er.id,
        'is_persisted', er.is_persisted,
        'is_candidate', er.is_candidate,
        'source_type', er.source_type,
        'source_id', er.source_id,
        'source_venue_id', er.source_venue_id,
        'program_key', program.program_key,
        'program_label', program.label,
        'schedule_date', er.schedule_date,
        'start_time', er.start_time,
        'end_time', er.end_time,
        'title', er.title,
        'location', er.location,
        'location_url', er.location_url,
        'legacy_coaches', er.legacy_coaches,
        'status', er.status,
        'note', er.note,
        'created_at', er.created_at,
        'updated_at', er.updated_at,
        'coach_profile_ids', coalesce(
          (
            select jsonb_agg(a.coach_profile_id order by coalesce(p.nickname, p.name, p.email))
            from public.coach_schedule_assignments a
            join public.profiles p on p.id = a.coach_profile_id
            where er.id is not null
              and a.event_id = er.id
          ),
          '[]'::jsonb
        ),
        'assignments', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'event_id', a.event_id,
                'coach_profile_id', a.coach_profile_id,
                'coach_name', p.name,
                'coach_nickname', p.nickname,
                'coach_role', p.role,
                'coach_avatar_url', p.avatar_url,
                'role_label', a.role_label,
                'note', a.note
              )
              order by coalesce(p.nickname, p.name, p.email)
            )
            from public.coach_schedule_assignments a
            join public.profiles p on p.id = a.coach_profile_id
            where er.id is not null
              and a.event_id = er.id
          ),
          '[]'::jsonb
        )
      )
      order by er.schedule_date asc, coalesce(er.start_time, '23:59') asc, er.source_order asc, er.title asc
    ),
    '[]'::jsonb
  )
  into v_events
  from event_rows er
  left join public.training_location_sessions source_session
    on er.source_type = 'training_location' and source_session.id = er.source_id
  left join public.training_program_settings program
    on program.program_key = case
      when er.source_type = 'training_date' then 'chunggang_school_team'
      else source_session.program_key
    end;

  return jsonb_build_object(
    'month_start', v_month_start,
    'scope', 'admin',
    'events', coalesce(v_events, '[]'::jsonb)
  );
end;
$$;


create or replace function public.list_coach_schedule_dashboard(p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date := public.coach_schedule_month_start(p_month);
  v_month_end date := (public.coach_schedule_month_start(p_month) + interval '1 month')::date;
  v_role text;
  v_can_view boolean;
  v_events jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role::text
  into v_role
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  v_can_view := public.has_app_permission('coach_schedules', 'VIEW');

  if not v_can_view and coalesce(v_role, '') not in ('HEAD_COACH', 'COACH') then
    return jsonb_build_object(
      'month_start', v_month_start,
      'scope', 'none',
      'events', '[]'::jsonb
    );
  end if;

  with event_rows as (
    select e.*
    from public.coach_schedule_events e
    where e.schedule_date >= v_month_start
      and e.schedule_date < v_month_end
      and (
        v_can_view
        or exists (
          select 1
          from public.coach_schedule_assignments own_assignment
          where own_assignment.event_id = e.id
            and own_assignment.coach_profile_id = v_user_id
        )
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'is_persisted', true,
        'is_candidate', false,
        'source_type', e.source_type,
        'source_id', e.source_id,
        'source_venue_id', e.source_venue_id,
        'program_key', program.program_key,
        'program_label', program.label,
        'schedule_date', e.schedule_date,
        'start_time', e.start_time,
        'end_time', e.end_time,
        'title', e.title,
        'location', e.location,
        'location_url', e.location_url,
        'legacy_coaches', e.legacy_coaches,
        'status', e.status,
        'note', e.note,
        'created_at', e.created_at,
        'updated_at', e.updated_at,
        'coach_profile_ids', coalesce(
          (
            select jsonb_agg(a.coach_profile_id order by coalesce(p.nickname, p.name, p.email))
            from public.coach_schedule_assignments a
            join public.profiles p on p.id = a.coach_profile_id
            where a.event_id = e.id
              and (v_can_view or a.coach_profile_id = v_user_id)
          ),
          '[]'::jsonb
        ),
        'assignments', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'event_id', a.event_id,
                'coach_profile_id', a.coach_profile_id,
                'coach_name', p.name,
                'coach_nickname', p.nickname,
                'coach_role', p.role,
                'coach_avatar_url', p.avatar_url,
                'role_label', a.role_label,
                'note', a.note
              )
              order by coalesce(p.nickname, p.name, p.email)
            )
            from public.coach_schedule_assignments a
            join public.profiles p on p.id = a.coach_profile_id
            where a.event_id = e.id
              and (v_can_view or a.coach_profile_id = v_user_id)
          ),
          '[]'::jsonb
        )
      )
      order by e.schedule_date asc, coalesce(e.start_time, '23:59') asc, e.title asc
    ),
    '[]'::jsonb
  )
  into v_events
  from event_rows e
  left join public.training_location_sessions source_session
    on e.source_type = 'training_location' and source_session.id = e.source_id
  left join public.training_program_settings program
    on program.program_key = case
      when e.source_type = 'training_date' then 'chunggang_school_team'
      else source_session.program_key
    end;

  return jsonb_build_object(
    'month_start', v_month_start,
    'scope', case when v_can_view then 'all' else 'own' end,
    'events', coalesce(v_events, '[]'::jsonb)
  );
end;
$$;
-- Restore only unambiguous one-to-one replacements inside the SAME session.
-- Never merge by date/title across different programs or venues.
with replacements as (
  select e.id as event_id, sv.id as venue_id,
    count(*) over (partition by e.id) as event_matches,
    count(*) over (partition by sv.id) as venue_matches
  from public.coach_schedule_events e
  join public.training_location_sessions s on s.id = e.source_id
  join public.training_location_session_venues sv on sv.session_id = s.id
  where e.source_type = 'training_location'
    and not exists (
      select 1 from public.training_location_session_venues original
      where original.id = e.source_venue_id and original.session_id = e.source_id
    )
    and e.schedule_date = coalesce(sv.training_date, s.training_date)
    and e.title = coalesce(nullif(btrim(sv.title), ''), nullif(btrim(s.title), ''), '場地訓練')
    and e.location = nullif(btrim(sv.venue_name), '')
    and e.start_time = coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), ''), '09:00')
    and e.end_time = coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), ''), '12:30')
    and not exists (
      select 1 from public.coach_schedule_events occupied
      where occupied.source_type = 'training_location'
        and occupied.source_id = s.id and occupied.source_venue_id = sv.id
    )
)
update public.coach_schedule_events e
set source_venue_id = r.venue_id, updated_at = timezone('utc', now())
from replacements r
where e.id = r.event_id and r.event_matches = 1 and r.venue_matches = 1;

-- Existing unmatched history must not lose coaches, notes, dates or event IDs.
-- Retain the old IDs for traceability, but detach source semantics as manual.
update public.coach_schedule_events e
set source_type = 'manual', updated_at = timezone('utc', now())
where e.source_type = 'training_location'
  and not exists (
    select 1 from public.training_location_session_venues sv
    where sv.id = e.source_venue_id and sv.session_id = e.source_id
  );

create schema if not exists private;

create or replace function private.validate_coach_schedule_training_location_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source record;
begin
  if new.source_type <> 'training_location' then
    return new;
  end if;

  select coalesce(sv.training_date, s.training_date) as schedule_date,
    coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), ''), '09:00') as start_time,
    coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), ''), '12:30') as end_time,
    coalesce(nullif(btrim(sv.title), ''), nullif(btrim(s.title), ''), '場地訓練') as title,
    nullif(btrim(sv.venue_name), '') as location,
    nullif(btrim(sv.venue_maps_url), '') as location_url
  into v_source
  from public.training_location_sessions s
  join public.training_location_session_venues sv on sv.session_id = s.id
  where s.id = new.source_id and sv.id = new.source_venue_id
  for share of s, sv;

  if not found then
    raise exception using errcode = '23503',
      message = '原場地配置已刪除或變更，請重新整理教練排班表。';
  end if;

  -- Source fields are authoritative even if an old browser submits stale values.
  new.schedule_date := v_source.schedule_date;
  new.start_time := v_source.start_time;
  new.end_time := v_source.end_time;
  new.title := v_source.title;
  new.location := v_source.location;
  new.location_url := v_source.location_url;
  new.legacy_coaches := null;
  return new;
end;
$$;

revoke all on function private.validate_coach_schedule_training_location_source() from public, anon, authenticated;

drop trigger if exists coach_schedule_validate_training_location_source_before_write on public.coach_schedule_events;
create trigger coach_schedule_validate_training_location_source_before_write
before insert or update on public.coach_schedule_events
for each row execute function private.validate_coach_schedule_training_location_source();

create or replace function private.cleanup_coach_schedule_training_location_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'training_location_session_venues' then
    delete from public.coach_schedule_events e
    where e.source_type = 'training_location'
      and e.source_id = old.session_id and e.source_venue_id = old.id;
  else
    delete from public.coach_schedule_events e
    where e.source_type = 'training_location' and e.source_id = old.id;
  end if;
  return old;
end;
$$;

revoke all on function private.cleanup_coach_schedule_training_location_source() from public, anon, authenticated;

drop trigger if exists coach_schedule_cleanup_before_training_venue_delete on public.training_location_session_venues;
create trigger coach_schedule_cleanup_before_training_venue_delete
before delete on public.training_location_session_venues
for each row execute function private.cleanup_coach_schedule_training_location_source();

drop trigger if exists coach_schedule_cleanup_before_training_session_delete on public.training_location_sessions;
create trigger coach_schedule_cleanup_before_training_session_delete
before delete on public.training_location_sessions
for each row execute function private.cleanup_coach_schedule_training_location_source();

-- Refresh snapshots after relinking, retaining assignments, status and notes.
update public.coach_schedule_events
set updated_at = timezone('utc', now())
where source_type = 'training_location';

revoke all on function public.list_coach_schedule_admin_month(date) from public, anon;
grant execute on function public.list_coach_schedule_admin_month(date) to authenticated, service_role;
revoke all on function public.list_coach_schedule_dashboard(date) from public, anon;
grant execute on function public.list_coach_schedule_dashboard(date) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
