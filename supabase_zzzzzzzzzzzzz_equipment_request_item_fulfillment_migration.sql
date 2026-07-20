begin;

-- Keep request-level fulfillment metadata for legacy whole-request actions while
-- adding item-level timestamps and media for partial fulfillment.
alter table public.equipment_purchase_request_items
  add column if not exists ready_at timestamptz,
  add column if not exists ready_by uuid,
  add column if not exists ready_note text,
  add column if not exists ready_image_url text,
  add column if not exists ready_image_urls jsonb not null default '[]'::jsonb,
  add column if not exists picked_up_at timestamptz,
  add column if not exists picked_up_by uuid,
  add column if not exists pickup_note text,
  add column if not exists pickup_image_url text,
  add column if not exists pickup_image_urls jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_purchase_request_items_ready_by_fkey'
      and conrelid = 'public.equipment_purchase_request_items'::regclass
  ) then
    alter table public.equipment_purchase_request_items
      add constraint equipment_purchase_request_items_ready_by_fkey
      foreign key (ready_by)
      references public.profiles(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_purchase_request_items_picked_up_by_fkey'
      and conrelid = 'public.equipment_purchase_request_items'::regclass
  ) then
    alter table public.equipment_purchase_request_items
      add constraint equipment_purchase_request_items_picked_up_by_fkey
      foreign key (picked_up_by)
      references public.profiles(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_purchase_request_items_ready_image_urls_is_array'
      and conrelid = 'public.equipment_purchase_request_items'::regclass
  ) then
    alter table public.equipment_purchase_request_items
      add constraint equipment_purchase_request_items_ready_image_urls_is_array
      check (jsonb_typeof(ready_image_urls) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_purchase_request_items_pickup_image_urls_is_array'
      and conrelid = 'public.equipment_purchase_request_items'::regclass
  ) then
    alter table public.equipment_purchase_request_items
      add constraint equipment_purchase_request_items_pickup_image_urls_is_array
      check (jsonb_typeof(pickup_image_urls) = 'array');
  end if;
end;
$$;

create index if not exists equipment_purchase_request_items_ready_by_idx
  on public.equipment_purchase_request_items (ready_by);

create index if not exists equipment_purchase_request_items_picked_up_by_idx
  on public.equipment_purchase_request_items (picked_up_by);

-- Existing request-level photos and notes remain on the request. Only timestamps
-- and actors are copied so old fulfilled requests acquire a deterministic item
-- state without duplicating whole-request media into every item.
update public.equipment_purchase_request_items ri
set
  ready_at = case
    when r.status in ('ready_for_pickup', 'picked_up') then coalesce(
      ri.ready_at,
      r.ready_at,
      r.picked_up_at,
      r.approved_at,
      r.updated_at,
      r.created_at
    )
    else ri.ready_at
  end,
  ready_by = case
    when r.status in ('ready_for_pickup', 'picked_up') then coalesce(
      ri.ready_by,
      r.ready_by,
      r.picked_up_by,
      r.approved_by,
      r.requested_by
    )
    else ri.ready_by
  end,
  picked_up_at = case
    when r.status = 'picked_up' then coalesce(
      ri.picked_up_at,
      r.picked_up_at,
      r.ready_at,
      r.approved_at,
      r.updated_at,
      r.created_at
    )
    else ri.picked_up_at
  end,
  picked_up_by = case
    when r.status = 'picked_up' then coalesce(
      ri.picked_up_by,
      r.picked_up_by,
      r.ready_by,
      r.approved_by,
      r.requested_by
    )
    else ri.picked_up_by
  end
from public.equipment_purchase_requests r
where r.id = ri.request_id
  and r.status in ('ready_for_pickup', 'picked_up');

-- Deletion must go through the atomic RPCs below so the payment guard cannot be
-- bypassed by a direct REST table delete.
drop policy if exists "equipment_request_items_delete_managers"
  on public.equipment_purchase_request_items;
