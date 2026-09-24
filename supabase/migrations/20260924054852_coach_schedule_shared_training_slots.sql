begin;

lock table public.training_location_sessions, public.training_location_session_venues,
  public.coach_schedule_events, public.coach_schedule_assignments in share row exclusive mode;

-- A physical lesson can contain players from several programs. Only a known venue,
-- the same day, start time and course title identify a shared lesson. End times may differ.
create or replace view private.coach_schedule_training_sources with (security_invoker = true) as
with normalized as (
  select s.id as source_id, sv.id as source_venue_id, sv.venue_id,
    coalesce(sv.training_date, s.training_date) as schedule_date,
    substring((coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), ''), '09:00'))::time::text, 1, 5) as start_time,
    substring((coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), ''), '12:30'))::time::text, 1, 5) as end_time,
    coalesce(nullif(btrim(sv.title), ''), nullif(btrim(s.title), ''), '場地訓練') as title,
    nullif(btrim(sv.venue_name), '') as location,
    nullif(btrim(sv.venue_maps_url), '') as location_url,
    coalesce(nullif(btrim(sv.note), ''), nullif(btrim(s.note), '')) as note,
    coalesce(s.status, 'draft') <> 'archived' as is_active,
    s.program_key, coalesce(p.label, s.program_key) as program_label,
    case when s.program_key = 'chunggang_school_team' then 0 else 1 end as program_order
  from public.training_location_sessions s
  join public.training_location_session_venues sv on sv.session_id = s.id
  left join public.training_program_settings p on p.program_key = s.program_key
)
select n.*, jsonb_build_array(schedule_date, venue_id, start_time, title,
  case when venue_id is null or not is_active then source_venue_id else null end)::text as slot_key
from normalized n;

create or replace view private.coach_schedule_training_slots with (security_invoker = true) as
select slot_key,
  (array_agg(source_id order by program_order, source_venue_id))[1] as source_id,
  (array_agg(source_venue_id order by program_order, source_venue_id))[1] as source_venue_id,
  array_agg(source_venue_id order by source_venue_id) as source_venue_ids,
  min(schedule_date) as schedule_date, min(start_time) as start_time, max(end_time) as end_time,
  min(title) as title,
  (array_agg(location order by program_order, source_venue_id))[1] as location,
  (array_agg(location_url order by program_order, source_venue_id))[1] as location_url,
  (array_agg(note order by program_order, source_venue_id))[1] as note,
  bool_or(is_active) as is_active,
  (array_agg(program_key order by program_order, source_venue_id))[1] as program_key,
  case when count(distinct program_key) > 1 then '合班｜' else '' end ||
    array_to_string(array(select x.program_label
      from private.coach_schedule_training_sources x where x.slot_key = n.slot_key
      group by x.program_label order by min(x.program_order), x.program_label), '、') as program_label
from private.coach_schedule_training_sources n group by slot_key;

revoke all on private.coach_schedule_training_sources, private.coach_schedule_training_slots from public, anon, authenticated;

alter table public.coach_schedule_events
  add column training_slot_key text,
  add column training_source_venue_ids uuid[] not null default '{}'::uuid[];

drop index public.coach_schedule_events_source_unique_idx;
create unique index coach_schedule_events_source_unique_idx
on public.coach_schedule_events (source_type, source_id, coalesce(source_venue_id, '00000000-0000-0000-0000-000000000000'::uuid))
where source_id is not null and source_type not in ('manual', 'training_location');
alter table public.coach_schedule_events add constraint coach_schedule_training_slot_unique
  unique (training_slot_key) deferrable initially immediate;

-- Preserve complete originals before merging records/duplicate assignments or removing
-- the final source. Private audit rows are not exposed through PostgREST or client RLS.
create table private.coach_schedule_merge_audit (
  id bigint generated always as identity primary key,
  target_event_id uuid,
  reason text not null,
  event_snapshot jsonb not null,
  assignment_snapshot jsonb not null,
  captured_at timestamptz not null default now()
);
alter table private.coach_schedule_merge_audit enable row level security;
revoke all on private.coach_schedule_merge_audit from public, anon, authenticated;

