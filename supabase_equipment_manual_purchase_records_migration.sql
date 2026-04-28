begin;

create or replace function public.list_my_equipment_manual_purchase_records(
  p_member_id uuid default null
)
returns table (
  transaction_id uuid,
  member_id uuid,
  member_name text,
  equipment_id uuid,
  equipment_name text,
  size text,
  quantity integer,
  unit_price integer,
  total_amount integer,
  payment_status text,
  payment_submission_id uuid,
  transaction_date date,
  notes text,
  handled_by text,
  created_at timestamptz,
  updated_at timestamptz
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
    t.member_id,
    tm.name::text,
    e.id,
    e.name::text,
    t.size::text,
    t.quantity,
    coalesce(t.unit_price, e.purchase_price, 0),
    coalesce(t.unit_price, e.purchase_price, 0) * t.quantity,
    coalesce(t.payment_status, 'unpaid')::text,
    t.payment_submission_id,
    t.transaction_date,
    t.notes::text,
    t.handled_by::text,
    t.created_at,
    t.updated_at
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  join public.team_members tm on tm.id = t.member_id
  where t.transaction_type = 'purchase'
    and t.member_id is not null
    and t.request_item_id is null
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
  order by t.transaction_date desc, t.created_at desc;
end;
$$;

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
  quantity integer,
  unit_price integer,
  total_amount integer,
  payment_status text,
  payment_submission_id uuid,
  transaction_date date,
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
    t.quantity,
    coalesce(t.unit_price, e.purchase_price, 0),
    coalesce(t.unit_price, e.purchase_price, 0) * t.quantity,
    coalesce(t.payment_status, 'unpaid')::text,
    t.payment_submission_id,
    t.transaction_date,
    r.picked_up_at
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  join public.team_members tm on tm.id = t.member_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where t.transaction_type = 'purchase'
    and t.member_id is not null
    and (t.request_item_id is null or r.status = 'picked_up')
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
    t.transaction_date desc,
    t.created_at desc;
end;
$$;

create or replace function public.create_equipment_payment_submission(
  p_transaction_ids uuid[],
  p_payment_method text,
  p_account_last_5 text default null,
  p_remittance_date date default null,
  p_note text default null
)
returns table (
  id uuid,
  profile_id uuid,
  member_id uuid,
  member_name text,
  amount integer,
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
  v_count integer;
  v_member_count integer;
  v_member_id uuid;
  v_amount integer;
  v_payment_method text := nullif(btrim(p_payment_method), '');
  v_account_last_5 text := nullif(regexp_replace(coalesce(p_account_last_5, ''), '\D', '', 'g'), '');
  v_note text := nullif(btrim(p_note), '');
  v_requires_account_last_5 boolean := false;
  v_submission_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select array_agg(distinct transaction_id)
  into v_transaction_ids
  from unnest(coalesce(p_transaction_ids, array[]::uuid[])) as transaction_id;

  if v_transaction_ids is null or cardinality(v_transaction_ids) = 0 then
    raise exception 'transaction_ids is required';
  end if;

  if v_payment_method is null then
    raise exception 'payment_method is required';
  end if;

  v_requires_account_last_5 := v_payment_method in ('銀行轉帳', '郵局', '郵局無摺', 'ATM存款');

  if v_requires_account_last_5 and (v_account_last_5 is null or v_account_last_5 !~ '^[0-9]{5}$') then
    raise exception 'account_last_5 must be 5 digits for transfer payments';
  end if;

  if not v_requires_account_last_5 then
    v_account_last_5 := null;
  end if;

  select
    count(*),
    count(distinct t.member_id),
    min(t.member_id),
    sum(coalesce(t.unit_price, e.purchase_price, 0) * t.quantity)
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
    and (t.request_item_id is null or r.status = 'picked_up');

  if v_count <> cardinality(v_transaction_ids) then
    raise exception 'some equipment transactions are not payable';
  end if;

  if v_member_count <> 1 or v_member_id is null then
    raise exception 'all transactions must belong to the same member';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and v_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  insert into public.equipment_payment_submissions (
    profile_id,
    member_id,
    amount,
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
  select v_submission_id, transaction_id
  from unnest(v_transaction_ids) as transaction_id;

  update public.equipment_transactions
  set
    payment_status = 'pending_review',
    payment_submission_id = v_submission_id,
    updated_at = now()
  where equipment_transactions.id = any(v_transaction_ids);

  return query
  select *
  from public.list_equipment_payment_submissions() submissions
  where submissions.id = v_submission_id;
end;
$$;

revoke all on function public.list_my_equipment_manual_purchase_records(uuid) from public;
revoke all on function public.list_my_equipment_payment_items(uuid) from public;
revoke all on function public.create_equipment_payment_submission(uuid[], text, text, date, text) from public;

grant execute on function public.list_my_equipment_manual_purchase_records(uuid) to authenticated, service_role;
grant execute on function public.list_my_equipment_payment_items(uuid) to authenticated, service_role;
grant execute on function public.create_equipment_payment_submission(uuid[], text, text, date, text) to authenticated, service_role;

commit;
