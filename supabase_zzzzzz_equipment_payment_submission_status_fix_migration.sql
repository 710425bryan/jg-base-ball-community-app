begin;

alter table public.equipment_payment_submissions
  add column if not exists balance_amount integer not null default 0 check (balance_amount >= 0);

drop function if exists public.create_equipment_payment_submission(uuid[], text, text, date, text);
drop function if exists public.create_equipment_payment_submission(uuid[], text, text, date, text, integer);
drop function if exists public.review_equipment_payment_submission(uuid, text);
drop function if exists public.review_equipment_payment_submission(uuid, text, integer);
drop function if exists public.list_equipment_payment_submissions();

create or replace function public.list_equipment_payment_submissions()
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
  v_can_manage boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  v_can_manage := (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('equipment', 'VIEW')
  );

  return query
  select
    s.id,
    s.profile_id,
    s.member_id,
    tm.name::text,
    s.amount,
    coalesce(s.balance_amount, 0),
    greatest(s.amount - coalesce(s.balance_amount, 0), 0),
    s.payment_method::text,
    s.account_last_5::text,
    s.remittance_date,
    s.note::text,
    s.status::text,
    s.reviewed_at,
    s.reviewed_by,
    s.created_at,
    s.updated_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'transaction_id', t.id,
          'request_id', r.id,
          'member_id', t.member_id,
          'member_name', tm.name,
          'equipment_id', e.id,
          'equipment_name', e.name,
          'size', t.size,
          'jersey_number', t.jersey_number,
          'quantity', t.quantity,
          'unit_price', coalesce(t.unit_price, e.purchase_price, 0),
          'total_amount', coalesce(t.unit_price, e.purchase_price, 0) * t.quantity,
          'payment_status', coalesce(t.payment_status, 'unpaid'),
          'payment_submission_id', t.payment_submission_id,
          'transaction_date', t.transaction_date,
          'request_status', r.status,
          'picked_up_at', r.picked_up_at
        )
        order by t.created_at
      ) filter (where t.id is not null),
      '[]'::jsonb
    ) as items
  from public.equipment_payment_submissions s
  join public.team_members tm on tm.id = s.member_id
  left join public.equipment_payment_submission_items si on si.submission_id = s.id
  left join public.equipment_transactions t on t.id = si.transaction_id
  left join public.equipment e on e.id = t.equipment_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where v_can_manage or s.profile_id = v_user_id
  group by s.id, tm.name
  order by s.created_at desc;
end;
$$;

drop function if exists public.create_equipment_payment_submission(uuid[], text, text, date, text);
drop function if exists public.create_equipment_payment_submission(uuid[], text, text, date, text, integer);

