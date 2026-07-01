begin;

create or replace function public.get_monthly_period_index(p_period_key text)
returns integer
language sql
immutable
set search_path = public
as $$
  with normalized as (
    select nullif(btrim(p_period_key), '') as period_key
  )
  select case
    when period_key ~ '^[0-9]{4}-[0-9]{2}$'
      then substring(period_key from 1 for 4)::integer * 12
        + substring(period_key from 6 for 2)::integer
    else null::integer
  end
  from normalized;
$$;

create or replace function public.get_monthly_payment_open_period_key(
  p_calculation_type text default 'per_session',
  p_date date default ((now() at time zone 'Asia/Taipei')::date)
)
returns text
language sql
stable
set search_path = public
as $$
  with normalized as (
    select
      coalesce(nullif(btrim(p_calculation_type), ''), 'per_session') as calculation_type,
      coalesce(p_date, (now() at time zone 'Asia/Taipei')::date) as date_value
  ),
  target_date as (
    select case
      when calculation_type = 'monthly_fixed'
        and extract(day from date_value)::integer >= 25
        then (date_value + interval '1 month')::date
      when calculation_type = 'monthly_fixed'
        then date_value
      else (date_value - interval '1 month')::date
    end as date_value
    from normalized
  )
  select to_char(date_value, 'YYYY-MM')
  from target_date;
$$;

create or replace function public.is_monthly_payment_period_open(
  p_period_key text,
  p_calculation_type text default 'per_session',
  p_date date default ((now() at time zone 'Asia/Taipei')::date)
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    public.get_monthly_period_index(p_period_key)
      <= public.get_monthly_period_index(public.get_monthly_payment_open_period_key(p_calculation_type, p_date)),
    false
  );
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
    public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text),
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

drop trigger if exists guard_profile_payment_submission_monthly_open_period
  on public.profile_payment_submissions;

create trigger guard_profile_payment_submission_monthly_open_period
before insert or update of billing_mode, period_key, member_id
on public.profile_payment_submissions
for each row
execute function public.guard_profile_payment_submission_monthly_open_period();

revoke all on function public.get_monthly_period_index(text) from public;
revoke all on function public.get_monthly_payment_open_period_key(text, date) from public;
revoke all on function public.is_monthly_payment_period_open(text, text, date) from public;
revoke all on function public.guard_profile_payment_submission_monthly_open_period() from public;

grant execute on function public.get_monthly_period_index(text) to authenticated, service_role;
grant execute on function public.get_monthly_payment_open_period_key(text, date) to authenticated, service_role;
grant execute on function public.is_monthly_payment_period_open(text, text, date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
