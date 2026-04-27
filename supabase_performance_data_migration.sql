create table if not exists public.baseball_ability_records (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  test_date date not null default current_date,
  home_to_first numeric not null default 0 check (home_to_first >= 0),
  pitch_speed numeric not null default 0 check (pitch_speed >= 0),
  home_to_home numeric not null default 0 check (home_to_home >= 0),
  exit_velocity numeric not null default 0 check (exit_velocity >= 0),
  catch_count integer not null default 0 check (catch_count >= 0),
  base_run_180s_laps numeric not null default 0 check (base_run_180s_laps >= 0),
  relay_throw_count integer not null default 0 check (relay_throw_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.physical_test_records (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  test_date date not null default current_date,
  height numeric not null default 0 check (height >= 0),
  weight numeric not null default 0 check (weight >= 0),
  bmi numeric not null default 0 check (bmi >= 0),
  arm_span numeric not null default 0 check (arm_span >= 0),
  shuttle_run numeric not null default 0 check (shuttle_run >= 0),
  sit_and_reach numeric not null default 0,
  sit_ups integer not null default 0 check (sit_ups >= 0),
  standing_long_jump numeric not null default 0 check (standing_long_jump >= 0),
  vertical_jump numeric not null default 0 check (vertical_jump >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists baseball_ability_records_member_date_idx
  on public.baseball_ability_records (team_member_id, test_date desc);

create index if not exists physical_test_records_member_date_idx
  on public.physical_test_records (team_member_id, test_date desc);

create or replace function public.set_performance_record_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_baseball_ability_records_updated_at on public.baseball_ability_records;
create trigger set_baseball_ability_records_updated_at
before update on public.baseball_ability_records
for each row
execute function public.set_performance_record_updated_at();

drop trigger if exists set_physical_test_records_updated_at on public.physical_test_records;
create trigger set_physical_test_records_updated_at
before update on public.physical_test_records
for each row
execute function public.set_performance_record_updated_at();

alter table public.baseball_ability_records enable row level security;
alter table public.physical_test_records enable row level security;

drop policy if exists "baseball_ability_select_allowed" on public.baseball_ability_records;
create policy "baseball_ability_select_allowed"
  on public.baseball_ability_records
  for select
  using (
    public.has_app_permission('baseball_ability', 'VIEW')
    or team_member_id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "baseball_ability_insert_create" on public.baseball_ability_records;
create policy "baseball_ability_insert_create"
  on public.baseball_ability_records
  for insert
  with check (public.has_app_permission('baseball_ability', 'CREATE'));

drop policy if exists "baseball_ability_update_edit" on public.baseball_ability_records;
create policy "baseball_ability_update_edit"
  on public.baseball_ability_records
  for update
  using (public.has_app_permission('baseball_ability', 'EDIT'))
  with check (public.has_app_permission('baseball_ability', 'EDIT'));

drop policy if exists "baseball_ability_delete_delete" on public.baseball_ability_records;
create policy "baseball_ability_delete_delete"
  on public.baseball_ability_records
  for delete
  using (public.has_app_permission('baseball_ability', 'DELETE'));

drop policy if exists "physical_tests_select_allowed" on public.physical_test_records;
create policy "physical_tests_select_allowed"
  on public.physical_test_records
  for select
  using (
    public.has_app_permission('physical_tests', 'VIEW')
    or team_member_id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "physical_tests_insert_create" on public.physical_test_records;
create policy "physical_tests_insert_create"
  on public.physical_test_records
  for insert
  with check (public.has_app_permission('physical_tests', 'CREATE'));

drop policy if exists "physical_tests_update_edit" on public.physical_test_records;
create policy "physical_tests_update_edit"
  on public.physical_test_records
  for update
  using (public.has_app_permission('physical_tests', 'EDIT'))
  with check (public.has_app_permission('physical_tests', 'EDIT'));

drop policy if exists "physical_tests_delete_delete" on public.physical_test_records;
create policy "physical_tests_delete_delete"
  on public.physical_test_records
  for delete
  using (public.has_app_permission('physical_tests', 'DELETE'));

grant select, insert, update, delete on public.baseball_ability_records to authenticated;
grant select, insert, update, delete on public.physical_test_records to authenticated;

drop policy if exists "team_members_select_permitted_features" on public.team_members;
create policy "team_members_select_permitted_features"
  on public.team_members
  for select
  using (
    public.has_any_app_permission(
      array[
        'players',
        'leave_requests',
        'attendance',
        'fees',
        'users',
        'matches',
        'equipment',
        'baseball_ability',
        'physical_tests'
      ],
      'VIEW'
    )
    or id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

insert into public.app_role_permissions (role_key, feature, action)
select 'ADMIN', feature, action
from (
  values
    ('baseball_ability', 'VIEW'),
    ('baseball_ability', 'CREATE'),
    ('baseball_ability', 'EDIT'),
    ('baseball_ability', 'DELETE'),
    ('physical_tests', 'VIEW'),
    ('physical_tests', 'CREATE'),
    ('physical_tests', 'EDIT'),
    ('physical_tests', 'DELETE')
) as seed(feature, action)
where exists (
  select 1 from public.app_roles where role_key = 'ADMIN'
)
on conflict (role_key, feature, action) do nothing;

create or replace function public.get_performance_member_options()
returns table (
  id uuid,
  name text,
  role text,
  team_group text,
  status text,
  jersey_number text,
  avatar_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    tm.id,
    tm.name,
    tm.role,
    tm.team_group,
    tm.status,
    tm.jersey_number,
    tm.avatar_url
  from public.team_members tm
  where
    public.has_any_app_permission(array['baseball_ability', 'physical_tests'], 'VIEW')
    or tm.id in (
      select unnest(coalesce(p.linked_team_member_ids, array[]::uuid[]))
      from public.profiles p
      where p.id = auth.uid()
    )
  order by tm.role nulls last, tm.name;
$$;

create or replace function public.get_baseball_ability_records(
  p_team_member_id uuid default null
)
returns table (
  id uuid,
  team_member_id uuid,
  test_date date,
  home_to_first numeric,
  pitch_speed numeric,
  home_to_home numeric,
  exit_velocity numeric,
  catch_count integer,
  base_run_180s_laps numeric,
  relay_throw_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  member_name text,
  member_role text,
  member_team_group text,
  member_status text,
  member_jersey_number text,
  member_avatar_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    r.team_member_id,
    r.test_date,
    r.home_to_first,
    r.pitch_speed,
    r.home_to_home,
    r.exit_velocity,
    r.catch_count,
    r.base_run_180s_laps,
    r.relay_throw_count,
    r.created_at,
    r.updated_at,
    tm.name as member_name,
    tm.role as member_role,
    tm.team_group as member_team_group,
    tm.status as member_status,
    tm.jersey_number as member_jersey_number,
    tm.avatar_url as member_avatar_url
  from public.baseball_ability_records r
  join public.team_members tm on tm.id = r.team_member_id
  where
    (p_team_member_id is null or r.team_member_id = p_team_member_id)
    and (
      public.has_app_permission('baseball_ability', 'VIEW')
      or r.team_member_id in (
        select unnest(coalesce(p.linked_team_member_ids, array[]::uuid[]))
        from public.profiles p
        where p.id = auth.uid()
      )
    )
  order by r.test_date desc, r.created_at desc;
$$;

create or replace function public.get_physical_test_records(
  p_team_member_id uuid default null
)
returns table (
  id uuid,
  team_member_id uuid,
  test_date date,
  height numeric,
  weight numeric,
  bmi numeric,
  arm_span numeric,
  shuttle_run numeric,
  sit_and_reach numeric,
  sit_ups integer,
  standing_long_jump numeric,
  vertical_jump numeric,
  created_at timestamptz,
  updated_at timestamptz,
  member_name text,
  member_role text,
  member_team_group text,
  member_status text,
  member_jersey_number text,
  member_avatar_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    r.team_member_id,
    r.test_date,
    r.height,
    r.weight,
    r.bmi,
    r.arm_span,
    r.shuttle_run,
    r.sit_and_reach,
    r.sit_ups,
    r.standing_long_jump,
    r.vertical_jump,
    r.created_at,
    r.updated_at,
    tm.name as member_name,
    tm.role as member_role,
    tm.team_group as member_team_group,
    tm.status as member_status,
    tm.jersey_number as member_jersey_number,
    tm.avatar_url as member_avatar_url
  from public.physical_test_records r
  join public.team_members tm on tm.id = r.team_member_id
  where
    (p_team_member_id is null or r.team_member_id = p_team_member_id)
    and (
      public.has_app_permission('physical_tests', 'VIEW')
      or r.team_member_id in (
        select unnest(coalesce(p.linked_team_member_ids, array[]::uuid[]))
        from public.profiles p
        where p.id = auth.uid()
      )
    )
  order by r.test_date desc, r.created_at desc;
$$;

grant execute on function public.get_performance_member_options() to authenticated;
grant execute on function public.get_baseball_ability_records(uuid) to authenticated;
grant execute on function public.get_physical_test_records(uuid) to authenticated;
