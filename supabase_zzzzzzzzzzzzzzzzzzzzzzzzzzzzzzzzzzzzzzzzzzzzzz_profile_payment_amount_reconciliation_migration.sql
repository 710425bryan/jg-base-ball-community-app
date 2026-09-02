begin;

do $$
declare
  v_row_count bigint;
  v_row_fingerprint text;
begin
  select
    count(*)::bigint,
    md5(coalesce(string_agg(
      concat_ws('|', id, status, amount, balance_amount, reviewed_at, reviewed_by, updated_at),
      '||' order by id
    ), ''))
  into v_row_count, v_row_fingerprint
  from public.profile_payment_submissions
  where status <> 'pending_review';

  perform set_config('jg.profile_payment_history_row_count', v_row_count::text, true);
  perform set_config('jg.profile_payment_history_fingerprint', v_row_fingerprint, true);
end $$;

do $$
declare
  v_pending_count bigint;
begin
  select count(*) into v_pending_count
  from public.profile_payment_submissions
  where status = 'pending_review';

  raise notice 'profile payment reconciliation: pending submissions before migration = %', v_pending_count;
end $$;

alter table public.profile_payment_submissions
  add column if not exists expected_amount integer,
  add column if not exists reported_external_amount integer,
  add column if not exists amount_mismatch_reason text,
  add column if not exists rejection_reason text;

alter table public.profile_payment_submission_items
  add column if not exists expected_amount integer,
  add column if not exists reported_external_amount integer;

alter table public.profile_payment_submissions
  drop constraint if exists profile_payment_submissions_expected_amount_check,
  add constraint profile_payment_submissions_expected_amount_check
    check (expected_amount is null or expected_amount >= 0),
  drop constraint if exists profile_payment_submissions_reported_external_amount_check,
  add constraint profile_payment_submissions_reported_external_amount_check
    check (reported_external_amount is null or reported_external_amount >= 0);

alter table public.profile_payment_submission_items
  drop constraint if exists profile_payment_submission_items_expected_amount_check,
  add constraint profile_payment_submission_items_expected_amount_check
    check (expected_amount is null or expected_amount >= 0),
  drop constraint if exists profile_payment_submission_items_reported_external_amount_check,
  add constraint profile_payment_submission_items_reported_external_amount_check
    check (reported_external_amount is null or reported_external_amount >= 0);

comment on column public.profile_payment_submissions.expected_amount
is 'Server-calculated membership fee principal snapshot. Never trust the client amount for this value.';
comment on column public.profile_payment_submissions.reported_external_amount
is 'Actual cash / transfer amount reported by the submitting user.';
comment on column public.profile_payment_submissions.amount_mismatch_reason
is 'User explanation required when reported cash differs from expected cash after balance deduction.';
comment on column public.profile_payment_submissions.rejection_reason
is 'Required administrator reason when a pending payment report is rejected.';

-- Only pending legacy rows are derived. Approved/rejected history is intentionally untouched.
update public.profile_payment_submission_items si
set
  expected_amount = coalesce(
    si.expected_amount,
    (
      select nullif(qf.amount, 0)
      from public.quarterly_fees qf
      where qf.year_quarter = si.period_key
        and (
          qf.member_id = si.member_id
          or si.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
        )
      order by qf.updated_at desc nulls last, qf.created_at desc nulls last
      limit 1
    )
  ),
  reported_external_amount = coalesce(
    si.reported_external_amount,
    greatest(si.amount - coalesce(si.balance_amount, 0), 0)
  ),
  updated_at = now()
from public.profile_payment_submissions s
where s.id = si.submission_id
  and s.status = 'pending_review';

update public.profile_payment_submissions s
set
  expected_amount = coalesce(
    s.expected_amount,
    case
      when exists (
        select 1 from public.profile_payment_submission_items si where si.submission_id = s.id
      ) and not exists (
        select 1
        from public.profile_payment_submission_items si
        where si.submission_id = s.id
          and si.expected_amount is null
      ) then (
        select sum(si.expected_amount)::integer
        from public.profile_payment_submission_items si
        where si.submission_id = s.id
      )
      when s.billing_mode = 'monthly' then (
        select nullif(mf.payable_amount, 0)
        from public.monthly_fees mf
        where mf.member_id = s.member_id
          and mf.year_month = s.period_key
        limit 1
      )
      when s.billing_mode = 'quarterly' then (
        select nullif(qf.amount, 0)
        from public.quarterly_fees qf
        where qf.year_quarter = s.period_key
          and (
            qf.member_id = s.member_id
            or s.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
          )
        order by qf.updated_at desc nulls last, qf.created_at desc nulls last
        limit 1
      )
      else null
    end
  ),
  reported_external_amount = coalesce(
    s.reported_external_amount,
    greatest(s.amount - coalesce(s.balance_amount, 0), 0)
  ),
  amount_mismatch_reason = coalesce(
    nullif(btrim(s.amount_mismatch_reason), ''),
    '舊版 App 金額推導，請管理員核對'
  ),
  updated_at = now()
where s.status = 'pending_review';

