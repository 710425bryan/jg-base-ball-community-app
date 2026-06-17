begin;

alter table public.equipment
  add column if not exists is_custom_order boolean not null default false;

drop function if exists public.list_equipments_with_inventory_snapshot(uuid[]);

create or replace function public.list_equipments_with_inventory_snapshot(
  p_equipment_ids uuid[] default null
)
returns table (
  id uuid,
  name text,
  category text,
  specs text,
  notes text,
  image_url text,
  image_urls jsonb,
  purchase_price integer,
  quick_purchase_enabled boolean,
  is_custom_order boolean,
  requires_jersey_number boolean,
  jersey_number_min integer,
  jersey_number_max integer,
  jersey_number_options jsonb,
  total_quantity integer,
  purchased_by text,
  sizes_stock jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  inventory_snapshot jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  return query
  with scoped_equipment as (
    select e.*
    from public.equipment e
    where p_equipment_ids is null
      or cardinality(p_equipment_ids) = 0
      or e.id = any(p_equipment_ids)
  ),
  transaction_allocations as (
    select
      t.equipment_id as row_equipment_id,
      nullif(btrim(coalesce(t.size, '')), '') as row_size,
      coalesce(sum(
        case
          when t.transaction_type in ('borrow', 'receive', 'purchase') then greatest(coalesce(t.quantity, 0), 0)
          when t.transaction_type = 'return' then -greatest(coalesce(t.quantity, 0), 0)
          else 0
        end
      ), 0)::integer as row_used_quantity,
      0::integer as row_reserved_quantity
    from public.equipment_transactions t
    join scoped_equipment e on e.id = t.equipment_id
    group by t.equipment_id, nullif(btrim(coalesce(t.size, '')), '')
  ),
  reserved_allocations as (
    select
      ri.equipment_id as row_equipment_id,
      nullif(btrim(coalesce(ri.size, '')), '') as row_size,
      0::integer as row_used_quantity,
      coalesce(sum(greatest(coalesce(ri.quantity, 0), 0)), 0)::integer as row_reserved_quantity
    from public.equipment_purchase_request_items ri
    join public.equipment_purchase_requests r on r.id = ri.request_id
    join scoped_equipment e on e.id = ri.equipment_id
    where r.status in ('approved', 'ready_for_pickup')
      and ri.equipment_transaction_id is null
    group by ri.equipment_id, nullif(btrim(coalesce(ri.size, '')), '')
  ),
  combined_allocations as (
    select * from transaction_allocations
    union all
    select * from reserved_allocations
  ),
  snapshot_rows as (
    select
      combined.row_equipment_id,
      combined.row_size,
      coalesce(sum(combined.row_used_quantity), 0)::integer as row_used_quantity,
      coalesce(sum(combined.row_reserved_quantity), 0)::integer as row_reserved_quantity
    from combined_allocations combined
    group by combined.row_equipment_id, combined.row_size
    having coalesce(sum(combined.row_used_quantity), 0) <> 0
      or coalesce(sum(combined.row_reserved_quantity), 0) <> 0
  ),
  snapshot_json as (
    select
      rows.row_equipment_id,
      jsonb_agg(
        jsonb_build_object(
          'equipment_id', rows.row_equipment_id,
          'size', rows.row_size,
          'used_quantity', rows.row_used_quantity,
          'reserved_quantity', rows.row_reserved_quantity
        )
        order by rows.row_size nulls first
      ) as snapshot_items
    from snapshot_rows rows
    group by rows.row_equipment_id
  )
  select
    e.id,
    e.name,
    e.category,
    e.specs,
    e.notes,
    e.image_url,
    e.image_urls,
    e.purchase_price,
    e.quick_purchase_enabled,
    e.is_custom_order,
    e.requires_jersey_number,
    e.jersey_number_min,
    e.jersey_number_max,
    e.jersey_number_options,
    e.total_quantity,
    e.purchased_by,
    e.sizes_stock,
    e.created_at,
    e.updated_at,
    coalesce(snapshot.snapshot_items, '[]'::jsonb) as inventory_snapshot
  from scoped_equipment e
  left join snapshot_json snapshot on snapshot.row_equipment_id = e.id
  order by e.created_at desc;
end;
$$;

revoke all on function public.list_equipments_with_inventory_snapshot(uuid[]) from public;
grant execute on function public.list_equipments_with_inventory_snapshot(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
