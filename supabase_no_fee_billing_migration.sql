begin;

alter table public.team_members
add column if not exists fee_billing_mode text;

update public.team_members
set fee_billing_mode = 'role_default'
where fee_billing_mode is null
   or fee_billing_mode not in ('role_default', 'monthly_fixed', 'no_fee');

alter table public.team_members
alter column fee_billing_mode set default 'role_default',
alter column fee_billing_mode set not null;

alter table public.team_members
drop constraint if exists team_members_fee_billing_mode_check;

alter table public.team_members
add constraint team_members_fee_billing_mode_check
check (fee_billing_mode in ('role_default', 'monthly_fixed', 'no_fee'));

comment on column public.team_members.fee_billing_mode
is 'Manual billing override. role_default follows member role; monthly_fixed keeps role 球員 but bills through monthly fees; no_fee excludes the member from new team and match fees.';

drop function if exists public.get_effective_payment_billing_mode(text, text);

create or replace function public.get_effective_payment_billing_mode(
  p_role text,
  p_fee_billing_mode text default 'role_default'
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_role in ('球員', '校隊') and coalesce(p_fee_billing_mode, 'role_default') = 'no_fee' then 'none'
    when p_role = '校隊' then 'monthly'
    when p_role = '球員' and coalesce(p_fee_billing_mode, 'role_default') = 'monthly_fixed' then 'monthly'
    when p_role = '球員' then 'quarterly'
    else null
  end;
$$;

drop function if exists public.list_my_payment_members();

create or replace function public.list_my_payment_members()
returns table (
  member_id uuid,
  name text,
  role text,
  billing_mode text,
  is_linked boolean,
  balance_amount integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  return query
  select
    team_members.id,
    team_members.name::text,
    team_members.role::text,
    public.get_effective_payment_billing_mode(
      team_members.role::text,
      team_members.fee_billing_mode::text
    ) as billing_mode,
    team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) as is_linked,
    public.get_player_balance_unchecked(team_members.id) as balance_amount
  from public.profiles
  join public.team_members
    on (
      team_members.role in ('校隊', '球員')
      and coalesce(team_members.status, '在隊') not in ('退隊', '離隊')
      and coalesce(team_members.is_inactive_or_graduated, false) = false
      and (
        team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        or public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
      )
    )
  where profiles.id = v_user_id
  order by
    case when team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) then 0 else 1 end,
    case
      when team_members.role = '校隊' and team_members.fee_billing_mode <> 'no_fee' then 0
      when team_members.fee_billing_mode = 'monthly_fixed' then 1
      when team_members.role = '球員' and team_members.fee_billing_mode <> 'no_fee' then 2
      else 3
    end,
    team_members.name asc;
end;
$$;

drop function if exists public.get_my_payment_records(uuid);

create or replace function public.get_my_payment_records(
  p_member_id uuid
)
returns table (
  member_id uuid,
  member_name text,
  billing_mode text,
  period_key text,
  period_label text,
  amount integer,
  balance_amount integer,
  external_amount integer,
  status text,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not exists (
    select 1
    from public.profiles
    join public.team_members
      on team_members.id = p_member_id
    where profiles.id = v_user_id
      and team_members.role in ('球員', '校隊')
      and (
        public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
        or p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      )
  ) then
    raise exception 'member is not viewable by current profile';
  end if;

  return query
  with target_member as (
    select
      tm.id,
      tm.name::text as name,
      public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) as effective_billing_mode
    from public.team_members tm
    where tm.id = p_member_id
      and tm.role in ('球員', '校隊')
    limit 1
  ),
  payment_rows as (
    select
      mf.member_id,
      target_member.name as member_name,
      'monthly'::text as billing_mode,
      mf.year_month::text as period_key,
      mf.year_month::text as period_label,
      coalesce(mf.payable_amount, 0)::integer as amount,
      coalesce(mf.balance_amount, 0)::integer as balance_amount,
      greatest(coalesce(mf.payable_amount, 0) - coalesce(mf.balance_amount, 0), 0)::integer as external_amount,
      coalesce(mf.status, 'unpaid')::text as status,
      mf.payment_method::text,
      mf.account_last_5::text,
      mf.remittance_date,
      mf.updated_at
    from public.monthly_fees mf
    join target_member on target_member.id = mf.member_id
    where target_member.effective_billing_mode in ('monthly', 'none')

    union all

    select
      p_member_id as member_id,
      target_member.name as member_name,
      'quarterly'::text as billing_mode,
      qf.year_quarter::text as period_key,
      qf.year_quarter::text as period_label,
      coalesce(qf.amount, 0)::integer as amount,
      coalesce(qf.balance_amount, 0)::integer as balance_amount,
      greatest(coalesce(qf.amount, 0) - coalesce(qf.balance_amount, 0), 0)::integer as external_amount,
      coalesce(qf.status, 'pending_review')::text as status,
      qf.payment_method::text,
      qf.account_last_5::text,
      qf.remittance_date,
      qf.updated_at
    from public.quarterly_fees qf
    join target_member on true
    where target_member.effective_billing_mode in ('quarterly', 'none')
      and (
        qf.member_id = p_member_id
        or p_member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
      )
  )
  select *
  from payment_rows
  order by period_key desc, updated_at desc nulls last;
end;
$$;

