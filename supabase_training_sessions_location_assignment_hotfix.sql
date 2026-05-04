begin;

drop function if exists public.list_training_sessions(uuid);

create or replace function public.list_training_sessions(p_member_id uuid default null)
returns table (
  session_id uuid,
  match_id uuid,
  match_name text,
  match_date date,
  match_time text,
  location text,
  category_group text,
  manual_status text,
  registration_start_at timestamptz,
  registration_end_at timestamptz,
  capacity integer,
  point_cost integer,
  published_at timestamptz,
  selected_count integer,
  applied_count integer,
  is_registration_open boolean,
  registration_id uuid,
  registration_status text,
  point_status text,
  is_blocked boolean,
  block_reason text,
  selected_members jsonb,
  training_locations jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_manage boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_can_manage := public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE');

  if p_member_id is not null
    and not v_can_manage
    and not public.is_profile_linked_to_member(p_member_id)
  then
    raise exception 'member not linked to current profile';
  end if;

  return query
  select
    tss.id as session_id,
    m.id as match_id,
    m.match_name::text,
    m.match_date,
    m.match_time::text,
    m.location::text,
    m.category_group::text,
    coalesce(tss.manual_status, 'draft')::text as manual_status,
    tss.registration_start_at,
    tss.registration_end_at,
    tss.capacity,
    coalesce(tss.point_cost, 1) as point_cost,
    tss.published_at,
    coalesce(reg_counts.selected_count, 0) as selected_count,
    coalesce(reg_counts.applied_count, 0) as applied_count,
    (
      tss.id is not null
      and public.is_training_registration_window_open(
        tss.manual_status,
        tss.registration_start_at,
        tss.registration_end_at
      )
    ) as is_registration_open,
    my_reg.id as registration_id,
    my_reg.status::text as registration_status,
    my_reg.point_status::text as point_status,
    coalesce(block_state.is_blocked, false) as is_blocked,
    block_state.reason as block_reason,
    case
      when tss.id is not null
        and (
          v_can_manage
          or (tss.published_at is not null and tss.published_at <= now())
        )
      then coalesce(selected_roster.members, '[]'::jsonb)
      else '[]'::jsonb
    end as selected_members,
    case
      when tss.id is not null
        and (
          v_can_manage
          or (tss.published_at is not null and tss.published_at <= now())
        )
      then coalesce(location_roster.locations, '[]'::jsonb)
      else '[]'::jsonb
    end as training_locations
  from public.matches m
  left join public.training_session_settings tss
    on tss.match_id = m.id
  left join lateral (
    select
      count(*) filter (where tr.status = 'selected')::integer as selected_count,
      count(*) filter (where tr.status in ('applied', 'selected', 'waitlisted'))::integer as applied_count
    from public.training_registrations tr
    where tr.session_id = tss.id
  ) reg_counts on true
  left join public.training_registrations my_reg
    on my_reg.session_id = tss.id
   and my_reg.member_id = p_member_id
  left join lateral (
    select
      true as is_blocked,
      coalesce(nullif(b.reason, ''), '上次特訓未到，下一場暫停報名')::text as reason
    from public.training_no_show_blocks b
    where b.member_id = p_member_id
      and b.status = 'active'
      and (
        b.blocked_session_id = tss.id
        or (
          b.blocked_session_id is null
          and public.get_next_training_session_id(b.source_session_id) = tss.id
        )
      )
    order by b.created_at desc
    limit 1
  ) block_state on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'member_id', tm.id,
        'name', tm.name,
        'role', tm.role,
        'team_group', tm.team_group,
        'jersey_number', tm.jersey_number
      )
      order by tm.role, tm.name
    ) as members
    from public.training_registrations selected_reg
    join public.team_members tm
      on tm.id = selected_reg.member_id
    where selected_reg.session_id = tss.id
      and selected_reg.status = 'selected'
  ) selected_roster on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'location_id', tl.id,
        'location_name', tl.location_name,
        'training_time', tl.training_time,
        'coach_names', tl.coach_names,
        'sort_order', tl.sort_order,
        'members', coalesce(assigned_members.members, '[]'::jsonb)
      )
      order by tl.sort_order asc, tl.created_at asc
    ) as locations
    from public.training_locations tl
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'member_id', tm.id,
          'name', tm.name,
          'role', tm.role,
          'team_group', tm.team_group,
          'jersey_number', tm.jersey_number,
          'training_location_id', tl.id,
          'training_location_name', tl.location_name,
          'training_time', tl.training_time,
          'coach_names', tl.coach_names
        )
        order by tm.role, tm.name
      ) as members
      from public.training_location_assignments tla
      join public.training_registrations tr
        on tr.id = tla.registration_id
       and tr.status = 'selected'
      join public.team_members tm
        on tm.id = tla.member_id
      where tla.session_venue_id = tl.id
    ) assigned_members on true
    where tl.session_id = tss.id
  ) location_roster on true
  where m.match_level = '特訓課'
    and (v_can_manage or tss.id is not null)
  order by m.match_date asc, coalesce(m.match_time, '') asc, m.match_name asc;
end;
$$;

revoke all on function public.list_training_sessions(uuid) from public;
grant execute on function public.list_training_sessions(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
