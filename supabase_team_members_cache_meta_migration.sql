begin;

alter table public.team_members
  add column if not exists updated_at timestamptz;

update public.team_members
set updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where updated_at is null;

alter table public.team_members
  alter column updated_at set default timezone('utc', now()),
  alter column updated_at set not null;

create or replace function public.set_team_members_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_team_members_updated_at on public.team_members;
create trigger set_team_members_updated_at
before update on public.team_members
for each row
execute function public.set_team_members_updated_at();

drop function if exists public.get_team_members_cache_meta();

create or replace function public.get_team_members_cache_meta()
returns table (
  row_count bigint,
  latest_changed_at timestamptz
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
    count(*)::bigint as row_count,
    max(coalesce(tm.updated_at, tm.created_at)) as latest_changed_at
  from public.team_members tm;
end;
$$;

revoke all on function public.get_team_members_cache_meta() from public;
grant execute on function public.get_team_members_cache_meta() to authenticated;

commit;