create or replace function private.lock_coach_training_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);
  return null;
end;
$$;
revoke all on function private.lock_coach_training_slots() from public, anon, authenticated;

-- Statement locks are taken before any source/event row locks, including concurrent saves.
create trigger coach_training_slots_lock before insert or update or delete on public.training_location_sessions
for each statement execute function private.lock_coach_training_slots();
create trigger coach_training_slots_lock before insert or update or delete on public.training_location_session_venues
for each statement execute function private.lock_coach_training_slots();
create trigger coach_training_slots_lock before insert or update or delete on public.coach_schedule_events
for each statement execute function private.lock_coach_training_slots();

drop trigger coach_schedule_cleanup_before_training_venue_delete on public.training_location_session_venues;
drop trigger coach_schedule_cleanup_before_training_session_delete on public.training_location_sessions;
drop trigger coach_schedule_sync_training_location_venue_after_change on public.training_location_session_venues;
drop trigger coach_schedule_sync_training_location_session_after_change on public.training_location_sessions;

create or replace function private.validate_coach_schedule_training_location_source()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_slot record;
begin
  if new.source_type <> 'training_location' then
    new.training_slot_key := null;
    new.training_source_venue_ids := '{}'::uuid[];
    return new;
  end if;
  select g.* into v_slot
  from private.coach_schedule_training_sources s
  join private.coach_schedule_training_slots g using (slot_key)
  where s.source_id = new.source_id and s.source_venue_id = new.source_venue_id;
  if not found then
    raise exception using errcode = '23503', message = '原場地配置已刪除或變更，請重新整理教練排班表。';
  end if;
  new.source_id := v_slot.source_id;
  new.source_venue_id := v_slot.source_venue_id;
  new.training_slot_key := v_slot.slot_key;
  new.training_source_venue_ids := v_slot.source_venue_ids;
  new.schedule_date := v_slot.schedule_date;
  new.start_time := v_slot.start_time;
  new.end_time := v_slot.end_time;
  new.title := v_slot.title;
  new.location := v_slot.location;
  new.location_url := v_slot.location_url;
  new.legacy_coaches := null;
  return new;
end;
$$;
revoke all on function private.validate_coach_schedule_training_location_source() from public, anon, authenticated;

create or replace function private.reconcile_coach_training_slots()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_targets jsonb;
  v_group record;
  v_ids uuid[];
  v_keep uuid;
  v_drop uuid;
  v_note text;
  v_status text;
