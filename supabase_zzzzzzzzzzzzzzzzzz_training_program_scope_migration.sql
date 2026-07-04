begin;

create table if not exists public.training_program_settings (
  program_key text primary key,
  label text not null,
  team_group text,
  default_weekdays integer[] not null default array[6],
  default_start_time text,
  default_end_time text,
  default_venue_name text,
  default_venue_address text,
  default_venue_maps_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_program_settings_key_check check (program_key ~ '^[a-z0-9_:-]+$'),
  constraint training_program_settings_label_check check (length(btrim(label)) > 0),
  constraint training_program_settings_weekdays_check check (
    default_weekdays <@ array[0,1,2,3,4,5,6]
    and cardinality(default_weekdays) > 0
  )
);

create or replace function public.set_training_program_settings_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_training_program_settings_updated_at on public.training_program_settings;
create trigger set_training_program_settings_updated_at
before update on public.training_program_settings
for each row
execute function public.set_training_program_settings_updated_at();

insert into public.training_program_settings (
  program_key,
  label,
  team_group,
  default_weekdays,
  default_start_time,
  default_end_time,
  default_venue_name,
  sort_order,
  is_active
)
values
  ('chunggang_school_team', '中港校隊', '中港校隊', array[6], '09:00', '12:30', '中港國小', 10, true),
  ('junior_high_school_team', '國中校隊', '國中校隊', array[0], '09:00', '12:00', '新泰國中', 20, true)
on conflict (program_key) do update
  set label = excluded.label,
      team_group = excluded.team_group,
      default_weekdays = excluded.default_weekdays,
      default_start_time = excluded.default_start_time,
      default_end_time = excluded.default_end_time,
      default_venue_name = excluded.default_venue_name,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active;

insert into public.team_group_settings (name, sort_order)
values
  ('中港校隊', 10),
  ('國中校隊', 20)
on conflict (name) do nothing;

insert into public.training_venues (name, sort_order, is_active)
values ('新泰國中', 20, true)
on conflict (name) do update
  set is_active = true,
      sort_order = least(public.training_venues.sort_order, excluded.sort_order),
      updated_at = timezone('utc', now());

alter table public.training_program_settings enable row level security;

drop policy if exists "training_program_settings_select_authenticated" on public.training_program_settings;
create policy "training_program_settings_select_authenticated"
  on public.training_program_settings
  for select
  using (auth.uid() is not null);

drop policy if exists "training_program_settings_insert_edit" on public.training_program_settings;
create policy "training_program_settings_insert_edit"
  on public.training_program_settings
  for insert
  with check (public.has_app_permission('training_dates', 'EDIT'));

drop policy if exists "training_program_settings_update_edit" on public.training_program_settings;
create policy "training_program_settings_update_edit"
  on public.training_program_settings
  for update
  using (public.has_app_permission('training_dates', 'EDIT'))
  with check (public.has_app_permission('training_dates', 'EDIT'));

drop policy if exists "training_program_settings_delete_edit" on public.training_program_settings;
create policy "training_program_settings_delete_edit"
  on public.training_program_settings
  for delete
  using (public.has_app_permission('training_dates', 'EDIT'));

grant select, insert, update, delete on public.training_program_settings to authenticated, service_role;

create or replace function public.normalize_training_program_key(p_program_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(regexp_replace(lower(btrim(coalesce(p_program_key, ''))), '[^a-z0-9_:-]+', '_', 'g'), ''), 'chunggang_school_team');
$$;

