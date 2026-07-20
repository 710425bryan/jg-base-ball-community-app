begin;

-- Payment and fulfillment are separate lifecycles. For multi-item requests the
-- parent stays approved until every item is ready, so payment rows must expose
-- the linked request item's fulfillment state instead of the parent aggregate.
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
    case
      when r.status in ('pending', 'rejected', 'cancelled') then r.status
      when ri.picked_up_at is not null then 'picked_up'
      when ri.ready_at is not null then 'ready_for_pickup'
      else r.status
    end::text,
    coalesce(ri.picked_up_at, r.picked_up_at)
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
    coalesce(
      ri.picked_up_at,
      ri.ready_at,
      r.picked_up_at,
      r.ready_at,
      r.approved_at,
      t.transaction_date::timestamptz,
      t.created_at
    ) desc,
    t.created_at desc;
end;
$$;

create or replace function public.list_equipment_unpaid_payment_items()
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
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('equipment', 'VIEW')
  ) then
    raise exception 'permission denied';
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
    case
      when r.status in ('pending', 'rejected', 'cancelled') then r.status
      when ri.picked_up_at is not null then 'picked_up'
      when ri.ready_at is not null then 'ready_for_pickup'
      else r.status
    end::text,
    coalesce(ri.picked_up_at, r.picked_up_at)
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  join public.team_members tm on tm.id = t.member_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where t.transaction_type = 'purchase'
    and t.member_id is not null
    and coalesce(t.payment_status, 'unpaid') = 'unpaid'
    and (
      t.request_item_id is null
      or r.status in ('approved', 'ready_for_pickup', 'picked_up')
    )
  order by
    coalesce(
      ri.picked_up_at,
      ri.ready_at,
      r.picked_up_at,
      r.ready_at,
      r.approved_at,
      t.transaction_date::timestamptz,
      t.created_at
    ) desc,
    t.transaction_date desc,
    t.created_at desc;
end;
$$;

create or replace function public.list_equipment_refundable_direct_payment_items()
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
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('equipment', 'VIEW')
  ) then
    raise exception 'permission denied';
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
    case
      when r.status in ('pending', 'rejected', 'cancelled') then r.status
      when ri.picked_up_at is not null then 'picked_up'
      when ri.ready_at is not null then 'ready_for_pickup'
      else r.status
    end::text,
    coalesce(ri.picked_up_at, r.picked_up_at)
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  join public.team_members tm on tm.id = t.member_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where t.transaction_type = 'purchase'
    and t.member_id is not null
    and coalesce(t.payment_status, 'unpaid') = 'paid'
    and t.payment_submission_id is null
    and not exists (
      select 1
      from public.equipment_payment_submission_items si
      where si.transaction_id = t.id
    )
  order by
    coalesce(
      ri.picked_up_at,
      ri.ready_at,
      r.picked_up_at,
      r.ready_at,
      r.approved_at,
      t.transaction_date::timestamptz,
      t.created_at
    ) desc,
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
  balance_amount integer,
  external_amount integer,
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
    coalesce(s.balance_amount, 0),
    greatest(s.amount - coalesce(s.balance_amount, 0), 0),
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
          'request_status', case
            when r.status in ('pending', 'rejected', 'cancelled') then r.status
            when ri.picked_up_at is not null then 'picked_up'
            when ri.ready_at is not null then 'ready_for_pickup'
            else r.status
          end,
          'picked_up_at', coalesce(ri.picked_up_at, r.picked_up_at)
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

revoke all on function public.list_my_equipment_payment_items(uuid)
  from public, anon;
revoke all on function public.list_equipment_unpaid_payment_items()
  from public, anon;
revoke all on function public.list_equipment_refundable_direct_payment_items()
  from public, anon;
revoke all on function public.list_equipment_payment_submissions()
  from public, anon;

grant execute on function public.list_my_equipment_payment_items(uuid)
  to authenticated, service_role;
grant execute on function public.list_equipment_unpaid_payment_items()
  to authenticated, service_role;
grant execute on function public.list_equipment_refundable_direct_payment_items()
  to authenticated, service_role;
grant execute on function public.list_equipment_payment_submissions()
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
