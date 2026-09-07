-- Apply after profile_payment_amount_reconciliation and equipment/match payment migrations.
-- No existing fee snapshots, reviewed submissions, balances or fulfillment records are rewritten.
begin;

create or replace function public.list_my_pending_payment_submissions(p_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or public.current_profile_role() is null then
    raise exception '登入狀態已失效，請重新登入。' using errcode = '42501';
  end if;

  with headers as (
    select 'membership'::text as kind, to_jsonb(s) as data
    from public.profile_payment_submissions s
    where s.profile_id = auth.uid() and s.status = 'pending_review' and s.reviewed_at is null
    union all
    select 'equipment', to_jsonb(s) from public.equipment_payment_submissions s
    where s.profile_id = auth.uid() and s.status = 'pending_review' and s.reviewed_at is null
    union all
    select 'match', to_jsonb(s) from public.match_payment_submissions s
    where s.profile_id = auth.uid() and s.status = 'pending_review' and s.reviewed_at is null
  ), lines as (
    select h.kind, h.data, coalesce(item_data.items, jsonb_build_array(jsonb_build_object(
      'id', h.data->>'id', 'member_id', h.data->>'member_id',
      'label', tm.name || '｜' || case h.kind
        when 'membership' then h.data->>'period_key'
        when 'equipment' then coalesce((
          select string_agg(e.name || coalesce(' ' || t.size, '') || ' × ' || t.quantity, '、' order by t.id)
          from public.equipment_payment_submission_items i
          join public.equipment_transactions t on t.id = i.transaction_id
          join public.equipments e on e.id = t.equipment_id
          where i.submission_id = (h.data->>'id')::uuid
        ), '裝備付款')
        else coalesce((
          select string_agg(t.match_name || ' ' || t.match_date::text, '、' order by t.id)
          from public.match_payment_submission_items i
          join public.match_fee_items t on t.id = i.match_fee_item_id
          where i.submission_id = (h.data->>'id')::uuid
        ), '比賽費用') end,
      'expected_amount', case when h.kind = 'membership'
        then (h.data->>'expected_amount')::integer else (h.data->>'amount')::integer end,
      'balance_amount', coalesce((h.data->>'balance_amount')::integer, 0),
      'reported_external_amount', coalesce((h.data->>'reported_external_amount')::integer,
        greatest((h.data->>'amount')::integer - coalesce((h.data->>'balance_amount')::integer, 0), 0)),
      'available_balance', public.get_player_balance_unchecked(tm.id)
    ))) as items
    from headers h
    join public.team_members tm on tm.id = (h.data->>'member_id')::uuid
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', si.id, 'member_id', si.member_id, 'label', im.name || '｜' || si.period_key,
        'expected_amount', si.expected_amount, 'balance_amount', coalesce(si.balance_amount, 0),
        'reported_external_amount', coalesce(si.reported_external_amount, greatest(si.amount - coalesce(si.balance_amount, 0), 0)),
        'available_balance', public.get_player_balance_unchecked(si.member_id)
      ) order by im.name, si.id) as items
      from public.profile_payment_submission_items si
      join public.team_members im on im.id = si.member_id
      where h.kind = 'membership' and si.submission_id = (h.data->>'id')::uuid
    ) item_data on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.data->>'id', 'kind', l.kind,
    'label', case l.kind when 'membership' then '月／季費' when 'equipment' then '裝備款' else '比賽費' end,
    'payment_method', l.data->>'payment_method', 'account_last_5', l.data->>'account_last_5',
    'remittance_date', l.data->>'remittance_date', 'note', l.data->>'note',
    'amount_mismatch_reason', l.data->>'amount_mismatch_reason',
    'updated_at', l.data->>'updated_at', 'items', l.items
  ) order by l.data->>'updated_at' desc), '[]'::jsonb) into v_result
  from lines l
  join public.profiles p on p.id = auth.uid()
  where (l.data->>'member_id')::uuid = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    and not exists (
      select 1 from jsonb_array_elements(l.items) i
      where not ((i->>'member_id')::uuid = any(coalesce(p.linked_team_member_ids, array[]::uuid[])))
    )
    and (p_member_id is null or exists (
      select 1 from jsonb_array_elements(l.items) i where (i->>'member_id')::uuid = p_member_id
    ));
  return v_result;
end;
$$;

