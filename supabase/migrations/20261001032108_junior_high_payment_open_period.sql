begin;

-- Payment availability depends on member identity, independently of the saved
-- amount/calculation snapshot. No fee rows, submissions or balances are changed.
create or replace function public.get_monthly_payment_open_calculation_type(
  p_role text,
  p_fee_billing_mode text,
  p_training_program text,
  p_calculation_type text
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
    when p_role = '校隊' then 'per_session'
    else coalesce(nullif(btrim(p_calculation_type), ''), 'per_session')
  end;
$$;

revoke all on function public.get_monthly_payment_open_calculation_type(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_monthly_payment_open_calculation_type(text, text, text, text)
  to service_role;

create or replace function public.guard_profile_payment_submission_monthly_open_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_key text := upper(nullif(btrim(new.period_key), ''));
  v_open_calculation_type text;
  v_open_period_key text;
begin
  if coalesce(new.billing_mode, '') <> 'monthly' then
    return new;
  end if;

  if v_period_key is null or v_period_key !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'monthly period_key must look like YYYY-MM';
  end if;

  select public.get_monthly_payment_open_calculation_type(
    tm.role::text,
    tm.fee_billing_mode::text,
    tm.training_program::text,
    coalesce(
      mf.calculation_type,
      public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text, tm.training_program::text),
      'per_session'
    )
  )
  into v_open_calculation_type
  from public.team_members tm
  left join public.monthly_fees mf
    on mf.member_id = tm.id and mf.year_month = v_period_key
  where tm.id = new.member_id
  limit 1;

  if v_open_calculation_type is null then
    raise exception 'member not found for monthly payment submission';
  end if;

  v_open_period_key := public.get_monthly_payment_open_period_key(v_open_calculation_type);
  if not public.is_monthly_payment_period_open(v_period_key, v_open_calculation_type) then
    raise exception 'monthly period % is not open yet; current open monthly period is %',
      v_period_key, v_open_period_key;
  end if;

  new.period_key := v_period_key;
  return new;
end;
$$;

-- Patch only availability predicates, preserving later security/ownership and
-- calculation hotfixes. Unknown function layouts fail the whole transaction.
do $$
declare
  v_definition text;
  v_updated text;
  v_home_previous text := $old$public.is_monthly_payment_period_open(
        mf.year_month::text,
        coalesce(
          mf.calculation_type,
          public.get_monthly_fee_calculation_type(
            tm.role::text,
            tm.fee_billing_mode::text,
            tm.training_program::text
          ),
          'per_session'
        ),
        v_today
      )$old$;
  v_home_next text := $new$public.is_monthly_payment_period_open(
        mf.year_month::text,
        public.get_monthly_payment_open_calculation_type(
          tm.role::text,
          tm.fee_billing_mode::text,
          tm.training_program::text,
          coalesce(
            mf.calculation_type,
            public.get_monthly_fee_calculation_type(
              tm.role::text,
              tm.fee_billing_mode::text,
              tm.training_program::text
            ),
            'per_session'
          )
        ),
        v_today
      )$new$;
  v_estimate_previous text := $old$  where linked_member.billing_mode = 'monthly'
     or (linked_member.billing_mode = 'none' and monthly_fees.id is not null)$old$;
  v_estimate_next text := $new$  where (
    linked_member.billing_mode = 'monthly'
    or (linked_member.billing_mode = 'none' and monthly_fees.id is not null)
  )
    and public.is_monthly_payment_period_open(
      month_input.period_key,
      public.get_monthly_payment_open_calculation_type(
        linked_member.member_role,
        linked_member.fee_billing_mode,
        linked_member.raw_training_program,
        coalesce(monthly_fees.calculation_type, linked_member.calculation_type)
      )
    )$new$;
begin
  -- SQL Editor / Windows clipboard can preserve CRLF in dollar-quoted strings,
  -- even when the saved function body uses LF. Normalize both comparison and
  -- replacement literals as well as the catalog definition before matching.
  v_home_previous := replace(v_home_previous, E'\r\n', E'\n');
  v_home_next := replace(v_home_next, E'\r\n', E'\n');
  v_estimate_previous := replace(v_estimate_previous, E'\r\n', E'\n');
  v_estimate_next := replace(v_estimate_next, E'\r\n', E'\n');

  v_definition := replace(pg_get_functiondef('public.get_my_home_snapshot(date)'::regprocedure), E'\r\n', E'\n');
  if position(v_home_next in v_definition) = 0 then
    v_updated := replace(v_definition, v_home_previous, v_home_next);
    if v_updated = v_definition then
      raise exception 'get_my_home_snapshot monthly availability predicate not found';
    end if;
    execute v_updated;
  end if;

  v_definition := replace(pg_get_functiondef('public.get_my_payment_submission_estimate(uuid,text)'::regprocedure), E'\r\n', E'\n');
  if position(v_estimate_next in v_definition) = 0 then
    v_updated := replace(v_definition, v_estimate_previous, v_estimate_next);
    if v_updated = v_definition then
      raise exception 'get_my_payment_submission_estimate monthly availability predicate not found';
    end if;
    execute v_updated;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