create or replace function public.get_my_payment_submission_estimate(
  p_member_id uuid,
  p_period_key text
)
returns table (
  member_id uuid,
  member_name text,
  billing_mode text,
  period_key text,
  period_label text,
  amount integer,
  total_sessions integer,
  leave_sessions integer,
  per_session_fee integer,
  deduction_amount integer,
  calculation_type text,
  fixed_monthly_fee integer
)
language sql
security definer
set search_path = public
as $function$
with normalized_input as (
  select upper(nullif(btrim(p_period_key), '')) as period_key
),
month_input as (
  select
    normalized_input.period_key,
    to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD')::date as month_start
  from normalized_input
  where normalized_input.period_key ~ '^[0-9]{4}-[0-9]{2}$'
),
linked_member as (
  select
    team_members.id as member_id,
    team_members.name::text as member_name,
    team_members.role::text as member_role,
    coalesce(team_members.fee_billing_mode, 'role_default') as fee_billing_mode,
    public.get_effective_payment_billing_mode(team_members.role::text, team_members.fee_billing_mode::text) as billing_mode,
    public.get_monthly_fee_calculation_type(team_members.role::text, team_members.fee_billing_mode::text) as calculation_type,
    coalesce(team_members.is_half_price, false) as is_half_price,
    coalesce(team_members.is_primary_payer, false) as is_primary_payer,
    coalesce(team_members.sibling_ids, array[]::uuid[]) as sibling_ids,
    coalesce(fee_settings.per_session_fee, 500) as base_fee,
    coalesce(fee_settings.monthly_fixed_fee, 2000) as monthly_fixed_fee
  from public.profiles
  join public.team_members
    on team_members.id = p_member_id
  left join public.fee_settings
    on fee_settings.member_id = team_members.id
  where profiles.id = auth.uid()
    and (
      p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      or profiles.role = 'ADMIN'
      or public.has_app_permission('fees', 'VIEW')
      or public.has_app_permission('fees', 'EDIT')
    )
  limit 1
),
training_month_total as (
  select
    month_input.period_key,
    case
      when exists (
        select 1
        from public.training_month_date_settings settings
        where settings.month_start = month_input.month_start
      ) then (
        select count(distinct training_day.training_date)::integer
        from public.training_month_date_settings settings
        cross join lateral unnest(coalesce(settings.training_dates, '{}'::date[])) as training_day(training_date)
        where settings.month_start = month_input.month_start
          and date_trunc('month', training_day.training_date)::date = month_input.month_start
      )
      else cardinality(public.get_default_training_month_dates(month_input.month_start))
    end as total_sessions
  from month_input
),
monthly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    month_input.period_key,
    coalesce(monthly_fees.calculation_type, linked_member.calculation_type) as calculation_type,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed'
        then coalesce(monthly_fees.fixed_monthly_fee, linked_member.monthly_fixed_fee, 2000)
      else null
    end as fixed_monthly_fee,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      else coalesce(training_month_total.total_sessions, 0)
    end as total_sessions,
    coalesce(monthly_fees.deduction_amount, 0) as deduction_amount,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      else coalesce(monthly_fees.leave_sessions, leave_stats.leave_sessions, 0)
    end as leave_sessions,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      when monthly_fees.id is not null and monthly_fees.per_session_fee is not null then monthly_fees.per_session_fee
      when linked_member.is_half_price then round(linked_member.base_fee / 2.0)::integer
      when cardinality(linked_member.sibling_ids) > 0
        and not linked_member.is_primary_payer
        and (
          sibling_flags.has_primary_sibling
          or sibling_flags.has_fallback_discount
        ) then round(linked_member.base_fee / 2.0)::integer
      else linked_member.base_fee
    end as per_session_fee,
    monthly_fees.payable_amount as stored_payable_amount
  from linked_member
  cross join month_input
  join training_month_total
    on training_month_total.period_key = month_input.period_key
  left join public.monthly_fees
    on monthly_fees.member_id = linked_member.member_id
   and monthly_fees.year_month = month_input.period_key
  left join lateral (
    select
      coalesce(count(distinct leave_day::date), 0)::integer as leave_sessions
    from public.leave_requests
    cross join lateral generate_series(
      greatest(
        leave_requests.start_date,
        month_input.month_start
      ),
      least(
        leave_requests.end_date,
        (month_input.month_start + interval '1 month - 1 day')::date
      ),
      interval '1 day'
    ) as leave_day
    where leave_requests.user_id = linked_member.member_id
      and leave_requests.start_date <= (month_input.month_start + interval '1 month - 1 day')::date
      and leave_requests.end_date >= month_input.month_start
  ) as leave_stats on true
  left join lateral (
    select
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and coalesce(sibling.is_primary_payer, false)
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'monthly'
      ) as has_primary_sibling,
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and linked_member.member_id > sibling.id
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'monthly'
      ) as has_fallback_discount
  ) as sibling_flags on true
  where linked_member.billing_mode = 'monthly'
     or (linked_member.billing_mode = 'none' and monthly_fees.id is not null)
),
quarterly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    normalized_input.period_key,
    coalesce(
      nullif(quarterly_fee.amount, 0),
      case
        when linked_member.is_half_price then 3000
        when cardinality(linked_member.sibling_ids) > 0
          and not linked_member.is_primary_payer
          and (
            sibling_flags.has_primary_sibling
            or sibling_flags.has_fallback_discount
          ) then 3000
        else 6000
      end
    ) as amount
  from linked_member
  cross join normalized_input
  left join lateral (
    select quarterly_fees.id, quarterly_fees.amount
    from public.quarterly_fees
    where (
      quarterly_fees.member_id = linked_member.member_id
      or linked_member.member_id = any(coalesce(quarterly_fees.member_ids, array[]::uuid[]))
    )
      and quarterly_fees.year_quarter = normalized_input.period_key
    order by quarterly_fees.updated_at desc nulls last, quarterly_fees.created_at desc nulls last
    limit 1
  ) as quarterly_fee on true
  left join lateral (
    select
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and coalesce(sibling.is_primary_payer, false)
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'quarterly'
      ) as has_primary_sibling,
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and linked_member.member_id > sibling.id
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'quarterly'
      ) as has_fallback_discount
  ) as sibling_flags on true
  where normalized_input.period_key ~ '^[0-9]{4}-Q[1-4]$'
    and (
      linked_member.billing_mode = 'quarterly'
      or (linked_member.billing_mode = 'none' and quarterly_fee.id is not null)
    )
)
select
  monthly_context.member_id,
  monthly_context.member_name,
  'monthly'::text as billing_mode,
  monthly_context.period_key,
  monthly_context.period_key as period_label,
  coalesce(
    monthly_context.stored_payable_amount,
    case
      when monthly_context.calculation_type = 'monthly_fixed'
        then monthly_context.fixed_monthly_fee - monthly_context.deduction_amount
      else greatest(coalesce(monthly_context.total_sessions, 0) - coalesce(monthly_context.leave_sessions, 0), 0) * coalesce(monthly_context.per_session_fee, 0) - monthly_context.deduction_amount
    end
  ) as amount,
  monthly_context.total_sessions,
  monthly_context.leave_sessions,
  monthly_context.per_session_fee,
  monthly_context.deduction_amount,
  monthly_context.calculation_type,
  monthly_context.fixed_monthly_fee
