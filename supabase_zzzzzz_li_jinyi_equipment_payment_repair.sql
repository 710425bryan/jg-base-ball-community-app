begin;

do $$
declare
  -- Li Jin-Yi / player / game socks, written with Unicode escapes so this
  -- one-off repair stays safe on consoles that do not preserve UTF-8 text.
  v_member_name constant text := U&'\674E\9032\4E00';
  v_member_role constant text := U&'\7403\54E1';
  v_equipment_name_pattern constant text := U&'%\6BD4\8CFD\896A%';

  v_member_id uuid;
  v_member_count integer := 0;
  v_profile_submission record;
  v_profile_submission_count integer := 0;
  v_unpaid_transaction record;
  v_unpaid_transaction_count integer := 0;
  v_existing_transaction record;
  v_existing_transaction_count integer := 0;
  v_new_submission_id uuid;
begin
  select count(*)
  into v_member_count
  from public.team_members tm
  where btrim(tm.name) = v_member_name
    and tm.role = v_member_role;

  if v_member_count = 0 then
    raise exception 'No matching member found for Li Jin-Yi.';
  end if;

  if v_member_count > 1 then
    raise exception 'Multiple matching members found for Li Jin-Yi. Repair manually with member_id.';
  end if;

  select tm.id
  into v_member_id
  from public.team_members tm
  where btrim(tm.name) = v_member_name
    and tm.role = v_member_role
  limit 1;

  select count(*)
  into v_profile_submission_count
  from public.profile_payment_submissions s
  where s.member_id = v_member_id
    and s.status = 'pending_review'
    and s.billing_mode = 'quarterly'
    and s.period_key = '2026-Q2'
    and s.amount = 300
    and coalesce(s.account_last_5, '') = '03046'
    and s.created_at >= timestamptz '2026-05-06 00:00:00+08'
    and s.created_at < timestamptz '2026-05-07 00:00:00+08';

  if v_profile_submission_count = 0 then
    raise notice 'No pending quarterly profile submission matched Li Jin-Yi / 2026-Q2 / $300 / #03046. Nothing changed.';
    return;
  end if;

  if v_profile_submission_count > 1 then
    raise exception 'Multiple pending quarterly profile submissions matched Li Jin-Yi / 2026-Q2 / $300 / #03046. Repair manually.';
  end if;

  select s.*
  into v_profile_submission
  from public.profile_payment_submissions s
  where s.member_id = v_member_id
    and s.status = 'pending_review'
    and s.billing_mode = 'quarterly'
    and s.period_key = '2026-Q2'
    and s.amount = 300
    and coalesce(s.account_last_5, '') = '03046'
    and s.created_at >= timestamptz '2026-05-06 00:00:00+08'
    and s.created_at < timestamptz '2026-05-07 00:00:00+08'
  limit 1;

  select count(*)
  into v_unpaid_transaction_count
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where t.member_id = v_member_id
    and t.transaction_type = 'purchase'
    and e.name ilike v_equipment_name_pattern
    and coalesce(t.unit_price, e.purchase_price, 0) * t.quantity = 300
    and coalesce(t.payment_status, 'unpaid') = 'unpaid'
    and t.payment_submission_id is null
    and (
      t.request_item_id is null
      or r.status = 'picked_up'
    );

  if v_unpaid_transaction_count = 1 then
    select
      t.id,
      t.member_id,
      t.created_at,
      e.name as equipment_name
    into v_unpaid_transaction
    from public.equipment_transactions t
    join public.equipment e on e.id = t.equipment_id
    left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
    left join public.equipment_purchase_requests r on r.id = ri.request_id
    where t.member_id = v_member_id
      and t.transaction_type = 'purchase'
      and e.name ilike v_equipment_name_pattern
      and coalesce(t.unit_price, e.purchase_price, 0) * t.quantity = 300
      and coalesce(t.payment_status, 'unpaid') = 'unpaid'
      and t.payment_submission_id is null
      and (
        t.request_item_id is null
        or r.status = 'picked_up'
      )
    order by t.created_at desc
    limit 1
    for update of t;

    insert into public.equipment_payment_submissions (
      profile_id,
      member_id,
      amount,
      balance_amount,
      payment_method,
      account_last_5,
      remittance_date,
      note,
      status,
      created_at,
      updated_at
    )
    values (
      v_profile_submission.profile_id,
      v_member_id,
      v_profile_submission.amount,
      coalesce(v_profile_submission.balance_amount, 0),
      v_profile_submission.payment_method,
      v_profile_submission.account_last_5,
      v_profile_submission.remittance_date,
      concat_ws(
        E'\n',
        nullif(v_profile_submission.note, ''),
        format('Moved from wrong quarterly profile submission. profile_payment_submissions.id=%s', v_profile_submission.id)
      ),
      'pending_review',
      v_profile_submission.created_at,
      now()
    )
    returning id into v_new_submission_id;

    insert into public.equipment_payment_submission_items (submission_id, transaction_id)
    values (v_new_submission_id, v_unpaid_transaction.id);

    update public.equipment_transactions
    set
      payment_status = 'pending_review',
      payment_submission_id = v_new_submission_id,
      updated_at = now()
    where id = v_unpaid_transaction.id;

    update public.profile_payment_submissions
    set
      status = 'rejected',
      reviewed_at = now(),
      reviewed_by = null,
      note = concat_ws(
        E'\n',
        nullif(v_profile_submission.note, ''),
        format('Wrong destination for equipment payment. Moved to equipment_payment_submissions.id=%s', v_new_submission_id)
      ),
      updated_at = now()
    where id = v_profile_submission.id;

    raise notice 'Moved Li Jin-Yi profile submission % to equipment submission %.', v_profile_submission.id, v_new_submission_id;
    return;
  end if;

  if v_unpaid_transaction_count > 1 then
    raise exception 'Multiple unpaid equipment transactions matched Li Jin-Yi / game socks / $300. Repair manually.';
  end if;

  select count(*)
  into v_existing_transaction_count
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  where t.member_id = v_member_id
    and t.transaction_type = 'purchase'
    and e.name ilike v_equipment_name_pattern
    and coalesce(t.unit_price, e.purchase_price, 0) * t.quantity = 300
    and coalesce(t.payment_status, 'unpaid') in ('pending_review', 'paid')
    and t.payment_submission_id is not null;

  if v_existing_transaction_count = 1 then
    select
      t.id,
      t.payment_status,
      t.payment_submission_id
    into v_existing_transaction
    from public.equipment_transactions t
    join public.equipment e on e.id = t.equipment_id
    where t.member_id = v_member_id
      and t.transaction_type = 'purchase'
      and e.name ilike v_equipment_name_pattern
      and coalesce(t.unit_price, e.purchase_price, 0) * t.quantity = 300
      and coalesce(t.payment_status, 'unpaid') in ('pending_review', 'paid')
      and t.payment_submission_id is not null
    order by t.updated_at desc
    limit 1;

    update public.profile_payment_submissions
    set
      status = 'rejected',
      reviewed_at = now(),
      reviewed_by = null,
      note = concat_ws(
        E'\n',
        nullif(v_profile_submission.note, ''),
        format('Wrong destination for equipment payment. Equipment submission already exists: equipment_payment_submissions.id=%s', v_existing_transaction.payment_submission_id)
      ),
      updated_at = now()
    where id = v_profile_submission.id;

    raise notice 'Li Jin-Yi equipment transaction is already %. Rejected wrong profile submission %.', v_existing_transaction.payment_status, v_profile_submission.id;
    return;
  end if;

  if v_existing_transaction_count > 1 then
    raise exception 'Multiple existing equipment payment records matched Li Jin-Yi / game socks / $300. Repair manually.';
  end if;

  raise exception 'No payable or existing equipment transaction matched Li Jin-Yi / game socks / $300.';
end $$;

notify pgrst, 'reload schema';

commit;
