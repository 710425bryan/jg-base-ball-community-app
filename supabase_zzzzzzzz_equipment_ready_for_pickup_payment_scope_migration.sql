begin;

drop function if exists public.list_my_equipment_pending_request_payment_items(uuid);

create or replace function public.list_my_equipment_pending_request_payment_items(
  p_member_id uuid default null
)
returns table (
  request_item_id uuid,
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
  request_status text,
  requested_at timestamptz,
  approved_at timestamptz,
  ready_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_member_id is not null and not (
    public.has_app_permission('equipment', 'VIEW')
    or public.has_app_permission('fees', 'VIEW')
    or exists (
      select 1
      from public.profiles
      where profiles.id = v_user_id
        and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
    )
  ) then
    raise exception 'member is not viewable by current profile';
  end if;

  return query
  select
    ri.id,
    r.id,
    r.member_id,
    tm.name::text,
    ri.equipment_id,
    coalesce(nullif(ri.equipment_name_snapshot, ''), e.name)::text,
    ri.size::text,
    ri.jersey_number,
    ri.quantity,
    coalesce(ri.unit_price_snapshot, e.purchase_price, 0),
    coalesce(ri.unit_price_snapshot, e.purchase_price, 0) * ri.quantity,
    r.status::text,
    r.requested_at,
    r.approved_at,
    r.ready_at
  from public.equipment_purchase_request_items ri
  join public.equipment_purchase_requests r on r.id = ri.request_id
  join public.equipment e on e.id = ri.equipment_id
  join public.team_members tm on tm.id = r.member_id
  left join public.equipment_transactions t on t.id = ri.equipment_transaction_id
  where r.status in ('pending', 'approved')
    and (
      ri.equipment_transaction_id is null
      or coalesce(t.payment_status, 'unpaid') = 'unpaid'
    )
    and (p_member_id is null or r.member_id = p_member_id)
    and (
      public.has_app_permission('equipment', 'VIEW')
      or public.has_app_permission('fees', 'VIEW')
      or r.member_id in (
        select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        from public.profiles
        where profiles.id = v_user_id
      )
    )
  order by
    case r.status
      when 'pending' then 0
      when 'approved' then 1
      else 2
    end,
    coalesce(r.approved_at, r.updated_at, r.created_at) desc,
    ri.created_at asc;
end;
$$;

drop function if exists public.list_my_equipment_payment_items(uuid);

create or replace function public.list_my_equipment_payment_items(
  p_member_id uuid default null
)
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
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_member_id is not null and not (
    public.has_app_permission('equipment', 'VIEW')
    or public.has_app_permission('fees', 'VIEW')
    or exists (
      select 1
      from public.profiles
      where profiles.id = v_user_id
        and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
    )
  ) then
    raise exception 'member is not viewable by current profile';
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
    and (
      t.request_item_id is null
      or r.status in ('ready_for_pickup', 'picked_up')
      or coalesce(t.payment_status, 'unpaid') <> 'unpaid'
    )
    and (p_member_id is null or t.member_id = p_member_id)
    and (
      public.has_app_permission('equipment', 'VIEW')
      or public.has_app_permission('fees', 'VIEW')
      or t.member_id in (
        select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        from public.profiles
        where profiles.id = v_user_id
      )
    )
  order by
    case coalesce(t.payment_status, 'unpaid')
      when 'unpaid' then 0
      when 'pending_review' then 1
      when 'paid' then 2
      else 3
    end,
    coalesce(r.picked_up_at, r.ready_at, t.transaction_date::timestamptz, t.created_at) desc,
    t.created_at desc;
end;
$$;

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
    and (t.request_item_id is null or r.status in ('ready_for_pickup', 'picked_up'))
  order by
    coalesce(r.picked_up_at, r.ready_at, t.created_at) desc,
    t.transaction_date desc,
    t.created_at desc;
end;
$$;

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
            and r.status in ('ready_for_pickup', 'picked_up')
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
      or r.status in ('ready_for_pickup', 'picked_up')
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

do $$
declare
  v_request record;
begin
  for v_request in
    select
      id,
      coalesce(ready_at::date, picked_up_at::date, approved_at::date, current_date) as transaction_date
    from public.equipment_purchase_requests
    where status in ('ready_for_pickup', 'picked_up')
  loop
    perform public.ensure_equipment_purchase_request_payment_transactions(
      v_request.id,
      v_request.transaction_date
    );
  end loop;
end;
$$;

revoke all on function public.list_my_equipment_pending_request_payment_items(uuid) from public;
revoke all on function public.list_my_equipment_payment_items(uuid) from public;
revoke all on function public.list_equipment_unpaid_payment_items() from public;
revoke all on function public.mark_equipment_transactions_paid(uuid[]) from public;
revoke all on function public.create_equipment_payment_submission(uuid[], text, text, date, text, integer) from public;

grant execute on function public.list_my_equipment_pending_request_payment_items(uuid) to authenticated, service_role;
grant execute on function public.list_my_equipment_payment_items(uuid) to authenticated, service_role;
grant execute on function public.list_equipment_unpaid_payment_items() to authenticated, service_role;
grant execute on function public.mark_equipment_transactions_paid(uuid[]) to authenticated, service_role;
grant execute on function public.create_equipment_payment_submission(uuid[], text, text, date, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