from monthly_context

union all

select
  quarterly_context.member_id,
  quarterly_context.member_name,
  'quarterly'::text as billing_mode,
  quarterly_context.period_key,
  quarterly_context.period_key as period_label,
  quarterly_context.amount,
  null::integer as total_sessions,
  null::integer as leave_sessions,
  null::integer as per_session_fee,
  null::integer as deduction_amount,
  null::text as calculation_type,
  null::integer as fixed_monthly_fee
from quarterly_context;
$function$;

drop function if exists public.create_my_payment_submission(uuid, text, integer, text, text, date, text);
drop function if exists public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer);

create or replace function public.create_my_payment_submission(
  p_member_id uuid,
  p_period_key text,
  p_amount integer,
  p_payment_method text,
  p_account_last_5 text default null,
  p_remittance_date date default null,
  p_note text default null,
  p_balance_amount integer default 0
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
  v_effective_billing_mode text;
  v_billing_mode text;
  v_submission public.profile_payment_submissions%rowtype;
  v_period_key text := upper(nullif(btrim(p_period_key), ''));
  v_payment_method text := nullif(btrim(p_payment_method), '');
  v_account_last_5 text := nullif(regexp_replace(coalesce(p_account_last_5, ''), '\D', '', 'g'), '');
  v_note text := nullif(btrim(p_note), '');
  v_balance_amount integer := greatest(coalesce(p_balance_amount, 0), 0);
  v_external_amount integer := 0;
  v_requires_account_last_5 boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  if v_balance_amount > p_amount then
    raise exception 'balance_amount cannot exceed amount';
  end if;

  select public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text)
  into v_effective_billing_mode
  from public.profiles p
  join public.team_members tm on tm.id = p_member_id
  where p.id = v_user_id
    and p_member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]));

  if v_effective_billing_mode is null then
    raise exception 'member not linked to current profile or unsupported member role';
  end if;

  v_billing_mode := v_effective_billing_mode;

  if v_effective_billing_mode = 'none' then
    if v_period_key ~ '^[0-9]{4}-[0-9]{2}$'
      and exists (
        select 1
        from public.monthly_fees mf
        where mf.member_id = p_member_id
          and mf.year_month = v_period_key
          and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')
      ) then
      v_billing_mode := 'monthly';
    elsif v_period_key ~ '^[0-9]{4}-Q[1-4]$'
      and exists (
        select 1
        from public.quarterly_fees qf
        where qf.year_quarter = v_period_key
          and (
            qf.member_id = p_member_id
            or p_member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
          )
          and coalesce(qf.status, 'unpaid') not in ('paid', 'approved')
      ) then
      v_billing_mode := 'quarterly';
    else
      raise exception 'no_fee member has no payable official fee record for this period';
    end if;
  end if;

  if v_billing_mode = 'monthly' then
    if v_period_key is null or v_period_key !~ '^[0-9]{4}-[0-9]{2}$' then
      raise exception 'monthly period_key must look like YYYY-MM';
    end if;
  elsif v_billing_mode = 'quarterly' then
    if v_period_key is null or v_period_key !~ '^[0-9]{4}-Q[1-4]$' then
      raise exception 'quarterly period_key must look like YYYY-Q1';
    end if;
  else
    raise exception 'unsupported member role for payment submission';
  end if;

  if v_balance_amount > public.get_player_balance_unchecked(p_member_id) then
    raise exception 'player balance is not enough';
  end if;

  v_external_amount := greatest(p_amount - v_balance_amount, 0);

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
    p_member_id,
    v_billing_mode,
    v_period_key,
    p_amount,
    v_balance_amount,
    v_payment_method,
    v_account_last_5,
    coalesce(p_remittance_date, current_date),
    v_note,
    'pending_review',
    now(),
    now()
  )
  returning * into v_submission;

  return query
  select *
  from public.list_my_payment_submissions(v_submission.member_id) submissions
  where submissions.id = v_submission.id;