create or replace function public.get_member_training_program_key(
  p_team_group text,
  p_role text default null,
  p_fee_billing_mode text default null
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_program_key text;
begin
  select tps.program_key
  into v_program_key
  from public.training_program_settings tps
  where tps.is_active
    and tps.team_group is not null
    and lower(btrim(tps.team_group)) = lower(btrim(coalesce(p_team_group, '')))
  order by tps.sort_order, tps.program_key
  limit 1;

  if v_program_key is not null then
    return v_program_key;
  end if;

  if p_role = '校隊' or coalesce(p_fee_billing_mode, '') = 'monthly_per_session' then
    return 'chunggang_school_team';
  end if;

  return null;
end;
$$;

create or replace function public.list_training_program_settings()
returns table (
  program_key text,
  label text,
  team_group text,
  default_weekdays integer[],
  default_start_time text,
  default_end_time text,
  default_venue_name text,
  default_venue_address text,
  default_venue_maps_url text,
  sort_order integer,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    tps.program_key,
    tps.label,
    tps.team_group,
    tps.default_weekdays,
    tps.default_start_time,
    tps.default_end_time,
    tps.default_venue_name,
    tps.default_venue_address,
    tps.default_venue_maps_url,
    tps.sort_order,
    tps.is_active,
    tps.created_at,
    tps.updated_at
  from public.training_program_settings tps
  order by tps.sort_order, tps.label;
end;
$$;

create or replace function public.save_training_program_setting(
  p_program_key text,
  p_label text,
  p_team_group text default null,
  p_default_weekdays integer[] default array[6],
  p_default_start_time text default null,
  p_default_end_time text default null,
  p_default_venue_name text default null,
  p_default_venue_address text default null,
  p_default_venue_maps_url text default null,
  p_sort_order integer default 0,
  p_is_active boolean default true
)
returns public.training_program_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_key text := public.normalize_training_program_key(p_program_key);
  v_setting public.training_program_settings%rowtype;
begin
  perform public.assert_training_dates_permission('EDIT');

  if nullif(btrim(coalesce(p_label, '')), '') is null then
    raise exception 'label is required';
  end if;

  insert into public.training_program_settings (
    program_key,
    label,
    team_group,
    default_weekdays,
    default_start_time,
    default_end_time,
    default_venue_name,
    default_venue_address,
    default_venue_maps_url,
    sort_order,
    is_active
  )
  values (
    v_program_key,
    btrim(p_label),
    nullif(btrim(coalesce(p_team_group, '')), ''),
    coalesce(p_default_weekdays, array[6]),
    nullif(btrim(coalesce(p_default_start_time, '')), ''),
    nullif(btrim(coalesce(p_default_end_time, '')), ''),
    nullif(btrim(coalesce(p_default_venue_name, '')), ''),
    nullif(btrim(coalesce(p_default_venue_address, '')), ''),
    nullif(btrim(coalesce(p_default_venue_maps_url, '')), ''),
    coalesce(p_sort_order, 0),
    coalesce(p_is_active, true)
  )
  on conflict (program_key) do update
    set label = excluded.label,
        team_group = excluded.team_group,
        default_weekdays = excluded.default_weekdays,
        default_start_time = excluded.default_start_time,
        default_end_time = excluded.default_end_time,
        default_venue_name = excluded.default_venue_name,
        default_venue_address = excluded.default_venue_address,
        default_venue_maps_url = excluded.default_venue_maps_url,
        sort_order = excluded.sort_order,
        is_active = excluded.is_active
  returning *
  into v_setting;

  if v_setting.team_group is not null then
    insert into public.team_group_settings (name, sort_order)
    values (v_setting.team_group, v_setting.sort_order)
    on conflict (name) do nothing;
  end if;

  if v_setting.default_venue_name is not null then
    insert into public.training_venues (name, address, maps_url, sort_order, is_active)
    values (
      v_setting.default_venue_name,
      v_setting.default_venue_address,
      v_setting.default_venue_maps_url,
      v_setting.sort_order,
      true
    )
    on conflict (name) do update
      set address = coalesce(excluded.address, public.training_venues.address),
          maps_url = coalesce(excluded.maps_url, public.training_venues.maps_url),
          is_active = true,
          updated_at = timezone('utc', now());
  end if;

  return v_setting;
end;
$$;

alter table public.training_month_date_settings
  add column if not exists program_key text not null default 'chunggang_school_team';

update public.training_month_date_settings
set program_key = 'chunggang_school_team'
where program_key is null or btrim(program_key) = '';

alter table public.training_month_date_settings
  drop constraint if exists training_month_date_settings_month_start_key;

drop index if exists training_month_date_settings_month_start_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_month_date_settings_month_program_key'
      and conrelid = 'public.training_month_date_settings'::regclass
  ) then
    alter table public.training_month_date_settings
      add constraint training_month_date_settings_month_program_key unique (month_start, program_key);
  end if;
end $$;

create index if not exists training_month_date_settings_program_month_idx
  on public.training_month_date_settings (program_key, month_start);

alter table public.training_location_sessions
  add column if not exists program_key text not null default 'chunggang_school_team';

create index if not exists training_location_sessions_program_date_idx
  on public.training_location_sessions (program_key, training_date);

alter table public.monthly_fees
  add column if not exists training_program text;

create index if not exists monthly_fees_training_program_period_idx
  on public.monthly_fees (training_program, year_month);

create or replace function public.get_default_training_month_dates(
  p_month date,
  p_program_key text
)
returns date[]
language sql
stable
set search_path = public
as $$
  with program_setting as (
    select coalesce((
      select tps.default_weekdays
      from public.training_program_settings tps
      where tps.program_key = public.normalize_training_program_key(p_program_key)
        and tps.is_active
      limit 1
    ), array[6]) as weekdays
  )
  select coalesce(array_agg(day_value::date order by day_value::date), '{}'::date[])
  from generate_series(
    date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date,
    (date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date)) + interval '1 month - 1 day')::date,
    interval '1 day'
  ) as day_value
  cross join program_setting
  where extract(dow from day_value)::integer = any(program_setting.weekdays);
$$;

