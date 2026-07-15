begin;

do $$
declare
  v_function_def text;
  v_next_def text;
  v_monthly_needle text := '      and coalesce(mf.status, ''unpaid'') not in (''paid'', ''approved'')';
  v_monthly_replacement text := $monthly$      and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')
      and public.is_monthly_payment_period_open(
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
      )$monthly$;
  v_quarterly_needle text := '      and coalesce(qf.status, ''pending_review'') not in (''paid'', ''approved'')';
  v_quarterly_replacement text := $quarterly$      and coalesce(qf.status, 'pending_review') not in ('paid', 'approved')
      and public.is_quarterly_payment_period_open(qf.year_quarter::text, v_today)$quarterly$;
begin
  select pg_get_functiondef('public.get_my_home_snapshot(date)'::regprocedure)
  into v_function_def;

  v_next_def := v_function_def;

  if position(v_monthly_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_monthly_needle, v_monthly_replacement);

    if v_next_def = v_function_def then
      raise exception 'get_my_home_snapshot monthly payment summary condition not found';
    end if;
  end if;

  v_function_def := v_next_def;

  if position(v_quarterly_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_quarterly_needle, v_quarterly_replacement);

    if v_next_def = v_function_def then
      raise exception 'get_my_home_snapshot quarterly payment summary condition not found';
    end if;
  end if;

  if v_next_def <> pg_get_functiondef('public.get_my_home_snapshot(date)'::regprocedure) then
    execute v_next_def;
  end if;
end $$;

revoke all on function public.get_my_home_snapshot(date) from public, anon;
grant execute on function public.get_my_home_snapshot(date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
