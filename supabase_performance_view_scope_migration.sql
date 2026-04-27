begin;

create or replace function public.has_performance_feature_manage_permission(
  p_feature text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    p_feature in ('baseball_ability', 'physical_tests')
    and (
      public.has_app_permission(p_feature, 'CREATE')
      or public.has_app_permission(p_feature, 'EDIT')
      or public.has_app_permission(p_feature, 'DELETE')
    );
$$;

create or replace function public.can_read_performance_member(
  p_feature text,
  p_team_member_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    p_feature in ('baseball_ability', 'physical_tests')
    and (
      public.has_performance_feature_manage_permission(p_feature)
      or p_team_member_id in (
        select unnest(coalesce(p.linked_team_member_ids, array[]::uuid[]))
        from public.profiles p
        where p.id = auth.uid()
      )
    );
$$;

drop policy if exists "baseball_ability_select_allowed" on public.baseball_ability_records;
create policy "baseball_ability_select_allowed"
  on public.baseball_ability_records
  for select
  using (public.can_read_performance_member('baseball_ability', team_member_id));

drop policy if exists "physical_tests_select_allowed" on public.physical_test_records;
create policy "physical_tests_select_allowed"
  on public.physical_test_records
  for select
  using (public.can_read_performance_member('physical_tests', team_member_id));

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
        'equipment'
      ],
      'VIEW'
    )
    or public.has_performance_feature_manage_permission('baseball_ability')
    or public.has_performance_feature_manage_permission('physical_tests')
    or id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop function if exists public.get_performance_member_options();

create or replace function public.get_performance_member_options(
  p_feature text default null
)
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
    case
      when p_feature in ('baseball_ability', 'physical_tests') then
        public.can_read_performance_member(p_feature, tm.id)
      else
        public.has_performance_feature_manage_permission('baseball_ability')
        or public.has_performance_feature_manage_permission('physical_tests')
        or tm.id in (
          select unnest(coalesce(p.linked_team_member_ids, array[]::uuid[]))
          from public.profiles p
          where p.id = auth.uid()
        )
    end
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
    and public.can_read_performance_member('baseball_ability', r.team_member_id)
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
    and public.can_read_performance_member('physical_tests', r.team_member_id)
  order by r.test_date desc, r.created_at desc;
$$;

grant execute on function public.has_performance_feature_manage_permission(text) to authenticated, service_role;
grant execute on function public.can_read_performance_member(text, uuid) to authenticated, service_role;
grant execute on function public.get_performance_member_options(text) to authenticated;
grant execute on function public.get_baseball_ability_records(uuid) to authenticated;
grant execute on function public.get_physical_test_records(uuid) to authenticated;

commit;
