begin;

alter table public.equipment_payment_submissions
  drop constraint if exists equipment_payment_submissions_status_check;

alter table public.equipment_payment_submissions
  add constraint equipment_payment_submissions_status_check check (
    status in ('pending_review', 'approved', 'rejected', 'refunded')
  );

alter table public.equipment_payment_submissions
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid references public.profiles(id) on delete set null,
  add column if not exists refund_note text;

alter table public.equipment_transactions
  drop constraint if exists equipment_transactions_payment_status_check;

alter table public.equipment_transactions
  add constraint equipment_transactions_payment_status_check check (
    payment_status in ('unpaid', 'pending_review', 'paid', 'cancelled', 'refunded')
  );

alter table public.player_balance_transactions
  drop constraint if exists player_balance_transactions_source_check;

alter table public.player_balance_transactions
  add constraint player_balance_transactions_source_check check (
    source in (
      'manual_adjustment',
      'payment_deduction',
      'overpayment',
      'quarterly_compensation',
      'refund'
    )
  );

create or replace function public.refund_equipment_payment_submission(
  p_submission_id uuid,
  p_note text default null
)
returns table (
  id uuid,
  profile_id uuid,
  member_id uuid,
  member_name text,
  amount integer,
  balance_amount integer,
  external_amount integer,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  note text,
  status text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.equipment_payment_submissions%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_transaction_count integer := 0;
  v_paid_count integer := 0;
  v_overpayment_amount integer := 0;
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

  select *
  into v_submission
  from public.equipment_payment_submissions
  where equipment_payment_submissions.id = p_submission_id
    and equipment_payment_submissions.status = 'approved'
  for update;

  if not found then
    raise exception 'equipment payment submission is not refundable';
  end if;

  perform 1
  from public.team_members tm
  where tm.id = v_submission.member_id
  for update;

  perform 1
  from public.equipment_transactions t
  where t.id in (
    select si.transaction_id
    from public.equipment_payment_submission_items si
    where si.submission_id = p_submission_id
  )
  for update;

  select
    count(*)::integer,
    (count(*) filter (where coalesce(t.payment_status, 'unpaid') = 'paid'))::integer
  into v_transaction_count, v_paid_count
  from public.equipment_payment_submission_items si
  join public.equipment_transactions t on t.id = si.transaction_id
  where si.submission_id = p_submission_id;

  if v_transaction_count = 0 then
    raise exception 'equipment payment submission has no transactions';
  end if;

  if v_paid_count <> v_transaction_count then
    raise exception 'only paid equipment payment submissions can be refunded';
  end if;

  if coalesce(v_submission.balance_amount, 0) > 0 then
    insert into public.player_balance_transactions (
      member_id,
      delta,
      reason,
      source,
      related_equipment_payment_submission_id,
      idempotency_key,
      created_by
    )
    values (
      v_submission.member_id,
      v_submission.balance_amount,
      '裝備付款退款 - 退回餘額扣抵',
      'refund',
      v_submission.id,
      format('equipment_payment:%s:refund_balance', v_submission.id),
      v_user_id
    )
    on conflict (idempotency_key) do nothing;
  end if;

  select coalesce(sum(delta), 0)::integer
  into v_overpayment_amount
  from public.player_balance_transactions
  where related_equipment_payment_submission_id = v_submission.id
    and source = 'overpayment'
    and delta > 0;

  if v_overpayment_amount > 0 then
    insert into public.player_balance_transactions (
      member_id,
      delta,
      reason,
      source,
      related_equipment_payment_submission_id,
      idempotency_key,
      created_by
    )
    values (
      v_submission.member_id,
      -v_overpayment_amount,
      '裝備付款退款 - 溢繳轉入沖回',
      'refund',
      v_submission.id,
      format('equipment_payment:%s:refund_overpayment', v_submission.id),
      v_user_id
    )
    on conflict (idempotency_key) do nothing;
  end if;

  update public.equipment_transactions t
  set
    payment_status = 'refunded',
    updated_at = now()
  where t.id in (
    select si.transaction_id
    from public.equipment_payment_submission_items si
    where si.submission_id = p_submission_id
  );

  update public.equipment_payment_submissions
  set
    status = 'refunded',
    refunded_at = now(),
    refunded_by = v_user_id,
    refund_note = v_note,
    updated_at = now()
  where equipment_payment_submissions.id = p_submission_id;

  return query
  select *
  from public.list_equipment_payment_submissions() submissions
  where submissions.id = p_submission_id;
end;
$$;

create or replace function public.list_equipment_refundable_direct_payment_items()
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
    and coalesce(t.payment_status, 'unpaid') = 'paid'
    and t.payment_submission_id is null
    and not exists (
      select 1
      from public.equipment_payment_submission_items si
      where si.transaction_id = t.id
    )
  order by
    coalesce(r.picked_up_at, r.ready_at, r.approved_at, t.transaction_date::timestamptz, t.created_at) desc,
    t.transaction_date desc,
    t.created_at desc;
end;
$$;

create or replace function public.refund_equipment_transactions(
  p_transaction_ids uuid[],
  p_note text default null
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
  v_updated_count integer := 0;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
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
  where t.id = any(v_transaction_ids)
    and (
      t.transaction_type <> 'purchase'
      or coalesce(t.payment_status, 'unpaid') <> 'paid'
      or t.payment_submission_id is not null
      or exists (
        select 1
        from public.equipment_payment_submission_items si
        where si.transaction_id = t.id
      )
    );

  if v_blocked_count > 0 then
    raise exception 'only directly paid equipment transactions without payment submissions can be voided here';
  end if;

  update public.equipment_transactions t
  set
    payment_status = 'refunded',
    notes = case
      when v_note is null then t.notes
      else concat_ws(E'\n', nullif(t.notes, ''), format('[退款 / 作廢收款] %s', v_note))
    end,
    updated_at = now()
  where t.id = any(v_transaction_ids);

  get diagnostics v_updated_count = ROW_COUNT;
  return v_updated_count;
end;
$$;

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
        and coalesce(s.status, 'pending_review') not in ('rejected', 'refunded')
      )
    );

  select v_blocked_count + count(*)
  into v_blocked_count
  from public.equipment_payment_submission_items si
  join public.equipment_payment_submissions s
    on s.id = si.submission_id
  where si.transaction_id = any(v_transaction_ids)
    and s.status not in ('rejected', 'refunded');

  if v_blocked_count > 0 then
    raise exception '已有付款回報或已確認付款的裝備交易不可直接刪除，請先退回或退款付款紀錄。';
  end if;

  delete from public.equipment_payment_submission_items si
  using public.equipment_payment_submissions s
  where si.submission_id = s.id
    and si.transaction_id = any(v_transaction_ids)
    and s.status in ('rejected', 'refunded');

  delete from public.equipment_transactions
  where equipment_transactions.id = any(v_transaction_ids);

  get diagnostics v_deleted_count = ROW_COUNT;
  return v_deleted_count;
end;
$$;

revoke all on function public.refund_equipment_payment_submission(uuid, text) from public;
revoke all on function public.list_equipment_refundable_direct_payment_items() from public;
revoke all on function public.refund_equipment_transactions(uuid[], text) from public;
revoke all on function public.delete_equipment_transactions(uuid[]) from public;

grant execute on function public.refund_equipment_payment_submission(uuid, text) to authenticated, service_role;
grant execute on function public.list_equipment_refundable_direct_payment_items() to authenticated, service_role;
grant execute on function public.refund_equipment_transactions(uuid[], text) to authenticated, service_role;
grant execute on function public.delete_equipment_transactions(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