drop function if exists public.list_profile_payment_submissions_unchecked(uuid, uuid);
create function public.list_profile_payment_submissions_unchecked(
  p_profile_id uuid default null,
  p_member_id uuid default null
)
returns table (
  id uuid,
  profile_id uuid,
  member_id uuid,
  member_name text,
  billing_mode text,
  period_key text,
  period_label text,
  amount integer,
  expected_amount integer,
  balance_amount integer,
  external_amount integer,
  expected_external_amount integer,
  reported_external_amount integer,
  amount_difference integer,
  reconciliation_status text,
  amount_mismatch_reason text,
  rejection_reason text,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  note text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb
)
language sql
security definer
set search_path = public
as $function$
with item_rows as (
  select
    si.id,
    si.submission_id,
    si.member_id,
    item_member.name::text as member_name,
    si.period_key::text,
    coalesce(si.expected_amount, item_estimate.amount) as expected_amount,
    coalesce(si.balance_amount, 0)::integer as balance_amount,
    coalesce(
      si.reported_external_amount,
      greatest(si.amount - coalesce(si.balance_amount, 0), 0)
    )::integer as reported_external_amount,
    si.created_at
  from public.profile_payment_submission_items si
  join public.profile_payment_submissions item_submission on item_submission.id = si.submission_id
  join public.team_members item_member on item_member.id = si.member_id
  left join lateral (
    select estimate.amount::integer
    from public.get_my_payment_submission_estimate(si.member_id, si.period_key) estimate
    where item_submission.status = 'pending_review'
      and si.expected_amount is null
    limit 1
  ) item_estimate on true
),
item_reconciliation as (
  select
    item_rows.*,
    case
      when item_rows.expected_amount is null then null
      else greatest(item_rows.expected_amount - item_rows.balance_amount, 0)
    end::integer as expected_external_amount,
    case
      when item_rows.expected_amount is null then null
      else item_rows.reported_external_amount - greatest(item_rows.expected_amount - item_rows.balance_amount, 0)
    end::integer as amount_difference
  from item_rows
),
item_summary as (
  select
    ir.submission_id,
    count(*)::integer as item_count,
    count(ir.expected_amount)::integer as verifiable_count,
    string_agg(ir.member_name, ', ' order by ir.member_name) as member_names,
    sum(ir.expected_amount)::integer as expected_amount,
    sum(ir.balance_amount)::integer as balance_amount,
    sum(ir.reported_external_amount)::integer as reported_external_amount,
    sum(ir.expected_external_amount)::integer as expected_external_amount,
    sum(ir.amount_difference)::integer as amount_difference,
    bool_or(ir.amount_difference < 0) as has_underpayment,
    bool_or(ir.amount_difference > 0) as has_overpayment,
    jsonb_agg(
      jsonb_build_object(
        'id', ir.id,
        'submission_id', ir.submission_id,
        'member_id', ir.member_id,
        'member_name', ir.member_name,
        'period_key', ir.period_key,
        'amount', ir.expected_amount,
        'expected_amount', ir.expected_amount,
        'balance_amount', ir.balance_amount,
        'external_amount', ir.reported_external_amount,
        'expected_external_amount', ir.expected_external_amount,
        'reported_external_amount', ir.reported_external_amount,
        'amount_difference', ir.amount_difference,
        'reconciliation_status', case
          when ir.expected_amount is null then 'unverifiable'
          when ir.amount_difference < 0 then 'underpaid'
          when ir.amount_difference > 0 then 'overpaid'
          else 'matched'
        end
      )
      order by ir.member_name, ir.created_at
    ) as items
  from item_reconciliation ir
  group by ir.submission_id
),
parent_rows as (
  select
    s.*,
    tm.name::text as direct_member_name,
    coalesce(
      s.expected_amount,
      case when coalesce(item_summary.item_count, 0) > 0
        and item_summary.item_count = item_summary.verifiable_count
        then item_summary.expected_amount
      end,
      parent_estimate.amount
    )::integer as resolved_expected_amount,
    coalesce(s.balance_amount, 0)::integer as resolved_balance_amount,
    coalesce(
      s.reported_external_amount,
      item_summary.reported_external_amount,
      greatest(s.amount - coalesce(s.balance_amount, 0), 0)
    )::integer as resolved_reported_external_amount,
    item_summary.item_count,
    item_summary.verifiable_count,
    item_summary.member_names,
    item_summary.expected_external_amount as item_expected_external_amount,
    item_summary.amount_difference as item_amount_difference,
    item_summary.has_underpayment,
    item_summary.has_overpayment,
    coalesce(item_summary.items, '[]'::jsonb) as resolved_items
  from public.profile_payment_submissions s
  join public.team_members tm on tm.id = s.member_id
  left join item_summary on item_summary.submission_id = s.id
  left join lateral (
    select estimate.amount::integer
    from public.get_my_payment_submission_estimate(s.member_id, s.period_key) estimate
    where s.status = 'pending_review'
      and s.expected_amount is null
      and coalesce(item_summary.item_count, 0) = 0
    limit 1
  ) parent_estimate on true
  where (p_profile_id is null or s.profile_id = p_profile_id)
    and (
      p_member_id is null
      or s.member_id = p_member_id
      or exists (
        select 1
        from public.profile_payment_submission_items member_item
        where member_item.submission_id = s.id
          and member_item.member_id = p_member_id
      )
    )
),
reconciled_rows as (
  select
    parent_rows.*,
    case
      when coalesce(parent_rows.item_count, 0) > 0 then parent_rows.item_expected_external_amount
      when parent_rows.resolved_expected_amount is null then null
      else greatest(parent_rows.resolved_expected_amount - parent_rows.resolved_balance_amount, 0)
    end::integer as resolved_expected_external_amount,
    case
      when coalesce(parent_rows.item_count, 0) > 0 then parent_rows.item_amount_difference
      when parent_rows.resolved_expected_amount is null then null
      else parent_rows.resolved_reported_external_amount
        - greatest(parent_rows.resolved_expected_amount - parent_rows.resolved_balance_amount, 0)
    end::integer as resolved_amount_difference
  from parent_rows
)
select
  reconciled_rows.id,
  reconciled_rows.profile_id,
  reconciled_rows.member_id,
  case
    when coalesce(reconciled_rows.item_count, 0) > 0
      then coalesce(reconciled_rows.member_names, reconciled_rows.direct_member_name)
    else reconciled_rows.direct_member_name
  end,
  reconciled_rows.billing_mode::text,
  reconciled_rows.period_key::text,
  reconciled_rows.period_key::text,
  coalesce(reconciled_rows.resolved_expected_amount, reconciled_rows.amount)::integer,
  reconciled_rows.resolved_expected_amount,
  reconciled_rows.resolved_balance_amount,
  reconciled_rows.resolved_reported_external_amount,
  reconciled_rows.resolved_expected_external_amount,
  reconciled_rows.resolved_reported_external_amount,
  reconciled_rows.resolved_amount_difference,
  case
    when coalesce(reconciled_rows.item_count, 0) > reconciled_rows.verifiable_count then 'unverifiable'
    when reconciled_rows.resolved_expected_amount is null then 'unverifiable'
    when coalesce(reconciled_rows.has_underpayment, false) or reconciled_rows.resolved_amount_difference < 0 then 'underpaid'
    when coalesce(reconciled_rows.has_overpayment, false) or reconciled_rows.resolved_amount_difference > 0 then 'overpaid'
    else 'matched'
  end,
  reconciled_rows.amount_mismatch_reason::text,
  reconciled_rows.rejection_reason::text,
  reconciled_rows.payment_method::text,
  reconciled_rows.account_last_5::text,
  reconciled_rows.remittance_date,
  reconciled_rows.note::text,
  reconciled_rows.status::text,
  reconciled_rows.created_at,
  reconciled_rows.updated_at,
  reconciled_rows.resolved_items
