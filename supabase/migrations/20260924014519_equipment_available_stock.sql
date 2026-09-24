begin;

-- Setting availability is a separate audited operation; never reinterpret old totals.
alter table public.equipment_inventory_adjustments
  add column available_quantity_before integer,
  add column available_quantity_after integer;
alter table public.equipment_inventory_adjustments
  drop constraint equipment_inventory_adjustments_adjustment_type_check,
  drop constraint equipment_inventory_adjustments_quantity_delta_check;
alter table public.equipment_inventory_adjustments
  add constraint equipment_inventory_adjustments_adjustment_type_check
    check (adjustment_type in ('stock_in', 'stock_out', 'stock_set')),
  add constraint equipment_inventory_adjustments_quantity_delta_check
    check (quantity_delta > 0 or (adjustment_type = 'stock_set' and quantity_delta = 0));

-- All allocation changes share the catalog row lock and invalidate open edit forms.
create or replace function public.touch_equipment_stock_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old uuid; v_new uuid;
begin
  if tg_op <> 'INSERT' then v_old := old.equipment_id; end if;
  if tg_op <> 'DELETE' then v_new := new.equipment_id; end if;
  perform e.id from public.equipment e where e.id in (v_old, v_new) order by e.id for update;
  update public.equipment set updated_at = clock_timestamp() where id in (v_old, v_new);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.touch_equipment_stock_revision() from public, anon, authenticated;
create trigger equipment_transactions_stock_revision
  before insert or update or delete on public.equipment_transactions
  for each row execute function public.touch_equipment_stock_revision();
create trigger equipment_request_items_stock_revision
  before insert or update or delete on public.equipment_purchase_request_items
  for each row execute function public.touch_equipment_stock_revision();

