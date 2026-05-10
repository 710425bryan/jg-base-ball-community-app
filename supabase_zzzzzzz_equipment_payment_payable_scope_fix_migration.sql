begin;

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
  left join public.equipment_transactions t on t.id = ri.equipment_transaction_id
  where r.status in ('pending', 'approved', 'ready_for_pickup')
    and (
      ri.equipment_transaction_id is null
      or coalesce(t.payment_status, 'unpaid') = 'unpaid'
    )
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
      or r.status = 'picked_up'
      or coalesce(t.payment_status, 'unpaid') <> 'unpaid'
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
    coalesce(r.picked_up_at, t.transaction_date::timestamptz, t.created_at) desc,
    t.created_at desc;
end;
$$;

revoke all on function public.list_my_equipment_pending_request_payment_items(uuid) from public;
revoke all on function public.list_my_equipment_payment_items(uuid) from public;

grant execute on function public.list_my_equipment_pending_request_payment_items(uuid) to authenticated, service_role;
grant execute on function public.list_my_equipment_payment_items(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
