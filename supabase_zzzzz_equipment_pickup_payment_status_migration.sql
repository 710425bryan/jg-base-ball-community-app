begin;

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

  perform public.ensure_equipment_purchase_request_payment_transactions(
    p_request_id,
    current_date
  );

  update public.equipment_transactions t
  set
    jersey_number = ri.jersey_number,
    updated_at = now()
  from public.equipment_purchase_request_items ri
  where ri.request_id = p_request_id
    and ri.equipment_transaction_id = t.id;

  if coalesce(p_mark_paid, false) then
    update public.equipment_transactions t
    set
      payment_status = 'paid',
      paid_at = now(),
      paid_by = p_user_id,
      payment_submission_id = null,
      updated_at = now()
    from public.equipment_purchase_request_items ri
    where ri.request_id = p_request_id
      and ri.equipment_transaction_id = t.id
      and coalesce(t.payment_status, 'unpaid') = 'unpaid';
  end if;

  update public.equipment_jersey_number_claims claims
  set
    status = 'purchased',
    purchased_at = coalesce(claims.purchased_at, now()),
    released_at = null,
    updated_at = now()
  where claims.request_id = p_request_id
    and claims.status = 'reserved';

  v_image_urls := case
    when jsonb_typeof(coalesce(p_image_urls, '[]'::jsonb)) = 'array'
      then coalesce(p_image_urls, '[]'::jsonb)
    else '[]'::jsonb
  end;

  update public.equipment_purchase_requests
  set
    status = 'picked_up',
    picked_up_at = now(),
    picked_up_by = p_user_id,
    pickup_note = nullif(btrim(coalesce(p_note, '')), ''),
    pickup_image_url = nullif(v_image_urls ->> 0, ''),
    pickup_image_urls = v_image_urls,
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.mark_equipment_request_picked_up(uuid, uuid, text, jsonb, boolean) from public;
grant execute on function public.mark_equipment_request_picked_up(uuid, uuid, text, jsonb, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