end;
$$;

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
      (value ->> 'member_id')::uuid as member_id,
      upper(nullif(btrim(value ->> 'period_key'), '')) as period_key,
      greatest(coalesce((value ->> 'amount')::integer, 0), 0) as amount,
      greatest(coalesce((value ->> 'balance_amount')::integer, 0), 0) as balance_amount
    from jsonb_array_elements(p_items) as item(value)
  ),
  valid_items as (
    select *
    from raw_items
    where member_id is not null
      and period_key ~ '^[0-9]{4}-Q[1-4]$'
      and amount > 0
      and balance_amount <= amount
  )
  select
    (select count(*) from raw_items),
    coalesce(jsonb_agg(to_jsonb(valid_items) order by member_id), '[]'::jsonb),
    count(*),
    count(distinct member_id),
    count(distinct period_key),
    min(period_key),
    (array_agg(member_id order by member_id))[1],
    coalesce(sum(amount), 0),
    coalesce(sum(balance_amount), 0)
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
        and (
          public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
          or (
            public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'none'
            and exists (
              select 1
              from public.quarterly_fees qf
              where qf.year_quarter = item.period_key
                and (
                  qf.member_id = item.member_id
                  or item.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
                )
                and coalesce(qf.status, 'unpaid') not in ('paid', 'approved')
            )
          )
        )
    )
  ) then
    raise exception 'all quarterly payment members must be linked payable quarterly players';
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

create or replace function public.sync_match_fee_items_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
begin
  select *
  into v_match
  from public.matches
  where matches.id = p_match_id;

  if not found then
    return;
  end if;

  if coalesce(v_match.match_fee_amount, 0) > 0 and v_match.match_date is not null then
    with player_names as (
      select distinct
        public.normalize_match_fee_player_name(player_name) as name_key,
        player_name
      from public.split_match_fee_player_names(v_match.players)
      where public.normalize_match_fee_player_name(player_name) <> ''
    ),
    absent_names as (
      select distinct public.normalize_match_fee_player_name(value ->> 'name') as name_key
      from jsonb_array_elements(coalesce(v_match.absent_players, '[]'::jsonb)) as absent(value)
      where public.normalize_match_fee_player_name(value ->> 'name') <> ''
    ),
    eligible_members as (
      select distinct
        tm.id as member_id,
        tm.name::text as member_name
      from player_names pn
      join public.team_members tm
        on public.normalize_match_fee_player_name(tm.name::text) = pn.name_key
      where tm.role in ('球員', '校隊')
        and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) <> 'none'
        and coalesce(tm.status::text, '在隊') = '在隊'
        and not exists (
          select 1
          from absent_names an
          where an.name_key = pn.name_key
        )
        and not exists (
          select 1
          from public.leave_requests lr
          where lr.user_id = tm.id
            and lr.start_date <= v_match.match_date
            and coalesce(lr.end_date, lr.start_date) >= v_match.match_date
        )
    )
    insert into public.match_fee_items (
      match_id,
      member_id,
      member_name_snapshot,
      match_name_snapshot,
      tournament_name_snapshot,
      match_date_snapshot,
      match_time_snapshot,
      category_group_snapshot,
      fee_month,
      amount,
      payment_status,
      payment_submission_id,
      cancelled_at,
      cancelled_reason,
      created_at,
      updated_at
    )
    select
      v_match.id,
      em.member_id,
      em.member_name,
      coalesce(nullif(v_match.match_name, ''), '未命名賽事'),
      nullif(v_match.tournament_name, ''),
      v_match.match_date,
      nullif(v_match.match_time, ''),
      nullif(v_match.category_group, ''),
      to_char(v_match.match_date, 'YYYY-MM'),
      v_match.match_fee_amount,
      'unpaid',
      null,
      null,
      null,
      now(),
      now()
    from eligible_members em
    on conflict (match_id, member_id) where match_id is not null
    do update
    set
      member_name_snapshot = excluded.member_name_snapshot,
      match_name_snapshot = excluded.match_name_snapshot,
      tournament_name_snapshot = excluded.tournament_name_snapshot,
      match_date_snapshot = excluded.match_date_snapshot,
      match_time_snapshot = excluded.match_time_snapshot,
      category_group_snapshot = excluded.category_group_snapshot,
      fee_month = excluded.fee_month,
      amount = excluded.amount,
      payment_status = 'unpaid',
      payment_submission_id = null,
      cancelled_at = null,
      cancelled_reason = null,
      updated_at = now()
    where match_fee_items.payment_status in ('unpaid', 'cancelled')
      and match_fee_items.payment_submission_id is null;
  end if;

  with current_eligible as (
    select distinct tm.id as member_id
    from public.split_match_fee_player_names(v_match.players) pn
    join public.team_members tm
      on public.normalize_match_fee_player_name(tm.name::text) = public.normalize_match_fee_player_name(pn.player_name)
    where coalesce(v_match.match_fee_amount, 0) > 0
      and v_match.match_date is not null
      and tm.role in ('球員', '校隊')
      and coalesce(tm.status::text, '在隊') = '在隊'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(v_match.absent_players, '[]'::jsonb)) as absent(value)
        where public.normalize_match_fee_player_name(absent.value ->> 'name')
          = public.normalize_match_fee_player_name(pn.player_name)
      )
      and not exists (
        select 1
        from public.leave_requests lr
        where lr.user_id = tm.id
          and lr.start_date <= v_match.match_date
          and coalesce(lr.end_date, lr.start_date) >= v_match.match_date
      )
  )
  update public.match_fee_items fi
  set
    payment_status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = case
      when coalesce(v_match.match_fee_amount, 0) <= 0 then '比賽費用已取消'
      else '參賽名單或請假狀態已變更'
    end,
    updated_at = now()
  where fi.match_id = v_match.id
    and fi.payment_status = 'unpaid'
    and not exists (
      select 1
      from current_eligible ce
      where ce.member_id = fi.member_id
    );