from reconciled_rows
order by reconciled_rows.created_at desc;
$function$;

drop function if exists public.list_my_payment_submissions(uuid);
create function public.list_my_payment_submissions(p_member_id uuid default null)
returns table (
  id uuid, profile_id uuid, member_id uuid, member_name text, billing_mode text,
  period_key text, period_label text, amount integer, expected_amount integer,
  balance_amount integer, external_amount integer, expected_external_amount integer,
  reported_external_amount integer, amount_difference integer, reconciliation_status text,
  amount_mismatch_reason text, rejection_reason text, payment_method text,
  account_last_5 text, remittance_date date, note text, status text,
  created_at timestamptz, updated_at timestamptz, items jsonb
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

  if p_member_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and (
        public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
        or p_member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
      )
  ) then
    raise exception 'member is not viewable by current profile';
  end if;

  return query
  select *
  from public.list_profile_payment_submissions_unchecked(v_user_id, p_member_id);
end;
$$;

drop function if exists public.list_profile_payment_submissions();
create function public.list_profile_payment_submissions()
returns table (
  id uuid, profile_id uuid, member_id uuid, member_name text, billing_mode text,
  period_key text, period_label text, amount integer, expected_amount integer,
  balance_amount integer, external_amount integer, expected_external_amount integer,
  reported_external_amount integer, amount_difference integer, reconciliation_status text,
  amount_mismatch_reason text, rejection_reason text, payment_method text,
  account_last_5 text, remittance_date date, note text, status text,
  created_at timestamptz, updated_at timestamptz, items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (public.has_app_permission('fees', 'VIEW') or public.has_app_permission('fees', 'EDIT')) then
    raise exception 'fees VIEW permission required';
  end if;

  return query
  select *
  from public.list_profile_payment_submissions_unchecked(null, null);
end;
$$;

drop function if exists public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer);
drop function if exists public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer, integer, text);
create function public.create_my_payment_submission(
  p_member_id uuid,
  p_period_key text,
  p_amount integer,
  p_payment_method text,
  p_account_last_5 text default null,
  p_remittance_date date default null,
  p_note text default null,
  p_balance_amount integer default 0,
  p_reported_external_amount integer default null,
  p_amount_mismatch_reason text default null
)
returns table (
  id uuid, profile_id uuid, member_id uuid, member_name text, billing_mode text,
  period_key text, period_label text, amount integer, expected_amount integer,
  balance_amount integer, external_amount integer, expected_external_amount integer,
  reported_external_amount integer, amount_difference integer, reconciliation_status text,
  amount_mismatch_reason text, rejection_reason text, payment_method text,
  account_last_5 text, remittance_date date, note text, status text,
  created_at timestamptz, updated_at timestamptz, items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_key text := upper(nullif(btrim(p_period_key), ''));
  v_effective_billing_mode text;
  v_billing_mode text;
  v_expected_amount integer;
  v_balance_amount integer := greatest(coalesce(p_balance_amount, 0), 0);
  v_expected_external_amount integer;
  v_reported_external_amount integer;
  v_payment_method text := nullif(btrim(p_payment_method), '');
  v_account_last_5 text := nullif(regexp_replace(coalesce(p_account_last_5, ''), '\D', '', 'g'), '');
  v_note text := nullif(btrim(p_note), '');
  v_mismatch_reason text := nullif(btrim(p_amount_mismatch_reason), '');
  v_submission_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text)
  into v_effective_billing_mode
  from public.profiles p
  join public.team_members tm on tm.id = p_member_id
  where p.id = v_user_id
    and p_member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    and public.is_member_fee_period_on_or_after_join(tm.joined_date, v_period_key);

  if v_effective_billing_mode is null then
    raise exception 'member not linked, unsupported billing mode, or fee period is before member joined month';
  end if;

  v_billing_mode := v_effective_billing_mode;
  if v_effective_billing_mode = 'none' then
    if v_period_key ~ '^[0-9]{4}-[0-9]{2}$' and exists (
      select 1 from public.monthly_fees mf
      where mf.member_id = p_member_id and mf.year_month = v_period_key
        and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')
    ) then
      v_billing_mode := 'monthly';
    elsif v_period_key ~ '^[0-9]{4}-Q[1-4]$' and exists (
      select 1 from public.quarterly_fees qf
      where qf.year_quarter = v_period_key
        and (qf.member_id = p_member_id or p_member_id = any(coalesce(qf.member_ids, array[]::uuid[])))
        and coalesce(qf.status, 'unpaid') not in ('paid', 'approved')
    ) then
      v_billing_mode := 'quarterly';
    else
      raise exception 'no_fee member has no payable official fee record for this period';
    end if;
  end if;

  select estimate.amount::integer
  into v_expected_amount
  from public.get_my_payment_submission_estimate(p_member_id, v_period_key) estimate
  where estimate.billing_mode = v_billing_mode
  limit 1;

  if v_expected_amount is null or v_expected_amount <= 0 then
    raise exception 'system expected amount is unavailable';
  end if;

  if v_balance_amount > v_expected_amount then
    raise exception 'balance_amount cannot exceed expected amount';
  end if;
  if v_balance_amount > public.get_player_balance_unchecked(p_member_id) then
    raise exception 'player balance is not enough';
  end if;

  v_expected_external_amount := greatest(v_expected_amount - v_balance_amount, 0);
  v_reported_external_amount := coalesce(
    p_reported_external_amount,
    greatest(coalesce(p_amount, v_expected_amount) - v_balance_amount, 0)
  );

  if v_reported_external_amount < 0 then
    raise exception 'reported_external_amount cannot be negative';
  end if;
  if p_reported_external_amount is null then
    v_mismatch_reason := coalesce(v_mismatch_reason, '舊版 App 金額推導，請管理員核對');
  elsif v_reported_external_amount <> v_expected_external_amount and v_mismatch_reason is null then
    raise exception 'amount_mismatch_reason is required when actual payment differs';
  end if;

  if v_reported_external_amount = 0 then
    v_payment_method := coalesce(v_payment_method, 'balance');
    v_account_last_5 := null;
  else
    if v_payment_method is null then raise exception 'payment_method is required'; end if;
    if v_payment_method in ('銀行轉帳', '匯款', '匯款轉帳', 'ATM轉帳')
      and (v_account_last_5 is null or v_account_last_5 !~ '^[0-9]{5}$') then
      raise exception 'account_last_5 must be 5 digits for transfer payments';
    end if;
  end if;

  insert into public.profile_payment_submissions (
    profile_id, member_id, billing_mode, period_key, amount, expected_amount,
    balance_amount, reported_external_amount, amount_mismatch_reason,
    payment_method, account_last_5, remittance_date, note, status, created_at, updated_at
  ) values (
    v_user_id, p_member_id, v_billing_mode, v_period_key, v_expected_amount, v_expected_amount,
    v_balance_amount, v_reported_external_amount, v_mismatch_reason,
    v_payment_method, v_account_last_5, coalesce(p_remittance_date, current_date),
    v_note, 'pending_review', now(), now()
  ) returning profile_payment_submissions.id into v_submission_id;

  return query
  select * from public.list_my_payment_submissions(p_member_id) rows where rows.id = v_submission_id;
