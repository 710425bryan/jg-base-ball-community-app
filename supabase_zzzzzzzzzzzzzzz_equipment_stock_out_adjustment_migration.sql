begin;

alter table public.equipment_inventory_adjustments
  drop constraint if exists equipment_inventory_adjustments_adjustment_type_check;

alter table public.equipment_inventory_adjustments
  add constraint equipment_inventory_adjustments_adjustment_type_check
  check (adjustment_type in ('stock_in', 'stock_out'));

drop policy if exists "equipment_inventory_adjustments_insert_managers"
  on public.equipment_inventory_adjustments;

create policy "equipment_inventory_adjustments_insert_managers"
  on public.equipment_inventory_adjustments
  for insert
  to authenticated
  with check (
    (
      adjustment_type = 'stock_in'
      and (
        public.has_app_permission('equipment', 'CREATE')
        or public.has_app_permission('equipment', 'EDIT')
      )
    )
    or (
      adjustment_type = 'stock_out'
      and public.has_app_permission('equipment', 'EDIT')
    )
  );

create or replace function public.create_equipment_inventory_adjustment(
  p_equipment_id uuid,
  p_adjustment_date date,
  p_member_id uuid,
  p_handled_by text,
  p_size text,
  p_quantity_delta integer,
  p_notes text
)
returns public.equipment_inventory_adjustments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment public.equipment%rowtype;
  v_adjustment public.equipment_inventory_adjustments%rowtype;
  v_adjustment_type text;
  v_signed_quantity integer := coalesce(p_quantity_delta, 0);
  v_quantity integer := abs(coalesce(p_quantity_delta, 0));
  v_size text := nullif(btrim(coalesce(p_size, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_sizes jsonb;
  v_sizes_after jsonb := '[]'::jsonb;
  v_item jsonb;
  v_item_size text;
  v_item_quantity integer;
  v_size_found boolean := false;
  v_has_sizes boolean := false;
  v_total_after integer;
  v_overall_used integer := 0;
  v_overall_reserved integer := 0;
  v_size_used integer := 0;
  v_size_reserved integer := 0;
  v_available integer := 0;
begin
  if v_signed_quantity = 0 then
    raise exception '庫存調整數量不可為 0';
  end if;

  v_adjustment_type := case
    when v_signed_quantity < 0 then 'stock_out'
    else 'stock_in'
  end;

  if v_adjustment_type = 'stock_out' then
    if not coalesce(public.has_app_permission('equipment', 'EDIT'), false) then
      raise exception '沒有減少裝備庫存的權限';
    end if;

    if v_notes is null then
      raise exception '減少庫存時必須填寫原因';
    end if;
  elsif not (
    coalesce(public.has_app_permission('equipment', 'CREATE'), false)
    or coalesce(public.has_app_permission('equipment', 'EDIT'), false)
  ) then
    raise exception '沒有新增裝備庫存的權限';
  end if;

  select *
  into v_equipment
  from public.equipment
  where id = p_equipment_id
  for update;

  if not found then
    raise exception '找不到裝備資料';
  end if;

  v_sizes := case
    when jsonb_typeof(coalesce(v_equipment.sizes_stock, '[]'::jsonb)) = 'array'
      then coalesce(v_equipment.sizes_stock, '[]'::jsonb)
    else '[]'::jsonb
  end;

  select exists (
    select 1
    from jsonb_array_elements(v_sizes) as size_item(value)
    where nullif(btrim(coalesce(size_item.value->>'size', '')), '') is not null
  )
  into v_has_sizes;

  if v_adjustment_type = 'stock_out' and v_has_sizes and v_size is null then
    raise exception '此裝備有尺寸規格，請選擇要減少的尺寸';
  end if;

  if v_adjustment_type = 'stock_out' and not v_has_sizes and v_size is not null then
    raise exception '此裝備沒有尺寸規格，不可指定減少尺寸';
  end if;

  v_total_after := greatest(coalesce(v_equipment.total_quantity, 0), 0) + v_signed_quantity;

  if v_adjustment_type = 'stock_out' then
    select greatest(coalesce(sum(
      case
        when t.transaction_type in ('borrow', 'receive', 'purchase')
          then greatest(coalesce(t.quantity, 0), 0)
        when t.transaction_type = 'return'
          then -greatest(coalesce(t.quantity, 0), 0)
        else 0
      end
    ), 0), 0)::integer
    into v_overall_used
    from public.equipment_transactions t
    where t.equipment_id = p_equipment_id;

    select coalesce(sum(greatest(coalesce(ri.quantity, 0), 0)), 0)::integer
    into v_overall_reserved
    from public.equipment_purchase_request_items ri
    join public.equipment_purchase_requests r on r.id = ri.request_id
    where ri.equipment_id = p_equipment_id
      and r.status in ('approved', 'ready_for_pickup')
      and ri.equipment_transaction_id is null;

    v_available := greatest(
      greatest(coalesce(v_equipment.total_quantity, 0), 0)
        - v_overall_used
        - v_overall_reserved,
      0
    );

    if v_quantity > v_available or v_total_after < 0 then
      raise exception '可用庫存不足，目前最多可減少 % 件', v_available;
    end if;

    if v_size is not null then
      select greatest(coalesce(sum(
        case
          when t.transaction_type in ('borrow', 'receive', 'purchase')
            then greatest(coalesce(t.quantity, 0), 0)
          when t.transaction_type = 'return'
            then -greatest(coalesce(t.quantity, 0), 0)
          else 0
        end
      ), 0), 0)::integer
      into v_size_used
      from public.equipment_transactions t
      where t.equipment_id = p_equipment_id
        and nullif(btrim(coalesce(t.size, '')), '') = v_size;

      select coalesce(sum(greatest(coalesce(ri.quantity, 0), 0)), 0)::integer
      into v_size_reserved
      from public.equipment_purchase_request_items ri
      join public.equipment_purchase_requests r on r.id = ri.request_id
      where ri.equipment_id = p_equipment_id
        and nullif(btrim(coalesce(ri.size, '')), '') = v_size
        and r.status in ('approved', 'ready_for_pickup')
        and ri.equipment_transaction_id is null;
    end if;
  end if;

  if v_size is null then
    v_sizes_after := v_sizes;
  else
    for v_item in select value from jsonb_array_elements(v_sizes)
    loop
      v_item_size := btrim(coalesce(v_item->>'size', ''));
      if v_item_size = '' then
        continue;
      end if;

      v_item_quantity := case
        when coalesce(v_item->>'quantity', '') ~ '^-?[0-9]+$'
          then greatest((v_item->>'quantity')::integer, 0)
        else 0
      end;

      if v_item_size = v_size then
        if v_adjustment_type = 'stock_out' then
          v_available := greatest(v_item_quantity - v_size_used - v_size_reserved, 0);
          if v_quantity > v_available then
            raise exception '尺寸 % 可用庫存不足，目前最多可減少 % 件', v_size, v_available;
          end if;
        end if;

        v_item_quantity := v_item_quantity + v_signed_quantity;
        v_size_found := true;
      end if;

      v_sizes_after := v_sizes_after || jsonb_build_array(
        jsonb_build_object('size', v_item_size, 'quantity', v_item_quantity)
      );
    end loop;

    if not v_size_found then
      if v_adjustment_type = 'stock_out' then
        raise exception '找不到尺寸規格：%', v_size;
      end if;

      v_sizes_after := v_sizes_after || jsonb_build_array(
        jsonb_build_object('size', v_size, 'quantity', v_quantity)
      );
    end if;
  end if;

  update public.equipment
  set
    total_quantity = v_total_after,
    sizes_stock = v_sizes_after,
    updated_at = now()
  where id = p_equipment_id;

  insert into public.equipment_inventory_adjustments (
    equipment_id,
    adjustment_type,
    adjustment_date,
    member_id,
    handled_by,
    size,
    quantity_delta,
    total_quantity_after,
    sizes_stock_after,
    notes,
    created_by
  )
  values (
    p_equipment_id,
    v_adjustment_type,
    coalesce(p_adjustment_date, current_date),
    p_member_id,
    nullif(btrim(coalesce(p_handled_by, '')), ''),
    v_size,
    v_quantity,
    v_total_after,
    v_sizes_after,
    v_notes,
    auth.uid()
  )
  returning *
  into v_adjustment;

  return v_adjustment;
end;
$$;

revoke all on function public.create_equipment_inventory_adjustment(uuid, date, uuid, text, text, integer, text)
  from public;
grant execute on function public.create_equipment_inventory_adjustment(uuid, date, uuid, text, text, integer, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
