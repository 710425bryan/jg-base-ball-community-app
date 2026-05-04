begin;

create table if not exists public.training_venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  maps_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_venues_name_key unique (name),
  constraint training_venues_name_check check (length(btrim(name)) > 0)
);

create table if not exists public.training_location_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  training_date date not null,
  start_time text,
  end_time text,
  status text not null default 'draft',
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_location_sessions_title_check check (length(btrim(title)) > 0),
  constraint training_location_sessions_status_check check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.training_location_session_venues (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_location_sessions(id) on delete cascade,
  venue_id uuid references public.training_venues(id) on delete set null,
  venue_name text not null,
  venue_address text,
  venue_maps_url text,
  sort_order integer not null default 0,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_location_session_venues_name_check check (length(btrim(venue_name)) > 0)
);

create table if not exists public.training_location_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_location_sessions(id) on delete cascade,
  session_venue_id uuid not null references public.training_location_session_venues(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_location_assignments_session_member_key unique (session_id, member_id)
);

do $$
declare
  v_session_attnum smallint;
  v_session_venue_attnum smallint;
  v_constraint_name text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_location_assignments'
      and column_name = 'location_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_location_assignments'
      and column_name = 'session_venue_id'
  ) then
    alter table public.training_location_assignments
      rename column location_id to session_venue_id;
  end if;

  alter table public.training_location_assignments
    alter column id set default gen_random_uuid(),
    add column if not exists session_venue_id uuid,
    add column if not exists assigned_by uuid references public.profiles(id) on delete set null,
    add column if not exists created_at timestamptz not null default timezone('utc', now()),
    add column if not exists updated_at timestamptz not null default timezone('utc', now());

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_location_assignments'
      and column_name = 'registration_id'
  ) then
    alter table public.training_location_assignments
      alter column registration_id drop not null;
  end if;

  select attnum::smallint
  into v_session_attnum
  from pg_attribute
  where attrelid = 'public.training_location_assignments'::regclass
    and attname = 'session_id'
    and not attisdropped;

  select attnum::smallint
  into v_session_venue_attnum
  from pg_attribute
  where attrelid = 'public.training_location_assignments'::regclass
    and attname = 'session_venue_id'
    and not attisdropped;

  for v_constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and contype = 'f'
      and conkey = array[v_session_attnum]::smallint[]
      and confrelid <> 'public.training_location_sessions'::regclass
  loop
    execute format('alter table public.training_location_assignments drop constraint %I', v_constraint_name);
  end loop;

  for v_constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and contype = 'f'
      and conkey = array[v_session_venue_attnum]::smallint[]
      and confrelid <> 'public.training_location_session_venues'::regclass
  loop
    execute format('alter table public.training_location_assignments drop constraint %I', v_constraint_name);
  end loop;

  if not exists (
    select 1
    from public.training_location_assignments
    where session_venue_id is null
  ) then
    alter table public.training_location_assignments
      alter column session_venue_id set not null;
  end if;

  if v_session_venue_attnum is not null and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and contype = 'f'
      and conkey = array[v_session_venue_attnum]::smallint[]
      and confrelid = 'public.training_location_session_venues'::regclass
  ) then
    alter table public.training_location_assignments
      add constraint training_location_assignments_session_venue_id_fkey
      foreign key (session_venue_id)
      references public.training_location_session_venues(id)
      on delete cascade
      not valid;
  end if;

  if v_session_attnum is not null and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and contype = 'f'
      and conkey = array[v_session_attnum]::smallint[]
      and confrelid = 'public.training_location_sessions'::regclass
  ) then
    alter table public.training_location_assignments
      add constraint training_location_assignments_session_id_fkey
      foreign key (session_id)
      references public.training_location_sessions(id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and conname = 'training_location_assignments_session_member_key'
  ) then
    alter table public.training_location_assignments
      add constraint training_location_assignments_session_member_key
      unique (session_id, member_id);
  end if;
end;
$$;

create index if not exists training_location_sessions_date_status_idx
  on public.training_location_sessions (training_date, status, updated_at desc);