drop policy if exists "equipment_requests_delete_managers"
  on public.equipment_purchase_requests;

-- Internal helper: request status remains the aggregate compatibility state.
-- approved wins while any item is unfinished; ready_for_pickup wins when every
-- item is ready or picked up; picked_up requires every remaining item picked up.
create or replace function public.recalculate_equipment_purchase_request_fulfillment_status(
  p_request_id uuid,
  p_actor_id uuid default null
)
returns public.equipment_purchase_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.equipment_purchase_requests%rowtype;
  v_actor_id uuid := coalesce(p_actor_id, auth.uid());
  v_item_count integer := 0;
  v_ready_or_picked_count integer := 0;
  v_picked_count integer := 0;
  v_next_status text;
  v_now timestamptz := now();
begin
  if p_request_id is null then
    raise exception 'request_id is required';
  end if;

  select *
  into v_request
  from public.equipment_purchase_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception '找不到加購申請';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where ri.ready_at is not null or ri.picked_up_at is not null
    )::integer,
    count(*) filter (
      where ri.picked_up_at is not null
    )::integer
  into v_item_count, v_ready_or_picked_count, v_picked_count
  from public.equipment_purchase_request_items ri
  where ri.request_id = p_request_id;

  if v_item_count = 0 then
    return v_request;
  end if;

  if v_request.status not in ('approved', 'ready_for_pickup', 'picked_up') then
    update public.equipment_purchase_requests
    set updated_at = v_now
    where id = p_request_id
    returning * into v_request;

    return v_request;
  end if;

  if v_picked_count = v_item_count then
    v_next_status := 'picked_up';
  elsif v_ready_or_picked_count = v_item_count then
    v_next_status := 'ready_for_pickup';
  else
    v_next_status := 'approved';
  end if;

  update public.equipment_purchase_requests
  set
    status = v_next_status,
    ready_at = case
      when v_next_status in ('ready_for_pickup', 'picked_up')
        then coalesce(ready_at, v_now)
      else ready_at
    end,
    ready_by = case
      when v_next_status in ('ready_for_pickup', 'picked_up')
        then coalesce(ready_by, v_actor_id)
      else ready_by
    end,
    picked_up_at = case
      when v_next_status = 'picked_up'
        then coalesce(picked_up_at, v_now)
      else picked_up_at
    end,
    picked_up_by = case
      when v_next_status = 'picked_up'
        then coalesce(picked_up_by, v_actor_id)
      else picked_up_by
    end,
    updated_at = v_now
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

-- Compatibility trigger for legacy callers that still update the request header
-- directly. It only fills missing item timestamps and never calls the aggregate
-- helper, so aggregate updates cannot recurse back into themselves.
create or replace function public.sync_equipment_request_item_fulfillment_from_header()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if new.status = 'ready_for_pickup' then
    update public.equipment_purchase_request_items ri
    set
      ready_at = coalesce(new.ready_at, new.picked_up_at, v_now),
      ready_by = coalesce(ri.ready_by, new.ready_by, new.picked_up_by, auth.uid()),
      updated_at = v_now
    where ri.request_id = new.id
      and ri.ready_at is null
      and ri.picked_up_at is null;
  elsif new.status = 'picked_up' then
    update public.equipment_purchase_request_items ri
    set
      ready_at = coalesce(ri.ready_at, new.ready_at, new.picked_up_at, v_now),
      ready_by = coalesce(ri.ready_by, new.ready_by, new.picked_up_by, auth.uid()),
      picked_up_at = coalesce(ri.picked_up_at, new.picked_up_at, v_now),
      picked_up_by = coalesce(ri.picked_up_by, new.picked_up_by, new.ready_by, auth.uid()),
      updated_at = v_now
    where ri.request_id = new.id
      and ri.picked_up_at is null;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_equipment_request_items_after_header_fulfillment
  on public.equipment_purchase_requests;

