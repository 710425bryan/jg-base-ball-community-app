begin;

alter table public.equipment
  add column if not exists requires_jersey_number boolean not null default false,
  add column if not exists jersey_number_min integer not null default 0,
  add column if not exists jersey_number_max integer not null default 99,
  add column if not exists jersey_number_options jsonb not null default '[]'::jsonb;

alter table public.equipment_purchase_request_items
  add column if not exists jersey_number integer;

alter table public.equipment_transactions
  add column if not exists jersey_number integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'equipment_jersey_number_range_valid'
      and conrelid = 'public.equipment'::regclass
  ) then
    alter table public.equipment
      add constraint equipment_jersey_number_range_valid
      check (
        jersey_number_min >= 0
        and jersey_number_max >= jersey_number_min
        and jersey_number_max <= 999
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'equipment_jersey_number_options_array'
      and conrelid = 'public.equipment'::regclass
  ) then
    alter table public.equipment
      add constraint equipment_jersey_number_options_array
      check (jsonb_typeof(jersey_number_options) = 'array');
  end if;
end;
$$;

create table if not exists public.equipment_jersey_number_claims (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  jersey_number integer not null check (jersey_number >= 0 and jersey_number <= 999),
  request_id uuid references public.equipment_purchase_requests(id) on delete cascade,
  request_item_id uuid references public.equipment_purchase_request_items(id) on delete cascade,
  transaction_id uuid references public.equipment_transactions(id) on delete cascade,
  member_id uuid references public.team_members(id) on delete set null,
  requester_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'reserved' check (status in ('reserved', 'purchased', 'released')),
  claimed_at timestamptz not null default now(),
  released_at timestamptz,
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists equipment_jersey_number_claims_active_key
  on public.equipment_jersey_number_claims(equipment_id, jersey_number)
  where status in ('reserved', 'purchased');

create index if not exists equipment_jersey_number_claims_equipment_idx
  on public.equipment_jersey_number_claims(equipment_id);
create index if not exists equipment_jersey_number_claims_request_idx
  on public.equipment_jersey_number_claims(request_id);
create index if not exists equipment_jersey_number_claims_request_item_idx
  on public.equipment_jersey_number_claims(request_item_id);
create index if not exists equipment_jersey_number_claims_transaction_idx
  on public.equipment_jersey_number_claims(transaction_id);
create index if not exists equipment_jersey_number_claims_member_idx
  on public.equipment_jersey_number_claims(member_id);

alter table public.equipment_jersey_number_claims enable row level security;

drop policy if exists "equipment_jersey_claims_select_allowed" on public.equipment_jersey_number_claims;
create policy "equipment_jersey_claims_select_allowed"
  on public.equipment_jersey_number_claims
  for select
  using (
    public.has_app_permission('equipment', 'VIEW')
    or public.has_app_permission('fees', 'VIEW')
    or requester_user_id = auth.uid()
    or member_id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "equipment_jersey_claims_write_managers" on public.equipment_jersey_number_claims;
create policy "equipment_jersey_claims_write_managers"
  on public.equipment_jersey_number_claims
  for all
  using (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  )
  with check (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  );

create or replace function public.normalize_equipment_jersey_number_options(
  p_options jsonb
)
returns table (
  jersey_number integer
)
language sql
immutable
set search_path = public
as $$
  select distinct option_text.value::integer as jersey_number
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(coalesce(p_options, '[]'::jsonb)) = 'array'
        then coalesce(p_options, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as option_text(value)
  where option_text.value ~ '^\d+$'
    and option_text.value::integer between 0 and 999
  order by 1;
$$;

update public.equipment
set requires_jersey_number = true,
    jersey_number_min = 9,
    jersey_number_max = 97,
    jersey_number_options = '[9,13,16,19,32,34,41,43,47,48,49,59,60,62,63,64,68,70,71,72,73,75,76,78,79,80,81,82,83,84,86,87,89,91,92,93,95,96,97]'::jsonb
where btrim(name) = '社區球衣'
  or name ilike '%社區球衣%';

create or replace function public.list_equipment_jersey_number_availability(
  p_equipment_id uuid
)
returns table (
  jersey_number integer,
  is_available boolean,
  claim_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_equipment public.equipment%rowtype;
  v_has_number_options boolean;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select *
  into v_equipment
  from public.equipment
  where id = p_equipment_id;

  if not found then
    raise exception 'equipment not found';
  end if;

  if not coalesce(v_equipment.requires_jersey_number, false) then
    return;
  end if;

  v_has_number_options := coalesce(jsonb_array_length(v_equipment.jersey_number_options), 0) > 0;

  if v_has_number_options then
    return query
    select
      numbers.jersey_number,
      claims.id is null,
      claims.status::text
    from public.normalize_equipment_jersey_number_options(v_equipment.jersey_number_options) as numbers
    left join public.equipment_jersey_number_claims claims
      on claims.equipment_id = v_equipment.id
     and claims.jersey_number = numbers.jersey_number
     and claims.status in ('reserved', 'purchased')
    order by numbers.jersey_number;
  else
    return query
    select
      numbers.number::integer,
      claims.id is null,
      claims.status::text
    from generate_series(v_equipment.jersey_number_min, v_equipment.jersey_number_max) as numbers(number)
    left join public.equipment_jersey_number_claims claims
      on claims.equipment_id = v_equipment.id
     and claims.jersey_number = numbers.number
     and claims.status in ('reserved', 'purchased')
    order by numbers.number;
  end if;
end;
$$;

create or replace function public.create_equipment_purchase_request(
  p_member_id uuid,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns public.equipment_purchase_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.equipment_purchase_requests%rowtype;
  v_item record;
  v_equipment public.equipment%rowtype;
  v_request_item_id uuid;
  v_quantity integer;
  v_sizes_stock jsonb;
  v_has_sizes boolean;
  v_size text;
  v_jersey_number integer;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_member_id is null then
    raise exception 'member_id is required';
  end if;

  if not (
    public.has_app_permission('equipment', 'CREATE')
    or public.has_app_permission('equipment', 'EDIT')
    or exists (
      select 1
      from public.profiles
      where profiles.id = v_user_id
        and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
    )
  ) then
    raise exception 'member is not linked to current profile';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'items is required';
  end if;

  perform 1
  from public.equipment e
  where e.id in (
    select distinct item.equipment_id
    from jsonb_to_recordset(p_items) as item(equipment_id uuid)
  )
  order by e.id
  for update;

  insert into public.equipment_purchase_requests (
    member_id,
    requester_user_id,
    requested_by,
    notes,
    status,
    requested_at,
    created_at,
    updated_at
  )
  values (
    p_member_id,
    v_user_id,
    v_user_id,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'pending',
    now(),
    now(),
    now()
  )
  returning * into v_request;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as item(
      equipment_id uuid,
      size text,
      jersey_number integer,
      quantity integer,
      equipment_name_snapshot text,
      unit_price_snapshot integer
    )
  loop
    v_quantity := greatest(coalesce(v_item.quantity, 0), 0);
    v_size := nullif(btrim(coalesce(v_item.size, '')), '');
    v_jersey_number := v_item.jersey_number;

    if v_item.equipment_id is null then
      raise exception 'equipment_id is required';
    end if;

    if v_quantity <= 0 then
      raise exception '請購數量必須大於 0';
    end if;

    select *
    into v_equipment
    from public.equipment
    where id = v_item.equipment_id;

    if not found then
      raise exception '找不到裝備資料';
    end if;

    if not coalesce(v_equipment.quick_purchase_enabled, false) then
      raise exception '% 目前未開放加購', v_equipment.name;
    end if;

    if coalesce(v_equipment.purchase_price, 0) <= 0 then
      raise exception '% 尚未設定加購售價', v_equipment.name;
    end if;

    v_sizes_stock := case
      when jsonb_typeof(coalesce(v_equipment.sizes_stock, '[]'::jsonb)) = 'array'
        then coalesce(v_equipment.sizes_stock, '[]'::jsonb)
      else '[]'::jsonb
    end;

    select exists (
      select 1
      from jsonb_array_elements(v_sizes_stock) as stock(value)
      where nullif(btrim(coalesce(stock.value ->> 'size', '')), '') is not null
    )
    into v_has_sizes;

    if v_has_sizes and v_size is null then
      raise exception '% 請選擇尺寸或序號', v_equipment.name;
    end if;

    if v_has_sizes and not exists (
      select 1
      from jsonb_array_elements(v_sizes_stock) as stock(value)
      where nullif(btrim(coalesce(stock.value ->> 'size', '')), '') = v_size
    ) then
      raise exception '% 找不到尺寸或序號 %', v_equipment.name, v_size;
    end if;

    if coalesce(v_equipment.requires_jersey_number, false) then
      if v_quantity <> 1 then
        raise exception '% 每件球衣需分別選擇一個號碼', v_equipment.name;
      end if;

      if v_jersey_number is null then
        raise exception '% 請選擇球衣號碼', v_equipment.name;
      end if;

      if coalesce(jsonb_array_length(v_equipment.jersey_number_options), 0) > 0 then
        if not exists (
          select 1
          from public.normalize_equipment_jersey_number_options(v_equipment.jersey_number_options) as options
          where options.jersey_number = v_jersey_number
        ) then
          raise exception '% #% 目前不在可選號碼清單', v_equipment.name, v_jersey_number;
        end if;
      elsif v_jersey_number < v_equipment.jersey_number_min or v_jersey_number > v_equipment.jersey_number_max then
        raise exception '% 球衣號碼需介於 % - %', v_equipment.name, v_equipment.jersey_number_min, v_equipment.jersey_number_max;
      end if;

      if exists (
        select 1
        from public.equipment_jersey_number_claims claims
        where claims.equipment_id = v_equipment.id
          and claims.jersey_number = v_jersey_number
          and claims.status in ('reserved', 'purchased')
      ) then
        raise exception '% #% 已被選走，請改選其他號碼', v_equipment.name, v_jersey_number;
      end if;
    else
      v_jersey_number := null;
    end if;

    insert into public.equipment_purchase_request_items (
      request_id,
      equipment_id,
      size,
      jersey_number,
      quantity,
      equipment_name_snapshot,
      unit_price_snapshot,
      created_at,
      updated_at
    )
    values (
      v_request.id,
      v_equipment.id,
      v_size,
      v_jersey_number,
      v_quantity,
      coalesce(nullif(v_item.equipment_name_snapshot, ''), v_equipment.name),
      coalesce(v_item.unit_price_snapshot, v_equipment.purchase_price, 0),
      now(),
      now()
    )
    returning id into v_request_item_id;

    if v_jersey_number is not null then
      insert into public.equipment_jersey_number_claims (
        equipment_id,
        jersey_number,
        request_id,
        request_item_id,
        member_id,
        requester_user_id,
        status,
        claimed_at,
        created_at,
        updated_at
      )
      values (
        v_equipment.id,
        v_jersey_number,
        v_request.id,
        v_request_item_id,
        p_member_id,
        v_user_id,
        'reserved',
        now(),
        now(),
        now()
      );
    end if;
  end loop;

  return v_request;
end;
$$;

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
      ri.jersey_number,
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
      jersey_number,
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
      v_item.jersey_number,
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

    update public.equipment_jersey_number_claims
    set
      transaction_id = v_transaction_id,
      updated_at = now()
    where request_item_id = v_item.id
      and status = 'reserved';
  end loop;
end;
$$;

create or replace function public.mark_equipment_request_picked_up(
  p_request_id uuid,
  p_user_id uuid,
  p_note text default null,
  p_image_urls jsonb default '[]'::jsonb
)
returns public.equipment_purchase_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.equipment_purchase_requests%rowtype;
  v_image_urls jsonb;
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception '尚未登入或使用者不一致';
  end if;

  if not (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  ) then
    raise exception '沒有完成裝備領取的權限';
  end if;

  select *
  into v_request
  from public.equipment_purchase_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception '找不到加購申請';
  end if;

  if v_request.status not in ('approved', 'ready_for_pickup') then
    raise exception '只有已核准或可取貨的加購申請可以標記領取';
  end if;

  perform public.ensure_equipment_purchase_request_payment_transactions(
    p_request_id,
    current_date
  );

  update public.equipment_transactions t
  set
    jersey_number = ri.jersey_number,
    updated_at = now()
  from public.equipment_purchase_request_items ri
  where ri.request_id = p_request_id
    and ri.equipment_transaction_id = t.id;

  update public.equipment_jersey_number_claims claims
  set
    status = 'purchased',
    purchased_at = coalesce(claims.purchased_at, now()),
    released_at = null,
    updated_at = now()
  where claims.request_id = p_request_id
    and claims.status = 'reserved';

  v_image_urls := case
    when jsonb_typeof(coalesce(p_image_urls, '[]'::jsonb)) = 'array'
      then coalesce(p_image_urls, '[]'::jsonb)
    else '[]'::jsonb
  end;

  update public.equipment_purchase_requests
  set
    status = 'picked_up',
    picked_up_at = now(),
    picked_up_by = p_user_id,
    pickup_note = nullif(btrim(coalesce(p_note, '')), ''),
    pickup_image_url = nullif(v_image_urls ->> 0, ''),
    pickup_image_urls = v_image_urls,
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.release_equipment_jersey_claims_for_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('rejected', 'cancelled') and old.status is distinct from new.status then
    update public.equipment_jersey_number_claims
    set
      status = 'released',
      released_at = now(),
      updated_at = now()
    where request_id = new.id
      and status = 'reserved';
  end if;

  return null;
end;
$$;

drop trigger if exists release_equipment_jersey_claims_after_request_status
  on public.equipment_purchase_requests;
create trigger release_equipment_jersey_claims_after_request_status
after update of status on public.equipment_purchase_requests
for each row
execute function public.release_equipment_jersey_claims_for_request();

create or replace function public.claim_manual_equipment_transaction_jersey_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment public.equipment%rowtype;
begin
  if new.request_item_id is not null
    or new.jersey_number is null
    or new.transaction_type <> 'purchase'
  then
    return new;
  end if;

  select *
  into v_equipment
  from public.equipment
  where id = new.equipment_id
  for update;

  if not found or not coalesce(v_equipment.requires_jersey_number, false) then
    return new;
  end if;

  if coalesce(jsonb_array_length(v_equipment.jersey_number_options), 0) > 0 then
    if not exists (
      select 1
      from public.normalize_equipment_jersey_number_options(v_equipment.jersey_number_options) as options
      where options.jersey_number = new.jersey_number
    ) then
      raise exception '% #% 目前不在可選號碼清單', v_equipment.name, new.jersey_number;
    end if;
  elsif new.jersey_number < v_equipment.jersey_number_min or new.jersey_number > v_equipment.jersey_number_max then
    raise exception '% 球衣號碼需介於 % - %', v_equipment.name, v_equipment.jersey_number_min, v_equipment.jersey_number_max;
  end if;

  if exists (
    select 1
    from public.equipment_jersey_number_claims claims
    where claims.equipment_id = new.equipment_id
      and claims.jersey_number = new.jersey_number
      and claims.status in ('reserved', 'purchased')
  ) then
    raise exception '% #% 已被選走，請改選其他號碼', v_equipment.name, new.jersey_number;
  end if;

  insert into public.equipment_jersey_number_claims (
    equipment_id,
    jersey_number,
    transaction_id,
    member_id,
    requester_user_id,
    status,
    claimed_at,
    purchased_at,
    created_at,
    updated_at
  )
  values (
    new.equipment_id,
    new.jersey_number,
    new.id,
    new.member_id,
    auth.uid(),
    'purchased',
    now(),
    now(),
    now(),
    now()
  );

  return new;
end;
$$;

drop trigger if exists claim_manual_equipment_transaction_jersey_number_after_insert
  on public.equipment_transactions;
create trigger claim_manual_equipment_transaction_jersey_number_after_insert
after insert on public.equipment_transactions
for each row
execute function public.claim_manual_equipment_transaction_jersey_number();

drop function if exists public.list_my_equipment_manual_purchase_records(uuid);
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
  jersey_number integer,
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
    t.jersey_number,
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

grant select, insert, update, delete on public.equipment_jersey_number_claims to authenticated, service_role;

revoke all on function public.list_equipment_jersey_number_availability(uuid) from public;
revoke all on function public.normalize_equipment_jersey_number_options(jsonb) from public;
revoke all on function public.create_equipment_purchase_request(uuid, text, jsonb) from public;
revoke all on function public.ensure_equipment_purchase_request_payment_transactions(uuid, date) from public;
revoke all on function public.mark_equipment_request_picked_up(uuid, uuid, text, jsonb) from public;
revoke all on function public.release_equipment_jersey_claims_for_request() from public;
revoke all on function public.claim_manual_equipment_transaction_jersey_number() from public;
revoke all on function public.list_my_equipment_manual_purchase_records(uuid) from public;
revoke all on function public.list_my_equipment_pending_request_payment_items(uuid) from public;
revoke all on function public.list_my_equipment_payment_items(uuid) from public;
revoke all on function public.list_equipment_payment_submissions() from public;

grant execute on function public.list_equipment_jersey_number_availability(uuid) to authenticated, service_role;
grant execute on function public.normalize_equipment_jersey_number_options(jsonb) to service_role;
grant execute on function public.create_equipment_purchase_request(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.ensure_equipment_purchase_request_payment_transactions(uuid, date) to service_role;
grant execute on function public.mark_equipment_request_picked_up(uuid, uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.list_my_equipment_manual_purchase_records(uuid) to authenticated, service_role;
grant execute on function public.list_my_equipment_pending_request_payment_items(uuid) to authenticated, service_role;
grant execute on function public.list_my_equipment_payment_items(uuid) to authenticated, service_role;
grant execute on function public.list_equipment_payment_submissions() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