create index if not exists training_location_session_venues_session_idx
  on public.training_location_session_venues (session_id, sort_order);

create index if not exists training_location_assignments_session_idx
  on public.training_location_assignments (session_id);

create index if not exists training_location_assignments_session_venue_idx
  on public.training_location_assignments (session_venue_id);

create index if not exists training_location_assignments_member_idx
  on public.training_location_assignments (member_id);

alter table public.push_dispatch_events
  add column if not exists body text;

alter table public.push_dispatch_events
  add column if not exists match_id uuid;

alter table public.push_dispatch_events
  add column if not exists target_user_id uuid references public.profiles(id) on delete cascade;

alter table public.push_dispatch_events
  add column if not exists target_member_ids uuid[];

create index if not exists idx_push_dispatch_events_target_user
  on public.push_dispatch_events (target_user_id, created_at desc)
  where target_user_id is not null;

create index if not exists idx_push_dispatch_events_training_locations
  on public.push_dispatch_events (created_at desc)
  where feature = 'training_locations';

insert into public.training_venues (name, address, sort_order)
values
  ('中港國小', '新北市新莊區中港路', 10),
  ('輔大棒球場地', '新北市新莊區中正路510號', 20)
on conflict (name) do update
set
  address = coalesce(public.training_venues.address, excluded.address),
  sort_order = least(public.training_venues.sort_order, excluded.sort_order),
  updated_at = timezone('utc', now());

insert into public.app_role_permissions (role_key, feature, action)
values
  ('ADMIN', 'training_locations', 'VIEW'),
  ('ADMIN', 'training_locations', 'CREATE'),
  ('ADMIN', 'training_locations', 'EDIT'),
  ('ADMIN', 'training_locations', 'DELETE')
on conflict (role_key, feature, action) do nothing;

alter table public.training_venues enable row level security;
alter table public.training_location_sessions enable row level security;
alter table public.training_location_session_venues enable row level security;
alter table public.training_location_assignments enable row level security;

drop policy if exists "training_venues_select_view" on public.training_venues;
create policy "training_venues_select_view"
  on public.training_venues
  for select
  using (public.has_app_permission('training_locations', 'VIEW'));

drop policy if exists "training_venues_insert_create" on public.training_venues;
create policy "training_venues_insert_create"
  on public.training_venues
  for insert
  with check (public.has_app_permission('training_locations', 'CREATE'));

drop policy if exists "training_venues_update_edit" on public.training_venues;
create policy "training_venues_update_edit"
  on public.training_venues
  for update
  using (public.has_app_permission('training_locations', 'EDIT'))
  with check (public.has_app_permission('training_locations', 'EDIT'));

drop policy if exists "training_venues_delete_delete" on public.training_venues;
create policy "training_venues_delete_delete"
  on public.training_venues
  for delete
  using (public.has_app_permission('training_locations', 'DELETE'));

drop policy if exists "training_location_sessions_select_view" on public.training_location_sessions;
create policy "training_location_sessions_select_view"
  on public.training_location_sessions
  for select
  using (public.has_app_permission('training_locations', 'VIEW'));

drop policy if exists "training_location_sessions_insert_create" on public.training_location_sessions;
create policy "training_location_sessions_insert_create"
  on public.training_location_sessions
  for insert
  with check (public.has_app_permission('training_locations', 'CREATE'));

drop policy if exists "training_location_sessions_update_edit" on public.training_location_sessions;
create policy "training_location_sessions_update_edit"
  on public.training_location_sessions
  for update
  using (public.has_app_permission('training_locations', 'EDIT'))
  with check (public.has_app_permission('training_locations', 'EDIT'));

drop policy if exists "training_location_sessions_delete_delete" on public.training_location_sessions;
create policy "training_location_sessions_delete_delete"
  on public.training_location_sessions
  for delete
  using (public.has_app_permission('training_locations', 'DELETE'));

drop policy if exists "training_location_session_venues_select_view" on public.training_location_session_venues;
create policy "training_location_session_venues_select_view"
  on public.training_location_session_venues
  for select
  using (public.has_app_permission('training_locations', 'VIEW'));