create or replace function public.mutate_my_pending_payment_submission(
  p_kind text,
  p_submission_id uuid,
  p_updated_at timestamptz,
  p_changes jsonb default null,
  p_delete boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_ledger_column text;
  v_header jsonb;
  v_snapshot jsonb;
  v_line jsonb;
  v_change jsonb;
  v_expected integer;
  v_balance integer;
  v_reported integer;
  v_total_balance integer := 0;
  v_total_reported integer := 0;
  v_mismatch boolean := false;
  v_method text;
  v_account text;
  v_reason text;
  v_has_ledger boolean;
  v_item_count integer;
begin
  if auth.uid() is null or public.current_profile_role() is null then
    raise exception '登入狀態已失效，請重新登入。' using errcode = '42501';
  end if;
  -- Fixed allowlist; callers cannot choose an arbitrary table or SQL identifier.
  case p_kind
    when 'membership' then
      v_table := 'profile_payment_submissions';
      v_ledger_column := 'related_profile_payment_submission_id';
    when 'equipment' then
      v_table := 'equipment_payment_submissions';
      v_ledger_column := 'related_equipment_payment_submission_id';
    when 'match' then
      v_table := 'match_payment_submissions';
      v_ledger_column := 'related_match_payment_submission_id';
    else raise exception '不支援的付款類型。';
  end case;

  -- The review RPCs lock this same parent first. Recheck status/version AFTER obtaining it.
  execute format('select to_jsonb(s) from public.%I s where s.id = $1 and s.profile_id = $2 for update', v_table)
    into v_header using p_submission_id, auth.uid();
  if v_header is null or v_header->>'status' <> 'pending_review'
    or v_header->>'reviewed_at' is not null
    or p_updated_at is null or (v_header->>'updated_at')::timestamptz is distinct from p_updated_at then
    raise exception '付款回報已變更或無法操作。' using errcode = 'P0002';
  end if;
  select s into v_snapshot
  from jsonb_array_elements(public.list_my_pending_payment_submissions()) s
  where s->>'kind' = p_kind and (s->>'id')::uuid = p_submission_id;
  if v_snapshot is null then
    raise exception '只能處理自己送出的關聯成員付款回報。' using errcode = '42501';
  end if;
  execute format('select exists(select 1 from public.player_balance_transactions where %I = $1)', v_ledger_column)
    into v_has_ledger using p_submission_id;
  if v_has_ledger then
    raise exception '此付款已有入帳紀錄，無法修改或刪除。' using errcode = 'P0002';
  end if;

  -- Lock and validate all linked charge rows before restoring payment state on withdrawal.
  if p_kind = 'equipment' then
    perform 1 from public.equipment_transactions t
    join public.equipment_payment_submission_items i on i.transaction_id = t.id
    where i.submission_id = p_submission_id order by t.id for update of t;
    if exists (
      select 1 from public.equipment_payment_submission_items i
      left join public.equipment_transactions t on t.id = i.transaction_id
      where i.submission_id = p_submission_id and
        (t.payment_status is distinct from 'pending_review' or t.payment_submission_id is distinct from p_submission_id)
    ) then raise exception '裝備付款狀態已變更。' using errcode = 'P0002'; end if;
  elsif p_kind = 'match' then
    perform 1 from public.match_fee_items t
    join public.match_payment_submission_items i on i.match_fee_item_id = t.id
    where i.submission_id = p_submission_id order by t.id for update of t;
    if exists (
      select 1 from public.match_payment_submission_items i
      left join public.match_fee_items t on t.id = i.match_fee_item_id
      where i.submission_id = p_submission_id and
        (t.payment_status is distinct from 'pending_review' or t.payment_submission_id is distinct from p_submission_id)
    ) then raise exception '比賽付款狀態已變更。' using errcode = 'P0002'; end if;
  end if;

  if coalesce(p_delete, false) then
    if p_kind = 'equipment' then
      update public.equipment_transactions set payment_status = 'unpaid', payment_submission_id = null, updated_at = clock_timestamp()
      where payment_submission_id = p_submission_id and payment_status = 'pending_review';
    elsif p_kind = 'match' then
      update public.match_fee_items set payment_status = 'unpaid', payment_submission_id = null, updated_at = clock_timestamp()
      where payment_submission_id = p_submission_id and payment_status = 'pending_review';
    end if;
    -- Only the pending report and its cascading report-item links are removed.
    execute format('delete from public.%I where id = $1', v_table) using p_submission_id;
    return;
  end if;

  if p_changes is null or jsonb_typeof(p_changes->'items') is distinct from 'array' then
    raise exception '付款明細不可空白。';
  end if;
  v_item_count := jsonb_array_length(v_snapshot->'items');
  if jsonb_array_length(p_changes->'items') <> v_item_count
    or (select count(distinct i->>'id') from jsonb_array_elements(p_changes->'items') i) <> v_item_count then
    raise exception '付款品項已變更，請重新載入。' using errcode = 'P0002';
  end if;

  for v_line in select * from jsonb_array_elements(v_snapshot->'items') loop
    select i into v_change from jsonb_array_elements(p_changes->'items') i where i->>'id' = v_line->>'id';
    if v_change is null then raise exception '付款品項已變更。' using errcode = 'P0002'; end if;
    if coalesce(v_change->>'balance_amount', '') !~ '^[0-9]+$'
      or coalesce(v_change->>'reported_external_amount', '') !~ '^[0-9]+$' then
      raise exception '付款與餘額扣抵必須為非負整數。';
    end if;
    v_expected := (v_line->>'expected_amount')::integer;
    v_balance := (v_change->>'balance_amount')::integer;
    v_reported := (v_change->>'reported_external_amount')::integer;
    if v_expected is null then
      if v_balance <> (v_line->>'balance_amount')::integer or v_reported <> (v_line->>'reported_external_amount')::integer then
        raise exception '舊回報缺少應收快照，請刪除後重新回報以更正金額。';
      end if;
    else
      if v_balance > v_expected then raise exception '餘額扣抵不可超過系統應收。'; end if;
      if p_kind <> 'membership' and v_reported <> v_expected - v_balance then
        raise exception '裝備與比賽費實付金額必須等於應收扣除餘額。';
      end if;
      v_mismatch := v_mismatch or v_reported <> v_expected - v_balance;
    end if;
    v_total_balance := v_total_balance + v_balance;
    v_total_reported := v_total_reported + v_reported;
  end loop;

  -- Aggregate by member so grouped reports cannot claim the same balance multiple times.
  if exists (
    select 1 from jsonb_array_elements(v_snapshot->'items') old_line
    join jsonb_array_elements(p_changes->'items') new_line on new_line->>'id' = old_line->>'id'
    group by old_line->>'member_id'
    having sum((new_line->>'balance_amount')::integer) > greatest(public.get_player_balance_unchecked((old_line->>'member_id')::uuid), 0)
  ) then raise exception '球員可用餘額不足，請重新載入後調整扣抵金額。' using errcode = 'P0002'; end if;

  v_reason := nullif(btrim(p_changes->>'amount_mismatch_reason'), '');
  if v_mismatch and v_reason is null then raise exception '實付金額不同時，請填寫金額異常原因。'; end if;
  v_method := nullif(btrim(p_changes->>'payment_method'), '');
  v_account := nullif(btrim(p_changes->>'account_last_5'), '');
  if v_total_reported = 0 then
    v_method := '餘額扣款'; v_account := null;
  else
    if v_method is null or v_method not in ('銀行轉帳', '郵局', '現金', 'ATM存款', '郵局無摺', '匯款', '匯款轉帳', 'ATM轉帳') then
      raise exception '請選擇有效的付款方式。';
    end if;
    if v_method <> '現金' and (v_account is null or v_account !~ '^[0-9]{5}$') then
      raise exception '匯款帳號後五碼需為 5 位數字。';
    end if;
    if v_method = '現金' then v_account := null; end if;
  end if;
  if nullif(p_changes->>'remittance_date', '') is null then raise exception '請選擇匯款日期。'; end if;

  if p_kind = 'membership' then
    update public.profile_payment_submission_items si
    set balance_amount = (i->>'balance_amount')::integer,
      reported_external_amount = (i->>'reported_external_amount')::integer, updated_at = clock_timestamp()
    from jsonb_array_elements(p_changes->'items') i
    where si.submission_id = p_submission_id and si.id = (i->>'id')::uuid;
    update public.profile_payment_submissions set reported_external_amount = v_total_reported, amount_mismatch_reason = v_reason
    where id = p_submission_id;
  end if;
  -- Whitelisted columns only: preserve member/period/items, amount/expected_amount and review fields.
  execute format('update public.%I set payment_method = $1, account_last_5 = $2, remittance_date = $3,
    note = $4, balance_amount = $5, updated_at = clock_timestamp() where id = $6', v_table)
  using v_method, v_account, (p_changes->>'remittance_date')::date,
    nullif(btrim(p_changes->>'note'), ''), v_total_balance, p_submission_id;
end;
$$;

revoke all on function public.list_my_pending_payment_submissions(uuid) from public, anon;
revoke all on function public.mutate_my_pending_payment_submission(text, uuid, timestamptz, jsonb, boolean) from public, anon;
grant execute on function public.list_my_pending_payment_submissions(uuid) to authenticated;
grant execute on function public.mutate_my_pending_payment_submission(text, uuid, timestamptz, jsonb, boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
