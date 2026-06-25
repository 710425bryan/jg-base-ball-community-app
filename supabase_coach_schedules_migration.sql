begin;

create table if not exists public.coach_schedule_events (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid,
  source_venue_id uuid,
  schedule_date date not null,
  start_time text,
  end_time text,
  title text not null,
  location text,
  location_url text,
  legacy_coaches text,
  status text not null default 'scheduled',
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint coach_schedule_events_source_type_check
    check (source_type in ('training_date', 'training_location', 'match', 'training_class', 'manual')),
  constraint coach_schedule_events_status_check
    check (status in ('scheduled', 'cancelled')),
  constraint coach_schedule_events_title_check
    check (length(btrim(title)) > 0)
);

create table if not exists public.coach_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.coach_schedule_events(id) on delete cascade,
  coach_profile_id uuid not null references public.profiles(id) on delete cascade,
  role_label text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint coach_schedule_assignments_event_coach_key unique (event_id, coach_profile_id)
);

create index if not exists coach_schedule_events_month_idx
  on public.coach_schedule_events (schedule_date, source_type, start_time);

create index if not exists coach_schedule_events_source_idx
  on public.coach_schedule_events (source_type, source_id, source_venue_id);

create unique index if not exists coach_schedule_events_source_unique_idx
  on public.coach_schedule_events (source_type, source_id, coalesce(source_venue_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where source_id is not null and source_type <> 'manual';

create unique index if not exists coach_schedule_events_training_date_unique_idx
  on public.coach_schedule_events (schedule_date)
  where source_type = 'training_date' and source_id is null and source_venue_id is null;

create index if not exists coach_schedule_assignments_coach_idx
  on public.coach_schedule_assignments (coach_profile_id, event_id);

create index if not exists coach_schedule_assignments_event_idx
  on public.coach_schedule_assignments (event_id);

insert into public.app_role_permissions (role_key, feature, action)
values
  ('ADMIN', 'coach_schedules', 'VIEW'),
  ('ADMIN', 'coach_schedules', 'CREATE'),
  ('ADMIN', 'coach_schedules', 'EDIT'),
  ('ADMIN', 'coach_schedules', 'DELETE')
on conflict (role_key, feature, action) do nothing;

alter table public.coach_schedule_events enable row level security;
alter table public.coach_schedule_assignments enable row level security;

drop policy if exists "coach_schedule_events_select_view_or_self" on public.coach_schedule_events;
create policy "coach_schedule_events_select_view_or_self"
  on public.coach_schedule_events
  for select
  using (
    public.has_app_permission('coach_schedules', 'VIEW')
    or exists (
      select 1
      from public.coach_schedule_assignments csa
      where csa.event_id = coach_schedule_events.id
        and csa.coach_profile_id = auth.uid()
    )
  );

drop policy if exists "coach_schedule_events_insert_create" on public.coach_schedule_events;
create policy "coach_schedule_events_insert_create"
  on public.coach_schedule_events
  for insert
  with check (public.has_app_permission('coach_schedules', 'CREATE'));

drop policy if exists "coach_schedule_events_update_edit" on public.coach_schedule_events;
create policy "coach_schedule_events_update_edit"
  on public.coach_schedule_events
  for update
  using (public.has_app_permission('coach_schedules', 'EDIT'))
  with check (public.has_app_permission('coach_schedules', 'EDIT'));

drop policy if exists "coach_schedule_events_delete_delete" on public.coach_schedule_events;
create policy "coach_schedule_events_delete_delete"
  on public.coach_schedule_events
  for delete
  using (public.has_app_permission('coach_schedules', 'DELETE'));

drop policy if exists "coach_schedule_assignments_select_view_or_self" on public.coach_schedule_assignments;
create policy "coach_schedule_assignments_select_view_or_self"
  on public.coach_schedule_assignments
  for select
  using (
    public.has_app_permission('coach_schedules', 'VIEW')
    or coach_profile_id = auth.uid()
  );

drop policy if exists "coach_schedule_assignments_insert_create" on public.coach_schedule_assignments;
create policy "coach_schedule_assignments_insert_create"
  on public.coach_schedule_assignments
  for insert
  with check (public.has_app_permission('coach_schedules', 'CREATE'));

drop policy if exists "coach_schedule_assignments_update_edit" on public.coach_schedule_assignments;
create policy "coach_schedule_assignments_update_edit"
  on public.coach_schedule_assignments
  for update
  using (public.has_app_permission('coach_schedules', 'EDIT'))
  with check (public.has_app_permission('coach_schedules', 'EDIT'));

drop policy if exists "coach_schedule_assignments_delete_delete" on public.coach_schedule_assignments;
create policy "coach_schedule_assignments_delete_delete"
  on public.coach_schedule_assignments
  for delete
  using (
    public.has_app_permission('coach_schedules', 'DELETE')
    or public.has_app_permission('coach_schedules', 'EDIT')
  );

grant select, insert, update, delete on public.coach_schedule_events to authenticated, service_role;
grant select, insert, update, delete on public.coach_schedule_assignments to authenticated, service_role;

create or replace function public.assert_coach_schedules_permission(p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('coach_schedules', p_action) then
    raise exception 'coach_schedules:% permission required', p_action;
  end if;
end;
$$;

create or replace function public.coach_schedule_month_start(p_month date default null)
returns date
language sql
stable
set search_path = public
as $$
  select date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
$$;

create or replace function public.list_schedulable_coaches()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_coach_schedules_permission('VIEW');

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'nickname', p.nickname,
          'role', p.role,
          'avatar_url', p.avatar_url
        )
        order by
          case p.role when 'HEAD_COACH' then 0 when 'COACH' then 1 else 9 end,
          coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.name), ''), p.email)
      )
      from public.profiles p
      where (
          upper(btrim(coalesce(p.role, ''))) in ('HEAD_COACH', 'COACH')
          or btrim(coalesce(p.role, '')) in ('總教練', '教練')
        )
        and coalesce(p.is_active, true)
        and (p.access_start is null or p.access_start <= now())
        and (p.access_end is null or p.access_end >= now())
    ),
    '[]'::jsonb
  );