end;
$$;

drop function if exists public.create_my_quarterly_payment_submission(jsonb, text, text, date, text);
drop function if exists public.create_my_quarterly_payment_submission(jsonb, text, text, date, text, text);
create function public.create_my_quarterly_payment_submission(
  p_items jsonb,
  p_payment_method text,
  p_account_last_5 text default null,
  p_remittance_date date default null,
  p_note text default null,
  p_amount_mismatch_reason text default null
)
returns table (
  id uuid, profile_id uuid, member_id uuid, member_name text, billing_mode text,
  period_key text, period_label text, amount integer, expected_amount integer,
  balance_amount integer, external_amount integer, expected_external_amount integer,
  reported_external_amount integer, amount_difference integer, reconciliation_status text,
  amount_mismatch_reason text, rejection_reason text, payment_method text,
  account_last_5 text, remittance_date date, note text, status text,
  created_at timestamptz, updated_at timestamptz, items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_item_count integer;
  v_raw_item_count integer;
  v_period_key text;
  v_member_id uuid;
  v_expected_amount integer;
  v_balance_amount integer;
  v_reported_external_amount integer;
  v_expected_external_amount integer;
  v_payment_method text := nullif(btrim(p_payment_method), '');
  v_account_last_5 text := nullif(regexp_replace(coalesce(p_account_last_5, ''), '\D', '', 'g'), '');
  v_note text := nullif(btrim(p_note), '');
  v_mismatch_reason text := nullif(btrim(p_amount_mismatch_reason), '');
  v_has_legacy_item boolean := false;
  v_submission_id uuid;
begin
  if v_user_id is null then raise exception 'auth.uid() is null'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  with raw_items as (
    select
      payload.value,
      (payload.value ->> 'member_id')::uuid as member_id,
      upper(nullif(btrim(payload.value ->> 'period_key'), '')) as period_key,
      greatest(coalesce((payload.value ->> 'amount')::integer, 0), 0) as legacy_amount,
      greatest(coalesce((payload.value ->> 'balance_amount')::integer, 0), 0) as balance_amount,
      case when payload.value ? 'reported_external_amount'
        then greatest(coalesce((payload.value ->> 'reported_external_amount')::integer, 0), 0)
      end as reported_external_amount,
      not (payload.value ? 'reported_external_amount') as is_legacy
    from jsonb_array_elements(p_items) payload(value)
  ),
  resolved_items as (
    select
      raw.member_id,
      raw.period_key,
      estimate.amount::integer as expected_amount,
      raw.balance_amount,
      coalesce(raw.reported_external_amount, greatest(raw.legacy_amount - raw.balance_amount, 0))::integer as reported_external_amount,
      raw.is_legacy
    from raw_items raw
    join public.profiles p on p.id = v_user_id
    join public.team_members tm on tm.id = raw.member_id
    left join lateral (
      select payment_estimate.amount
      from public.get_my_payment_submission_estimate(raw.member_id, raw.period_key) payment_estimate
      where payment_estimate.billing_mode = 'quarterly'
      limit 1
    ) estimate on true
    where raw.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
      and raw.period_key ~ '^[0-9]{4}-Q[1-4]$'
      and public.is_quarterly_payment_period_open(raw.period_key)
      and public.is_member_fee_period_on_or_after_join(tm.joined_date, raw.period_key)
      and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
      and estimate.amount > 0
      and raw.balance_amount <= estimate.amount
  )
  select
    (select count(*) from raw_items),
    count(*),
    coalesce(jsonb_agg(to_jsonb(resolved_items) order by resolved_items.member_id), '[]'::jsonb),
    min(resolved_items.period_key),
    (array_agg(resolved_items.member_id order by resolved_items.member_id))[1],
    sum(resolved_items.expected_amount)::integer,
    sum(resolved_items.balance_amount)::integer,
    sum(resolved_items.reported_external_amount)::integer,
    bool_or(resolved_items.is_legacy)
  into
    v_raw_item_count, v_item_count, v_items, v_period_key, v_member_id,
    v_expected_amount, v_balance_amount, v_reported_external_amount, v_has_legacy_item
  from resolved_items;

  if v_item_count = 0 or v_item_count <> v_raw_item_count then
    raise exception 'all quarterly payment items must be valid and have a system expected amount';
  end if;
  if (select count(distinct item.member_id) from jsonb_to_recordset(v_items) item(member_id uuid)) <> v_item_count then
    raise exception 'quarterly payment items must not duplicate members';
  end if;
  if (select count(distinct item.period_key) from jsonb_to_recordset(v_items) item(period_key text)) <> 1 then
    raise exception 'all quarterly payment items must use the same period_key';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_items) item(member_id uuid, balance_amount integer)
    where item.balance_amount > public.get_player_balance_unchecked(item.member_id)
  ) then
    raise exception 'player balance is not enough';
  end if;

  v_expected_external_amount := greatest(v_expected_amount - v_balance_amount, 0);
  if v_has_legacy_item then
    v_mismatch_reason := coalesce(v_mismatch_reason, '舊版 App 金額推導，請管理員核對');
  elsif exists (
    select 1
    from jsonb_to_recordset(v_items) item(expected_amount integer, balance_amount integer, reported_external_amount integer)
    where item.reported_external_amount <> greatest(item.expected_amount - item.balance_amount, 0)
  ) and v_mismatch_reason is null then
    raise exception 'amount_mismatch_reason is required when actual payment differs';
  end if;

  if v_reported_external_amount = 0 then
    v_payment_method := coalesce(v_payment_method, 'balance');
    v_account_last_5 := null;
  else
    if v_payment_method is null then raise exception 'payment_method is required'; end if;
    if v_payment_method in ('銀行轉帳', '匯款', '匯款轉帳', 'ATM轉帳')
      and (v_account_last_5 is null or v_account_last_5 !~ '^[0-9]{5}$') then
      raise exception 'account_last_5 must be 5 digits for transfer payments';
    end if;
  end if;

  insert into public.profile_payment_submissions (
    profile_id, member_id, billing_mode, period_key, amount, expected_amount,
    balance_amount, reported_external_amount, amount_mismatch_reason,
    payment_method, account_last_5, remittance_date, note, status, created_at, updated_at
  ) values (
    v_user_id, v_member_id, 'quarterly', v_period_key, v_expected_amount, v_expected_amount,
    v_balance_amount, v_reported_external_amount, v_mismatch_reason,
    v_payment_method, v_account_last_5, coalesce(p_remittance_date, current_date),
    v_note, 'pending_review', now(), now()
  ) returning profile_payment_submissions.id into v_submission_id;

  insert into public.profile_payment_submission_items (
    submission_id, member_id, period_key, amount, expected_amount, balance_amount,
    reported_external_amount, created_at, updated_at
  )
  select
    v_submission_id, item.member_id, item.period_key, item.expected_amount,
    item.expected_amount, item.balance_amount, item.reported_external_amount, now(), now()
  from jsonb_to_recordset(v_items) item(
    member_id uuid, period_key text, expected_amount integer,
    balance_amount integer, reported_external_amount integer
  );

  return query
  select * from public.list_my_payment_submissions(v_member_id) rows where rows.id = v_submission_id;
