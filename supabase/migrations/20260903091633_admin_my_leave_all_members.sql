begin;

create or replace function public.enforce_profile_access_admin_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    old.role is distinct from new.role
    or old.linked_team_member_ids is distinct from new.linked_team_member_ids
  ) then
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;

    if not public.has_app_permission('users', 'EDIT') then
      raise exception 'users:EDIT permission required';
    end if;
  end if;

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

create or replace function public.list_my_leave_members()
returns table (
  member_id uuid,
  name text,
  role text,
  is_linked boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  return query
  with current_profile as (
    select
      coalesce(p.linked_team_member_ids, array[]::uuid[]) as linked_member_ids,
      public.current_profile_role() = 'ADMIN' as is_admin
    from public.profiles p
    where p.id = v_user_id
  )
  select
    tm.id,
    tm.name::text,
    tm.role::text,
    tm.id = any(cp.linked_member_ids) as is_linked
  from current_profile cp
  join public.team_members tm
    on cp.is_admin
    or tm.id = any(cp.linked_member_ids)
  where coalesce(tm.status, '在隊') not in ('退隊', '離隊')
    and coalesce(tm.is_inactive_or_graduated, false) = false
  order by
    case when tm.id = any(cp.linked_member_ids) then 0 else 1 end,
    case
      when tm.role = '校隊' then 0
      when tm.role = '球員' then 1
      else 2
    end,
    tm.name asc;
end;
$$;

create or replace function public.list_my_leave_requests(
  p_member_id uuid
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  leave_type text,
  leave_time_segment text,
  start_date date,
  end_date date,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_linked_member_ids uuid[] := array[]::uuid[];
  v_is_admin boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select
    coalesce(p.linked_team_member_ids, array[]::uuid[]),
    public.current_profile_role() = 'ADMIN'
  into v_linked_member_ids, v_is_admin
  from public.profiles p
  where p.id = v_user_id;

  if not coalesce(v_is_admin, false)
    and not coalesce(p_member_id = any(v_linked_member_ids), false) then
    raise exception 'member not linked to current profile';
  end if;

  return query
  select
    lr.id,
    tm.id as member_id,
    tm.name::text as member_name,
    tm.role::text as member_role,
    lr.leave_type::text,
    public.normalize_leave_time_segment(lr.leave_time_segment)::text,
    lr.start_date,
    lr.end_date,
    lr.reason::text,
    lr.created_at
  from public.leave_requests lr
  join public.team_members tm
    on tm.id = lr.user_id
  where lr.user_id = p_member_id
  order by lr.start_date desc, lr.created_at desc;
end;
$$;

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
  leave_time_segment text,
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
  v_linked_member_ids uuid[] := array[]::uuid[];
  v_is_admin boolean := false;
  v_member_name text;
  v_member_role text;
  v_record jsonb;
  v_leave_type text;
  v_leave_time_segment text;
  v_start_date date;
  v_end_date date;
  v_reason text;
  v_inserted public.leave_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select
    coalesce(p.linked_team_member_ids, array[]::uuid[]),
    public.current_profile_role() = 'ADMIN'
  into v_linked_member_ids, v_is_admin
  from public.profiles p
  where p.id = v_user_id;

  if not coalesce(v_is_admin, false)
    and not coalesce(p_member_id = any(v_linked_member_ids), false) then
    raise exception 'member not linked to current profile';
  end if;

  if p_records is null
    or jsonb_typeof(p_records) <> 'array'
    or jsonb_array_length(p_records) = 0 then
    raise exception 'records must be a non-empty array';
  end if;

  select tm.name::text, tm.role::text
  into v_member_name, v_member_role
  from public.team_members tm
  where tm.id = p_member_id
    and coalesce(tm.status, '在隊') not in ('退隊', '離隊')
    and coalesce(tm.is_inactive_or_graduated, false) = false;

  if v_member_name is null then
    raise exception 'member not found or inactive';
  end if;

  for v_record in
    select value
    from jsonb_array_elements(p_records)
  loop
    v_leave_type := nullif(btrim(v_record ->> 'leave_type'), '');
    v_start_date := nullif(v_record ->> 'start_date', '')::date;
    v_end_date := coalesce(nullif(v_record ->> 'end_date', '')::date, v_start_date);
    v_leave_time_segment := public.normalize_leave_time_segment(v_record ->> 'leave_time_segment');
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

    if v_start_date <> v_end_date then
      v_leave_time_segment := 'full_day';
    end if;

    insert into public.leave_requests (
      user_id,
      leave_type,
      leave_time_segment,
      start_date,
      end_date,
      reason
    )
    values (
      p_member_id,
      v_leave_type,
      v_leave_time_segment,
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
    leave_time_segment := public.normalize_leave_time_segment(v_inserted.leave_time_segment)::text;
    start_date := v_inserted.start_date;
    end_date := v_inserted.end_date;
    reason := v_inserted.reason::text;
    created_at := v_inserted.created_at;

    return next;
  end loop;

  return;
end;
$$;

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
  v_linked_member_ids uuid[] := array[]::uuid[];
  v_is_admin boolean := false;
  v_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select lr.user_id
  into v_member_id
  from public.leave_requests lr
  where lr.id = p_leave_request_id;

  if v_member_id is null then
    raise exception 'leave request not found';
  end if;

  select
    coalesce(p.linked_team_member_ids, array[]::uuid[]),
    public.current_profile_role() = 'ADMIN'
  into v_linked_member_ids, v_is_admin
  from public.profiles p
  where p.id = v_user_id;

  if not coalesce(v_is_admin, false)
    and not coalesce(v_member_id = any(v_linked_member_ids), false) then
    raise exception 'leave request not deletable by current profile';
  end if;

  delete from public.leave_requests lr
  where lr.id = p_leave_request_id;
end;
$$;

revoke all on function public.list_my_leave_members() from public, anon, authenticated, service_role;
revoke all on function public.list_my_leave_requests(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_my_leave_requests(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.delete_my_leave_request(uuid) from public, anon, authenticated, service_role;
revoke all on function public.enforce_profile_access_admin_guard() from public, anon, authenticated, service_role;
revoke all on function public.update_my_profile_settings(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.touch_profile_last_seen() from public, anon, authenticated, service_role;
revoke all on function public.admin_update_profile(uuid, text, text, text, text, uuid[], boolean, timestamptz, timestamptz) from public, anon, authenticated, service_role;

grant execute on function public.list_my_leave_members() to authenticated, service_role;
grant execute on function public.list_my_leave_requests(uuid) to authenticated, service_role;
grant execute on function public.create_my_leave_requests(uuid, jsonb) to authenticated, service_role;
grant execute on function public.delete_my_leave_request(uuid) to authenticated, service_role;
grant execute on function public.update_my_profile_settings(text, text, text, text) to authenticated, service_role;
grant execute on function public.touch_profile_last_seen() to authenticated, service_role;
grant execute on function public.admin_update_profile(uuid, text, text, text, text, uuid[], boolean, timestamptz, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
