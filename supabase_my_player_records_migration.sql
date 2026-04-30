begin;

drop function if exists public.list_my_player_record_members();

create or replace function public.list_my_player_record_members()
returns table (
  member_id uuid,
  name text,
  role text,
  team_group text,
  status text,
  jersey_number text,
  avatar_url text,
  is_linked boolean
)
language sql
security definer
stable
set search_path = public
as $$
  with current_profile as (
    select
      p.id,
      coalesce(p.linked_team_member_ids, array[]::uuid[]) as linked_member_ids,
      public.has_app_permission('players', 'VIEW') as can_view_all_players
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    tm.id,
    tm.name::text,
    tm.role::text,
    tm.team_group::text,
    tm.status::text,
    tm.jersey_number::text,
    tm.avatar_url::text,
    tm.id = any(cp.linked_member_ids) as is_linked
  from current_profile cp
  join public.team_members tm
    on tm.role in ('校隊', '球員')
   and (
     cp.can_view_all_players
     or tm.id = any(cp.linked_member_ids)
   )
  order by
    case when tm.id = any(cp.linked_member_ids) then 0 else 1 end,
    case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
    tm.name asc;
$$;

drop function if exists public.get_my_player_match_records(uuid);

create or replace function public.get_my_player_match_records(
  p_member_id uuid
)
returns table (
  id uuid,
  google_calendar_event_id text,
  match_name text,
  opponent text,
  match_date date,
  match_time text,
  location text,
  category_group text,
  match_level text,
  tournament_name text,
  home_score integer,
  opponent_score integer,
  coaches text,
  players text,
  absent_players jsonb,
  note text,
  photo_url text,
  video_url text,
  lineup jsonb,
  current_lineup jsonb,
  inning_logs jsonb,
  batting_stats jsonb,
  pitching_stats jsonb,
  current_batter_name text,
  current_inning text,
  current_b integer,
  current_s integer,
  current_o integer,
  base_1 boolean,
  base_2 boolean,
  base_3 boolean,
  bat_first boolean,
  show_lineup_intro boolean,
  show_line_score boolean,
  show_3d_field boolean,
  line_score_data jsonb,
  locked_by_user_id uuid,
  locked_by_user_name text,
  locked_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_linked_member_ids uuid[] := array[]::uuid[];
  v_can_view_all_players boolean := false;
  v_member_name text;
  v_member_number text;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select coalesce(p.linked_team_member_ids, array[]::uuid[])
  into v_linked_member_ids
  from public.profiles p
  where p.id = v_user_id;

  if v_linked_member_ids is null then
    v_linked_member_ids := array[]::uuid[];
  end if;

  v_can_view_all_players := public.has_app_permission('players', 'VIEW');

  if not v_can_view_all_players and not (p_member_id = any(v_linked_member_ids)) then
    raise exception 'member is not viewable by current profile';
  end if;

  select
    tm.name::text,
    nullif(btrim(tm.jersey_number::text), '')
  into v_member_name, v_member_number
  from public.team_members tm
  where tm.id = p_member_id
    and tm.role in ('校隊', '球員');

  if v_member_name is null then
    raise exception 'member not found';
  end if;

  v_member_name := btrim(v_member_name);
  v_member_number := coalesce(v_member_number, '');

  return query
  select
    m.id::uuid,
    m.google_calendar_event_id::text,
    m.match_name::text,
    m.opponent::text,
    m.match_date::date,
    m.match_time::text,
    m.location::text,
    m.category_group::text,
    m.match_level::text,
    m.tournament_name::text,
    m.home_score::integer,
    m.opponent_score::integer,
    m.coaches::text,
    m.players::text,
    coalesce(m.absent_players, '[]'::jsonb),
    m.note::text,
    m.photo_url::text,
    m.video_url::text,
    coalesce(m.lineup, '[]'::jsonb),
    coalesce(m.current_lineup, '[]'::jsonb),
    coalesce(m.inning_logs, '[]'::jsonb),
    coalesce(m.batting_stats, '[]'::jsonb),
    coalesce(m.pitching_stats, '[]'::jsonb),
    m.current_batter_name::text,
    m.current_inning::text,
    m.current_b::integer,
    m.current_s::integer,
    m.current_o::integer,
    m.base_1::boolean,
    m.base_2::boolean,
    m.base_3::boolean,
    m.bat_first::boolean,
    m.show_lineup_intro::boolean,
    m.show_line_score::boolean,
    m.show_3d_field::boolean,
    m.line_score_data::jsonb,
    m.locked_by_user_id::uuid,
    m.locked_by_user_name::text,
    m.locked_at::timestamptz,
    m.created_at::timestamptz,
    m.updated_at::timestamptz
  from public.matches m
  where
    exists (
      select 1
      from regexp_split_to_table(coalesce(m.players, ''), '[,，、\n]+') as player_name(name)
      where btrim(player_name.name) = v_member_name
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(m.lineup, '[]'::jsonb)) as lineup_entry(value)
      where btrim(lineup_entry.value ->> 'name') = v_member_name
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(m.current_lineup, '[]'::jsonb)) as current_lineup_entry(value)
      where btrim(current_lineup_entry.value ->> 'name') = v_member_name
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(m.absent_players, '[]'::jsonb)) as absent_entry(value)
      where btrim(
        case
          when jsonb_typeof(absent_entry.value) = 'string' then absent_entry.value #>> '{}'
          else absent_entry.value ->> 'name'
        end
      ) = v_member_name
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(m.batting_stats, '[]'::jsonb)) as batting_stat(value)
      where btrim(batting_stat.value ->> 'name') = v_member_name
        or (v_member_number <> '' and btrim(batting_stat.value ->> 'number') = v_member_number)
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(m.pitching_stats, '[]'::jsonb)) as pitching_stat(value)
      where btrim(pitching_stat.value ->> 'name') = v_member_name
        or (v_member_number <> '' and btrim(pitching_stat.value ->> 'number') = v_member_number)
    )
  order by m.match_date desc nulls last, m.match_time desc nulls last;
end;
$$;

revoke all on function public.list_my_player_record_members() from public;
revoke all on function public.get_my_player_match_records(uuid) from public;

grant execute on function public.list_my_player_record_members() to authenticated;
grant execute on function public.get_my_player_match_records(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