begin
  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);
  set constraints public.coach_schedule_training_slot_unique deferred;
  -- Decide all destinations before mutating any row. A split keeps the original
  -- lesson's coaches; a moved source becomes an unassigned candidate, not a copied roster.
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'slot_key', dest.slot_key)), '[]')
  into v_targets
  from public.coach_schedule_events e
  left join lateral (
    select g.slot_key from private.coach_schedule_training_slots g
    where g.source_venue_ids && (e.training_source_venue_ids || array[e.source_venue_id])
    order by (g.slot_key = e.training_slot_key) desc nulls last,
      (e.source_venue_id = any(g.source_venue_ids)) desc, g.slot_key
    limit 1
  ) dest on true
  where e.source_type = 'training_location';

  for v_group in select t.slot_key, array_agg(t.id order by e.created_at, t.id) as ids
    from jsonb_to_recordset(v_targets) as t(id uuid, slot_key text)
    join public.coach_schedule_events e on e.id = t.id group by t.slot_key
  loop
    v_ids := v_group.ids;
    v_keep := v_ids[1];
    if v_group.slot_key is null or cardinality(v_ids) > 1 then
      insert into private.coach_schedule_merge_audit(target_event_id, reason, event_snapshot, assignment_snapshot)
      select case when v_group.slot_key is null then null else v_keep end,
        case when v_group.slot_key is null then 'last_source_deleted' else 'shared_training_merge' end,
        to_jsonb(e), coalesce((select jsonb_agg(to_jsonb(a) order by a.id)
          from public.coach_schedule_assignments a where a.event_id = e.id), '[]')
      from public.coach_schedule_events e where e.id = any(v_ids);
    end if;
    if v_group.slot_key is null then
      delete from public.coach_schedule_events where id = any(v_ids);
      continue;
    end if;
    select string_agg(distinct nullif(btrim(note), ''), E'\n' order by nullif(btrim(note), '')),
      case when bool_or(status = 'scheduled') then 'scheduled' else 'cancelled' end
    into v_note, v_status from public.coach_schedule_events where id = any(v_ids);
    foreach v_drop in array v_ids[2:cardinality(v_ids)] loop
      -- Duplicate coaches keep one assignment; retain both annotations and an audit snapshot.
      update public.coach_schedule_assignments keep
      set role_label = (select string_agg(distinct value, E'\n' order by value)
            from unnest(array[nullif(keep.role_label, ''), nullif(other.role_label, '')]) value),
          note = (select string_agg(distinct value, E'\n' order by value)
            from unnest(array[nullif(keep.note, ''), nullif(other.note, '')]) value)
      from public.coach_schedule_assignments other
      where keep.event_id = v_keep and other.event_id = v_drop
        and keep.coach_profile_id = other.coach_profile_id;
      delete from public.coach_schedule_assignments other using public.coach_schedule_assignments keep
      where other.event_id = v_drop and keep.event_id = v_keep
        and other.coach_profile_id = keep.coach_profile_id;
      update public.coach_schedule_assignments set event_id = v_keep where event_id = v_drop;
      delete from public.coach_schedule_events where id = v_drop;
    end loop;
    update public.coach_schedule_events e
    set source_id = g.source_id, source_venue_id = g.source_venue_id,
      note = case when cardinality(v_ids) > 1 then v_note else e.note end,
      status = v_status, updated_at = now()
    from private.coach_schedule_training_slots g
    where e.id = v_keep and g.slot_key = v_group.slot_key
      and (cardinality(v_ids) > 1 or
        row(e.source_id, e.source_venue_id, e.training_slot_key, e.training_source_venue_ids,
          e.schedule_date, e.start_time, e.end_time, e.title, e.location, e.location_url)
        is distinct from row(g.source_id, g.source_venue_id, g.slot_key, g.source_venue_ids,
          g.schedule_date, g.start_time, g.end_time, g.title, g.location, g.location_url));
  end loop;
  set constraints public.coach_schedule_training_slot_unique immediate;
end;
$$;
revoke all on function private.reconcile_coach_training_slots() from public, anon, authenticated;

create or replace function private.sync_coach_training_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.reconcile_coach_training_slots();
  return null;
end;
$$;
revoke all on function private.sync_coach_training_slots() from public, anon, authenticated;
create trigger coach_training_slots_sync after insert or update or delete on public.training_location_sessions
for each statement execute function private.sync_coach_training_slots();
create trigger coach_training_slots_sync after insert or update or delete on public.training_location_session_venues
for each statement execute function private.sync_coach_training_slots();

select private.reconcile_coach_training_slots();