drop policy if exists "training_location_session_venues_insert_create" on public.training_location_session_venues;
create policy "training_location_session_venues_insert_create"
  on public.training_location_session_venues
  for insert
  with check (public.has_app_permission('training_locations', 'CREATE') or public.has_app_permission('training_locations', 'EDIT'));

drop policy if exists "training_location_session_venues_update_edit" on public.training_location_session_venues;
create policy "training_location_session_venues_update_edit"
  on public.training_location_session_venues
  for update
  using (public.has_app_permission('training_locations', 'EDIT'))
  with check (public.has_app_permission('training_locations', 'EDIT'));

drop policy if exists "training_location_session_venues_delete_delete" on public.training_location_session_venues;
create policy "training_location_session_venues_delete_delete"
  on public.training_location_session_venues
  for delete
  using (public.has_app_permission('training_locations', 'DELETE') or public.has_app_permission('training_locations', 'EDIT'));

drop policy if exists "training_location_assignments_select_view" on public.training_location_assignments;
create policy "training_location_assignments_select_view"
  on public.training_location_assignments
  for select
  using (public.has_app_permission('training_locations', 'VIEW'));

drop policy if exists "training_location_assignments_insert_create" on public.training_location_assignments;
create policy "training_location_assignments_insert_create"
  on public.training_location_assignments
  for insert
  with check (public.has_app_permission('training_locations', 'CREATE') or public.has_app_permission('training_locations', 'EDIT'));

drop policy if exists "training_location_assignments_update_edit" on public.training_location_assignments;
create policy "training_location_assignments_update_edit"
  on public.training_location_assignments
  for update
  using (public.has_app_permission('training_locations', 'EDIT'))
  with check (public.has_app_permission('training_locations', 'EDIT'));

drop policy if exists "training_location_assignments_delete_delete" on public.training_location_assignments;
create policy "training_location_assignments_delete_delete"
  on public.training_location_assignments
  for delete
  using (public.has_app_permission('training_locations', 'DELETE') or public.has_app_permission('training_locations', 'EDIT'));

grant select, insert, update, delete on public.training_venues to authenticated, service_role;
grant select, insert, update, delete on public.training_location_sessions to authenticated, service_role;
grant select, insert, update, delete on public.training_location_session_venues to authenticated, service_role;
grant select, insert, update, delete on public.training_location_assignments to authenticated, service_role;

create or replace function public.assert_training_locations_permission(p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training_locations', p_action) then
    raise exception 'training_locations:% permission required', p_action;
  end if;
end;
$$;

create or replace function public.list_training_venues()
returns table (
  id uuid,
  name text,
  address text,
  maps_url text,
  sort_order integer,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_training_locations_permission('VIEW');

  return query
  select
    tv.id,
    tv.name::text,
    tv.address::text,
    tv.maps_url::text,
    tv.sort_order,
    tv.is_active
  from public.training_venues tv
  where tv.is_active
  order by tv.sort_order asc, tv.name asc;
end;
$$;

create or replace function public.upsert_training_venue(
  p_id uuid,
  p_name text,
  p_address text default null,
  p_maps_url text default null,
  p_is_active boolean default true,
  p_sort_order integer default 0
)
returns public.training_venues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_venue public.training_venues%rowtype;
begin
  if p_id is null then
    perform public.assert_training_locations_permission('CREATE');
  else
    perform public.assert_training_locations_permission('EDIT');
  end if;

  if v_name is null then
    raise exception 'venue name is required';
  end if;

  insert into public.training_venues (
    id,
    name,
    address,
    maps_url,
    is_active,
    sort_order,
    created_by,
    updated_at
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    v_name,
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_maps_url, '')), ''),
    coalesce(p_is_active, true),
    coalesce(p_sort_order, 0),
    v_user_id,
    timezone('utc', now())
  )
  on conflict (id) do update
    set name = excluded.name,
        address = excluded.address,
        maps_url = excluded.maps_url,
        is_active = excluded.is_active,
        sort_order = excluded.sort_order,
        updated_at = timezone('utc', now())
  returning *
  into v_venue;

  return v_venue;
