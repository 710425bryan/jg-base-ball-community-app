begin;

drop function if exists public.list_equipment_unpaid_payment_items();
create or replace function public.list_equipment_unpaid_payment_items()
returns table (
  transaction_id uuid,
  request_id uuid,
  member_id uuid,
  member_name text,
  equipment_id uuid,
  equipment_name text,
  size text,
  jersey_number integer,
  quantity integer,
  unit_price integer,
  total_amount integer,
  payment_status text,
  payment_submission_id uuid,
  transaction_date date,
  request_status text,
  picked_up_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('equipment', 'VIEW')
  ) then
    raise exception 'permission denied';
  end if;

  return query
  select
    t.id,
    r.id,
    t.member_id,
    tm.name::text,
    e.id,
    e.name::text,
    t.size::text,
    t.jersey_number,
    t.quantity,
    coalesce(t.unit_price, e.purchase_price, 0),
    coalesce(t.unit_price, e.purchase_price, 0) * t.quantity,
    coalesce(t.payment_status, 'unpaid')::text,
    t.payment_submission_id,
    t.transaction_date,
    r.status::text,
    r.picked_up_at
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  join public.team_members tm on tm.id = t.member_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where t.transaction_type = 'purchase'
    and t.member_id is not null
    and coalesce(t.payment_status, 'unpaid') = 'unpaid'
    and (t.request_item_id is null or r.status = 'picked_up')
  order by
    coalesce(r.picked_up_at, t.created_at) desc,
    t.transaction_date desc,
    t.created_at desc;
end;
$$;

drop function if exists public.mark_equipment_transactions_paid(uuid[]);
create or replace function public.mark_equipment_transactions_paid(
  p_transaction_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (
    public.has_app_permission('fees', 'EDIT')
    or public.has_app_permission('equipment', 'EDIT')
  ) then
    raise exception 'permission denied';
  end if;

  if coalesce(array_length(p_transaction_ids, 1), 0) = 0 then
    raise exception 'no equipment transactions selected';
  end if;

  with selected_transactions as (
    select distinct unnest(p_transaction_ids) as id
  ),
  updated as (
    update public.equipment_transactions t
    set
      payment_status = 'paid',
      paid_at = now(),
      paid_by = v_user_id,
      payment_submission_id = null,
      updated_at = now()
    from selected_transactions selected
    where t.id = selected.id
      and t.transaction_type = 'purchase'
      and coalesce(t.payment_status, 'unpaid') = 'unpaid'
      and (
        t.request_item_id is null
        or exists (
          select 1
          from public.equipment_purchase_request_items ri
          join public.equipment_purchase_requests r on r.id = ri.request_id
          where ri.id = t.request_item_id
            and r.status = 'picked_up'
        )
      )
    returning t.id
  )
  select count(*)::integer into v_updated_count from updated;

  if v_updated_count = 0 then
    raise exception 'no unpaid equipment transactions were updated';
  end if;

  return v_updated_count;
end;
$$;

revoke all on function public.list_equipment_unpaid_payment_items() from public;
revoke all on function public.mark_equipment_transactions_paid(uuid[]) from public;

grant execute on function public.list_equipment_unpaid_payment_items() to authenticated, service_role;
grant execute on function public.mark_equipment_transactions_paid(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