create or replace function public.touch_equipment_request_stock_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform e.id from public.equipment e
      where e.id in (select i.equipment_id from public.equipment_purchase_request_items i where i.request_id = new.id)
      order by e.id for update;
    update public.equipment e set updated_at = clock_timestamp()
      where e.id in (select i.equipment_id from public.equipment_purchase_request_items i where i.request_id = new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.touch_equipment_request_stock_revision() from public, anon, authenticated;
create trigger equipment_requests_stock_revision
  before update of status on public.equipment_purchase_requests
  for each row execute function public.touch_equipment_request_stock_revision();

create or replace function public.save_equipment_available_stock(
  p_equipment_id uuid,
  p_details jsonb,
  p_stock jsonb,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_equipment public.equipment%rowtype;
  v_details public.equipment%rowtype;
  v_id uuid := p_equipment_id;
  v_snapshot jsonb := '[]'::jsonb;
  v_sizes jsonb := '[]'::jsonb;
  v_item jsonb;
  v_size text;
  v_quantity integer;
  v_allocated integer := 0;
  v_overall_allocated integer := 0;
  v_available integer := 0;
  v_before integer := 0;
  v_total integer := 0;
  v_actor text;
  v_stock_changed boolean := false;
begin
  if auth.uid() is null or not coalesce(public.has_app_permission('equipment',
    case when v_id is null then 'CREATE' else 'EDIT' end), false) then
    raise exception '沒有儲存裝備的權限' using errcode = '42501';
  end if;
  if jsonb_typeof(p_details) is distinct from 'object' or nullif(btrim(p_details->>'name'), '') is null then
    raise exception '請填寫裝備名稱' using errcode = '22023';
  end if;
  v_details := jsonb_populate_record(null::public.equipment, p_details);

  if v_id is not null then
    select * into v_equipment from public.equipment where id = v_id for update;
    if not found then raise exception '找不到裝備資料'; end if;
    if p_expected_updated_at is null or v_equipment.updated_at is distinct from p_expected_updated_at then
      raise exception '裝備或庫存已變更，請關閉視窗並重新整理後再試。' using errcode = '40001';
    end if;
    v_total := v_equipment.total_quantity;
    v_sizes := v_equipment.sizes_stock;
    select s.inventory_snapshot into v_snapshot
      from public.list_equipments_with_inventory_snapshot(array[v_id]) s;
    v_snapshot := coalesce(v_snapshot, '[]'::jsonb);
    select coalesce(sum((x->>'used_quantity')::integer + (x->>'reserved_quantity')::integer), 0)
      into v_overall_allocated from jsonb_array_elements(v_snapshot) x;
    v_before := greatest(v_total - v_overall_allocated, 0);
  elsif p_stock is null then
    raise exception '新增裝備需填寫目前可用庫存' using errcode = '22023';
  end if;

  if p_stock is not null then
    if jsonb_typeof(p_stock) is distinct from 'object'
      or jsonb_typeof(p_stock->'sizes') is distinct from 'array'
      or coalesce(p_stock->>'available_quantity', '') !~ '^[0-9]+$' then
      raise exception '可用庫存需為 0 或正整數' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_snapshot) x where (x->>'used_quantity')::integer < 0) then
      raise exception '歸還紀錄超過借出或領用數量，請先核對交易紀錄。';
    end if;
    v_available := (p_stock->>'available_quantity')::integer;
    v_sizes := '[]'::jsonb;
    if jsonb_array_length(p_stock->'sizes') > 0 then
      v_available := 0;
      v_total := 0;
      for v_item in select value from jsonb_array_elements(p_stock->'sizes')
      loop
        v_size := nullif(btrim(v_item->>'size'), '');
        if v_size is null or coalesce(v_item->>'quantity', '') !~ '^[0-9]+$' then
          raise exception '請填寫尺寸及非負整數的可用庫存' using errcode = '22023';
        end if;
        if exists (select 1 from jsonb_array_elements(v_sizes) x where x->>'size' = v_size) then
          raise exception '尺寸名稱不可重複：%', v_size using errcode = '22023';
        end if;
        v_quantity := (v_item->>'quantity')::integer;
        select coalesce(sum((x->>'used_quantity')::integer + (x->>'reserved_quantity')::integer), 0)
          into v_allocated from jsonb_array_elements(v_snapshot) x where x->>'size' = v_size;
        v_available := v_available + v_quantity;
        v_total := v_total + v_quantity + v_allocated;
        v_sizes := v_sizes || jsonb_build_array(jsonb_build_object('size', v_size, 'quantity', v_quantity + v_allocated));
      end loop;
      if exists (
        select 1 from jsonb_array_elements(v_snapshot) x
        where (x->>'used_quantity')::integer + (x->>'reserved_quantity')::integer <> 0
          and not exists (select 1 from jsonb_array_elements(v_sizes) s where s->>'size' = x->>'size')
      ) then
        raise exception '有已使用或預留的尺寸無法對應，請保留原尺寸名稱並核對交易紀錄。';
      end if;
    else
      if exists (select 1 from jsonb_array_elements(v_snapshot) x
        where nullif(x->>'size', '') is not null
          and (x->>'used_quantity')::integer + (x->>'reserved_quantity')::integer <> 0) then
        raise exception '已有尺寸交易或預留，請保留尺寸規格。';
      end if;
      v_total := v_available + v_overall_allocated;
    end if;
    -- A reorder alone does not change stock; a repair of inconsistent totals does.
    v_stock_changed := v_id is null or v_total is distinct from v_equipment.total_quantity
      or not (v_sizes @> coalesce(v_equipment.sizes_stock, '[]'::jsonb)
        and coalesce(v_equipment.sizes_stock, '[]'::jsonb) @> v_sizes);
    if v_id is not null and v_stock_changed and nullif(btrim(p_reason), '') is null then
      raise exception '請填寫庫存調整原因' using errcode = '22023';
    end if;
  end if;

  if v_id is null then
    insert into public.equipment (name, category, total_quantity, sizes_stock)
      values (btrim(v_details.name), v_details.category, v_total, v_sizes) returning id into v_id;
  end if;
  -- Explicit metadata whitelist: callers cannot write timestamps, IDs or raw totals.
  update public.equipment set
    name = btrim(v_details.name), category = v_details.category,
    specs = v_details.specs, notes = v_details.notes, purchased_by = v_details.purchased_by,
    image_url = v_details.image_url, image_urls = coalesce(v_details.image_urls, '[]'::jsonb),
    purchase_price = coalesce(v_details.purchase_price, 0),
    quick_purchase_enabled = coalesce(v_details.quick_purchase_enabled, false),
    is_custom_order = coalesce(v_details.is_custom_order, false),
    requires_jersey_number = coalesce(v_details.requires_jersey_number, false),
    jersey_number_min = coalesce(v_details.jersey_number_min, 0),
    jersey_number_max = coalesce(v_details.jersey_number_max, 99),
    jersey_number_options = coalesce(v_details.jersey_number_options, '[]'::jsonb),
    total_quantity = v_total, sizes_stock = v_sizes, updated_at = clock_timestamp()
    where id = v_id;

  if v_stock_changed then
    select coalesce(nullif(p.nickname, ''), p.name, '管理者') into v_actor
      from public.profiles p where p.id = auth.uid();
    insert into public.equipment_inventory_adjustments (
      equipment_id, adjustment_type, adjustment_date, handled_by, quantity_delta,
      total_quantity_after, sizes_stock_after, notes, created_by,
      available_quantity_before, available_quantity_after
    ) values (
      v_id, 'stock_set', (now() at time zone 'Asia/Taipei')::date, v_actor, abs(v_available - v_before),
      v_total, v_sizes, coalesce(nullif(btrim(p_reason), ''), '建立裝備可用庫存'), auth.uid(),
      v_before, v_available
    );
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_equipment_available_stock(uuid, jsonb, jsonb, timestamptz, text) from public, anon;
grant execute on function public.save_equipment_available_stock(uuid, jsonb, jsonb, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
commit;