end;
$$;

create or replace function public.list_training_location_roster(p_training_date date)
returns table (
  member_id uuid,
  name text,
  role text,
  team_group text,
  jersey_number text,
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
    exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = tm.id
        and lr.start_date <= v_training_date
        and coalesce(lr.end_date, lr.start_date) >= v_training_date
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
        'venue_name', sv.venue_name,
        'venue_address', sv.venue_address,
        'venue_maps_url', sv.venue_maps_url,
        'sort_order', sv.sort_order,
        'note', sv.note,
        'member_ids', coalesce(assignment_rows.member_ids, '[]'::jsonb),
        'assignments', coalesce(assignment_rows.assignments, '[]'::jsonb)
      )
      order by sv.sort_order asc, sv.created_at asc
    ) as venues
    from public.training_location_session_venues sv
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
  v_session_venue_id uuid;
  v_venue_name text;
  v_venue_address text;
  v_venue_maps_url text;
  v_member_id uuid;
  v_sort_order integer;
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

    delete from public.training_location_session_venues
    where session_id = v_session_id;
  end if;

  for v_venue, v_sort_order in
    select value, ordinality::integer
    from jsonb_array_elements(v_venues) with ordinality
  loop
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

  return v_session_id;
end;
$$;

create or replace function public.publish_training_location_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_training_locations_permission('EDIT');

  if not exists (
    select 1
    from public.training_location_session_venues sv
    where sv.session_id = p_session_id
  ) then
    raise exception 'published sessions require at least one venue';
  end if;

  update public.training_location_sessions
  set status = 'published',
      updated_by = auth.uid(),
      updated_at = timezone('utc', now())
  where id = p_session_id;

  if not found then
    raise exception 'training location session not found';
  end if;
end;
$$;

create or replace function public.delete_training_location_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_training_locations_permission('DELETE');

  delete from public.training_location_sessions
  where id = p_session_id;
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
    s.title::text,
    s.training_date,
    s.start_time::text,
    s.end_time::text,
    sv.venue_name::text,
    sv.venue_address::text,
    sv.venue_maps_url::text,
    exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = tm.id
        and lr.start_date <= s.training_date
        and coalesce(lr.end_date, lr.start_date) >= s.training_date
    ) as is_on_leave
  from public.training_location_assignments a
  join public.training_location_sessions s on s.id = a.session_id
  join public.training_location_session_venues sv on sv.id = a.session_venue_id
  join public.team_members_safe tm on tm.id = a.member_id
  where a.member_id = any(v_linked_ids)
    and s.status = 'published'
    and s.training_date between v_week_start and (v_week_start + interval '6 days')::date
  order by s.training_date asc, coalesce(s.start_time, '23:59') asc, tm.name;
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
    s.title::text,
    s.training_date,
    s.start_time::text,
    s.end_time::text,
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
    and s.training_date = v_target_date
    and (p_session_id is null or s.id = p_session_id)
    and coalesce(p.is_active, true) is not false
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now())
    and tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('離隊', '退隊')
    and not exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = a.member_id
        and lr.start_date <= s.training_date
        and coalesce(lr.end_date, lr.start_date) >= s.training_date
    )
  order by p.id, s.training_date, coalesce(s.start_time, '23:59'), tm.name;
end;
$$;

drop function if exists public.get_notification_feed(integer);

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
          when pde.match_id is not null then format('/match-records?match_id=%s', pde.match_id::text)
          else '/match-records'
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
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'training'
      and pde.action = 'VIEW'
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

