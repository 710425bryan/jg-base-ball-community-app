begin;

drop function if exists public.get_monthly_fee_calculation_type(text, text, text);

create or replace function public.get_monthly_fee_calculation_type(
  p_role text,
  p_fee_billing_mode text,
  p_training_program text
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_role = '校隊'
      and coalesce(p_fee_billing_mode, 'role_default') <> 'no_fee'
      and public.normalize_training_program_key(p_training_program) = 'junior_high_school_team'
      then 'monthly_fixed'
    when p_role = '球員'
      and coalesce(p_fee_billing_mode, 'role_default') = 'monthly_fixed'
      then 'monthly_fixed'
    else 'per_session'
  end;
$$;

create or replace function public.get_monthly_fee_calculation_type(
  p_role text,
  p_fee_billing_mode text default 'role_default'
)
returns text
language sql
stable
set search_path = public
as $$
  select public.get_monthly_fee_calculation_type(p_role, p_fee_billing_mode, null::text);
$$;

drop function if exists public.list_my_payment_members();

create or replace function public.list_my_payment_members()
returns table (
  member_id uuid,
  name text,
  role text,
  billing_mode text,
  fee_billing_mode text,
  is_linked boolean,
  balance_amount integer,
  training_program text,
  training_program_label text
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
  select
    tm.id,
    tm.name::text,
    tm.role::text,
    public.get_effective_payment_billing_mode(
      tm.role::text,
      tm.fee_billing_mode::text
    ) as billing_mode,
    tm.fee_billing_mode::text,
    tm.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) as is_linked,
    public.get_player_balance_unchecked(tm.id) as balance_amount,
    member_program.program_key as training_program,
    case
      when member_program.program_key is null then null::text
      else coalesce(tps.label, member_program.program_key)::text
    end as training_program_label
  from public.profiles
  join public.team_members tm
    on (
      tm.role in ('校隊', '球員')
      and coalesce(tm.status, '在隊') not in ('退隊', '離隊')
      and coalesce(tm.is_inactive_or_graduated, false) = false
      and (
        tm.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        or public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
      )
    )
  left join lateral (
    select nullif(
      regexp_replace(lower(btrim(coalesce(tm.training_program::text, ''))), '[^a-z0-9_:-]+', '_', 'g'),
      ''
    ) as program_key
  ) member_program on true
  left join public.training_program_settings tps
    on tps.program_key = member_program.program_key
  where profiles.id = v_user_id
  order by
    case when tm.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) then 0 else 1 end,
    case
      when tm.role = '校隊' and coalesce(tm.fee_billing_mode, 'role_default') <> 'no_fee' then 0
      when tm.fee_billing_mode = 'monthly_per_session' then 1
      when public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text, tm.training_program::text) = 'monthly_fixed' then 2
      when public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly' then 3
      else 4
    end,
    tm.name asc;
end;
$$;

create or replace function public.guard_profile_payment_submission_monthly_open_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_key text := upper(nullif(btrim(new.period_key), ''));
  v_calculation_type text;
  v_open_period_key text;
begin
  if coalesce(new.billing_mode, '') <> 'monthly' then
    return new;
  end if;

  if v_period_key is null or v_period_key !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'monthly period_key must look like YYYY-MM';
  end if;

  select coalesce(
    mf.calculation_type,
    public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text, tm.training_program::text),
    'per_session'
  )
  into v_calculation_type
  from public.team_members tm
  left join public.monthly_fees mf
    on mf.member_id = tm.id
   and mf.year_month = v_period_key
  where tm.id = new.member_id
  limit 1;

  if v_calculation_type is null then
    raise exception 'member not found for monthly payment submission';
  end if;

  v_open_period_key := public.get_monthly_payment_open_period_key(v_calculation_type);

  if not public.is_monthly_payment_period_open(v_period_key, v_calculation_type) then
    raise exception 'monthly period % is not open yet; current open monthly period is %',
      v_period_key,
      v_open_period_key;
  end if;

  new.period_key := v_period_key;
  return new;
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
    'public.get_monthly_fee_calculation_type(team_members.role::text, team_members.fee_billing_mode::text)',
    'public.get_monthly_fee_calculation_type(team_members.role::text, team_members.fee_billing_mode::text, team_members.training_program::text)'
  );

  if v_next_def = v_function_def
    and v_function_def not like '%get_monthly_fee_calculation_type(team_members.role::text, team_members.fee_billing_mode::text, team_members.training_program::text)%'
  then
    raise exception 'get_my_payment_submission_estimate monthly calculation expression not found';
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
    'public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text)',
    'public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text, tm.training_program::text)'
  );

  if v_next_def = v_function_def
    and v_function_def not like '%get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text, tm.training_program::text)%'
  then
    raise exception 'review_profile_payment_submission monthly calculation expression not found';
  end if;

  if v_next_def <> v_function_def then
    execute v_next_def;
  end if;
end $$;

revoke all on function public.get_monthly_fee_calculation_type(text, text) from public, anon;
revoke all on function public.get_monthly_fee_calculation_type(text, text, text) from public, anon;
revoke all on function public.list_my_payment_members() from public, anon;
revoke all on function public.guard_profile_payment_submission_monthly_open_period() from public;
revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public, anon;
revoke all on function public.review_profile_payment_submission(uuid, text, integer) from public, anon;

grant execute on function public.get_monthly_fee_calculation_type(text, text) to authenticated, service_role;
grant execute on function public.get_monthly_fee_calculation_type(text, text, text) to authenticated, service_role;
grant execute on function public.list_my_payment_members() to authenticated, service_role;
grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated, service_role;
grant execute on function public.review_profile_payment_submission(uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
