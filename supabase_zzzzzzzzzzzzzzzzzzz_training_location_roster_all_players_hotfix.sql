begin;

create or replace function public.list_training_location_roster(
  p_training_date date,
  p_program_key text
)
returns table (
  member_id uuid,
  name text,
  role text,
  team_group text,
  training_program text,
  training_program_label text,
  jersey_number text,
  fee_billing_mode text,
  is_on_leave boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_training_date date := coalesce(p_training_date, (now() at time zone 'Asia/Taipei')::date);
begin
  perform public.assert_training_locations_permission('VIEW');
  perform public.normalize_training_program_key(p_program_key);

  return query
  select
    tm.id,
    tm.name::text,
    tm.role::text,
    tm.team_group::text,
    member_program.program_key,
    coalesce(tps.label, member_program.program_key)::text,
    tm.jersey_number::text,
    tm.fee_billing_mode::text,
    exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = tm.id
        and public.leave_request_overlaps_event(
          lr.start_date,
          lr.end_date,
          lr.leave_time_segment,
          v_training_date,
          public.get_training_location_leave_event_time(null, null)
        )
    ) as is_on_leave
  from public.team_members_safe tm
  left join lateral (
    select public.get_member_training_program_key(tm.team_group::text, tm.role::text, tm.fee_billing_mode::text) as program_key
  ) member_program on true
  left join public.training_program_settings tps
    on tps.program_key = member_program.program_key
  where tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('離隊', '退隊')
  order by
    case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
    tm.team_group nulls last,
    tm.name;
end;
$$;

revoke all on function public.list_training_location_roster(date, text) from public, anon;
grant execute on function public.list_training_location_roster(date, text) to authenticated, service_role;

commit;
