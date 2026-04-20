begin;

drop function if exists public.list_my_leave_members();

create or replace function public.list_my_leave_members()
returns table (
  member_id uuid,
  name text,
  role text,
  is_linked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  return query
  select
    team_members.id,
    team_members.name::text,
    team_members.role::text,
    true as is_linked
  from public.profiles
  join public.team_members
    on team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  where profiles.id = v_user_id
  order by
    case
      when team_members.role = '校隊' then 0
      when team_members.role = '球員' then 1
      else 2
    end,
    team_members.name asc;
end;
$$;

drop function if exists public.list_my_leave_requests(uuid);

create or replace function public.list_my_leave_requests(
  p_member_id uuid
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  leave_type text,
  start_date date,
  end_date date,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  return query
  select
    leave_requests.id,
    team_members.id as member_id,
    team_members.name::text as member_name,
    team_members.role::text as member_role,
    leave_requests.leave_type::text,
    leave_requests.start_date,
    leave_requests.end_date,
    leave_requests.reason::text,
    leave_requests.created_at
  from public.leave_requests
  join public.team_members
    on team_members.id = leave_requests.user_id
  where leave_requests.user_id = p_member_id
  order by leave_requests.start_date desc, leave_requests.created_at desc;
end;
$$;

drop function if exists public.create_my_leave_requests(uuid, jsonb);

create or replace function public.create_my_leave_requests(
  p_member_id uuid,
  p_records jsonb
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  leave_type text,
  start_date date,
  end_date date,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_name text;
  v_member_role text;
  v_record jsonb;
  v_leave_type text;
  v_start_date date;
  v_end_date date;
  v_reason text;
  v_inserted public.leave_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'records must be a non-empty array';
  end if;

  select team_members.name::text, team_members.role::text
  into v_member_name, v_member_role
  from public.team_members
  where team_members.id = p_member_id;

  if v_member_name is null then
    raise exception 'member not found';
  end if;

  for v_record in
    select value
    from jsonb_array_elements(p_records)
  loop
    v_leave_type := nullif(btrim(v_record ->> 'leave_type'), '');
    v_start_date := nullif(v_record ->> 'start_date', '')::date;
    v_end_date := coalesce(nullif(v_record ->> 'end_date', '')::date, v_start_date);
    v_reason := nullif(btrim(v_record ->> 'reason'), '');

    if v_leave_type is null then
      raise exception 'leave_type is required';
    end if;

    if v_start_date is null then
      raise exception 'start_date is required';
    end if;

    if v_end_date is null then
      raise exception 'end_date is required';
    end if;

    if v_end_date < v_start_date then
      raise exception 'end_date must be on or after start_date';
    end if;

    insert into public.leave_requests (
      user_id,
      leave_type,
      start_date,
      end_date,
      reason
    )
    values (
      p_member_id,
      v_leave_type,
      v_start_date,
      v_end_date,
      v_reason
    )
    returning *
    into v_inserted;

    id := v_inserted.id;
    member_id := p_member_id;
    member_name := v_member_name;
    member_role := v_member_role;
    leave_type := v_inserted.leave_type::text;
    start_date := v_inserted.start_date;
    end_date := v_inserted.end_date;
    reason := v_inserted.reason::text;
    created_at := v_inserted.created_at;

    return next;
  end loop;

  return;
end;
$$;

drop function if exists public.delete_my_leave_request(uuid);

create or replace function public.delete_my_leave_request(
  p_leave_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select leave_requests.user_id
  into v_member_id
  from public.leave_requests
  where leave_requests.id = p_leave_request_id;

  if v_member_id is null then
    raise exception 'leave request not found';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and v_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'leave request not deletable by current profile';
  end if;

  delete from public.leave_requests
  where leave_requests.id = p_leave_request_id;
end;
$$;

grant execute on function public.list_my_leave_members() to authenticated;
grant execute on function public.list_my_leave_requests(uuid) to authenticated;
grant execute on function public.create_my_leave_requests(uuid, jsonb) to authenticated;
grant execute on function public.delete_my_leave_request(uuid) to authenticated;

commit;
