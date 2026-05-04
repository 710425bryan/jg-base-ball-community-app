begin;

create or replace function public.create_team_group_setting(p_name text)
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
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('players', 'CREATE') then
    raise exception 'players:CREATE permission required';
  end if;

  if v_name = '' then
    raise exception 'group name is required';
  end if;

  insert into public.team_group_settings (name, sort_order)
  values (
    v_name,
    coalesce((select max(settings.sort_order) + 10 from public.team_group_settings settings), 10)
  )
  returning team_group_settings.id into v_id;

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
  where settings.id = v_id
  group by settings.id;
end;
$$;

revoke all on function public.create_team_group_setting(text) from public;
grant execute on function public.create_team_group_setting(text) to authenticated;

notify pgrst, 'reload schema';

commit;
