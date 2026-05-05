begin;

drop function if exists public.reorder_team_group_settings(uuid[]);
create or replace function public.reorder_team_group_settings(p_group_ids uuid[])
returns table (
  id uuid,
  name text,
  sort_order integer,
  member_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_ids uuid[] := coalesce(p_group_ids, array[]::uuid[]);
  v_input_count integer := 0;
  v_distinct_count integer := 0;
  v_existing_count integer := 0;
  v_total_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('players', 'EDIT') then
    raise exception 'players:EDIT permission required';
  end if;

  select count(*)::integer, count(distinct requested.group_id)::integer
  into v_input_count, v_distinct_count
  from unnest(v_group_ids) as requested(group_id);

  if v_input_count = 0 then
    raise exception 'group order is required';
  end if;

  if v_input_count <> v_distinct_count then
    raise exception 'group order contains duplicate or empty ids';
  end if;

  select count(*)::integer
  into v_total_count
  from public.team_group_settings;

  if v_input_count <> v_total_count then
    raise exception 'group order is stale; refresh and try again';
  end if;

  select count(*)::integer
  into v_existing_count
  from public.team_group_settings settings
  where settings.id = any(v_group_ids);

  if v_existing_count <> v_input_count then
    raise exception 'group order contains unknown group id';
  end if;

  with ordered_groups as (
    select
      requested.group_id,
      requested.ordinality::integer as position
    from unnest(v_group_ids) with ordinality as requested(group_id, ordinality)
  )
  update public.team_group_settings settings
  set sort_order = ordered_groups.position * 10
  from ordered_groups
  where settings.id = ordered_groups.group_id;

  return query
  select
    settings.id,
    settings.name::text,
    settings.sort_order,
    count(tm.id)::bigint as member_count,
    settings.created_at,
    settings.updated_at
  from public.team_group_settings settings
  left join public.team_members tm
    on tm.team_group = settings.name
   and tm.role in ('球員', '校隊')
  group by settings.id
  order by settings.sort_order, settings.name;
end;
$$;

revoke all on function public.reorder_team_group_settings(uuid[]) from public;
grant execute on function public.reorder_team_group_settings(uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
