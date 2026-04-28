begin;

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
  where r.status in ('pending', 'approved', 'ready_for_pickup')
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
  order by
    case r.status
      when 'pending' then 0
      when 'approved' then 1
      when 'ready_for_pickup' then 2
      else 3
    end,
    coalesce(r.ready_at, r.approved_at, r.updated_at, r.created_at) desc,
    ri.created_at asc;
end;
$$;

revoke all on function public.list_my_equipment_pending_request_payment_items(uuid) from public;

grant execute on function public.list_my_equipment_pending_request_payment_items(uuid) to authenticated, service_role;

commit;
