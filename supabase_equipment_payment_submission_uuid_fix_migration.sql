begin;

create or replace function public.ensure_equipment_purchase_request_payment_transactions(
  p_request_id uuid,
  p_transaction_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_member_name text;
  v_item record;
  v_transaction_id uuid;
begin
  select
    r.member_id,
    tm.name::text
  into v_member_id, v_member_name
  from public.equipment_purchase_requests r
  join public.team_members tm on tm.id = r.member_id
  where r.id = p_request_id
    and r.status in ('approved', 'ready_for_pickup', 'picked_up');

  if v_member_id is null then
    return;
  end if;

  for v_item in
    select
      ri.id,
      ri.equipment_id,
      ri.size,
      ri.quantity,
      ri.unit_price_snapshot
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
      and ri.equipment_transaction_id is null
    order by ri.created_at
    for update
  loop
    insert into public.equipment_transactions (
      equipment_id,
      transaction_type,
      transaction_date,
      member_id,
      handled_by,
      size,
      quantity,
      notes,
      unit_price,
      request_item_id,
      payment_status,
      created_at,
      updated_at
    )
    values (
      v_item.equipment_id,
      'purchase',
      coalesce(p_transaction_date, current_date),
      v_member_id,
      v_member_name,
      v_item.size,
      v_item.quantity,
      format('加購申請 %s', p_request_id),
      v_item.unit_price_snapshot,
      v_item.id,
      'unpaid',
      now(),
      now()
    )
    returning id into v_transaction_id;

    update public.equipment_purchase_request_items
    set
      equipment_transaction_id = v_transaction_id,
      updated_at = now()
    where id = v_item.id;
  end loop;
end;
$$;

create or replace function public.sync_equipment_purchase_request_payment_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('approved', 'ready_for_pickup', 'picked_up') then
    perform public.ensure_equipment_purchase_request_payment_transactions(
      new.id,
      coalesce(new.approved_at::date, new.ready_at::date, new.picked_up_at::date, current_date)
    );
  end if;

  return null;
end;
$$;

drop trigger if exists sync_equipment_purchase_request_payment_transactions_after_status
  on public.equipment_purchase_requests;
create trigger sync_equipment_purchase_request_payment_transactions_after_status
after insert or update of status on public.equipment_purchase_requests
for each row
execute function public.sync_equipment_purchase_request_payment_transactions();

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
  where r.status = 'pending'
    and ri.equipment_transaction_id is null
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
  order by r.updated_at desc, ri.created_at asc;
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
      or r.status in ('approved', 'ready_for_pickup', 'picked_up')
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
    case coalesce(r.status, '')
      when 'approved' then 0
      when 'ready_for_pickup' then 1
      when 'picked_up' then 2
      else 3
    end,
    t.transaction_date desc,
    t.created_at desc;
end;
$$;

create or replace function public.list_equipment_payment_submissions()
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

create or replace function public.approve_equipment_purchase_request(
  p_request_id uuid,
  p_user_id uuid
)
returns public.equipment_purchase_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.equipment_purchase_requests%rowtype;
  v_item record;
  v_equipment public.equipment%rowtype;
  v_sizes_stock jsonb;
  v_has_sizes boolean;
  v_size_stock integer;
  v_overall_used integer;
  v_overall_reserved integer;
  v_size_used integer;
  v_size_reserved integer;
  v_overall_remaining integer;
  v_size_remaining integer;
  v_available integer;
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception '尚未登入或使用者不一致';
  end if;

  if not (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  ) then
    raise exception '沒有核准裝備加購申請的權限';
  end if;

  select *
  into v_request
  from public.equipment_purchase_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception '找不到加購申請';
  end if;

  if v_request.status <> 'pending' then
    raise exception '只有待審核的加購申請可以核准';
  end if;

  if not exists (
    select 1
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
  ) then
    raise exception '請購單沒有裝備品項';
  end if;

  perform 1
  from public.equipment e
  where e.id in (
    select distinct ri.equipment_id
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
  )
  order by e.id
  for update;

  for v_item in
    select
      ri.equipment_id,
      sum(greatest(coalesce(ri.quantity, 0), 0))::integer as requested_quantity,
      min(ri.equipment_name_snapshot) as equipment_name
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
    group by ri.equipment_id
  loop
    select *
    into v_equipment
    from public.equipment
    where id = v_item.equipment_id;

    if not found then
      raise exception '找不到裝備資料：%', v_item.equipment_name;
    end if;

    if not coalesce(v_equipment.quick_purchase_enabled, false) then
      raise exception '% 目前未開放加購', coalesce(v_equipment.name, v_item.equipment_name);
    end if;

    if coalesce(v_equipment.purchase_price, 0) <= 0 then
      raise exception '% 尚未設定加購售價', coalesce(v_equipment.name, v_item.equipment_name);
    end if;

    select coalesce(sum(
      case
        when t.transaction_type in ('borrow', 'receive', 'purchase') then greatest(coalesce(t.quantity, 0), 0)
        when t.transaction_type = 'return' then -greatest(coalesce(t.quantity, 0), 0)
        else 0
      end
    ), 0)::integer
    into v_overall_used
    from public.equipment_transactions t
    where t.equipment_id = v_item.equipment_id;

    select coalesce(sum(greatest(coalesce(ri.quantity, 0), 0)), 0)::integer
    into v_overall_reserved
    from public.equipment_purchase_request_items ri
    join public.equipment_purchase_requests r on r.id = ri.request_id
    where ri.equipment_id = v_item.equipment_id
      and r.id <> p_request_id
      and r.status in ('approved', 'ready_for_pickup')
      and ri.equipment_transaction_id is null;

    v_overall_remaining := greatest(coalesce(v_equipment.total_quantity, 0) - v_overall_used - v_overall_reserved, 0);

    if v_item.requested_quantity <= 0 then
      raise exception '% 請購數量必須大於 0', coalesce(v_equipment.name, v_item.equipment_name);
    end if;

    if v_item.requested_quantity > v_overall_remaining then
      raise exception '裝備庫存不足：% 剩 % 件，申請 % 件',
        coalesce(v_equipment.name, v_item.equipment_name),
        v_overall_remaining,
        v_item.requested_quantity;
    end if;
  end loop;

  for v_item in
    select
      ri.equipment_id,
      nullif(trim(coalesce(ri.size, '')), '') as size,
      sum(greatest(coalesce(ri.quantity, 0), 0))::integer as requested_quantity,
      min(ri.equipment_name_snapshot) as equipment_name
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
    group by ri.equipment_id, nullif(trim(coalesce(ri.size, '')), '')
  loop
    select *
    into v_equipment
    from public.equipment
    where id = v_item.equipment_id;

    if not found then
      raise exception '找不到裝備資料：%', v_item.equipment_name;
    end if;

    if not coalesce(v_equipment.quick_purchase_enabled, false) then
      raise exception '% 目前未開放加購', coalesce(v_equipment.name, v_item.equipment_name);
    end if;

    if coalesce(v_equipment.purchase_price, 0) <= 0 then
      raise exception '% 尚未設定加購售價', coalesce(v_equipment.name, v_item.equipment_name);
    end if;

    v_sizes_stock := case
      when jsonb_typeof(coalesce(v_equipment.sizes_stock, '[]'::jsonb)) = 'array'
        then coalesce(v_equipment.sizes_stock, '[]'::jsonb)
      else '[]'::jsonb
    end;

    select exists (
      select 1
      from jsonb_array_elements(v_sizes_stock) as stock(value)
      where nullif(trim(coalesce(stock.value ->> 'size', '')), '') is not null
    )
    into v_has_sizes;

    select coalesce(sum(
      case
        when t.transaction_type in ('borrow', 'receive', 'purchase') then greatest(coalesce(t.quantity, 0), 0)
        when t.transaction_type = 'return' then -greatest(coalesce(t.quantity, 0), 0)
        else 0
      end
    ), 0)::integer
    into v_overall_used
    from public.equipment_transactions t
    where t.equipment_id = v_item.equipment_id;

    select coalesce(sum(greatest(coalesce(ri.quantity, 0), 0)), 0)::integer
    into v_overall_reserved
    from public.equipment_purchase_request_items ri
    join public.equipment_purchase_requests r on r.id = ri.request_id
    where ri.equipment_id = v_item.equipment_id
      and r.id <> p_request_id
      and r.status in ('approved', 'ready_for_pickup')
      and ri.equipment_transaction_id is null;

    v_overall_remaining := greatest(coalesce(v_equipment.total_quantity, 0) - v_overall_used - v_overall_reserved, 0);

    if v_has_sizes then
      if v_item.size is null then
        raise exception '% 請選擇尺寸或序號', coalesce(v_equipment.name, v_item.equipment_name);
      end if;

      select coalesce(sum(greatest(
        case
          when (stock.value ->> 'quantity') ~ '^-?[0-9]+$'
            then (stock.value ->> 'quantity')::integer
          else 0
        end,
        0
      )), 0)::integer
      into v_size_stock
      from jsonb_array_elements(v_sizes_stock) as stock(value)
      where nullif(trim(coalesce(stock.value ->> 'size', '')), '') = v_item.size;

      select coalesce(sum(
        case
          when t.transaction_type in ('borrow', 'receive', 'purchase') then greatest(coalesce(t.quantity, 0), 0)
          when t.transaction_type = 'return' then -greatest(coalesce(t.quantity, 0), 0)
          else 0
        end
      ), 0)::integer
      into v_size_used
      from public.equipment_transactions t
      where t.equipment_id = v_item.equipment_id
        and nullif(trim(coalesce(t.size, '')), '') = v_item.size;

      select coalesce(sum(greatest(coalesce(ri.quantity, 0), 0)), 0)::integer
      into v_size_reserved
      from public.equipment_purchase_request_items ri
      join public.equipment_purchase_requests r on r.id = ri.request_id
      where ri.equipment_id = v_item.equipment_id
        and nullif(trim(coalesce(ri.size, '')), '') = v_item.size
        and r.id <> p_request_id
        and r.status in ('approved', 'ready_for_pickup')
        and ri.equipment_transaction_id is null;

      v_size_remaining := greatest(v_size_stock - v_size_used - v_size_reserved, 0);
      v_available := least(v_overall_remaining, v_size_remaining);
    else
      v_available := v_overall_remaining;
    end if;

    if v_item.requested_quantity <= 0 then
      raise exception '% 請購數量必須大於 0', coalesce(v_equipment.name, v_item.equipment_name);
    end if;

    if v_item.requested_quantity > v_available then
      raise exception '裝備庫存不足：% %剩 % 件，申請 % 件',
        coalesce(v_equipment.name, v_item.equipment_name),
        case when v_item.size is null then '' else v_item.size || ' ' end,
        v_available,
        v_item.requested_quantity;
    end if;
  end loop;

  update public.equipment_purchase_requests
  set
    status = 'approved',
    approved_at = now(),
    approved_by = p_user_id,
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  return v_request;
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
    (array_agg(t.member_id))[1],
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
    and (
      t.request_item_id is null
      or r.status in ('approved', 'ready_for_pickup', 'picked_up')
    );

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

do $$
declare
  v_request record;
begin
  for v_request in
    select
      id,
      coalesce(approved_at::date, ready_at::date, picked_up_at::date, current_date) as transaction_date
    from public.equipment_purchase_requests
    where status in ('approved', 'ready_for_pickup', 'picked_up')
  loop
    perform public.ensure_equipment_purchase_request_payment_transactions(
      v_request.id,
      v_request.transaction_date
    );
  end loop;
end;
$$;

revoke all on function public.ensure_equipment_purchase_request_payment_transactions(uuid, date) from public;
revoke all on function public.sync_equipment_purchase_request_payment_transactions() from public;
revoke all on function public.approve_equipment_purchase_request(uuid, uuid) from public;
revoke all on function public.list_my_equipment_pending_request_payment_items(uuid) from public;
revoke all on function public.list_my_equipment_payment_items(uuid) from public;
revoke all on function public.list_equipment_payment_submissions() from public;
revoke all on function public.create_equipment_payment_submission(uuid[], text, text, date, text) from public;

grant execute on function public.ensure_equipment_purchase_request_payment_transactions(uuid, date) to service_role;
grant execute on function public.approve_equipment_purchase_request(uuid, uuid) to authenticated, service_role;
grant execute on function public.list_my_equipment_pending_request_payment_items(uuid) to authenticated, service_role;
grant execute on function public.list_my_equipment_payment_items(uuid) to authenticated, service_role;
grant execute on function public.list_equipment_payment_submissions() to authenticated, service_role;
grant execute on function public.create_equipment_payment_submission(uuid[], text, text, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