end;
$$;

drop function if exists public.review_profile_payment_submission(uuid, text, integer);
drop function if exists public.review_profile_payment_submission(uuid, text, integer, text);
create function public.review_profile_payment_submission(
  p_submission_id uuid,
  p_status text,
  p_overpayment_amount integer default 0,
  p_rejection_reason text default null
)
returns table (
  id uuid, profile_id uuid, member_id uuid, member_name text, billing_mode text,
  period_key text, period_label text, amount integer, expected_amount integer,
  balance_amount integer, external_amount integer, expected_external_amount integer,
  reported_external_amount integer, amount_difference integer, reconciliation_status text,
  amount_mismatch_reason text, rejection_reason text, payment_method text,
  account_last_5 text, remittance_date date, note text, status text,
  created_at timestamptz, updated_at timestamptz, items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.profile_payment_submissions%rowtype;
  v_rejection_reason text := nullif(btrim(p_rejection_reason), '');
  v_expected_amount integer;
  v_reported_external_amount integer;
  v_expected_external_amount integer;
  v_difference integer;
  v_total_overpayment integer := 0;
  v_item_count integer := 0;
  v_item record;
  v_quarterly_fee_id uuid;
  v_est_calculation_type text;
  v_est_fixed_monthly_fee integer;
  v_total_sessions integer;
  v_leave_sessions integer;
  v_per_session_fee integer;
  v_training_program text;
begin
  if v_user_id is null then raise exception 'auth.uid() is null'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'unsupported review status'; end if;
  if not public.has_app_permission('fees', 'EDIT') then raise exception 'fees EDIT permission required'; end if;

  select * into v_submission
  from public.profile_payment_submissions s
  where s.id = p_submission_id and s.status = 'pending_review'
  for update;
  if not found then raise exception 'submission not found or already reviewed'; end if;

  if p_status = 'rejected' then
    if v_rejection_reason is null then raise exception 'rejection_reason is required'; end if;
    update public.profile_payment_submissions
    set status = 'rejected', rejection_reason = v_rejection_reason,
      reviewed_at = now(), reviewed_by = v_user_id, updated_at = now()
    where profile_payment_submissions.id = p_submission_id;

    return query
    select * from public.list_my_payment_submissions(v_submission.member_id) rows where rows.id = p_submission_id;
    return;
  end if;

  select count(*) into v_item_count
  from public.profile_payment_submission_items si
  where si.submission_id = p_submission_id;

  if v_item_count > 0 then
    -- Preflight every member before any balance transaction or fee record is written.
    for v_item in
      select
        si.id, si.member_id, si.period_key,
        coalesce(si.expected_amount, estimate.amount)::integer as expected_amount,
        coalesce(si.balance_amount, 0)::integer as balance_amount,
        coalesce(si.reported_external_amount, greatest(si.amount - coalesce(si.balance_amount, 0), 0))::integer as reported_external_amount
      from public.profile_payment_submission_items si
      left join lateral (
        select payment_estimate.amount
        from public.get_my_payment_submission_estimate(si.member_id, si.period_key) payment_estimate
        where payment_estimate.billing_mode = 'quarterly'
        limit 1
      ) estimate on true
      where si.submission_id = p_submission_id
      order by si.created_at, si.member_id
    loop
      if v_item.expected_amount is null then raise exception 'payment amount is unverifiable'; end if;
      v_difference := v_item.reported_external_amount
        - greatest(v_item.expected_amount - v_item.balance_amount, 0);
      if v_difference < 0 then raise exception 'underpaid payment submission cannot be approved'; end if;

      perform 1 from public.team_members tm where tm.id = v_item.member_id for update;
      if v_item.balance_amount > public.get_player_balance_unchecked(v_item.member_id) then
        raise exception 'player balance is not enough';
      end if;
      v_total_overpayment := v_total_overpayment + greatest(v_difference, 0);
    end loop;

    if greatest(coalesce(p_overpayment_amount, 0), 0) <> v_total_overpayment then
      raise exception 'overpayment confirmation does not match system calculated difference';
    end if;

    for v_item in
      select
        si.id, si.member_id, si.period_key,
        coalesce(si.expected_amount, estimate.amount)::integer as expected_amount,
        coalesce(si.balance_amount, 0)::integer as balance_amount,
        coalesce(si.reported_external_amount, greatest(si.amount - coalesce(si.balance_amount, 0), 0))::integer as reported_external_amount
      from public.profile_payment_submission_items si
      left join lateral (
        select payment_estimate.amount
        from public.get_my_payment_submission_estimate(si.member_id, si.period_key) payment_estimate
        where payment_estimate.billing_mode = 'quarterly'
        limit 1
      ) estimate on true
      where si.submission_id = p_submission_id
      order by si.created_at, si.member_id
    loop
      v_difference := v_item.reported_external_amount
        - greatest(v_item.expected_amount - v_item.balance_amount, 0);

      if v_item.balance_amount > 0 then
        insert into public.player_balance_transactions (
          member_id, delta, reason, source, related_profile_payment_submission_id, idempotency_key, created_by
        ) values (
          v_item.member_id, -v_item.balance_amount,
          format('Quarterly payment deduction %s', v_item.period_key), 'payment_deduction',
          v_submission.id, format('profile_payment:%s:%s:balance', v_submission.id, v_item.member_id), v_user_id
        ) on conflict (idempotency_key) do nothing;
      end if;

      if v_difference > 0 then
        insert into public.player_balance_transactions (
          member_id, delta, reason, source, related_profile_payment_submission_id, idempotency_key, created_by
        ) values (
          v_item.member_id, v_difference,
          format('Quarterly payment overpayment %s', v_item.period_key), 'overpayment',
          v_submission.id, format('profile_payment:%s:%s:overpayment', v_submission.id, v_item.member_id), v_user_id
        ) on conflict (idempotency_key) do nothing;
      end if;

      select qf.id into v_quarterly_fee_id
      from public.quarterly_fees qf
      where qf.year_quarter = v_item.period_key
        and (qf.member_id = v_item.member_id or v_item.member_id = any(coalesce(qf.member_ids, array[]::uuid[])))
      order by coalesce(qf.updated_at, qf.created_at) desc nulls last
      limit 1 for update;

      if v_quarterly_fee_id is not null then
        update public.quarterly_fees
        set member_id = v_item.member_id, member_ids = array[v_item.member_id],
          amount = v_item.expected_amount, payment_method = v_submission.payment_method,
          account_last_5 = v_submission.account_last_5, remittance_date = v_submission.remittance_date,
          payment_items = '["profile_payment_submission"]'::jsonb,
          balance_amount = v_item.balance_amount, status = 'paid', paid_at = now(), updated_at = now()
        where quarterly_fees.id = v_quarterly_fee_id;
      else
        insert into public.quarterly_fees (
          member_id, member_ids, year_quarter, amount_type, amount, payment_method,
          account_last_5, remittance_date, payment_items, balance_amount, status, paid_at, updated_at
        ) values (
          v_item.member_id, array[v_item.member_id], v_item.period_key, 'other', v_item.expected_amount,
          v_submission.payment_method, v_submission.account_last_5, v_submission.remittance_date,
          '["profile_payment_submission"]'::jsonb, v_item.balance_amount, 'paid', now(), now()
        );
      end if;

      update public.profile_payment_submission_items
      set amount = v_item.expected_amount, expected_amount = v_item.expected_amount,
        reported_external_amount = v_item.reported_external_amount, updated_at = now()
      where profile_payment_submission_items.id = v_item.id;
    end loop;

    select sum(si.expected_amount)::integer, sum(si.reported_external_amount)::integer
    into v_expected_amount, v_reported_external_amount
    from public.profile_payment_submission_items si
    where si.submission_id = p_submission_id;
  else
    select
      estimate.amount::integer, estimate.calculation_type, estimate.fixed_monthly_fee,
      estimate.total_sessions, estimate.leave_sessions, estimate.per_session_fee
    into
      v_expected_amount, v_est_calculation_type, v_est_fixed_monthly_fee,
      v_total_sessions, v_leave_sessions, v_per_session_fee
    from public.get_my_payment_submission_estimate(v_submission.member_id, v_submission.period_key) estimate
    where estimate.billing_mode = v_submission.billing_mode
    limit 1;

    v_expected_amount := coalesce(v_submission.expected_amount, v_expected_amount);
    if v_expected_amount is null then raise exception 'payment amount is unverifiable'; end if;
    v_reported_external_amount := coalesce(
      v_submission.reported_external_amount,
      greatest(v_submission.amount - coalesce(v_submission.balance_amount, 0), 0)
    );
    v_expected_external_amount := greatest(v_expected_amount - coalesce(v_submission.balance_amount, 0), 0);
    v_difference := v_reported_external_amount - v_expected_external_amount;
    if v_difference < 0 then raise exception 'underpaid payment submission cannot be approved'; end if;
    if greatest(coalesce(p_overpayment_amount, 0), 0) <> greatest(v_difference, 0) then
      raise exception 'overpayment confirmation does not match system calculated difference';
    end if;

    perform 1 from public.team_members tm where tm.id = v_submission.member_id for update;
    if coalesce(v_submission.balance_amount, 0) > public.get_player_balance_unchecked(v_submission.member_id) then
      raise exception 'player balance is not enough';
    end if;

    if coalesce(v_submission.balance_amount, 0) > 0 then
      insert into public.player_balance_transactions (
        member_id, delta, reason, source, related_profile_payment_submission_id, idempotency_key, created_by
      ) values (
        v_submission.member_id, -v_submission.balance_amount,
        format('Payment deduction %s', v_submission.period_key), 'payment_deduction',
        v_submission.id, format('profile_payment:%s:balance', v_submission.id), v_user_id
      ) on conflict (idempotency_key) do nothing;
    end if;
    if v_difference > 0 then
      insert into public.player_balance_transactions (
        member_id, delta, reason, source, related_profile_payment_submission_id, idempotency_key, created_by
      ) values (
        v_submission.member_id, v_difference,
        format('Payment overpayment %s', v_submission.period_key), 'overpayment',
        v_submission.id, format('profile_payment:%s:overpayment', v_submission.id), v_user_id
      ) on conflict (idempotency_key) do nothing;
    end if;

    if v_submission.billing_mode = 'monthly' then
      select public.get_member_training_program_key_v2(
        tm.training_program::text, tm.team_group::text, tm.role::text, tm.fee_billing_mode::text
      ) into v_training_program
      from public.team_members tm where tm.id = v_submission.member_id;

      insert into public.monthly_fees (
        member_id, year_month, payable_amount, deduction_amount, total_sessions, leave_sessions,
        per_session_fee, calculation_type, fixed_monthly_fee, training_program, status, paid_at,
        payment_method, account_last_5, remittance_date, balance_amount, updated_at
      ) values (
        v_submission.member_id, v_submission.period_key, v_expected_amount, 0,
        v_total_sessions, v_leave_sessions, v_per_session_fee,
        coalesce(v_est_calculation_type, 'per_session'), v_est_fixed_monthly_fee,
        coalesce(v_training_program, 'chunggang_school_team'), 'paid', now(),
        v_submission.payment_method, v_submission.account_last_5, v_submission.remittance_date,
        coalesce(v_submission.balance_amount, 0), now()
      )
      on conflict on constraint monthly_fees_member_id_year_month_key do update
      set payable_amount = excluded.payable_amount,
        total_sessions = excluded.total_sessions, leave_sessions = excluded.leave_sessions,
        per_session_fee = excluded.per_session_fee, calculation_type = excluded.calculation_type,
        fixed_monthly_fee = excluded.fixed_monthly_fee, training_program = excluded.training_program,
        status = 'paid', paid_at = excluded.paid_at, payment_method = excluded.payment_method,
        account_last_5 = excluded.account_last_5, remittance_date = excluded.remittance_date,
        balance_amount = excluded.balance_amount, updated_at = excluded.updated_at;
    elsif v_submission.billing_mode = 'quarterly' then
      select qf.id into v_quarterly_fee_id
      from public.quarterly_fees qf
      where qf.year_quarter = v_submission.period_key
        and (qf.member_id = v_submission.member_id or v_submission.member_id = any(coalesce(qf.member_ids, array[]::uuid[])))
      order by coalesce(qf.updated_at, qf.created_at) desc nulls last
      limit 1 for update;

      if v_quarterly_fee_id is not null then
        update public.quarterly_fees
        set member_id = v_submission.member_id, member_ids = array[v_submission.member_id],
          amount = v_expected_amount, payment_method = v_submission.payment_method,
          account_last_5 = v_submission.account_last_5, remittance_date = v_submission.remittance_date,
          balance_amount = coalesce(v_submission.balance_amount, 0), status = 'paid',
          paid_at = now(), updated_at = now()
        where quarterly_fees.id = v_quarterly_fee_id;
      else
        insert into public.quarterly_fees (
          member_id, member_ids, year_quarter, amount_type, amount, payment_method,
          account_last_5, remittance_date, payment_items, balance_amount, status, paid_at, updated_at
        ) values (
          v_submission.member_id, array[v_submission.member_id], v_submission.period_key, 'other',
          v_expected_amount, v_submission.payment_method, v_submission.account_last_5,
          v_submission.remittance_date, '["profile_payment_submission"]'::jsonb,
          coalesce(v_submission.balance_amount, 0), 'paid', now(), now()
        );
      end if;
    end if;
  end if;

  update public.profile_payment_submissions
  set amount = v_expected_amount, expected_amount = v_expected_amount,
    reported_external_amount = v_reported_external_amount,
    status = 'approved', rejection_reason = null,
    reviewed_at = now(), reviewed_by = v_user_id, updated_at = now()
  where profile_payment_submissions.id = p_submission_id;

  return query
  select * from public.list_my_payment_submissions(v_submission.member_id) rows where rows.id = p_submission_id;
end;
$$;

revoke all on function public.list_profile_payment_submissions_unchecked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_profile_payment_submissions_unchecked(uuid, uuid) to service_role;

revoke all on function public.list_my_payment_submissions(uuid) from public, anon;
grant execute on function public.list_my_payment_submissions(uuid) to authenticated, service_role;
revoke all on function public.list_profile_payment_submissions() from public, anon;
grant execute on function public.list_profile_payment_submissions() to authenticated, service_role;
revoke all on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer, integer, text) from public, anon;
grant execute on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer, integer, text) to authenticated, service_role;
revoke all on function public.create_my_quarterly_payment_submission(jsonb, text, text, date, text, text) from public, anon;
grant execute on function public.create_my_quarterly_payment_submission(jsonb, text, text, date, text, text) to authenticated, service_role;
revoke all on function public.review_profile_payment_submission(uuid, text, integer, text) from public, anon;
grant execute on function public.review_profile_payment_submission(uuid, text, integer, text) to authenticated, service_role;