end;
$$;

create or replace function public.get_my_home_snapshot(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_taipei_now timestamp := now() at time zone 'Asia/Taipei';
  v_today date := coalesce(p_today, v_taipei_now::date);
  v_current_time time := case
    when coalesce(p_today, v_taipei_now::date) = v_taipei_now::date then v_taipei_now::time
    else '00:00'::time
  end;
  v_week_start date := (v_today - ((extract(isodow from v_today)::integer - 1) * interval '1 day'))::date;
  v_linked_ids uuid[] := '{}'::uuid[];
  v_members jsonb := '[]'::jsonb;
  v_next_event jsonb := null;
  v_today_leaves jsonb := '[]'::jsonb;
  v_training_locations jsonb := '[]'::jsonb;
  v_training_month_dates jsonb := '[]'::jsonb;
  v_payment_summary jsonb;
  v_equipment_summary jsonb;
  v_recent_notifications jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(profiles.linked_team_member_ids, array[]::uuid[])
  into v_linked_ids
  from public.profiles
  where profiles.id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tm.id,
        'name', tm.name,
        'role', tm.role,
        'team_group', tm.team_group,
        'status', tm.status,
        'jersey_number', tm.jersey_number,
        'avatar_url', tm.avatar_url
      )
      order by
        case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
        tm.name
    ),
    '[]'::jsonb
  )
  into v_members
  from public.team_members_safe tm
  where tm.id = any(v_linked_ids)
    and tm.role in ('球員', '校隊');

  select to_jsonb(event_row)
  into v_next_event
  from (
    with event_candidates as (
      select
        m.id,
        'match'::text as type,
        coalesce(nullif(m.match_name, ''), nullif(m.opponent, ''), '賽事')::text as title,
        m.match_date::date as event_date,
        (mt.start_token)::time as event_start_time,
        coalesce(
          (mt.end_token)::time,
          case
            when mt.start_token is not null then ((mt.start_token)::time + interval '2 hours')::time
            else '23:59'::time
          end
        ) as event_end_time,
        m.match_date::text as date,
        nullif(m.match_time, '')::text as time,
        nullif(m.location, '')::text as location,
        nullif(m.opponent, '')::text as opponent,
        nullif(m.category_group, '')::text as category_group,
        nullif(m.match_level, '')::text as match_level,
        nullif(m.coaches, '')::text as coaches,
        nullif(m.players, '')::text as players,
        format('/calendar?match_id=%s', m.id::text) as route
      from public.matches m
      cross join lateral (
        select
          substring(nullif(m.match_time, '') from '([0-9]{1,2}:[0-5][0-9])') as start_token,
          substring(nullif(m.match_time, '') from '[0-9]{1,2}:[0-5][0-9][[:space:]]*[-~－—–][[:space:]]*([0-9]{1,2}:[0-5][0-9])') as end_token
      ) mt
      where m.match_date >= v_today
    )
    select
      id,
      type,
      title,
      date,
      time,
      location,
      opponent,
      category_group,
      match_level,
      coaches,
      players,
      route
    from event_candidates
    where event_date > v_today
      or event_end_time > v_current_time
    order by event_date asc, coalesce(event_start_time, '23:59'::time) asc
    limit 1
  ) event_row;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', lr.id,
        'member_id', tm.id,
        'member_name', tm.name,
        'leave_type', lr.leave_type,
        'start_date', lr.start_date,
        'end_date', lr.end_date,
        'reason', lr.reason
      )
      order by tm.name, lr.start_date
    ),
    '[]'::jsonb
  )
  into v_today_leaves
  from public.leave_requests lr
  join public.team_members_safe tm on tm.id = lr.user_id
  where lr.user_id = any(v_linked_ids)
    and lr.start_date <= v_today
    and lr.end_date >= v_today;

  if to_regprocedure('public.list_my_week_training_locations(date)') is not null then
    execute $sql$
      select coalesce(
        jsonb_agg(to_jsonb(location_row) order by location_row.training_date, location_row.start_time, location_row.member_name),
        '[]'::jsonb
      )
      from public.list_my_week_training_locations($1) location_row
    $sql$
    into v_training_locations
    using v_week_start;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', date_row.date_value::text,
        'weekday', concat('週', (array['日','一','二','三','四','五','六'])[extract(dow from date_row.date_value)::integer + 1]),
        'label', concat(extract(month from date_row.date_value)::integer, '/', extract(day from date_row.date_value)::integer, ' 週', (array['日','一','二','三','四','五','六'])[extract(dow from date_row.date_value)::integer + 1]),
        'is_today', date_row.date_value = v_today,
        'is_past', date_row.date_value < v_today
      )
      order by date_row.date_value
    ),
    '[]'::jsonb
  )
  into v_training_month_dates
  from (
    select value::date as date_value
    from jsonb_array_elements_text(public.get_training_month_dates(v_today)->'training_dates') as date_value(value)
  ) date_row;

  with official_due as (
    select
      mf.member_id,
      tm.name::text as member_name,
      'monthly'::text as billing_mode,
      mf.year_month::text as period_label,
      coalesce(mf.payable_amount, 0)::integer as amount,
      coalesce(mf.status, 'unpaid')::text as status,
      mf.updated_at
    from public.monthly_fees mf
    join public.team_members_safe tm on tm.id = mf.member_id
    where mf.member_id = any(v_linked_ids)
      and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) in ('monthly', 'none')
      and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')

    union all

    select
      matched_member.id as member_id,
      matched_member.name::text as member_name,
      'quarterly'::text as billing_mode,
      qf.year_quarter::text as period_label,
      coalesce(qf.amount, 0)::integer as amount,
      coalesce(qf.status, 'pending_review')::text as status,
      qf.updated_at
    from public.quarterly_fees qf
    join lateral (
      select tm.id, tm.name
      from public.team_members_safe tm
      where tm.id = any(v_linked_ids)
        and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) in ('quarterly', 'none')
        and (
          tm.id = qf.member_id
          or tm.id = any(coalesce(qf.member_ids, array[]::uuid[]))
        )
      order by tm.name
      limit 1
    ) matched_member on true
    where (
        qf.member_id = any(v_linked_ids)
        or coalesce(qf.member_ids, array[]::uuid[]) && v_linked_ids
      )
      and coalesce(qf.status, 'pending_review') not in ('paid', 'approved')
  ),
  pending_submissions as (
    select count(*)::integer as total
    from public.profile_payment_submissions pps
    where pps.member_id = any(v_linked_ids)
      and pps.status = 'pending_review'
  ),
  next_due_row as (
    select *
    from official_due
    order by updated_at desc nulls last, period_label desc
    limit 1
  )
  select jsonb_build_object(
    'unpaid_count', coalesce(count(*) filter (where status = 'unpaid'), 0),
    'pending_review_count', coalesce(count(*) filter (where status = 'pending_review'), 0) + coalesce((select total from pending_submissions), 0),
    'total_unpaid_amount', coalesce(sum(amount) filter (where status = 'unpaid'), 0),
    'next_due', coalesce((select to_jsonb(next_due_row) from next_due_row), 'null'::jsonb)
  )
  into v_payment_summary
  from official_due;

  with request_rows as (
    select
      r.id,
      r.member_id,
      tm.name::text as member_name,
      r.status::text,
      count(ri.id)::integer as item_count,
      coalesce(sum(coalesce(ri.unit_price_snapshot, 0) * coalesce(ri.quantity, 0)), 0)::integer as total_amount,
      r.updated_at
    from public.equipment_purchase_requests r
    join public.team_members_safe tm on tm.id = r.member_id
    left join public.equipment_purchase_request_items ri on ri.request_id = r.id
    where r.member_id = any(v_linked_ids)
      and r.status not in ('rejected', 'cancelled')
    group by r.id, r.member_id, tm.name, r.status, r.updated_at
  ),
  equipment_payment_rows as (
    select
      t.id,
      t.member_id,
      coalesce(t.payment_status, 'unpaid')::text as payment_status,
      coalesce(coalesce(t.unit_price, e.purchase_price, 0) * coalesce(t.quantity, 0), 0)::integer as total_amount
    from public.equipment_transactions t
    join public.equipment e on e.id = t.equipment_id
    left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
    left join public.equipment_purchase_requests r on r.id = ri.request_id
    where t.member_id = any(v_linked_ids)
      and t.transaction_type = 'purchase'
      and (
        t.request_item_id is null
        or (
          t.request_item_id is not null
          and r.status = 'picked_up'
        )
      )
      and coalesce(t.payment_status, 'unpaid') in ('unpaid', 'pending_review')
  ),
  latest_request_row as (
    select *
    from request_rows
    order by updated_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'active_request_count', coalesce((select count(*) from request_rows where status in ('pending', 'approved', 'ready_for_pickup')), 0),
    'ready_for_pickup_count', coalesce((select count(*) from request_rows where status = 'ready_for_pickup'), 0),
    'picked_up_unpaid_count', coalesce((select count(*) from equipment_payment_rows where payment_status = 'unpaid'), 0),
    'pending_payment_count', coalesce((select count(*) from equipment_payment_rows where payment_status = 'pending_review'), 0),
    'unpaid_amount', coalesce((select sum(total_amount) from equipment_payment_rows where payment_status = 'unpaid'), 0),
    'latest_request', coalesce((select to_jsonb(latest_request_row) from latest_request_row), 'null'::jsonb)
  )
  into v_equipment_summary;

  select coalesce(jsonb_agg(to_jsonb(feed_row) order by feed_row.created_at desc), '[]'::jsonb)
  into v_recent_notifications
  from public.get_notification_feed(5) feed_row;

  return jsonb_build_object(
    'members', v_members,
    'next_event', v_next_event,
    'today_leaves', v_today_leaves,
    'training_locations', v_training_locations,
    'training_month_dates', v_training_month_dates,
    'payment_summary', v_payment_summary,
    'equipment_summary', v_equipment_summary,
    'recent_notifications', v_recent_notifications,
    'generated_at', now()
  );
