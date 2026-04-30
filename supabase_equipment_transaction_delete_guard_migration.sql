begin;

drop function if exists public.delete_equipment_transactions(uuid[]);

create or replace function public.delete_equipment_transactions(
  p_transaction_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_transaction_ids uuid[];
  v_found_count integer := 0;
  v_blocked_count integer := 0;
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (
    coalesce(public.has_app_permission('equipment', 'DELETE'), false)
    or coalesce(public.has_app_permission('fees', 'DELETE'), false)
  ) then
    raise exception 'equipment DELETE permission required';
  end if;

  select array_agg(distinct ids.transaction_id)
  into v_transaction_ids
  from unnest(coalesce(p_transaction_ids, array[]::uuid[])) as ids(transaction_id)
  where ids.transaction_id is not null;

  if v_transaction_ids is null or cardinality(v_transaction_ids) = 0 then
    raise exception 'transaction_ids is required';
  end if;

  with locked_transactions as (
    select equipment_transactions.id
    from public.equipment_transactions
    where equipment_transactions.id = any(v_transaction_ids)
    for update
  )
  select count(*)
  into v_found_count
  from locked_transactions;

  if v_found_count <> cardinality(v_transaction_ids) then
    raise exception 'some equipment transactions were not found';
  end if;

  select count(*)
  into v_blocked_count
  from public.equipment_transactions t
  left join public.equipment_payment_submissions s
    on s.id = t.payment_submission_id
  where t.id = any(v_transaction_ids)
    and (
      coalesce(t.payment_status, 'unpaid') in ('pending_review', 'paid')
      or (
        t.payment_submission_id is not null
        and coalesce(s.status, 'pending_review') <> 'rejected'
      )
    );

  select v_blocked_count + count(*)
  into v_blocked_count
  from public.equipment_payment_submission_items si
  join public.equipment_payment_submissions s
    on s.id = si.submission_id
  where si.transaction_id = any(v_transaction_ids)
    and s.status <> 'rejected';

  if v_blocked_count > 0 then
    raise exception '已有付款回報或已確認付款的裝備交易不可直接刪除，請先處理付款回報。';
  end if;

  delete from public.equipment_payment_submission_items si
  using public.equipment_payment_submissions s
  where si.submission_id = s.id
    and si.transaction_id = any(v_transaction_ids)
    and s.status = 'rejected';

  delete from public.equipment_transactions
  where equipment_transactions.id = any(v_transaction_ids);

  get diagnostics v_deleted_count = ROW_COUNT;
  return v_deleted_count;
end;
$$;

revoke all on function public.delete_equipment_transactions(uuid[]) from public;
grant execute on function public.delete_equipment_transactions(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
