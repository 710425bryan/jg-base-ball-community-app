begin;

alter table public.team_members
  add column if not exists training_program text;

comment on column public.team_members.training_program
is 'School-team training program identity for roster members. Keeps 中港/新泰 identity separate from team_group.';

update public.team_members tm
set training_program = case
  when lower(btrim(coalesce(tm.team_group, ''))) = lower('國中校隊') then 'junior_high_school_team'
  else 'chunggang_school_team'
end
where tm.role = '校隊'
  and nullif(btrim(coalesce(tm.training_program, '')), '') is null;

create index if not exists team_members_training_program_idx
  on public.team_members (training_program)
  where training_program is not null;

create or replace view public.team_members_safe as
select
  tm.id,
  tm.name,
  tm.role,
  tm.team_group,
  tm.status,
  tm.birth_date,
  tm.is_early_enrollment,
  tm.is_primary_payer,
  tm.is_half_price,
  tm.jersey_number,
  tm.jersey_name,
  tm.jersey_size,
  tm.low_income_qualification,
  tm.sibling_ids,
  tm.sibling_id,
  tm.throwing_hand,
  tm.batting_hand,
  tm.contact_relation,
  tm.guardian_name,
  tm.portrait_auth,
  tm.notes,
  tm.avatar_url,
  tm.created_at,
  tm.is_inactive_or_graduated,
  tm.fee_billing_mode,
  tm.joined_date,
  tm.school_name,
  tm.grade,
  tm.training_program
from public.team_members tm;

create or replace function public.get_member_training_program_key_v2(
  p_training_program text,
  p_team_group text,
  p_role text default null,
  p_fee_billing_mode text default null
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_program_key text := nullif(regexp_replace(lower(btrim(coalesce(p_training_program, ''))), '[^a-z0-9_:-]+', '_', 'g'), '');
begin
  if v_program_key is not null and exists (
    select 1
    from public.training_program_settings tps
    where tps.is_active
      and tps.program_key = v_program_key
  ) then
    return v_program_key;
  end if;

  select tps.program_key
  into v_program_key
  from public.training_program_settings tps
  where tps.is_active
    and tps.team_group is not null
    and lower(btrim(tps.team_group)) = lower(btrim(coalesce(p_team_group, '')))
  order by tps.sort_order, tps.program_key
  limit 1;

  if v_program_key is not null then
    return v_program_key;
  end if;

  if p_role = '校隊' or coalesce(p_fee_billing_mode, '') = 'monthly_per_session' then
    return 'chunggang_school_team';
  end if;

  return null;
end;
$$;

create or replace function public.list_training_date_notification_targets(
  p_month_start date,
  p_program_key text
)
returns table (
  user_id uuid,
  member_id uuid,
  member_name text,
  program_key text,
  program_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_key text := public.normalize_training_program_key(p_program_key);
begin
  return query
  select distinct
    p.id,
    tm.id,
    tm.name::text,
    v_program_key,
    coalesce(tps.label, v_program_key)::text
  from public.profiles p
  join public.team_members_safe tm
    on tm.id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
  left join public.training_program_settings tps
    on tps.program_key = v_program_key
  where coalesce(p.is_active, true) is not false
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now())
    and tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('離隊', '退隊')
    and public.get_member_training_program_key_v2(tm.training_program::text, tm.team_group::text, tm.role::text, tm.fee_billing_mode::text) = v_program_key
  order by p.id, tm.name;
end;
$$;

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
    select public.get_member_training_program_key_v2(tm.training_program::text, tm.team_group::text, tm.role::text, tm.fee_billing_mode::text) as program_key
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

do $$
declare
  v_function_def text;
  v_next_def text;
begin
  select pg_get_functiondef('public.get_my_payment_submission_estimate(uuid,text)'::regprocedure)
  into v_function_def;

  v_next_def := replace(
    v_function_def,
    'public.get_member_training_program_key(team_members.team_group::text, team_members.role::text, team_members.fee_billing_mode::text)',
    'public.get_member_training_program_key_v2(team_members.training_program::text, team_members.team_group::text, team_members.role::text, team_members.fee_billing_mode::text)'
  );

  if v_next_def = v_function_def
    and v_function_def not like '%get_member_training_program_key_v2(team_members.training_program::text%'
  then
    raise exception 'get_my_payment_submission_estimate training program expression not found';
  end if;

  if v_next_def <> v_function_def then
    execute v_next_def;
  end if;
end $$;

do $$
declare
  v_function_def text;
  v_next_def text;
begin
  select pg_get_functiondef('public.review_profile_payment_submission(uuid,text,integer)'::regprocedure)
  into v_function_def;

  v_next_def := replace(
    v_function_def,
    'public.get_member_training_program_key(tm.team_group::text, tm.role::text, tm.fee_billing_mode::text)',
    'public.get_member_training_program_key_v2(tm.training_program::text, tm.team_group::text, tm.role::text, tm.fee_billing_mode::text)'
  );

  if v_next_def = v_function_def
    and v_function_def not like '%get_member_training_program_key_v2(tm.training_program::text%'
  then
    raise exception 'review_profile_payment_submission training program expression not found';
  end if;

  if v_next_def <> v_function_def then
    execute v_next_def;
  end if;
end $$;

revoke all on function public.get_member_training_program_key_v2(text, text, text, text) from public, anon;
grant execute on function public.get_member_training_program_key_v2(text, text, text, text) to authenticated, service_role;

revoke all on function public.list_training_date_notification_targets(date, text) from public, anon, authenticated;
grant execute on function public.list_training_date_notification_targets(date, text) to service_role;

revoke all on function public.list_training_location_roster(date, text) from public, anon;
grant execute on function public.list_training_location_roster(date, text) to authenticated, service_role;

revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public, anon;
grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated, service_role;

revoke all on function public.review_profile_payment_submission(uuid, text, integer) from public, anon;
grant execute on function public.review_profile_payment_submission(uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