end;
$$;

create or replace function public.get_fee_management_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_view_fees boolean := false;
  v_monthly_period text := case
    when extract(day from current_date)::integer >= 25 then to_char(current_date, 'YYYY-MM')
    else to_char(current_date - interval '1 month', 'YYYY-MM')
  end;
  v_quarterly_period text := to_char(current_date, 'YYYY') || '-Q' || extract(quarter from current_date)::integer::text;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_can_view_fees := public.has_app_permission('fees', 'VIEW');

  if not v_can_view_fees then
    raise exception 'permission denied';
  end if;

  with reminder_items as (
    select *
    from (
      select
        'profile-payment-pending'::text as id,
        'profilePaymentPending'::text as kind,
        U&'\500B\4EBA\56DE\5831\5F85\78BA\8A8D'::text as title,
        format(U&'%s \7B46\500B\4EBA\56DE\5831\4ED8\6B3E\5F85\78BA\8A8D\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
        item_count,
        total_amount,
        'urgent'::text as severity,
        case
          when latest_id is not null then format('/fees?highlight_submission_id=%s', latest_id)
          else '/fees'::text
        end as link,
        coalesce(latest_created_at, now()) as created_at,
        1 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(pps.amount), 0)::integer as total_amount,
          (array_agg(pps.id::text order by pps.created_at desc))[1] as latest_id,
          max(pps.created_at) as latest_created_at
        from public.profile_payment_submissions pps
        where pps.status = 'pending_review'
      ) profile_payments

      union all

      select
        'equipment-payment-pending'::text as id,
        'equipmentPaymentPending'::text as kind,
        U&'\88DD\5099\4ED8\6B3E\5F85\78BA\8A8D'::text as title,
        format(U&'%s \7B46\88DD\5099\4ED8\6B3E\56DE\5831\5F85\78BA\8A8D\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
        item_count,
        total_amount,
        'urgent'::text as severity,
        case
          when latest_id is not null then format('/fees?tab=equipment&highlight_equipment_submission_id=%s', latest_id)
          else '/fees?tab=equipment'::text
        end as link,
        coalesce(latest_created_at, now()) as created_at,
        1 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(eps.amount), 0)::integer as total_amount,
          (array_agg(eps.id::text order by eps.created_at desc))[1] as latest_id,
          max(eps.created_at) as latest_created_at
        from public.equipment_payment_submissions eps
        where eps.status = 'pending_review'
      ) equipment_payments

      union all

      select
        'equipment-request-pending'::text as id,
        'equipmentRequestPending'::text as kind,
        U&'\88DD\5099\8ACB\8CFC\5F85\5BE9\6838'::text as title,
        format(U&'%s \7B46\88DD\5099\8ACB\8CFC\5F85\5BE9\6838\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
        item_count,
        total_amount,
        'urgent'::text as severity,
        case
          when latest_id is not null then format('/fees?tab=equipment&highlight_id=%s', latest_id)
          else '/fees?tab=equipment'::text
        end as link,
        coalesce(latest_created_at, now()) as created_at,
        1 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(request_amount), 0)::integer as total_amount,
          (array_agg(id::text order by created_at desc))[1] as latest_id,
          max(created_at) as latest_created_at
        from (
          select
            r.id,
            coalesce(r.requested_at, r.created_at) as created_at,
            coalesce(sum(coalesce(ri.unit_price_snapshot, e.purchase_price, 0) * ri.quantity), 0)::integer as request_amount
          from public.equipment_purchase_requests r
          left join public.equipment_purchase_request_items ri on ri.request_id = r.id
          left join public.equipment e on e.id = ri.equipment_id
          where r.status = 'pending'
          group by r.id, coalesce(r.requested_at, r.created_at)
        ) requests
      ) pending_requests

      union all

      select
        'equipment-request-in-progress'::text as id,
        'equipmentRequestInProgress'::text as kind,
        U&'\88DD\5099\8ACB\8CFC\9032\884C\4E2D'::text as title,
        format(U&'%s \7B46\88DD\5099\8ACB\8CFC\5DF2\6838\51C6\6216\5F85\9818\53D6\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
        item_count,
        total_amount,
        'warning'::text as severity,
        case
          when latest_id is not null then format('/fees?tab=equipment&highlight_id=%s', latest_id)
          else '/fees?tab=equipment'::text
        end as link,
        coalesce(latest_created_at, now()) as created_at,
        2 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(request_amount), 0)::integer as total_amount,
          (array_agg(id::text order by created_at desc))[1] as latest_id,
          max(created_at) as latest_created_at
        from (
          select
            r.id,
            coalesce(r.ready_at, r.approved_at, r.updated_at, r.requested_at, r.created_at) as created_at,
            coalesce(sum(coalesce(ri.unit_price_snapshot, e.purchase_price, 0) * ri.quantity), 0)::integer as request_amount
          from public.equipment_purchase_requests r
          left join public.equipment_purchase_request_items ri on ri.request_id = r.id
          left join public.equipment e on e.id = ri.equipment_id
          where r.status in ('approved', 'ready_for_pickup')
          group by r.id, coalesce(r.ready_at, r.approved_at, r.updated_at, r.requested_at, r.created_at)
        ) requests
      ) active_requests

      union all

      select
        'monthly-unpaid'::text as id,
        'monthlyUnpaid'::text as kind,
        U&'\6821\968A\6708\8CBB\672A\4ED8\6B3E'::text as title,
        format(U&'%s \7B46\6821\968A\6708\8CBB\5728 %s \5C1A\672A\5B8C\6210\4ED8\6B3E\FF0C\5408\8A08 $%s\3002', item_count, v_monthly_period, total_amount) as body,
        item_count,
        total_amount,
        'warning'::text as severity,
        '/fees?tab=monthly'::text as link,
        coalesce(latest_created_at, now()) as created_at,
        2 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(case when mf.id is null then 0 else coalesce(mf.payable_amount, 0) end), 0)::integer as total_amount,
          max(coalesce(mf.updated_at, mf.created_at)) as latest_created_at
        from public.team_members_safe tm
        left join public.monthly_fees mf
          on mf.member_id = tm.id
         and mf.year_month = v_monthly_period
        where (
            public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'monthly'
            or (
              public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'none'
              and mf.id is not null
            )
          )
          and tm.status is distinct from U&'\9000\968A'
          and tm.status is distinct from U&'\505C\6B0A'
          and coalesce(tm.is_inactive_or_graduated, false) = false
          and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')
      ) monthly_unpaid

      union all

      select
        'quarterly-unpaid'::text as id,
        'quarterlyUnpaid'::text as kind,
        U&'\7403\54E1\5B63\8CBB\672A\4ED8\6B3E'::text as title,
        format(U&'%s \7B46\7403\54E1\5B63\8CBB\5728 %s \5C1A\672A\5B8C\6210\4ED8\6B3E\FF0C\5408\8A08 $%s\3002', item_count, v_quarterly_period, total_amount) as body,
        item_count,
        total_amount,
        'warning'::text as severity,
        '/fees?tab=quarterly'::text as link,
        coalesce(latest_created_at, now()) as created_at,
        2 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(case when qf.id is null then 0 else coalesce(qf.amount, 0) end), 0)::integer as total_amount,
          max(coalesce(qf.updated_at, qf.created_at)) as latest_created_at
        from public.team_members_safe tm
        left join lateral (
          select
            quarterly_fees.id,
            quarterly_fees.status,
            quarterly_fees.amount,
            quarterly_fees.created_at,
            quarterly_fees.updated_at
          from public.quarterly_fees
          where quarterly_fees.year_quarter = v_quarterly_period
            and (
              quarterly_fees.member_id = tm.id
              or tm.id = any(coalesce(quarterly_fees.member_ids, array[]::uuid[]))
            )
          order by coalesce(quarterly_fees.updated_at, quarterly_fees.created_at) desc
          limit 1
        ) qf on true
        where (
            public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
            or (
              public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'none'
              and qf.id is not null
            )
          )
          and tm.status is distinct from U&'\9000\968A'
          and tm.status is distinct from U&'\505C\6B0A'
          and coalesce(tm.is_inactive_or_graduated, false) = false
          and coalesce(qf.status, 'unpaid') not in ('paid', 'approved')
      ) quarterly_unpaid

      union all

      select
        'equipment-unpaid'::text as id,
        'equipmentUnpaid'::text as kind,
        U&'\88DD\5099\6B3E\9805\5F85\8FFD\8E64'::text as title,
        format(U&'\5C1A\672A\4ED8\6B3E\FF1A%s \7B46\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
        item_count,
        total_amount,
        'info'::text as severity,
        '/fees?tab=equipment&section=equipment-unpaid'::text as link,
        coalesce(latest_created_at, now()) as created_at,
        3 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(coalesce(t.unit_price, e.purchase_price, 0) * t.quantity), 0)::integer as total_amount,
          max(t.created_at) as latest_created_at
        from public.equipment_transactions t
        join public.equipment e on e.id = t.equipment_id
        left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
        left join public.equipment_purchase_requests r on r.id = ri.request_id
        where t.transaction_type = 'purchase'
          and coalesce(t.payment_status, 'unpaid') = 'unpaid'
          and (t.request_item_id is null or r.status = 'picked_up')
      ) equipment_unpaid
    ) all_items
    where item_count > 0
  ),
  summary as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'kind', kind,
            'title', title,
            'body', body,
            'count', item_count,
            'amount', total_amount,
            'severity', severity,
            'link', link,
            'created_at', created_at
          )
          order by severity_rank, created_at desc
        ),
        '[]'::jsonb
      ) as items,
      coalesce(sum(item_count), 0)::integer as total_count,
      coalesce(sum(total_amount), 0)::integer as total_amount
    from reminder_items
  )
  select jsonb_build_object(
    'items', summary.items,
    'total_count', summary.total_count,
    'total_amount', summary.total_amount,
    'generated_at', now(),
    'monthly_period', v_monthly_period,
    'quarterly_period', v_quarterly_period
  )
  into v_snapshot
  from summary;

  return coalesce(v_snapshot, jsonb_build_object(
    'items', '[]'::jsonb,
    'total_count', 0,
    'total_amount', 0,
    'generated_at', now(),
    'monthly_period', v_monthly_period,
    'quarterly_period', v_quarterly_period
  ));