end;
$$;

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
  from event_rows er;

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
  from event_rows e;

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
      or (
        upper(btrim(coalesce(p.role, ''))) not in ('HEAD_COACH', 'COACH')
        and btrim(coalesce(p.role, '')) not in ('總教練', '教練')
      )
      or not coalesce(p.is_active, true)
      or (p.access_start is not null and p.access_start > now())
      or (p.access_end is not null and p.access_end < now())
  ) then
    raise exception 'invalid coach profile';
  end if;

  if v_event_id is not null then
    select id into v_existing_id
    from public.coach_schedule_events
    where id = v_event_id
    for update;

    if v_existing_id is null then
      raise exception 'coach schedule event not found';
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

create or replace function public.delete_coach_schedule_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_coach_schedules_permission('DELETE');

  if p_event_id is null then
    raise exception 'event_id is required';
  end if;

  delete from public.coach_schedule_events
  where id = p_event_id;
end;
$$;

revoke all on function public.assert_coach_schedules_permission(text) from public;
revoke all on function public.assert_coach_schedules_permission(text) from anon;
grant execute on function public.assert_coach_schedules_permission(text) to authenticated, service_role;

revoke all on function public.coach_schedule_month_start(date) from public;
revoke all on function public.coach_schedule_month_start(date) from anon;
grant execute on function public.coach_schedule_month_start(date) to authenticated, service_role;

revoke all on function public.list_schedulable_coaches() from public;
revoke all on function public.list_schedulable_coaches() from anon;
grant execute on function public.list_schedulable_coaches() to authenticated, service_role;

revoke all on function public.list_coach_schedule_admin_month(date) from public;
revoke all on function public.list_coach_schedule_admin_month(date) from anon;
grant execute on function public.list_coach_schedule_admin_month(date) to authenticated, service_role;

revoke all on function public.list_coach_schedule_dashboard(date) from public;
revoke all on function public.list_coach_schedule_dashboard(date) from anon;
grant execute on function public.list_coach_schedule_dashboard(date) to authenticated, service_role;

revoke all on function public.save_coach_schedule_event(jsonb, uuid[]) from public;
revoke all on function public.save_coach_schedule_event(jsonb, uuid[]) from anon;
grant execute on function public.save_coach_schedule_event(jsonb, uuid[]) to authenticated, service_role;

revoke all on function public.delete_coach_schedule_event(uuid) from public;
revoke all on function public.delete_coach_schedule_event(uuid) from anon;
grant execute on function public.delete_coach_schedule_event(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
