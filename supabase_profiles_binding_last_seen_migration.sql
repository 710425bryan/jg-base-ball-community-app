do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'linked_team_member_id'
  ) then
    alter table public.profiles
    add column if not exists linked_team_member_ids uuid[];

    update public.profiles
    set linked_team_member_ids = array[linked_team_member_id]
    where linked_team_member_id is not null
      and (linked_team_member_ids is null or cardinality(linked_team_member_ids) = 0);

    drop index if exists profiles_linked_team_member_id_idx;

    alter table public.profiles
    drop column linked_team_member_id;
  else
    alter table public.profiles
    add column if not exists linked_team_member_ids uuid[];
  end if;
end $$;

alter table public.profiles
add column if not exists last_seen_at timestamptz;

update public.profiles
set last_seen_at = coalesce(last_seen_at, updated_at, created_at)
where last_seen_at is null;

create index if not exists profiles_linked_team_member_ids_gin_idx
  on public.profiles using gin (linked_team_member_ids);

create index if not exists profiles_last_seen_at_idx
  on public.profiles(last_seen_at desc);

create or replace function public.touch_profile_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  update public.profiles
  set last_seen_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.touch_profile_last_seen() to authenticated;