create or replace function public.create_equipment_payment_submission(
  p_transaction_ids uuid[],
  p_payment_method text,
  p_account_last_5 text default null,
  p_remittance_date date default null,
  p_note text default null,
  p_balance_amount integer default 0
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
  v_transaction_ids uuid[];
  v_count integer := 0;
  v_member_count integer := 0;
  v_member_id uuid;
  v_amount integer := 0;
  v_balance_amount integer := greatest(coalesce(p_balance_amount, 0), 0);
  v_external_amount integer := 0;
  v_payment_method text := nullif(btrim(p_payment_method), '');
  v_account_last_5 text := nullif(regexp_replace(coalesce(p_account_last_5, ''), '\D', '', 'g'), '');
  v_note text := nullif(btrim(p_note), '');
  v_requires_account_last_5 boolean := false;
  v_submission_id uuid;
  v_updated_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select coalesce(array_agg(distinct selected.transaction_id), array[]::uuid[])
  into v_transaction_ids
  from unnest(coalesce(p_transaction_ids, array[]::uuid[])) as selected(transaction_id)
  where selected.transaction_id is not null;

  if cardinality(v_transaction_ids) = 0 then
    raise exception 'transaction_ids is required';
  end if;

  perform 1
  from public.equipment_transactions t
  where t.id = any(v_transaction_ids)
  for update;

  select
    count(*)::integer,
    count(distinct t.member_id)::integer,
    (array_agg(t.member_id))[1],
    coalesce(sum(coalesce(t.unit_price, e.purchase_price, 0) * t.quantity), 0)::integer
  into v_count, v_member_count, v_member_id, v_amount
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where t.id = any(v_transaction_ids)
    and t.transaction_type = 'purchase'
    and t.member_id is not null
    and coalesce(t.payment_status, 'unpaid') = 'unpaid'
    and t.payment_submission_id is null
    and (
      t.request_item_id is null
      or r.status = 'picked_up'
    );

  if v_count <> cardinality(v_transaction_ids) then
    raise exception 'some equipment transactions are not payable';
  end if;

  if v_member_count <> 1 or v_member_id is null then
    raise exception 'all transactions must belong to the same member';
  end if;

  if v_amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  if v_balance_amount > v_amount then
    raise exception 'balance_amount cannot exceed amount';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and v_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  if v_balance_amount > public.get_player_balance_unchecked(v_member_id) then
    raise exception 'player balance is not enough';
  end if;

  v_external_amount := greatest(v_amount - v_balance_amount, 0);

  if v_external_amount = 0 then
    v_payment_method := coalesce(v_payment_method, '餘額扣款');
  elsif v_payment_method is null then
    raise exception 'payment_method is required';
  end if;

  v_requires_account_last_5 := v_external_amount > 0
    and v_payment_method in ('銀行轉帳', '郵局', '郵局無摺', 'ATM存款');

  if v_requires_account_last_5 and (v_account_last_5 is null or v_account_last_5 !~ '^[0-9]{5}$') then
    raise exception 'account_last_5 must be 5 digits for transfer payments';
  end if;

  if not v_requires_account_last_5 then
    v_account_last_5 := null;
  end if;

  insert into public.equipment_payment_submissions (
    profile_id,
    member_id,
    amount,
    balance_amount,
    payment_method,
    account_last_5,
    remittance_date,
    note,
    status,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    v_member_id,
    v_amount,
    v_balance_amount,
    v_payment_method,
    v_account_last_5,
    coalesce(p_remittance_date, current_date),
    v_note,
    'pending_review',
    now(),
    now()
  )
  returning equipment_payment_submissions.id into v_submission_id;

  insert into public.equipment_payment_submission_items (submission_id, transaction_id)
  select v_submission_id, selected.transaction_id
  from unnest(v_transaction_ids) as selected(transaction_id);

  with updated as (
    update public.equipment_transactions t
    set
      payment_status = 'pending_review',
      payment_submission_id = v_submission_id,
      updated_at = now()
    where t.id = any(v_transaction_ids)
      and t.transaction_type = 'purchase'
      and coalesce(t.payment_status, 'unpaid') = 'unpaid'
      and t.payment_submission_id is null
    returning t.id
  )
  select count(*)::integer into v_updated_count from updated;

  if v_updated_count <> cardinality(v_transaction_ids) then
    raise exception 'equipment payment submission was created but transaction status was not updated';
  end if;

  return query
  select *
  from public.list_equipment_payment_submissions() submissions
  where submissions.id = v_submission_id;
end;
$$;

drop function if exists public.review_equipment_payment_submission(uuid, text);
drop function if exists public.review_equipment_payment_submission(uuid, text, integer);

create or replace function public.review_equipment_payment_submission(
  p_submission_id uuid,
  p_status text,
  p_overpayment_amount integer default 0
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
  v_overpayment_amount integer := greatest(coalesce(p_overpayment_amount, 0), 0);
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'unsupported review status';
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
    and equipment_payment_submissions.status = 'pending_review'
  for update;

  if not found then
    raise exception 'submission not found or already reviewed';
  end if;

  if p_status = 'approved' then
    perform 1
    from public.team_members tm
    where tm.id = v_submission.member_id
    for update;

    if coalesce(v_submission.balance_amount, 0) > public.get_player_balance_unchecked(v_submission.member_id) then
      raise exception 'player balance is not enough';
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
        -v_submission.balance_amount,
        '裝備付款扣抵',
        'payment_deduction',
        v_submission.id,
        format('equipment_payment:%s:balance', v_submission.id),
        v_user_id
      )
      on conflict (idempotency_key) do nothing;
    end if;

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
        v_overpayment_amount,
        '裝備付款溢繳轉入',
        'overpayment',
        v_submission.id,
        format('equipment_payment:%s:overpayment', v_submission.id),
        v_user_id
      )
      on conflict (idempotency_key) do nothing;
    end if;

    update public.equipment_transactions
    set
      payment_status = 'paid',
      paid_at = now(),
      paid_by = v_user_id,
      updated_at = now()
    where equipment_transactions.id in (
      select transaction_id
      from public.equipment_payment_submission_items
      where submission_id = p_submission_id
    );
  else
    update public.equipment_transactions
    set
      payment_status = 'unpaid',
      payment_submission_id = null,
      updated_at = now()
    where equipment_transactions.id in (
      select transaction_id
      from public.equipment_payment_submission_items
      where submission_id = p_submission_id
    );
  end if;

  update public.equipment_payment_submissions
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where equipment_payment_submissions.id = p_submission_id;

  return query
  select *
  from public.list_equipment_payment_submissions() submissions
  where submissions.id = p_submission_id;
end;
$$;

revoke all on function public.list_equipment_payment_submissions() from public;
revoke all on function public.create_equipment_payment_submission(uuid[], text, text, date, text, integer) from public;
revoke all on function public.review_equipment_payment_submission(uuid, text, integer) from public;

grant execute on function public.list_equipment_payment_submissions() to authenticated, service_role;
grant execute on function public.create_equipment_payment_submission(uuid[], text, text, date, text, integer) to authenticated, service_role;
grant execute on function public.review_equipment_payment_submission(uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
