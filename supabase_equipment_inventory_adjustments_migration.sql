begin;

create table if not exists public.equipment_inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  adjustment_type text not null default 'stock_in' check (adjustment_type in ('stock_in')),
  adjustment_date date not null default current_date,
  member_id uuid references public.team_members(id) on delete set null,
  handled_by text,
  size text,
  quantity_delta integer not null check (quantity_delta > 0),
  total_quantity_after integer not null check (total_quantity_after >= 0),
  sizes_stock_after jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists equipment_inventory_adjustments_equipment_id_idx
  on public.equipment_inventory_adjustments(equipment_id);
create index if not exists equipment_inventory_adjustments_member_id_idx
  on public.equipment_inventory_adjustments(member_id);
create index if not exists equipment_inventory_adjustments_adjustment_date_idx
  on public.equipment_inventory_adjustments(adjustment_date desc);

alter table public.equipment_inventory_adjustments enable row level security;

drop policy if exists "equipment_inventory_adjustments_select_allowed" on public.equipment_inventory_adjustments;
create policy "equipment_inventory_adjustments_select_allowed"
  on public.equipment_inventory_adjustments
  for select
  using (
    public.has_app_permission('equipment', 'VIEW')
    or public.has_app_permission('fees', 'VIEW')
    or member_id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "equipment_inventory_adjustments_insert_managers" on public.equipment_inventory_adjustments;
create policy "equipment_inventory_adjustments_insert_managers"
  on public.equipment_inventory_adjustments
  for insert
  with check (
    public.has_app_permission('equipment', 'CREATE')
    or public.has_app_permission('equipment', 'EDIT')
  );

drop policy if exists "equipment_inventory_adjustments_update_managers" on public.equipment_inventory_adjustments;
create policy "equipment_inventory_adjustments_update_managers"
  on public.equipment_inventory_adjustments
  for update
  using (public.has_app_permission('equipment', 'EDIT'))
  with check (public.has_app_permission('equipment', 'EDIT'));

drop policy if exists "equipment_inventory_adjustments_delete_managers" on public.equipment_inventory_adjustments;
create policy "equipment_inventory_adjustments_delete_managers"
  on public.equipment_inventory_adjustments
  for delete
  using (public.has_app_permission('equipment', 'DELETE'));

drop function if exists public.create_equipment_inventory_adjustment(uuid, date, uuid, text, text, integer, text);

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
  v_quantity integer := greatest(coalesce(p_quantity_delta, 0), 0);
  v_size text := nullif(btrim(coalesce(p_size, '')), '');
  v_sizes jsonb;
  v_sizes_after jsonb := '[]'::jsonb;
  v_item jsonb;
  v_item_size text;
  v_item_quantity integer;
  v_size_found boolean := false;
  v_total_after integer;
begin
  if not (
    public.has_app_permission('equipment', 'CREATE')
    or public.has_app_permission('equipment', 'EDIT')
  ) then
    raise exception 'permission denied';
  end if;

  if v_quantity <= 0 then
    raise exception 'quantity_delta must be greater than zero';
  end if;

  select *
  into v_equipment
  from public.equipment
  where id = p_equipment_id
  for update;

  if not found then
    raise exception 'equipment not found';
  end if;

  v_total_after := greatest(coalesce(v_equipment.total_quantity, 0), 0) + v_quantity;
  v_sizes := case
    when jsonb_typeof(coalesce(v_equipment.sizes_stock, '[]'::jsonb)) = 'array'
      then coalesce(v_equipment.sizes_stock, '[]'::jsonb)
    else '[]'::jsonb
  end;

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
        v_item_quantity := v_item_quantity + v_quantity;
        v_size_found := true;
      end if;

      v_sizes_after := v_sizes_after || jsonb_build_array(
        jsonb_build_object('size', v_item_size, 'quantity', v_item_quantity)
      );
    end loop;

    if not v_size_found then
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
    'stock_in',
    coalesce(p_adjustment_date, current_date),
    p_member_id,
    nullif(btrim(coalesce(p_handled_by, '')), ''),
    v_size,
    v_quantity,
    v_total_after,
    v_sizes_after,
    nullif(btrim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning *
  into v_adjustment;

  return v_adjustment;
end;
$$;

grant select, insert, update, delete on public.equipment_inventory_adjustments to authenticated, service_role;

revoke all on function public.create_equipment_inventory_adjustment(uuid, date, uuid, text, text, integer, text) from public;
grant execute on function public.create_equipment_inventory_adjustment(uuid, date, uuid, text, text, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
