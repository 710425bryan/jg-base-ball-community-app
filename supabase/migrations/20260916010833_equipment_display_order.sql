begin;

-- Keep presentation order separate from inventory, pricing and equipment update triggers.
create table public.equipment_display_order (
  equipment_id uuid primary key references public.equipment(id) on delete cascade,
  position integer not null check (position > 0)
);

alter table public.equipment_display_order enable row level security;
revoke all on public.equipment_display_order from public, anon, authenticated;
grant select on public.equipment_display_order to authenticated;
grant all on public.equipment_display_order to service_role;

create policy equipment_display_order_read
  on public.equipment_display_order for select to authenticated
  using (auth.uid() is not null and public.current_profile_role() is not null);

create function public.reorder_equipment(p_equipment_ids uuid[], p_expected_equipment_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_ids uuid[];
  v_count integer;
begin
  if auth.uid() is null or not coalesce(public.has_app_permission('equipment', 'EDIT'), false) then
    raise exception '沒有調整裝備排序的權限' using errcode = '42501';
  end if;

  -- Serialize reorders and prevent catalog additions/deletions during validation and save.
  lock table public.equipment in share mode;
  lock table public.equipment_display_order in exclusive mode;

  select coalesce(array_agg(e.id order by o.position nulls last, date_trunc('milliseconds', e.created_at) desc, e.id), '{}'::uuid[])
    into v_current_ids
  from public.equipment e
  left join public.equipment_display_order o on o.equipment_id = e.id;

  if p_expected_equipment_ids is distinct from v_current_ids then
    raise exception '裝備清單或排序已更新，請關閉排序視窗並重新整理後再試。' using errcode = '40001';
  end if;

  v_count := cardinality(p_equipment_ids);
  if p_equipment_ids is null or v_count = 0
    or v_count <> cardinality(v_current_ids)
    or v_count <> (select count(distinct id) from unnest(p_equipment_ids) as requested(id))
    or not (p_equipment_ids <@ v_current_ids) then
    raise exception '請提供完整且不重複的裝備排序。' using errcode = '22023';
  end if;

  insert into public.equipment_display_order (equipment_id, position)
  select requested.id, requested.ordinality::integer
  from unnest(p_equipment_ids) with ordinality as requested(id, ordinality)
  on conflict (equipment_id) do update set position = excluded.position;
end;
$$;

revoke all on function public.reorder_equipment(uuid[], uuid[]) from public, anon;
grant execute on function public.reorder_equipment(uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