end;
$$;

revoke all on function public.get_effective_payment_billing_mode(text, text) from public;
revoke all on function public.list_my_payment_members() from public;
revoke all on function public.get_my_payment_records(uuid) from public;
revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public;
revoke all on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer) from public;
revoke all on function public.create_my_quarterly_payment_submission(jsonb, text, text, date, text) from public;
revoke all on function public.sync_match_fee_items_for_match(uuid) from public;
revoke all on function public.get_my_home_snapshot(date) from public;
revoke all on function public.get_my_home_snapshot(date) from anon;
revoke all on function public.get_fee_management_reminders() from public;
revoke all on function public.get_fee_management_reminders() from anon;

grant execute on function public.get_effective_payment_billing_mode(text, text) to authenticated, service_role;
grant execute on function public.list_my_payment_members() to authenticated, service_role;
grant execute on function public.get_my_payment_records(uuid) to authenticated, service_role;
grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated, service_role;
grant execute on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer) to authenticated, service_role;
grant execute on function public.create_my_quarterly_payment_submission(jsonb, text, text, date, text) to authenticated, service_role;
grant execute on function public.sync_match_fee_items_for_match(uuid) to authenticated, service_role;
grant execute on function public.get_my_home_snapshot(date) to authenticated, service_role;
grant execute on function public.get_fee_management_reminders() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
