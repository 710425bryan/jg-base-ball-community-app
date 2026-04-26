begin;

alter table public.profiles
add column if not exists is_active boolean,
add column if not exists access_start timestamptz,
add column if not exists access_end timestamptz;

update public.profiles
set is_active = coalesce(is_active, true)
where is_active is null;

alter table public.profiles
alter column is_active set default true,
alter column is_active set not null;

create index if not exists profiles_access_status_idx
  on public.profiles(is_active, access_start, access_end);

create or replace function public.current_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now())
  limit 1;
$$;

create or replace function public.can_request_magic_link(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when nullif(lower(btrim(coalesce(p_email, ''))), '') is null then false
    else exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(btrim(p_email))
        and p.is_active
        and (p.access_start is null or p.access_start <= now())
        and (p.access_end is null or p.access_end >= now())
    )
  end;
$$;

drop function if exists public.admin_insert_profile(uuid, text, text, text, text, text);

create or replace function public.admin_insert_profile(
  target_id uuid,
  p_email text,
  p_name text,
  p_nickname text default null,
  p_role text default 'COACH',
  p_avatar text default null,
  p_is_active boolean default true,
  p_access_start timestamptz default null,
  p_access_end timestamptz default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_email text := lower(nullif(btrim(p_email), ''));
  v_name text := nullif(btrim(p_name), '');
  v_nickname text := nullif(btrim(p_nickname), '');
  v_role text := coalesce(nullif(btrim(p_role), ''), 'COACH');
  v_avatar text := nullif(btrim(p_avatar), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('users', 'CREATE') then
    raise exception 'users:CREATE permission required';
  end if;

  if target_id is null then
    raise exception 'target_id is required';
  end if;

  if v_email is null then
    raise exception 'email is required';
  end if;

  if v_name is null then
    raise exception 'name is required';
  end if;

  if p_access_start is not null and p_access_end is not null and p_access_start > p_access_end then
    raise exception 'access_start must be before access_end';
  end if;

  insert into public.profiles (
    id,
    email,
    name,
    nickname,
    role,
    avatar_url,
    is_active,
    access_start,
    access_end,
    created_at,
    updated_at
  )
  values (
    target_id,
    v_email,
    v_name,
    v_nickname,
    v_role,
    v_avatar,
    coalesce(p_is_active, true),
    p_access_start,
    p_access_end,
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    nickname = excluded.nickname,
    role = excluded.role,
    avatar_url = excluded.avatar_url,
    is_active = excluded.is_active,
    access_start = excluded.access_start,
    access_end = excluded.access_end,
    updated_at = now()
  returning *
  into v_profile;

  return v_profile;
end;
$$;

create or replace function public.admin_update_profile(
  target_id uuid,
  p_name text,
  p_nickname text default null,
  p_role text default 'COACH',
  p_avatar text default null,
  p_linked_team_member_ids uuid[] default null,
  p_is_active boolean default true,
  p_access_start timestamptz default null,
  p_access_end timestamptz default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_name text := nullif(btrim(p_name), '');
  v_nickname text := nullif(btrim(p_nickname), '');
  v_role text := coalesce(nullif(btrim(p_role), ''), 'COACH');
  v_avatar text := nullif(btrim(p_avatar), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('users', 'EDIT') then
    raise exception 'users:EDIT permission required';
  end if;

  if target_id is null then
    raise exception 'target_id is required';
  end if;

  if v_name is null then
    raise exception 'name is required';
  end if;

  if p_access_start is not null and p_access_end is not null and p_access_start > p_access_end then
    raise exception 'access_start must be before access_end';
  end if;

  if target_id = auth.uid() and (
    not coalesce(p_is_active, true)
    or (p_access_start is not null and p_access_start > now())
    or (p_access_end is not null and p_access_end < now())
  ) then
    raise exception 'cannot disable current user';
  end if;

  update public.profiles
  set
    name = v_name,
    nickname = v_nickname,
    role = v_role,
    avatar_url = v_avatar,
    linked_team_member_ids = p_linked_team_member_ids,
    is_active = coalesce(p_is_active, true),
    access_start = p_access_start,
    access_end = p_access_end,
    updated_at = now()
  where id = target_id
  returning *
  into v_profile;

  if not found then
    raise exception 'profile not found';
  end if;

  return v_profile;
end;
$$;

create or replace function public.enforce_profile_access_admin_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    old.is_active is distinct from new.is_active
    or old.access_start is distinct from new.access_start
    or old.access_end is distinct from new.access_end
  ) then
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;

    if auth.uid() = new.id then
      raise exception 'cannot change current user access settings';
    end if;

    if not public.has_app_permission('users', 'EDIT') then
      raise exception 'users:EDIT permission required';
    end if;

    if new.access_start is not null and new.access_end is not null and new.access_start > new.access_end then
      raise exception 'access_start must be before access_end';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_access_admin_guard on public.profiles;
create trigger profiles_access_admin_guard
  before update on public.profiles
  for each row
  execute function public.enforce_profile_access_admin_guard();

revoke all on function public.current_profile_role() from public;
grant execute on function public.current_profile_role() to anon, authenticated, service_role;

revoke all on function public.can_request_magic_link(text) from public;
grant execute on function public.can_request_magic_link(text) to anon, authenticated, service_role;

revoke all on function public.admin_insert_profile(uuid, text, text, text, text, text, boolean, timestamptz, timestamptz) from public;
grant execute on function public.admin_insert_profile(uuid, text, text, text, text, text, boolean, timestamptz, timestamptz) to authenticated, service_role;

revoke all on function public.admin_update_profile(uuid, text, text, text, text, uuid[], boolean, timestamptz, timestamptz) from public;
grant execute on function public.admin_update_profile(uuid, text, text, text, text, uuid[], boolean, timestamptz, timestamptz) to authenticated, service_role;

commit;