create trigger sync_equipment_request_items_after_header_fulfillment
after update of status, ready_at, ready_by, picked_up_at, picked_up_by
on public.equipment_purchase_requests
for each row
when (
  new.status in ('ready_for_pickup', 'picked_up')
  and (
    old.status is distinct from new.status
    or old.ready_at is distinct from new.ready_at
    or old.ready_by is distinct from new.ready_by
    or old.picked_up_at is distinct from new.picked_up_at
    or old.picked_up_by is distinct from new.picked_up_by
  )
)
execute function public.sync_equipment_request_item_fulfillment_from_header();

create or replace function public.mark_equipment_request_item_ready(
  p_request_item_id uuid,
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
  v_item public.equipment_purchase_request_items%rowtype;
  v_image_urls jsonb;
  v_now timestamptz := now();
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception '尚未登入或使用者不一致';
  end if;

  if not (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  ) then
    raise exception '沒有標記裝備備貨完成的權限';
  end if;

  select r.*
  into v_request
  from public.equipment_purchase_requests r
  join public.equipment_purchase_request_items ri on ri.request_id = r.id
  where ri.id = p_request_item_id
  for update of r;

  if not found then
    raise exception '找不到請購品項';
  end if;

  select *
  into v_item
  from public.equipment_purchase_request_items
  where id = p_request_item_id
  for update;

  if v_request.status not in ('approved', 'ready_for_pickup') then
    raise exception '只有已核准或處理中的加購申請可以標記備貨完成';
  end if;

  if v_item.picked_up_at is not null then
    raise exception '此品項已完成領取';
  end if;

  if v_item.ready_at is not null then
    raise exception '此品項已標記備貨完成';
  end if;

  perform public.ensure_equipment_purchase_request_payment_transactions(
    v_request.id,
    coalesce(v_request.approved_at::date, current_date)
  );

  v_image_urls := case
    when jsonb_typeof(coalesce(p_image_urls, '[]'::jsonb)) = 'array'
      then coalesce(p_image_urls, '[]'::jsonb)
    else '[]'::jsonb
  end;

  update public.equipment_purchase_request_items
  set
    ready_at = v_now,
    ready_by = p_user_id,
    ready_note = nullif(btrim(coalesce(p_note, '')), ''),
    ready_image_url = nullif(v_image_urls ->> 0, ''),
    ready_image_urls = v_image_urls,
    updated_at = v_now
  where id = p_request_item_id;

  select *
  into v_request
  from public.recalculate_equipment_purchase_request_fulfillment_status(
    v_request.id,
    p_user_id
  );

  return v_request;
end;
$$;

create or replace function public.mark_equipment_request_item_picked_up(
  p_request_item_id uuid,
  p_user_id uuid,
  p_note text default null,
  p_image_urls jsonb default '[]'::jsonb,
  p_mark_paid boolean default false
)
returns public.equipment_purchase_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.equipment_purchase_requests%rowtype;
  v_item public.equipment_purchase_request_items%rowtype;
  v_image_urls jsonb;
  v_now timestamptz := now();
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

  select r.*
  into v_request
  from public.equipment_purchase_requests r
  join public.equipment_purchase_request_items ri on ri.request_id = r.id
  where ri.id = p_request_item_id
  for update of r;

  if not found then
    raise exception '找不到請購品項';
  end if;

  select *
  into v_item
  from public.equipment_purchase_request_items
  where id = p_request_item_id
  for update;

  if v_request.status not in ('approved', 'ready_for_pickup') then
    raise exception '只有已核准或可取貨的加購申請可以標記領取';
  end if;

  if v_item.picked_up_at is not null then
    raise exception '此品項已完成領取';
  end if;

  if v_item.ready_at is null then
    raise exception '請先將此品項標記為備貨完成';
  end if;

  perform public.ensure_equipment_purchase_request_payment_transactions(
    v_request.id,
    current_date
  );

  select *
  into v_item
  from public.equipment_purchase_request_items
  where id = p_request_item_id
  for update;

  update public.equipment_transactions t
  set
    jersey_number = v_item.jersey_number,
    updated_at = v_now
  where t.id = v_item.equipment_transaction_id;

  if coalesce(p_mark_paid, false) then
    update public.equipment_transactions t
    set
      payment_status = 'paid',
      paid_at = v_now,
      paid_by = p_user_id,
      payment_submission_id = null,
      updated_at = v_now
    where t.id = v_item.equipment_transaction_id
      and t.transaction_type = 'purchase'
      and coalesce(t.payment_status, 'unpaid') = 'unpaid';
  end if;

  update public.equipment_jersey_number_claims claims
  set
    status = 'purchased',
    purchased_at = coalesce(claims.purchased_at, v_now),
    released_at = null,
    updated_at = v_now
  where claims.request_item_id = p_request_item_id
    and claims.status = 'reserved';

  v_image_urls := case
    when jsonb_typeof(coalesce(p_image_urls, '[]'::jsonb)) = 'array'
      then coalesce(p_image_urls, '[]'::jsonb)
    else '[]'::jsonb
  end;

  update public.equipment_purchase_request_items
  set
    ready_at = coalesce(ready_at, v_now),
    ready_by = coalesce(ready_by, p_user_id),
    picked_up_at = v_now,
    picked_up_by = p_user_id,
    pickup_note = nullif(btrim(coalesce(p_note, '')), ''),
    pickup_image_url = nullif(v_image_urls ->> 0, ''),
    pickup_image_urls = v_image_urls,
    updated_at = v_now
  where id = p_request_item_id;

  select *
  into v_request
  from public.recalculate_equipment_purchase_request_fulfillment_status(
    v_request.id,
    p_user_id
  );

  return v_request;
end;
$$;

create or replace function public.delete_equipment_purchase_request_item(
  p_request_item_id uuid,
  p_user_id uuid
)
returns table (
  request_id uuid,
  request_deleted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_item public.equipment_purchase_request_items%rowtype;
  v_transaction_ids uuid[];
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception '尚未登入或使用者不一致';
  end if;

  if not (
    coalesce(public.has_app_permission('equipment', 'DELETE'), false)
    or coalesce(public.has_app_permission('fees', 'DELETE'), false)
  ) then
    raise exception '沒有刪除裝備請購的權限';
  end if;

  select ri.request_id
  into v_request_id
  from public.equipment_purchase_request_items ri
  where ri.id = p_request_item_id;

  if v_request_id is null then
    raise exception '找不到請購品項';
  end if;

  perform 1
  from public.equipment_purchase_requests r
  where r.id = v_request_id
  for update;

  if not found then
    raise exception '找不到加購申請';
  end if;

  select *
  into v_item
  from public.equipment_purchase_request_items ri
  where ri.id = p_request_item_id
    and ri.request_id = v_request_id
  for update;

  if not found then
    raise exception '找不到請購品項';
  end if;

  select array_agg(distinct transaction_id order by transaction_id)
  into v_transaction_ids
  from (
    select v_item.equipment_transaction_id as transaction_id
    where v_item.equipment_transaction_id is not null
    union
    select t.id
    from public.equipment_transactions t
    where t.request_item_id = p_request_item_id
  ) transactions;

  if coalesce(cardinality(v_transaction_ids), 0) > 0 then
    perform public.delete_equipment_transactions(v_transaction_ids);
  end if;

  delete from public.equipment_purchase_request_items
  where id = p_request_item_id;

  if exists (
    select 1
    from public.equipment_purchase_request_items ri
    where ri.request_id = v_request_id
  ) then
    perform public.recalculate_equipment_purchase_request_fulfillment_status(
      v_request_id,
      p_user_id
    );
  else
    delete from public.equipment_purchase_requests
    where id = v_request_id;
  end if;

  return query
  select
    v_request_id,
    not exists (
      select 1
      from public.equipment_purchase_requests r
      where r.id = v_request_id
    );
end;
$$;

-- Whole-request compatibility action. It fills only unfinished items, retains
-- already picked-up items, and keeps action note/photos at request level.
create or replace function public.mark_equipment_request_ready(
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
  v_now timestamptz := now();
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception '尚未登入或使用者不一致';
  end if;

  if not (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  ) then
    raise exception '沒有標記裝備備貨完成的權限';
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
    raise exception '只有已核准或處理中的加購申請可以標記備貨完成';
  end if;

  if not exists (
    select 1
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
  ) then
    raise exception '請購單沒有裝備品項';
  end if;

  perform public.ensure_equipment_purchase_request_payment_transactions(
    p_request_id,
    coalesce(v_request.approved_at::date, current_date)
  );

  update public.equipment_purchase_request_items ri
  set
    ready_at = v_now,
    ready_by = p_user_id,
    updated_at = v_now
  where ri.request_id = p_request_id
    and ri.ready_at is null
    and ri.picked_up_at is null;

  v_image_urls := case
    when jsonb_typeof(coalesce(p_image_urls, '[]'::jsonb)) = 'array'
      then coalesce(p_image_urls, '[]'::jsonb)
    else '[]'::jsonb
  end;

  update public.equipment_purchase_requests
  set
    ready_note = nullif(btrim(coalesce(p_note, '')), ''),
    ready_image_url = nullif(v_image_urls ->> 0, ''),
    ready_image_urls = v_image_urls,
    updated_at = v_now
  where id = p_request_id;

  select *
  into v_request
  from public.recalculate_equipment_purchase_request_fulfillment_status(
    p_request_id,
    p_user_id
  );

  return v_request;
end;
$$;

drop function if exists public.mark_equipment_request_picked_up(uuid, uuid, text, jsonb);

create or replace function public.mark_equipment_request_picked_up(
  p_request_id uuid,
  p_user_id uuid,
  p_note text default null,
  p_image_urls jsonb default '[]'::jsonb,
  p_mark_paid boolean default false
)
returns public.equipment_purchase_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.equipment_purchase_requests%rowtype;
  v_image_urls jsonb;
  v_now timestamptz := now();
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

  if not exists (
    select 1
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
  ) then
    raise exception '請購單沒有裝備品項';
  end if;

  perform public.ensure_equipment_purchase_request_payment_transactions(
    p_request_id,
    current_date
  );

  update public.equipment_transactions t
  set
    jersey_number = ri.jersey_number,
    updated_at = v_now
  from public.equipment_purchase_request_items ri
  where ri.request_id = p_request_id
    and ri.picked_up_at is null
    and ri.equipment_transaction_id = t.id;

  if coalesce(p_mark_paid, false) then
    update public.equipment_transactions t
    set
      payment_status = 'paid',
      paid_at = v_now,
      paid_by = p_user_id,
      payment_submission_id = null,
      updated_at = v_now
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
      and ri.picked_up_at is null
      and ri.equipment_transaction_id = t.id
      and t.transaction_type = 'purchase'
      and coalesce(t.payment_status, 'unpaid') = 'unpaid';
  end if;

  update public.equipment_jersey_number_claims claims
  set
    status = 'purchased',
    purchased_at = coalesce(claims.purchased_at, v_now),
    released_at = null,
    updated_at = v_now
  where claims.request_id = p_request_id
    and claims.status = 'reserved'
    and exists (
      select 1
      from public.equipment_purchase_request_items ri
      where ri.id = claims.request_item_id
        and ri.picked_up_at is null
    );

  update public.equipment_purchase_request_items ri
  set
    ready_at = coalesce(ri.ready_at, v_now),
    ready_by = coalesce(ri.ready_by, p_user_id),
    picked_up_at = coalesce(ri.picked_up_at, v_now),
    picked_up_by = coalesce(ri.picked_up_by, p_user_id),
    updated_at = v_now
  where ri.request_id = p_request_id
    and ri.picked_up_at is null;

  v_image_urls := case
    when jsonb_typeof(coalesce(p_image_urls, '[]'::jsonb)) = 'array'
      then coalesce(p_image_urls, '[]'::jsonb)
    else '[]'::jsonb
  end;

  update public.equipment_purchase_requests
  set
    pickup_note = nullif(btrim(coalesce(p_note, '')), ''),
    pickup_image_url = nullif(v_image_urls ->> 0, ''),
    pickup_image_urls = v_image_urls,
    updated_at = v_now
  where id = p_request_id;

  select *
  into v_request
  from public.recalculate_equipment_purchase_request_fulfillment_status(
    p_request_id,
    p_user_id
  );

  return v_request;
end;
$$;

create or replace function public.delete_equipment_purchase_request(
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_transaction_ids uuid[];
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception '尚未登入';
  end if;

  if not (
    coalesce(public.has_app_permission('equipment', 'DELETE'), false)
    or coalesce(public.has_app_permission('fees', 'DELETE'), false)
  ) then
    raise exception '沒有刪除裝備請購的權限';
  end if;

  perform 1
  from public.equipment_purchase_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception '找不到加購申請';
  end if;

  perform 1
  from public.equipment_purchase_request_items ri
  where ri.request_id = p_request_id
  order by ri.id
  for update;

  select array_agg(distinct transaction_id order by transaction_id)
  into v_transaction_ids
  from (
    select ri.equipment_transaction_id as transaction_id
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
      and ri.equipment_transaction_id is not null
    union
    select t.id
    from public.equipment_transactions t
    join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
    where ri.request_id = p_request_id
  ) transactions;

  if coalesce(cardinality(v_transaction_ids), 0) > 0 then
    perform public.delete_equipment_transactions(v_transaction_ids);
  end if;

  delete from public.equipment_purchase_requests
  where id = p_request_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

-- New functions inherit Supabase's default EXECUTE grants, so revoke anon and
-- PUBLIC explicitly. Internal trigger/helpers are not callable by clients.
revoke all on function public.recalculate_equipment_purchase_request_fulfillment_status(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.sync_equipment_request_item_fulfillment_from_header()
  from public, anon, authenticated;

grant execute on function public.recalculate_equipment_purchase_request_fulfillment_status(uuid, uuid)
  to service_role;
grant execute on function public.sync_equipment_request_item_fulfillment_from_header()
  to service_role;

revoke all on function public.mark_equipment_request_item_ready(uuid, uuid, text, jsonb)
  from public, anon;
revoke all on function public.mark_equipment_request_item_picked_up(uuid, uuid, text, jsonb, boolean)
  from public, anon;
revoke all on function public.delete_equipment_purchase_request_item(uuid, uuid)
  from public, anon;
revoke all on function public.mark_equipment_request_ready(uuid, uuid, text, jsonb)
  from public, anon;
revoke all on function public.mark_equipment_request_picked_up(uuid, uuid, text, jsonb, boolean)
  from public, anon;
revoke all on function public.delete_equipment_purchase_request(uuid)
  from public, anon;

grant execute on function public.mark_equipment_request_item_ready(uuid, uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function public.mark_equipment_request_item_picked_up(uuid, uuid, text, jsonb, boolean)
  to authenticated, service_role;
grant execute on function public.delete_equipment_purchase_request_item(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.mark_equipment_request_ready(uuid, uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function public.mark_equipment_request_picked_up(uuid, uuid, text, jsonb, boolean)
  to authenticated, service_role;
grant execute on function public.delete_equipment_purchase_request(uuid)
  to authenticated, service_role;

-- These dependencies were intended to be internal or authenticated-only, but
-- older default privileges can leave an explicit anon EXECUTE ACL behind.
revoke all on function public.ensure_equipment_purchase_request_payment_transactions(uuid, date)
  from public, anon, authenticated;
grant execute on function public.ensure_equipment_purchase_request_payment_transactions(uuid, date)
  to service_role;

revoke all on function public.delete_equipment_transactions(uuid[])
  from public, anon;
grant execute on function public.delete_equipment_transactions(uuid[])
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
