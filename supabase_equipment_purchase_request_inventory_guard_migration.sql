begin;

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
      and r.status in ('approved', 'ready_for_pickup');

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
      and r.status in ('approved', 'ready_for_pickup');

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
        and r.status in ('approved', 'ready_for_pickup');

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

revoke all on function public.approve_equipment_purchase_request(uuid, uuid) from public;
grant execute on function public.approve_equipment_purchase_request(uuid, uuid) to authenticated, service_role;

commit;
