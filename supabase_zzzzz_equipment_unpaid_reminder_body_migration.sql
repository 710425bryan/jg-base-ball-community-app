begin;

do $$
declare
  v_definition text;
  v_old_body text := 'format(''%s 筆已領取裝備尚未付款，合計 $%s。'', item_count, total_amount)';
  v_new_body text := 'format(''尚未付款：%s 筆，合計 $%s。'', item_count, total_amount)';
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_fee_management_reminders'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_definition is null then
    raise exception 'public.get_fee_management_reminders() not found';
  end if;

  if position(v_new_body in v_definition) > 0 then
    raise notice 'equipment unpaid reminder body already updated';
  elsif position(v_old_body in v_definition) = 0 then
    raise exception 'expected equipment unpaid reminder body not found';
  else
    execute replace(v_definition, v_old_body, v_new_body);
  end if;
end $$;

revoke all on function public.get_fee_management_reminders() from public;
grant execute on function public.get_fee_management_reminders() to authenticated, service_role;

commit;