do $$
declare
  v_before_row_count bigint;
  v_before_fingerprint text;
  v_after_row_count bigint;
  v_after_fingerprint text;
  v_status record;
begin
  v_before_row_count := nullif(
    current_setting('jg.profile_payment_history_row_count', true),
    ''
  )::bigint;
  v_before_fingerprint := current_setting(
    'jg.profile_payment_history_fingerprint',
    true
  );

  if v_before_row_count is null or v_before_fingerprint is null then
    raise exception 'profile payment history audit baseline is missing';
  end if;

  select
    count(*)::bigint,
    md5(coalesce(string_agg(
      concat_ws('|', id, status, amount, balance_amount, reviewed_at, reviewed_by, updated_at),
      '||' order by id
    ), ''))
  into v_after_row_count, v_after_fingerprint
  from public.profile_payment_submissions
  where status <> 'pending_review';

  if v_after_row_count <> v_before_row_count or v_after_fingerprint <> v_before_fingerprint then
    raise exception 'non-pending profile payment history changed during reconciliation migration';
  end if;

  for v_status in
    select
      case
        when expected_amount is null then 'unverifiable'
        when reported_external_amount < greatest(expected_amount - coalesce(balance_amount, 0), 0) then 'underpaid'
        when reported_external_amount > greatest(expected_amount - coalesce(balance_amount, 0), 0) then 'overpaid'
        else 'matched'
      end as reconciliation_status,
      count(*) as row_count
    from public.profile_payment_submissions
    where status = 'pending_review'
    group by 1
    order by 1
  loop
    raise notice 'profile payment reconciliation: % = %', v_status.reconciliation_status, v_status.row_count;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