create or replace function public.get_my_home_snapshot(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Taipei')::date);
  v_week_start date := (v_today - ((extract(isodow from v_today)::integer - 1) * interval '1 day'))::date;
  v_linked_ids uuid[] := '{}'::uuid[];
  v_members jsonb := '[]'::jsonb;
  v_next_event jsonb := null;
  v_today_leaves jsonb := '[]'::jsonb;
  v_training_locations jsonb := '[]'::jsonb;
  v_payment_summary jsonb;
  v_equipment_summary jsonb;
  v_recent_notifications jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(profiles.linked_team_member_ids, array[]::uuid[])
  into v_linked_ids
  from public.profiles
  where profiles.id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tm.id,
        'name', tm.name,
        'role', tm.role,
        'team_group', tm.team_group,
        'status', tm.status,
        'jersey_number', tm.jersey_number,
        'avatar_url', tm.avatar_url,
        'point_balance', public.get_player_point_balance(tm.id),
        'reserved_training_points', public.get_player_reserved_training_points(tm.id),
        'available_training_points', public.get_player_available_training_points(tm.id)
      )
      order by
        case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
        tm.name
    ),
    '[]'::jsonb
  )
  into v_members
  from public.team_members_safe tm
  where tm.id = any(v_linked_ids)
    and tm.role in ('球員', '校隊');

  select to_jsonb(event_row)
  into v_next_event
  from (
    with event_candidates as (
      select
        m.id,
        'match'::text as type,
        coalesce(nullif(m.match_name, ''), nullif(m.opponent, ''), '賽事')::text as title,
        m.match_date::date as event_date,
        m.match_date::text as date,
        nullif(m.match_time, '')::text as time,
        nullif(m.location, '')::text as location,
        nullif(m.opponent, '')::text as opponent,
        nullif(m.category_group, '')::text as category_group,
        nullif(m.match_level, '')::text as match_level,
        nullif(m.coaches, '')::text as coaches,
        nullif(m.players, '')::text as players,
        format('/match-records?match_id=%s', m.id::text) as route
      from public.matches m
      where m.match_date >= v_today

      union all

      select
        ae.id,
        'attendance'::text as type,
        coalesce(nullif(ae.title, ''), '球隊活動')::text as title,
        ae.date::date as event_date,
        ae.date::text as date,
        null::text as time,
        null::text as location,
        null::text as opponent,
        null::text as category_group,
        nullif(ae.event_type, '')::text as match_level,
        null::text as coaches,
        null::text as players,
        '/calendar'::text as route
      from public.attendance_events ae
      where ae.date >= v_today
    )
    select
      id,
      type,
      title,
      date,
      time,
      location,
      opponent,
      category_group,
      match_level,
      coaches,
      players,
      route
    from event_candidates
    order by event_date asc, coalesce(time, '23:59') asc
    limit 1
  ) event_row;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', lr.id,
        'member_id', tm.id,
        'member_name', tm.name,
        'leave_type', lr.leave_type,
        'start_date', lr.start_date,
        'end_date', lr.end_date,
        'reason', lr.reason
      )
      order by tm.name, lr.start_date
    ),
    '[]'::jsonb
  )
  into v_today_leaves
  from public.leave_requests lr
  join public.team_members_safe tm on tm.id = lr.user_id
  where lr.user_id = any(v_linked_ids)
    and lr.start_date <= v_today
    and lr.end_date >= v_today;

  select coalesce(jsonb_agg(to_jsonb(location_row) order by location_row.training_date, location_row.start_time, location_row.member_name), '[]'::jsonb)
  into v_training_locations
  from public.list_my_week_training_locations(v_week_start) location_row;

  with official_due as (
    select
      mf.member_id,
      tm.name::text as member_name,
      'monthly'::text as billing_mode,
      mf.year_month::text as period_label,
      coalesce(mf.payable_amount, 0)::integer as amount,
      coalesce(mf.status, 'unpaid')::text as status,
      mf.updated_at
    from public.monthly_fees mf
    join public.team_members_safe tm on tm.id = mf.member_id
    where mf.member_id = any(v_linked_ids)
      and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')

    union all

    select
      matched_member.id as member_id,
      matched_member.name::text as member_name,
      'quarterly'::text as billing_mode,
      qf.year_quarter::text as period_label,
      coalesce(qf.amount, 0)::integer as amount,
      coalesce(qf.status, 'pending_review')::text as status,
      qf.updated_at
    from public.quarterly_fees qf
    join lateral (
      select tm.id, tm.name
      from public.team_members_safe tm
      where tm.id = any(v_linked_ids)
        and (
          tm.id = qf.member_id
          or tm.id = any(coalesce(qf.member_ids, array[]::uuid[]))
        )
      order by tm.name
      limit 1
    ) matched_member on true
    where (
        qf.member_id = any(v_linked_ids)
        or coalesce(qf.member_ids, array[]::uuid[]) && v_linked_ids
      )
      and coalesce(qf.status, 'pending_review') not in ('paid', 'approved')
  ),
  pending_submissions as (
    select count(*)::integer as total
    from public.profile_payment_submissions pps
    where pps.member_id = any(v_linked_ids)
      and pps.status = 'pending_review'
  ),
  next_due_row as (
    select *
    from official_due
    order by updated_at desc nulls last, period_label desc
    limit 1
  )
  select jsonb_build_object(
    'unpaid_count', coalesce(count(*) filter (where status = 'unpaid'), 0),
    'pending_review_count', coalesce(count(*) filter (where status = 'pending_review'), 0) + coalesce((select total from pending_submissions), 0),
    'total_unpaid_amount', coalesce(sum(amount) filter (where status = 'unpaid'), 0),
    'next_due', coalesce((select to_jsonb(next_due_row) from next_due_row), 'null'::jsonb)
  )
  into v_payment_summary
  from official_due;

  with request_rows as (
    select
      r.id,
      r.member_id,
      tm.name::text as member_name,
      r.status::text,
      count(ri.id)::integer as item_count,
      coalesce(sum(coalesce(ri.unit_price_snapshot, 0) * coalesce(ri.quantity, 0)), 0)::integer as total_amount,
      r.updated_at
    from public.equipment_purchase_requests r
    join public.team_members_safe tm on tm.id = r.member_id
    left join public.equipment_purchase_request_items ri on ri.request_id = r.id
    where r.member_id = any(v_linked_ids)
      and r.status not in ('rejected', 'cancelled')
    group by r.id, r.member_id, tm.name, r.status, r.updated_at
  ),
  equipment_payment_rows as (
    select
      t.id,
      t.member_id,
      coalesce(t.payment_status, 'unpaid')::text as payment_status,
      coalesce(coalesce(t.unit_price, e.purchase_price, 0) * coalesce(t.quantity, 0), 0)::integer as total_amount
    from public.equipment_transactions t
    join public.equipment e on e.id = t.equipment_id
    join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
    join public.equipment_purchase_requests r on r.id = ri.request_id
    where t.member_id = any(v_linked_ids)
      and t.transaction_type = 'purchase'
      and r.status = 'picked_up'
      and coalesce(t.payment_status, 'unpaid') in ('unpaid', 'pending_review')
  ),
  latest_request_row as (
    select *
    from request_rows
    order by updated_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'active_request_count', coalesce((select count(*) from request_rows where status in ('pending', 'approved', 'ready_for_pickup')), 0),
    'ready_for_pickup_count', coalesce((select count(*) from request_rows where status = 'ready_for_pickup'), 0),
    'picked_up_unpaid_count', coalesce((select count(*) from equipment_payment_rows where payment_status = 'unpaid'), 0),
    'pending_payment_count', coalesce((select count(*) from equipment_payment_rows where payment_status = 'pending_review'), 0),
    'unpaid_amount', coalesce((select sum(total_amount) from equipment_payment_rows where payment_status = 'unpaid'), 0),
    'latest_request', coalesce((select to_jsonb(latest_request_row) from latest_request_row), 'null'::jsonb)
  )
  into v_equipment_summary;

  select coalesce(jsonb_agg(to_jsonb(feed_row) order by feed_row.created_at desc), '[]'::jsonb)
  into v_recent_notifications
  from public.get_notification_feed(5) feed_row;

  return jsonb_build_object(
    'members', v_members,
    'next_event', v_next_event,
    'today_leaves', v_today_leaves,
    'training_locations', v_training_locations,
    'payment_summary', v_payment_summary,
    'equipment_summary', v_equipment_summary,
    'recent_notifications', v_recent_notifications,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.assert_training_locations_permission(text) from public;
revoke all on function public.assert_training_locations_permission(text) from anon;
grant execute on function public.assert_training_locations_permission(text) to authenticated, service_role;

revoke all on function public.list_training_venues() from public;
revoke all on function public.list_training_venues() from anon;
grant execute on function public.list_training_venues() to authenticated, service_role;

revoke all on function public.upsert_training_venue(uuid, text, text, text, boolean, integer) from public;
revoke all on function public.upsert_training_venue(uuid, text, text, text, boolean, integer) from anon;
grant execute on function public.upsert_training_venue(uuid, text, text, text, boolean, integer) to authenticated, service_role;

revoke all on function public.list_training_location_roster(date) from public;
revoke all on function public.list_training_location_roster(date) from anon;
grant execute on function public.list_training_location_roster(date) to authenticated, service_role;

revoke all on function public.list_training_location_admin_sessions(date, date) from public;
revoke all on function public.list_training_location_admin_sessions(date, date) from anon;
grant execute on function public.list_training_location_admin_sessions(date, date) to authenticated, service_role;

revoke all on function public.save_training_location_session(uuid, text, date, text, text, text, text, jsonb) from public;
revoke all on function public.save_training_location_session(uuid, text, date, text, text, text, text, jsonb) from anon;
grant execute on function public.save_training_location_session(uuid, text, date, text, text, text, text, jsonb) to authenticated, service_role;

revoke all on function public.publish_training_location_session(uuid) from public;
revoke all on function public.publish_training_location_session(uuid) from anon;
grant execute on function public.publish_training_location_session(uuid) to authenticated, service_role;

revoke all on function public.delete_training_location_session(uuid) from public;
revoke all on function public.delete_training_location_session(uuid) from anon;
grant execute on function public.delete_training_location_session(uuid) to authenticated, service_role;

revoke all on function public.list_my_week_training_locations(date) from public;
revoke all on function public.list_my_week_training_locations(date) from anon;
grant execute on function public.list_my_week_training_locations(date) to authenticated, service_role;

revoke all on function public.list_training_location_notification_targets(date, uuid) from public;
revoke all on function public.list_training_location_notification_targets(date, uuid) from anon;
grant execute on function public.list_training_location_notification_targets(date, uuid) to service_role;

revoke all on function public.get_notification_feed(integer, boolean) from public;
revoke all on function public.get_notification_feed(integer, boolean) from anon;
grant execute on function public.get_notification_feed(integer, boolean) to authenticated, service_role;

revoke all on function public.get_my_home_snapshot(date) from public;
revoke all on function public.get_my_home_snapshot(date) from anon;
grant execute on function public.get_my_home_snapshot(date) to authenticated, service_role;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Required DB settings before the cron job runs:
-- alter database postgres set app.training_location_notification_function_url = 'https://<project-ref>.supabase.co/functions/v1/send-training-location-notifications';
-- alter database postgres set app.training_location_notification_authorization = 'Bearer <anon-or-service-role-jwt>';
-- alter database postgres set app.training_location_notification_secret = '<same value as TRAINING_LOCATION_NOTIFICATION_SECRET>';

select cron.unschedule(jobid)
from cron.job
where jobname = 'training-location-notification-daily';

select cron.schedule(
  'training-location-notification-daily',
  '10 12 * * *',
  $$
  do $cron$
  declare
    v_url text := nullif(current_setting('app.training_location_notification_function_url', true), '');
    v_authorization text := nullif(current_setting('app.training_location_notification_authorization', true), '');
    v_secret text := nullif(current_setting('app.training_location_notification_secret', true), '');
  begin
    if v_url is null then
      raise notice 'app.training_location_notification_function_url is not set; skip training location notification check';
      return;
    end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_strip_nulls(jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', v_authorization,
        'x-sync-secret', v_secret
      )),
      body := jsonb_build_object(
        'source', 'pg_cron',
        'schedule', 'daily 20:10 Asia/Taipei'
      ),
      timeout_milliseconds := 60000
    );
  end;
  $cron$;
  $$
);

notify pgrst, 'reload schema';

commit;