create or replace function public.get_training_month_dates(
  p_month date,
  p_program_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
  v_program_key text := public.normalize_training_program_key(p_program_key);
  v_setting public.training_month_date_settings%rowtype;
  v_program public.training_program_settings%rowtype;
  v_dates date[];
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_program
  from public.training_program_settings
  where program_key = v_program_key;

  select *
  into v_setting
  from public.training_month_date_settings
  where month_start = v_month_start
    and program_key = v_program_key;

  if v_setting.id is null then
    v_dates := public.get_default_training_month_dates(v_month_start, v_program_key);
    return jsonb_build_object(
      'month_start', v_month_start,
      'program_key', v_program_key,
      'program_label', coalesce(v_program.label, v_program_key),
      'default_weekdays', coalesce(v_program.default_weekdays, array[6]),
      'training_dates', to_jsonb(v_dates),
      'note', null,
      'is_default', true,
      'updated_at', null
    );
  end if;

  select coalesce(array_agg(date_value order by date_value), '{}'::date[])
  into v_dates
  from unnest(coalesce(v_setting.training_dates, '{}'::date[])) as date_value
  where date_trunc('month', date_value)::date = v_month_start;

  return jsonb_build_object(
    'month_start', v_month_start,
    'program_key', v_program_key,
    'program_label', coalesce(v_program.label, v_program_key),
    'default_weekdays', coalesce(v_program.default_weekdays, array[6]),
    'training_dates', to_jsonb(v_dates),
    'note', v_setting.note,
    'is_default', false,
    'updated_at', v_setting.updated_at
  );
end;
$$;

create or replace function public.get_training_month_dates(p_month date default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.get_training_month_dates(p_month, 'chunggang_school_team');
$$;

create or replace function public.ensure_training_month_date_setting(
  p_month date,
  p_program_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
  v_program_key text := public.normalize_training_program_key(p_program_key);
  v_dates date[] := public.get_default_training_month_dates(v_month_start, v_program_key);
  v_setting public.training_month_date_settings%rowtype;
  v_created boolean := false;
begin
  insert into public.training_month_date_settings (
    month_start,
    program_key,
    training_dates,
    note,
    created_by,
    updated_by,
    updated_at
  )
  values (
    v_month_start,
    v_program_key,
    v_dates,
    null,
    null,
    null,
    timezone('utc', now())
  )
  on conflict (month_start, program_key) do nothing
  returning *
  into v_setting;

  if v_setting.id is not null then
    v_created := true;
  else
    select *
    into v_setting
    from public.training_month_date_settings
    where month_start = v_month_start
      and program_key = v_program_key;
  end if;

  return jsonb_build_object(
    'success', true,
    'created', v_created,
    'month_start', v_month_start,
    'program_key', v_program_key,
    'training_dates', to_jsonb(coalesce(v_setting.training_dates, v_dates)),
    'note', v_setting.note,
    'updated_at', v_setting.updated_at
  );
end;
$$;

create or replace function public.ensure_training_month_date_setting(p_month date default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.ensure_training_month_date_setting(p_month, 'chunggang_school_team');
$$;

create or replace function public.save_training_month_dates(
  p_month date,
  p_training_dates date[],
  p_program_key text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
  v_program_key text := public.normalize_training_program_key(p_program_key);
  v_program public.training_program_settings%rowtype;
  v_previous_dates date[];
  v_next_dates date[];
  v_added_dates date[];
  v_removed_dates date[];
  v_setting public.training_month_date_settings%rowtype;
  v_changed boolean := false;
begin
  perform public.assert_training_dates_permission('EDIT');

  select *
  into v_program
  from public.training_program_settings
  where program_key = v_program_key;

  select coalesce(array_agg(distinct date_value order by date_value), '{}'::date[])
  into v_next_dates
  from unnest(coalesce(p_training_dates, '{}'::date[])) as input_date(date_value)
  where date_trunc('month', date_value)::date = v_month_start;

  select coalesce(training_dates, public.get_default_training_month_dates(v_month_start, v_program_key))
  into v_previous_dates
  from public.training_month_date_settings
  where month_start = v_month_start
    and program_key = v_program_key;

  if v_previous_dates is null then
    v_previous_dates := public.get_default_training_month_dates(v_month_start, v_program_key);
  end if;

  select coalesce(array_agg(date_value order by date_value), '{}'::date[])
  into v_previous_dates
  from unnest(v_previous_dates) as previous_date(date_value)
  where date_trunc('month', date_value)::date = v_month_start;

  v_changed := v_previous_dates <> v_next_dates;

  select coalesce(array_agg(date_value order by date_value), '{}'::date[])
  into v_added_dates
  from unnest(v_next_dates) as next_date(date_value)
  where not (date_value = any(v_previous_dates));

  select coalesce(array_agg(date_value order by date_value), '{}'::date[])
  into v_removed_dates
  from unnest(v_previous_dates) as previous_date(date_value)
  where not (date_value = any(v_next_dates));

  insert into public.training_month_date_settings (
    month_start,
    program_key,
    training_dates,
    note,
    created_by,
    updated_by,
    updated_at
  )
  values (
    v_month_start,
    v_program_key,
    v_next_dates,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_user_id,
    v_user_id,
    timezone('utc', now())
  )
  on conflict (month_start, program_key) do update
    set training_dates = excluded.training_dates,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc', now())
  returning *
  into v_setting;

  return jsonb_build_object(
    'success', true,
    'changed', v_changed,
    'month_start', v_setting.month_start,
    'program_key', v_program_key,
    'program_label', coalesce(v_program.label, v_program_key),
    'training_dates', to_jsonb(v_next_dates),
    'added_dates', to_jsonb(v_added_dates),
    'removed_dates', to_jsonb(v_removed_dates),
    'note', v_setting.note,
    'updated_at', v_setting.updated_at
  );
end;
$$;

create or replace function public.save_training_month_dates(
  p_month date,
  p_training_dates date[],
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.save_training_month_dates(p_month, p_training_dates, 'chunggang_school_team', p_note);
$$;

create or replace function public.list_training_date_notification_targets(
  p_month_start date,
  p_program_key text
)
returns table (
  user_id uuid,
  member_id uuid,
  member_name text,
  program_key text,
  program_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_key text := public.normalize_training_program_key(p_program_key);
begin
  return query
  select distinct
    p.id,
    tm.id,
    tm.name::text,
    v_program_key,
    coalesce(tps.label, v_program_key)::text
  from public.profiles p
  join public.team_members_safe tm
    on tm.id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
  left join public.training_program_settings tps
    on tps.program_key = v_program_key
  where coalesce(p.is_active, true) is not false
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now())
    and tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('離隊', '退隊')
    and public.get_member_training_program_key(tm.team_group::text, tm.role::text, tm.fee_billing_mode::text) = v_program_key
  order by p.id, tm.name;
end;
$$;

create or replace function public.list_training_date_notification_targets(p_month_start date)
returns table (
  user_id uuid,
  member_id uuid,
  member_name text
)
language sql
security definer
set search_path = public
as $$
  select user_id, member_id, member_name
  from public.list_training_date_notification_targets(p_month_start, 'chunggang_school_team');
$$;

create or replace function public.list_training_location_roster(
  p_training_date date,
  p_program_key text
)
returns table (
  member_id uuid,
  name text,
  role text,
  team_group text,
  training_program text,
  training_program_label text,
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
  v_program_key text := public.normalize_training_program_key(p_program_key);
begin
  perform public.assert_training_locations_permission('VIEW');

  return query
  select
    tm.id,
    tm.name::text,
    tm.role::text,
    tm.team_group::text,
    v_program_key,
    coalesce(tps.label, v_program_key)::text,
    tm.jersey_number::text,
    tm.fee_billing_mode::text,
    exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = tm.id
        and lr.start_date <= v_training_date
        and coalesce(lr.end_date, lr.start_date) >= v_training_date
    ) as is_on_leave
  from public.team_members_safe tm
  left join public.training_program_settings tps
    on tps.program_key = v_program_key
  where tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('離隊', '退隊')
    and public.get_member_training_program_key(tm.team_group::text, tm.role::text, tm.fee_billing_mode::text) = v_program_key
  order by
    case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
    tm.team_group nulls last,
    tm.name;
end;
$$;

create or replace function public.list_training_location_admin_sessions(
  p_from date,
  p_to date,
  p_program_key text
)
returns table (
  session_id uuid,
  program_key text,
  program_label text,
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
  v_program_key text := public.normalize_training_program_key(p_program_key);
begin
  perform public.assert_training_locations_permission('VIEW');

  return query
  select
    base.session_id,
    coalesce(s.program_key, 'chunggang_school_team')::text,
    coalesce(tps.label, coalesce(s.program_key, 'chunggang_school_team'))::text,
    base.title,
    base.training_date,
    base.start_time,
    base.end_time,
    base.status,
    base.note,
    base.created_at,
    base.updated_at,
    base.venue_count,
    base.assignment_count,
    base.venues
  from public.list_training_location_admin_sessions(p_from, p_to) base
  join public.training_location_sessions s
    on s.id = base.session_id
  left join public.training_program_settings tps
    on tps.program_key = coalesce(s.program_key, 'chunggang_school_team')
  where coalesce(s.program_key, 'chunggang_school_team') = v_program_key;
end;
$$;

create or replace function public.save_training_location_session(
  p_session_id uuid,
  p_program_key text,
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
  v_program_key text := public.normalize_training_program_key(p_program_key);
  v_session_id uuid;
begin
  v_session_id := public.save_training_location_session(
    p_session_id,
    p_title,
    p_training_date,
    p_start_time,
    p_end_time,
    p_status,
    p_note,
    p_venues
  );

  update public.training_location_sessions
  set program_key = v_program_key,
      updated_at = timezone('utc', now())
  where id = v_session_id;

  return v_session_id;
end;
$$;

revoke all on function public.list_training_program_settings() from public, anon;
grant execute on function public.list_training_program_settings() to authenticated, service_role;

revoke all on function public.save_training_program_setting(text, text, text, integer[], text, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.save_training_program_setting(text, text, text, integer[], text, text, text, text, text, integer, boolean) to authenticated, service_role;

revoke all on function public.get_training_month_dates(date, text) from public, anon;
grant execute on function public.get_training_month_dates(date, text) to authenticated, service_role;

revoke all on function public.save_training_month_dates(date, date[], text, text) from public, anon;
grant execute on function public.save_training_month_dates(date, date[], text, text) to authenticated, service_role;

revoke all on function public.list_training_date_notification_targets(date, text) from public, anon, authenticated;
grant execute on function public.list_training_date_notification_targets(date, text) to service_role;

revoke all on function public.list_training_location_roster(date, text) from public, anon;
grant execute on function public.list_training_location_roster(date, text) to authenticated, service_role;

revoke all on function public.list_training_location_admin_sessions(date, date, text) from public, anon;
grant execute on function public.list_training_location_admin_sessions(date, date, text) to authenticated, service_role;

revoke all on function public.save_training_location_session(uuid, text, text, date, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_training_location_session(uuid, text, text, date, text, text, text, text, jsonb) to authenticated, service_role;

create or replace function public.get_my_payment_submission_estimate(
  p_member_id uuid,
  p_period_key text
)
returns table (
  member_id uuid,
  member_name text,
  billing_mode text,
  period_key text,
  period_label text,
  amount integer,
  total_sessions integer,
  leave_sessions integer,
  per_session_fee integer,
  deduction_amount integer,
  calculation_type text,
  fixed_monthly_fee integer
)
language sql
security definer
set search_path = public
as $function$
with normalized_input as (
  select upper(nullif(btrim(p_period_key), '')) as period_key
),
month_input as (
  select
    normalized_input.period_key,
    to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD')::date as month_start
  from normalized_input
  where normalized_input.period_key ~ '^[0-9]{4}-[0-9]{2}$'
),
linked_member as (
  select
    team_members.id as member_id,
    team_members.name::text as member_name,
    team_members.role::text as member_role,
    team_members.team_group::text as team_group,
    coalesce(team_members.fee_billing_mode, 'role_default') as fee_billing_mode,
    public.get_effective_payment_billing_mode(team_members.role::text, team_members.fee_billing_mode::text) as billing_mode,
    public.get_monthly_fee_calculation_type(team_members.role::text, team_members.fee_billing_mode::text) as calculation_type,
    public.get_member_training_program_key(team_members.team_group::text, team_members.role::text, team_members.fee_billing_mode::text) as training_program_key,
    coalesce(team_members.is_half_price, false) as is_half_price,
    coalesce(team_members.is_primary_payer, false) as is_primary_payer,
    coalesce(team_members.sibling_ids, array[]::uuid[]) as sibling_ids,
    coalesce(fee_settings.per_session_fee, 500) as base_fee,
    coalesce(fee_settings.monthly_fixed_fee, 2000) as monthly_fixed_fee
  from public.profiles
  join public.team_members
    on team_members.id = p_member_id
  left join public.fee_settings
    on fee_settings.member_id = team_members.id
  where profiles.id = auth.uid()
    and (
      p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      or profiles.role = 'ADMIN'
      or public.has_app_permission('fees', 'VIEW')
      or public.has_app_permission('fees', 'EDIT')
    )
  limit 1
),
training_month_dates as (
  select
    month_input.period_key,
    linked_member.training_program_key,
    training_dates.training_date
  from linked_member
  cross join month_input
  cross join lateral (
    select distinct source_dates.training_date::date as training_date
    from (
      select configured_day.training_date::date as training_date
      from public.training_month_date_settings settings
      cross join lateral unnest(coalesce(settings.training_dates, '{}'::date[])) as configured_day(training_date)
      where settings.month_start = month_input.month_start
        and coalesce(settings.program_key, 'chunggang_school_team') = linked_member.training_program_key

      union all

      select default_day.training_date::date as training_date
      from unnest(public.get_default_training_month_dates(month_input.month_start, linked_member.training_program_key)) as default_day(training_date)
      where not exists (
        select 1
        from public.training_month_date_settings settings
        where settings.month_start = month_input.month_start
          and coalesce(settings.program_key, 'chunggang_school_team') = linked_member.training_program_key
      )
    ) as source_dates
    where source_dates.training_date is not null
      and date_trunc('month', source_dates.training_date)::date = month_input.month_start
  ) as training_dates
),
training_month_total as (
  select
    training_month_dates.period_key,
    training_month_dates.training_program_key,
    count(distinct training_month_dates.training_date)::integer as total_sessions
  from training_month_dates
  group by training_month_dates.period_key, training_month_dates.training_program_key
),
monthly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    month_input.period_key,
    coalesce(monthly_fees.calculation_type, linked_member.calculation_type) as calculation_type,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed'
        then coalesce(monthly_fees.fixed_monthly_fee, linked_member.monthly_fixed_fee, 2000)
      else null
    end as fixed_monthly_fee,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      else coalesce(monthly_fees.total_sessions, training_month_total.total_sessions, 0)
    end as total_sessions,
    coalesce(monthly_fees.deduction_amount, 0) as deduction_amount,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      else coalesce(monthly_fees.leave_sessions, leave_stats.leave_sessions, 0)
    end as leave_sessions,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      when monthly_fees.id is not null and monthly_fees.per_session_fee is not null then monthly_fees.per_session_fee
      when linked_member.is_half_price then round(linked_member.base_fee / 2.0)::integer
      when cardinality(linked_member.sibling_ids) > 0
        and not linked_member.is_primary_payer
        and (
          sibling_flags.has_primary_sibling
          or sibling_flags.has_fallback_discount
        ) then round(linked_member.base_fee / 2.0)::integer
      else linked_member.base_fee
    end as per_session_fee,
    monthly_fees.payable_amount as stored_payable_amount
  from linked_member
  cross join month_input
  left join training_month_total
    on training_month_total.period_key = month_input.period_key
   and training_month_total.training_program_key = linked_member.training_program_key
  left join public.monthly_fees
    on monthly_fees.member_id = linked_member.member_id
   and monthly_fees.year_month = month_input.period_key
  left join lateral (
    select
      coalesce(count(distinct leave_day::date), 0)::integer as leave_sessions
    from public.leave_requests
    cross join lateral generate_series(
      greatest(
        leave_requests.start_date,
        month_input.month_start
      ),
      least(
        coalesce(leave_requests.end_date, leave_requests.start_date),
        (month_input.month_start + interval '1 month - 1 day')::date
      ),
      interval '1 day'
    ) as leave_day
    join training_month_dates
      on training_month_dates.period_key = month_input.period_key
     and training_month_dates.training_program_key = linked_member.training_program_key
     and training_month_dates.training_date = leave_day::date
    where leave_requests.user_id = linked_member.member_id
      and public.is_monthly_fee_deductible_leave_segment(leave_requests.leave_time_segment)
      and leave_requests.start_date <= (month_input.month_start + interval '1 month - 1 day')::date
      and coalesce(leave_requests.end_date, leave_requests.start_date) >= month_input.month_start
  ) as leave_stats on true
  left join lateral (
    select
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and coalesce(sibling.is_primary_payer, false)
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'monthly'
      ) as has_primary_sibling,
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and linked_member.member_id > sibling.id
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'monthly'
      ) as has_fallback_discount
  ) as sibling_flags on true
  where linked_member.billing_mode = 'monthly'
     or (linked_member.billing_mode = 'none' and monthly_fees.id is not null)
),
quarterly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    normalized_input.period_key,
    coalesce(
      nullif(quarterly_fee.amount, 0),
      case
        when linked_member.is_half_price then 3000
        when cardinality(linked_member.sibling_ids) > 0
          and not linked_member.is_primary_payer
          and (
            sibling_flags.has_primary_sibling
            or sibling_flags.has_fallback_discount
          ) then 3000
        else 6000
      end
    ) as amount
  from linked_member
  cross join normalized_input
  left join lateral (
    select quarterly_fees.id, quarterly_fees.amount
    from public.quarterly_fees
    where (
      quarterly_fees.member_id = linked_member.member_id
      or linked_member.member_id = any(coalesce(quarterly_fees.member_ids, array[]::uuid[]))
    )
      and quarterly_fees.year_quarter = normalized_input.period_key
    order by quarterly_fees.updated_at desc nulls last, quarterly_fees.created_at desc nulls last
    limit 1
  ) as quarterly_fee on true
  left join lateral (
    select
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and coalesce(sibling.is_primary_payer, false)
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'quarterly'
      ) as has_primary_sibling,
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and linked_member.member_id > sibling.id
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'quarterly'
      ) as has_fallback_discount
  ) as sibling_flags on true
  where normalized_input.period_key ~ '^[0-9]{4}-Q[1-4]$'
    and public.is_quarterly_payment_period_open(normalized_input.period_key)
    and (
      linked_member.billing_mode = 'quarterly'
      or (linked_member.billing_mode = 'none' and quarterly_fee.id is not null)
    )
)
select
  monthly_context.member_id,
  monthly_context.member_name,
  'monthly'::text as billing_mode,
  monthly_context.period_key,
  monthly_context.period_key as period_label,
  coalesce(
    monthly_context.stored_payable_amount,
    case
      when monthly_context.calculation_type = 'monthly_fixed'
        then monthly_context.fixed_monthly_fee - monthly_context.deduction_amount
      else greatest(coalesce(monthly_context.total_sessions, 0) - coalesce(monthly_context.leave_sessions, 0), 0) * coalesce(monthly_context.per_session_fee, 0) - monthly_context.deduction_amount
    end
  ) as amount,
  monthly_context.total_sessions,
  monthly_context.leave_sessions,
  monthly_context.per_session_fee,
  monthly_context.deduction_amount,
  monthly_context.calculation_type,
  monthly_context.fixed_monthly_fee
from monthly_context

union all

select
  quarterly_context.member_id,
  quarterly_context.member_name,
  'quarterly'::text as billing_mode,
  quarterly_context.period_key,
  quarterly_context.period_key as period_label,
  quarterly_context.amount,
  null::integer as total_sessions,
  null::integer as leave_sessions,
  null::integer as per_session_fee,
  null::integer as deduction_amount,
  null::text as calculation_type,
  null::integer as fixed_monthly_fee
from quarterly_context;
$function$;

drop function if exists public.review_profile_payment_submission(uuid, text, integer);

create or replace function public.review_profile_payment_submission(
  p_submission_id uuid,
  p_status text,
  p_overpayment_amount integer default 0
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  billing_mode text,
  period_key text,
  period_label text,
  amount integer,
  balance_amount integer,
  external_amount integer,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  note text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.profile_payment_submissions%rowtype;
  v_overpayment_amount integer := greatest(coalesce(p_overpayment_amount, 0), 0);
  v_quarterly_fee_id uuid;
  v_item_count integer := 0;
  v_item record;
  v_monthly_calculation_type text := 'per_session';
  v_fixed_monthly_fee integer := null;
  v_training_program text := 'chunggang_school_team';
  v_est_calculation_type text;
  v_est_fixed_monthly_fee integer;
  v_total_sessions integer;
  v_leave_sessions integer;
  v_per_session_fee integer;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'unsupported review status';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  select *
  into v_submission
  from public.profile_payment_submissions
  where profile_payment_submissions.id = p_submission_id
    and profile_payment_submissions.status = 'pending_review'
  for update;

  if not found then
    raise exception 'submission not found or already reviewed';
  end if;

  select count(*)
  into v_item_count
  from public.profile_payment_submission_items
  where submission_id = p_submission_id;

  if v_item_count > 0 and v_submission.billing_mode <> 'quarterly' then
    raise exception 'profile payment submission items are only supported for quarterly payments';
  end if;

  if v_item_count > 0 and v_overpayment_amount > 0 then
    raise exception 'grouped quarterly submissions do not support a single overpayment amount';
  end if;

  if p_status = 'approved' then
    if v_item_count > 0 then
      for v_item in
        select
          si.member_id,
          si.period_key,
          si.amount,
          coalesce(si.balance_amount, 0) as balance_amount
        from public.profile_payment_submission_items si
        where si.submission_id = p_submission_id
        order by si.created_at, si.member_id
      loop
        perform 1
        from public.team_members tm
        where tm.id = v_item.member_id
        for update;

        if v_item.balance_amount > public.get_player_balance_unchecked(v_item.member_id) then
          raise exception 'player balance is not enough';
        end if;

        if v_item.balance_amount > 0 then
          insert into public.player_balance_transactions (
            member_id,
            delta,
            reason,
            source,
            related_profile_payment_submission_id,
            idempotency_key,
            created_by
          )
          values (
            v_item.member_id,
            -v_item.balance_amount,
            format('Quarterly payment deduction %s', v_item.period_key),
            'payment_deduction',
            v_submission.id,
            format('profile_payment:%s:%s:balance', v_submission.id, v_item.member_id),
            v_user_id
          )
          on conflict (idempotency_key) do nothing;
        end if;

        select qf.id
        into v_quarterly_fee_id
        from public.quarterly_fees qf
        where qf.year_quarter = v_item.period_key
          and (
            qf.member_id = v_item.member_id
            or v_item.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
          )
        order by
          case
            when qf.member_id = v_item.member_id and cardinality(coalesce(qf.member_ids, array[]::uuid[])) <= 1 then 0
            else 1
          end,
          coalesce(qf.updated_at, qf.created_at) desc nulls last
        limit 1
        for update;

        if v_quarterly_fee_id is not null then
          update public.quarterly_fees
          set
            member_id = v_item.member_id,
            member_ids = array[v_item.member_id],
            amount = v_item.amount,
            payment_method = v_submission.payment_method,
            account_last_5 = v_submission.account_last_5,
            remittance_date = v_submission.remittance_date,
            payment_items = '["profile_payment_submission"]'::jsonb,
            balance_amount = v_item.balance_amount,
            status = 'paid',
            paid_at = now(),
            updated_at = now()
          where quarterly_fees.id = v_quarterly_fee_id;
        else
          insert into public.quarterly_fees (
            member_id,
            member_ids,
            year_quarter,
            amount_type,
            amount,
            payment_method,
            account_last_5,
            remittance_date,
            payment_items,
            balance_amount,
            status,
            paid_at,
            updated_at
          )
          values (
            v_item.member_id,
            array[v_item.member_id],
            v_item.period_key,
            'other',
            v_item.amount,
            v_submission.payment_method,
            v_submission.account_last_5,
            v_submission.remittance_date,
            '["profile_payment_submission"]'::jsonb,
            v_item.balance_amount,
            'paid',
            now(),
            now()
          );
        end if;
      end loop;
    else
      select
        public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text),
        case
          when public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text) = 'monthly_fixed'
            then coalesce(fs.monthly_fixed_fee, 2000)
          else null
        end,
        public.get_member_training_program_key(tm.team_group::text, tm.role::text, tm.fee_billing_mode::text)
      into v_monthly_calculation_type, v_fixed_monthly_fee, v_training_program
      from public.team_members tm
      left join public.fee_settings fs on fs.member_id = tm.id
      where tm.id = v_submission.member_id
      for update of tm;

      if not found then
        raise exception 'member not found';
      end if;

      if v_submission.billing_mode = 'monthly' then
        select
          estimate.calculation_type,
          estimate.fixed_monthly_fee,
          estimate.total_sessions,
          estimate.leave_sessions,
          estimate.per_session_fee
        into
          v_est_calculation_type,
          v_est_fixed_monthly_fee,
          v_total_sessions,
          v_leave_sessions,
          v_per_session_fee
        from public.get_my_payment_submission_estimate(v_submission.member_id, v_submission.period_key) estimate
        where estimate.billing_mode = 'monthly'
        limit 1;

        v_monthly_calculation_type := coalesce(v_est_calculation_type, v_monthly_calculation_type, 'per_session');
        v_fixed_monthly_fee := coalesce(v_est_fixed_monthly_fee, v_fixed_monthly_fee);
      end if;

      if coalesce(v_submission.balance_amount, 0) > public.get_player_balance_unchecked(v_submission.member_id) then
        raise exception 'player balance is not enough';
      end if;

      if coalesce(v_submission.balance_amount, 0) > 0 then
        insert into public.player_balance_transactions (
          member_id,
          delta,
          reason,
          source,
          related_profile_payment_submission_id,
          idempotency_key,
          created_by
        )
        values (
          v_submission.member_id,
          -v_submission.balance_amount,
          format('Payment deduction %s', v_submission.period_key),
          'payment_deduction',
          v_submission.id,
          format('profile_payment:%s:balance', v_submission.id),
          v_user_id
        )
        on conflict (idempotency_key) do nothing;
      end if;

      if v_overpayment_amount > 0 then
        insert into public.player_balance_transactions (
          member_id,
          delta,
          reason,
          source,
          related_profile_payment_submission_id,
          idempotency_key,
          created_by
        )
        values (
          v_submission.member_id,
          v_overpayment_amount,
          format('Payment overpayment %s', v_submission.period_key),
          'overpayment',
          v_submission.id,
          format('profile_payment:%s:overpayment', v_submission.id),
          v_user_id
        )
        on conflict (idempotency_key) do nothing;
      end if;

      if v_submission.billing_mode = 'monthly' then
        insert into public.monthly_fees (
          member_id,
          year_month,
          payable_amount,
          deduction_amount,
          total_sessions,
          leave_sessions,
          per_session_fee,
          calculation_type,
          fixed_monthly_fee,
          training_program,
          status,
          paid_at,
          payment_method,
          account_last_5,
          remittance_date,
          balance_amount,
          updated_at
        )
        values (
          v_submission.member_id,
          v_submission.period_key,
          v_submission.amount,
          0,
          v_total_sessions,
          v_leave_sessions,
          v_per_session_fee,
          v_monthly_calculation_type,
          v_fixed_monthly_fee,
          coalesce(v_training_program, 'chunggang_school_team'),
          'paid',
          now(),
          v_submission.payment_method,
          v_submission.account_last_5,
          v_submission.remittance_date,
          coalesce(v_submission.balance_amount, 0),
          now()
        )
        on conflict on constraint monthly_fees_member_id_year_month_key do update
        set
          payable_amount = excluded.payable_amount,
          total_sessions = excluded.total_sessions,
          leave_sessions = excluded.leave_sessions,
          per_session_fee = excluded.per_session_fee,
          calculation_type = excluded.calculation_type,
          fixed_monthly_fee = excluded.fixed_monthly_fee,
          training_program = excluded.training_program,
          status = 'paid',
          paid_at = excluded.paid_at,
          payment_method = excluded.payment_method,
          account_last_5 = excluded.account_last_5,
          remittance_date = excluded.remittance_date,
          balance_amount = excluded.balance_amount,
          updated_at = excluded.updated_at;
      elsif v_submission.billing_mode = 'quarterly' then
        select qf.id
        into v_quarterly_fee_id
        from public.quarterly_fees qf
        where qf.year_quarter = v_submission.period_key
          and (
            qf.member_id = v_submission.member_id
            or v_submission.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
          )
        order by coalesce(qf.updated_at, qf.created_at) desc nulls last
        limit 1
        for update;

        if v_quarterly_fee_id is not null then
          update public.quarterly_fees
          set
            member_id = v_submission.member_id,
            member_ids = array[v_submission.member_id],
            amount = v_submission.amount,
            payment_method = v_submission.payment_method,
            account_last_5 = v_submission.account_last_5,
            remittance_date = v_submission.remittance_date,
            balance_amount = coalesce(v_submission.balance_amount, 0),
            status = 'paid',
            paid_at = now(),
            updated_at = now()
          where quarterly_fees.id = v_quarterly_fee_id;
        else
          insert into public.quarterly_fees (
            member_id,
            member_ids,
            year_quarter,
            amount_type,
            amount,
            payment_method,
            account_last_5,
            remittance_date,
            payment_items,
            balance_amount,
            status,
            paid_at,
            updated_at
          )
          values (
            v_submission.member_id,
            array[v_submission.member_id],
            v_submission.period_key,
            'other',
            v_submission.amount,
            v_submission.payment_method,
            v_submission.account_last_5,
            v_submission.remittance_date,
            '["profile_payment_submission"]'::jsonb,
            coalesce(v_submission.balance_amount, 0),
            'paid',
            now(),
            now()
          );
        end if;
      end if;
    end if;
  end if;

  update public.profile_payment_submissions
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where profile_payment_submissions.id = p_submission_id;

  return query
  select *
  from public.list_my_payment_submissions(v_submission.member_id) submissions
  where submissions.id = p_submission_id;
end;
$$;

revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public, anon;
grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated, service_role;

revoke all on function public.review_profile_payment_submission(uuid, text, integer) from public, anon;
grant execute on function public.review_profile_payment_submission(uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
