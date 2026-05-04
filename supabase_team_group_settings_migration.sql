begin;

create table if not exists public.team_group_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint team_group_settings_name_not_blank check (length(btrim(name)) > 0),
  constraint team_group_settings_name_unique unique (name)
);

comment on table public.team_group_settings
is 'Configurable roster team groups used by team_members.team_group.';

comment on column public.team_group_settings.name
is 'Display name for team_members.team_group. Kept as text for compatibility with existing views and RPCs.';

create index if not exists team_group_settings_sort_order_idx
  on public.team_group_settings (sort_order, name);

create or replace function public.set_team_group_settings_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name = btrim(new.name);
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_team_group_settings_updated_at on public.team_group_settings;
create trigger set_team_group_settings_updated_at
before insert or update on public.team_group_settings
for each row
execute function public.set_team_group_settings_updated_at();

update public.team_members
set team_group = case team_group
  when '灰熊(大組)' then '暴力熊(大組)'
  when '成灰熊(中組)' then '黑熊(中組)'
  else team_group
end
where team_group in ('灰熊(大組)', '成灰熊(中組)');

insert into public.team_group_settings (name, sort_order)
values
  ('拉拉熊(小組)', 10),
  ('泰迪熊(小組)', 20),
  ('黑熊(中組)', 30),
  ('北極熊(中組)', 40),
  ('暴力熊(大組)', 50)
on conflict (name) do update
set sort_order = excluded.sort_order;

insert into public.team_group_settings (name, sort_order)
select
  existing_groups.name,
  1000 + row_number() over (order by existing_groups.name) * 10
from (
  select distinct btrim(team_group) as name
  from public.team_members
  where btrim(coalesce(team_group, '')) <> ''
) existing_groups
on conflict (name) do nothing;

alter table public.team_group_settings enable row level security;

drop policy if exists "team_group_settings_select_players_view" on public.team_group_settings;
create policy "team_group_settings_select_players_view"
  on public.team_group_settings
  for select
  using (public.has_app_permission('players', 'VIEW'));

drop policy if exists "team_group_settings_insert_players_create" on public.team_group_settings;
create policy "team_group_settings_insert_players_create"
  on public.team_group_settings
  for insert
  with check (public.has_app_permission('players', 'CREATE'));

drop policy if exists "team_group_settings_update_players_edit" on public.team_group_settings;
create policy "team_group_settings_update_players_edit"
  on public.team_group_settings
  for update
  using (public.has_app_permission('players', 'EDIT'))
  with check (public.has_app_permission('players', 'EDIT'));

drop policy if exists "team_group_settings_delete_players_delete" on public.team_group_settings;
create policy "team_group_settings_delete_players_delete"
  on public.team_group_settings
  for delete
  using (public.has_app_permission('players', 'DELETE'));

revoke all on public.team_group_settings from public;
grant select, insert, update, delete on public.team_group_settings to authenticated, service_role;

drop function if exists public.list_team_group_settings();
create or replace function public.list_team_group_settings()
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
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('players', 'VIEW') then
    raise exception 'players:VIEW permission required';
  end if;

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

drop function if exists public.create_team_group_setting(text);
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

drop function if exists public.update_team_group_setting(uuid, text);
create or replace function public.update_team_group_setting(p_id uuid, p_name text)
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
  v_old_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('players', 'EDIT') then
    raise exception 'players:EDIT permission required';
  end if;

  if p_id is null then
    raise exception 'group id is required';
  end if;

  if v_name = '' then
    raise exception 'group name is required';
  end if;

  select settings.name
  into v_old_name
  from public.team_group_settings settings
  where settings.id = p_id
  for update;

  if v_old_name is null then
    raise exception 'team group not found';
  end if;

  update public.team_group_settings
  set name = v_name
  where team_group_settings.id = p_id;

  if v_old_name is distinct from v_name then
    update public.team_members
    set team_group = v_name
    where team_group = v_old_name;
  end if;

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
  where settings.id = p_id
  group by settings.id;
end;
$$;

drop function if exists public.delete_team_group_setting(uuid, uuid);
create or replace function public.delete_team_group_setting(
  p_id uuid,
  p_transfer_to_id uuid default null
)
returns table (
  deleted_name text,
  transferred_to_name text,
  transferred_member_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_transfer_to_name text;
  v_member_count integer := 0;
  v_transferred_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('players', 'DELETE') then
    raise exception 'players:DELETE permission required';
  end if;

  if p_id is null then
    raise exception 'group id is required';
  end if;

  select settings.name
  into v_name
  from public.team_group_settings settings
  where settings.id = p_id
  for update;

  if v_name is null then
    raise exception 'team group not found';
  end if;

  select count(*)::integer
  into v_member_count
  from public.team_members tm
  where tm.team_group = v_name
    and tm.role in ('球員', '校隊');

  if v_member_count > 0 then
    if not public.has_app_permission('players', 'EDIT') then
      raise exception 'players:EDIT permission required to transfer members';
    end if;

    if p_transfer_to_id is null then
      raise exception 'transfer target is required';
    end if;

    if p_transfer_to_id = p_id then
      raise exception 'transfer target cannot be the deleted group';
    end if;

    select settings.name
    into v_transfer_to_name
    from public.team_group_settings settings
    where settings.id = p_transfer_to_id
    for update;

    if v_transfer_to_name is null then
      raise exception 'transfer target not found';
    end if;

    update public.team_members
    set team_group = v_transfer_to_name
    where team_group = v_name;

    get diagnostics v_transferred_count = row_count;
  end if;

  delete from public.team_group_settings
  where team_group_settings.id = p_id;

  deleted_name := v_name;
  transferred_to_name := v_transfer_to_name;
  transferred_member_count := v_transferred_count;
  return next;
end;
$$;

revoke all on function public.list_team_group_settings() from public;
revoke all on function public.create_team_group_setting(text) from public;
revoke all on function public.update_team_group_setting(uuid, text) from public;
revoke all on function public.delete_team_group_setting(uuid, uuid) from public;

grant execute on function public.list_team_group_settings() to authenticated;
grant execute on function public.create_team_group_setting(text) to authenticated;
grant execute on function public.update_team_group_setting(uuid, text) to authenticated;
grant execute on function public.delete_team_group_setting(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
