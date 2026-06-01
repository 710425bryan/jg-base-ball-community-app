begin;

do $$
declare
  v_function_def text;
begin
  select pg_get_functiondef('public.review_profile_payment_submission(uuid,text,integer)'::regprocedure)
  into v_function_def;

  if v_function_def like '%on conflict on constraint monthly_fees_member_id_year_month_key do update%' then
    return;
  end if;

  if v_function_def not like '%on conflict (member_id, year_month) do update%' then
    raise exception 'review_profile_payment_submission monthly_fees conflict target not found';
  end if;

  execute replace(
    v_function_def,
    'on conflict (member_id, year_month) do update',
    'on conflict on constraint monthly_fees_member_id_year_month_key do update'
  );
end $$;

do $$
begin
  if pg_get_functiondef('public.review_profile_payment_submission(uuid,text,integer)'::regprocedure)
    like '%on conflict (member_id, year_month) do update%'
  then
    raise exception 'review_profile_payment_submission still has ambiguous monthly_fees conflict target';
  end if;
end $$;

revoke all on function public.review_profile_payment_submission(uuid, text, integer) from public;
grant execute on function public.review_profile_payment_submission(uuid, text, integer) to authenticated, service_role;

commit;
