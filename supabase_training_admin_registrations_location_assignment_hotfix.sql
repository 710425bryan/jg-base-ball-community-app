begin;

drop function if exists public.list_training_admin_registrations(uuid);

create or replace function public.list_training_admin_registrations(p_session_id uuid)
returns table (
  registration_id uuid,
  session_id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  team_group text,
  jersey_number text,
  status text,
  point_status text,
  note text,
  applied_by uuid,
  applied_by_name text,
  selected_by uuid,
  selected_at timestamptz,
  created_at timestamptz,
  point_balance integer,
  reserved_points integer,
  available_points integer,
  training_location_id uuid,
  training_location_name text,
  training_time text,
  coach_names text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE')
  ) then
    raise exception 'training management permission required';
  end if;

  return query
  select
    tr.id,
    tr.session_id,
    tr.member_id,
    tm.name::text,
    tm.role::text,
    tm.team_group::text,
    tm.jersey_number::text,
    tr.status::text,
    tr.point_status::text,
    tr.note::text,
    tr.applied_by,
    coalesce(p.nickname, p.name)::text as applied_by_name,
    tr.selected_by,
    tr.selected_at,
    tr.created_at,
    public.get_player_point_balance(tr.member_id),
    public.get_player_reserved_training_points(tr.member_id),
    public.get_player_available_training_points(tr.member_id),
    tla.session_venue_id,
    tl.location_name::text,
    tl.training_time::text,
    tl.coach_names::text
  from public.training_registrations tr
  join public.team_members tm
    on tm.id = tr.member_id
  left join public.profiles p
    on p.id = tr.applied_by
  left join public.training_location_assignments tla
    on tla.registration_id = tr.id
  left join public.training_locations tl
    on tl.id = tla.session_venue_id
  where tr.session_id = p_session_id
  order by
    case tr.status
      when 'selected' then 0
      when 'applied' then 1
      when 'waitlisted' then 2
      when 'rejected' then 3
      else 4
    end,
    tm.role,
    tm.name
  limit 200;
end;
$$;

revoke all on function public.list_training_admin_registrations(uuid) from public;
grant execute on function public.list_training_admin_registrations(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
