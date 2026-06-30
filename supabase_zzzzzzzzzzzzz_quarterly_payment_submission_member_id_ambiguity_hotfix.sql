begin;

create or replace function public.create_my_quarterly_payment_submission(
  p_items jsonb,
  p_payment_method text,
  p_account_last_5 text default null,
  p_remittance_date date default null,
  p_note text default null
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  billing_mode text,
  period_key text,
  period_label text,
  amount integer,
  balance_amount integer,
  external_amount integer,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  note text,
  status text,
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
  v_items jsonb := '[]'::jsonb;
  v_raw_item_count integer := 0;
  v_item_count integer := 0;
  v_member_count integer := 0;
  v_period_count integer := 0;
  v_period_key text;
  v_member_id uuid;
  v_amount integer := 0;
  v_balance_amount integer := 0;
  v_external_amount integer := 0;
  v_payment_method text := nullif(btrim(p_payment_method), '');
  v_account_last_5 text := nullif(regexp_replace(coalesce(p_account_last_5, ''), '\D', '', 'g'), '');
  v_note text := nullif(btrim(p_note), '');
  v_requires_account_last_5 boolean := false;
  v_submission_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  with raw_items as (
    select
      (payload.value ->> 'member_id')::uuid as member_id,
      upper(nullif(btrim(payload.value ->> 'period_key'), '')) as period_key,
      greatest(coalesce((payload.value ->> 'amount')::integer, 0), 0) as amount,
      greatest(coalesce((payload.value ->> 'balance_amount')::integer, 0), 0) as balance_amount
    from jsonb_array_elements(p_items) as payload(value)
  ),
  valid_items as (
    select
      raw_items.member_id,
      raw_items.period_key,
      raw_items.amount,
      raw_items.balance_amount
    from raw_items
    where raw_items.member_id is not null
      and raw_items.period_key ~ '^[0-9]{4}-Q[1-4]$'
      and raw_items.amount > 0
      and raw_items.balance_amount <= raw_items.amount
  )
  select
    (select count(*) from raw_items),
    coalesce(jsonb_agg(to_jsonb(valid_items) order by valid_items.member_id), '[]'::jsonb),
    count(*),
    count(distinct valid_items.member_id),
    count(distinct valid_items.period_key),
    min(valid_items.period_key),
    (array_agg(valid_items.member_id order by valid_items.member_id))[1],
    coalesce(sum(valid_items.amount), 0),
    coalesce(sum(valid_items.balance_amount), 0)
  into
    v_raw_item_count,
    v_items,
    v_item_count,
    v_member_count,
    v_period_count,
    v_period_key,
    v_member_id,
    v_amount,
    v_balance_amount
  from valid_items;

  if v_item_count = 0 then
    raise exception 'quarterly payment items are required';
  end if;

  if v_item_count <> v_raw_item_count then
    raise exception 'all quarterly payment items must be valid';
  end if;

  if v_member_count <> v_item_count then
    raise exception 'quarterly payment items must not duplicate members';
  end if;

  if v_period_count <> 1 or v_period_key is null then
    raise exception 'all quarterly payment items must use the same period_key';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_items) as item(member_id uuid, period_key text, amount integer, balance_amount integer)
    where not exists (
      select 1
      from public.profiles p
      join public.team_members tm on tm.id = item.member_id
      where p.id = v_user_id
        and item.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
        and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
    )
  ) then
    raise exception 'all quarterly payment members must be linked quarterly players';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_items) as item(member_id uuid, period_key text, amount integer, balance_amount integer)
    where item.balance_amount > public.get_player_balance_unchecked(item.member_id)
  ) then
    raise exception 'player balance is not enough';
  end if;

  v_external_amount := greatest(v_amount - v_balance_amount, 0);

  if v_external_amount = 0 then
    v_payment_method := coalesce(v_payment_method, 'balance');
  elsif v_payment_method is null then
    raise exception 'payment_method is required';
  end if;

  v_requires_account_last_5 := v_external_amount > 0
    and v_payment_method in ('銀行轉帳', '匯款', '匯款轉帳', 'ATM轉帳');

  if v_requires_account_last_5 then
    if v_account_last_5 is null or v_account_last_5 !~ '^[0-9]{5}$' then
      raise exception 'account_last_5 must be 5 digits for transfer payments';
    end if;
  else
    v_account_last_5 := null;
  end if;

  insert into public.profile_payment_submissions (
    profile_id,
    member_id,
    billing_mode,
    period_key,
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
    v_user_id,
    v_member_id,
    'quarterly',
    v_period_key,
    v_amount,
    v_balance_amount,
    v_payment_method,
    v_account_last_5,
    coalesce(p_remittance_date, current_date),
    v_note,
    'pending_review',
    now(),
    now()
  )
  returning profile_payment_submissions.id into v_submission_id;

  insert into public.profile_payment_submission_items (
    submission_id,
    member_id,
    period_key,
    amount,
    balance_amount,
    created_at,
    updated_at
  )
  select
    v_submission_id,
    item.member_id,
    item.period_key,
    item.amount,
    item.balance_amount,
    now(),
    now()
  from jsonb_to_recordset(v_items) as item(member_id uuid, period_key text, amount integer, balance_amount integer);

  return query
  select *
  from public.list_my_payment_submissions(v_member_id) submissions
  where submissions.id = v_submission_id;
end;
$$;

revoke all on function public.create_my_quarterly_payment_submission(jsonb, text, text, date, text) from public;
grant execute on function public.create_my_quarterly_payment_submission(jsonb, text, text, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