-- Preserve admin/self visibility and use the same slot resolver for candidates and writes.
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
    select 'training_location'::text as source_type, g.source_id, g.source_venue_id,
      g.schedule_date, g.start_time, g.end_time, g.title, g.location, g.location_url,
      null::text as legacy_coaches, 'scheduled'::text as status, g.note, 10::integer as source_order
    from private.coach_schedule_training_slots g
    where g.is_active and g.schedule_date >= v_month_start and g.schedule_date < v_month_end
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
        'program_key', coalesce(slot.program_key, program.program_key),
        'program_label', coalesce(slot.program_label, program.label),
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
  left join private.coach_schedule_training_slots slot
    on er.source_type = 'training_location' and slot.source_venue_id = er.source_venue_id
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
        'program_key', coalesce(slot.program_key, program.program_key),
        'program_label', coalesce(slot.program_label, program.label),
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
  left join private.coach_schedule_training_slots slot
    on e.source_type = 'training_location' and slot.source_venue_id = e.source_venue_id
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
create or replace function public.save_coach_schedule_event(
  p_event jsonb,
  p_coach_profile_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid := nullif(p_event->>'id', '')::uuid;
  v_existing_id uuid;
  v_source_type text := nullif(btrim(coalesce(p_event->>'source_type', '')), '');
  v_source_id uuid := nullif(p_event->>'source_id', '')::uuid;
  v_source_venue_id uuid := nullif(p_event->>'source_venue_id', '')::uuid;
  v_schedule_date date := nullif(p_event->>'schedule_date', '')::date;
  v_start_time text := nullif(btrim(coalesce(p_event->>'start_time', '')), '');
  v_end_time text := nullif(btrim(coalesce(p_event->>'end_time', '')), '');
  v_title text := nullif(btrim(coalesce(p_event->>'title', '')), '');
  v_location text := nullif(btrim(coalesce(p_event->>'location', '')), '');
  v_location_url text := nullif(btrim(coalesce(p_event->>'location_url', '')), '');
  v_legacy_coaches text := nullif(btrim(coalesce(p_event->>'legacy_coaches', '')), '');
  v_status text := coalesce(nullif(btrim(coalesce(p_event->>'status', '')), ''), 'scheduled');
  v_note text := nullif(btrim(coalesce(p_event->>'note', '')), '');
  v_coach_ids uuid[];
  v_slot record;
  v_existing public.coach_schedule_events%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_source_type not in ('training_date', 'training_location', 'match', 'training_class', 'manual') then
    raise exception 'unsupported source_type';
  end if;

  if v_status not in ('scheduled', 'cancelled') then
    raise exception 'unsupported status';
  end if;

  if v_schedule_date is null then
    raise exception 'schedule_date is required';
  end if;

  if v_title is null then
    raise exception 'title is required';
  end if;

  select coalesce(array_agg(distinct coach_id), '{}'::uuid[])
  into v_coach_ids
  from unnest(coalesce(p_coach_profile_ids, '{}'::uuid[])) as coach_id
  where coach_id is not null;

  if exists (
    select 1
    from unnest(v_coach_ids) as input_coach_id(coach_id)
    left join public.profiles p on p.id = input_coach_id.coach_id
    where p.id is null
      or p.role not in ('HEAD_COACH', 'COACH')
      or not coalesce(p.is_active, true)
      or (p.access_start is not null and p.access_start > now())
      or (p.access_end is not null and p.access_end < now())
  ) then
    raise exception 'invalid coach profile';
  end if;

  -- Lock before lookup so two program sources cannot race to create separate events.
  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);
  if v_source_type = 'training_location' then
    select g.* into v_slot from private.coach_schedule_training_sources s
    join private.coach_schedule_training_slots g using (slot_key)
    where s.source_id = v_source_id and s.source_venue_id = v_source_venue_id;
    if not found then
      raise exception using errcode = '23503', message = '原場地配置已刪除或變更，請重新整理教練排班表。';
    end if;
    v_source_id := v_slot.source_id;
    v_source_venue_id := v_slot.source_venue_id;
  end if;

  if v_event_id is not null then
    select id into v_existing_id
    from public.coach_schedule_events
    where id = v_event_id
    for update;

    if v_existing_id is null then
      raise exception '排班已合併或刪除，請重新整理教練排班表。';
    end if;

    perform public.assert_coach_schedules_permission('EDIT');
  elsif v_source_type = 'training_date' then
    select id into v_existing_id
    from public.coach_schedule_events
    where source_type = 'training_date'
      and source_id is null
      and source_venue_id is null
      and schedule_date = v_schedule_date
    for update;

    if v_existing_id is null then
      perform public.assert_coach_schedules_permission('CREATE');
    else
      perform public.assert_coach_schedules_permission('EDIT');
    end if;
  elsif v_source_type <> 'manual' and v_source_id is not null then
    select id into v_existing_id
    from public.coach_schedule_events
    where source_type = v_source_type
      and source_id = v_source_id
      and coalesce(source_venue_id, '00000000-0000-0000-0000-000000000000'::uuid) =
        coalesce(v_source_venue_id, '00000000-0000-0000-0000-000000000000'::uuid)
    for update;

    if v_existing_id is null then
      perform public.assert_coach_schedules_permission('CREATE');
    else
      perform public.assert_coach_schedules_permission('EDIT');
    end if;
  else
    perform public.assert_coach_schedules_permission('CREATE');
  end if;

  if v_existing_id is not null and v_source_type = 'training_location' then
    select * into v_existing from public.coach_schedule_events where id = v_existing_id;
    if v_existing.training_slot_key is distinct from v_slot.slot_key then
      raise exception '場地配置已變更，請重新整理教練排班表。';
    end if;
    if nullif(p_event->>'updated_at', '') is not null
       and v_existing.updated_at <> (p_event->>'updated_at')::timestamptz then
      raise exception '排班已由其他操作更新，請重新整理後再儲存。';
    end if;
    -- Retrying an identical create is safe. A stale unassigned candidate must not
    -- replace coaches already saved through another program or browser.
    if v_event_id is null then
      if v_existing.status = v_status and v_existing.note is not distinct from v_note
        and v_coach_ids @> array(select coach_profile_id from public.coach_schedule_assignments where event_id = v_existing_id)
        and v_coach_ids <@ array(select coach_profile_id from public.coach_schedule_assignments where event_id = v_existing_id) then
        return v_existing_id;
      end if;
      raise exception '這場訓練已有教練排班，請重新整理後再更新。';
    end if;
  end if;

  if v_existing_id is null then
    insert into public.coach_schedule_events (
      source_type,
      source_id,
      source_venue_id,
      schedule_date,
      start_time,
      end_time,
      title,
      location,
      location_url,
      legacy_coaches,
      status,
      note,
      created_by,
      updated_by
    )
    values (
      v_source_type,
      v_source_id,
      v_source_venue_id,
      v_schedule_date,
      v_start_time,
      v_end_time,
      v_title,
      v_location,
      v_location_url,
      v_legacy_coaches,
      v_status,
      v_note,
      v_user_id,
      v_user_id
    )
    returning id into v_existing_id;
  else
    update public.coach_schedule_events
    set
      source_type = v_source_type,
      source_id = v_source_id,
      source_venue_id = v_source_venue_id,
      schedule_date = v_schedule_date,
      start_time = v_start_time,
      end_time = v_end_time,
      title = v_title,
      location = v_location,
      location_url = v_location_url,
      legacy_coaches = v_legacy_coaches,
      status = v_status,
      note = v_note,
      updated_by = v_user_id,
      updated_at = timezone('utc', now())
    where id = v_existing_id;
  end if;

  delete from public.coach_schedule_assignments
  where event_id = v_existing_id
    and not (coach_profile_id = any(v_coach_ids));

  insert into public.coach_schedule_assignments (
    event_id,
    coach_profile_id,
    created_by,
    updated_by
  )
  select
    v_existing_id,
    coach_id,
    v_user_id,
    v_user_id
  from unnest(v_coach_ids) as coach_id
  on conflict (event_id, coach_profile_id) do update
  set
    updated_by = excluded.updated_by,
    updated_at = timezone('utc', now());

  return v_existing_id;
end;
$$;


revoke all on function public.list_coach_schedule_admin_month(date), public.list_coach_schedule_dashboard(date),
  public.save_coach_schedule_event(jsonb, uuid[]) from public, anon;
grant execute on function public.list_coach_schedule_admin_month(date), public.list_coach_schedule_dashboard(date),
  public.save_coach_schedule_event(jsonb, uuid[]) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
