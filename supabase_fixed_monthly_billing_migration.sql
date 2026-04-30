begin;

alter table public.team_members
add column if not exists fee_billing_mode text;

update public.team_members
set fee_billing_mode = 'role_default'
where fee_billing_mode is null
   or fee_billing_mode not in ('role_default', 'monthly_fixed');

alter table public.team_members
alter column fee_billing_mode set default 'role_default',
alter column fee_billing_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_fee_billing_mode_check'
      and conrelid = 'public.team_members'::regclass
  ) then
    alter table public.team_members
    add constraint team_members_fee_billing_mode_check
    check (fee_billing_mode in ('role_default', 'monthly_fixed'));
  end if;
end $$;

comment on column public.team_members.fee_billing_mode
is 'Manual billing override. role_default follows member role; monthly_fixed keeps role 球員 but bills through monthly fees.';

alter table public.fee_settings
add column if not exists monthly_fixed_fee integer;

update public.fee_settings
set monthly_fixed_fee = 2000
where monthly_fixed_fee is null;

alter table public.fee_settings
alter column monthly_fixed_fee set default 2000,
alter column monthly_fixed_fee set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fee_settings_monthly_fixed_fee_check'
      and conrelid = 'public.fee_settings'::regclass
  ) then
    alter table public.fee_settings
    add constraint fee_settings_monthly_fixed_fee_check
    check (monthly_fixed_fee >= 0);
  end if;
end $$;

comment on column public.fee_settings.monthly_fixed_fee
is 'Fixed monthly fee amount for 球員 with fee_billing_mode = monthly_fixed.';

alter table public.monthly_fees
add column if not exists calculation_type text,
add column if not exists fixed_monthly_fee integer;

update public.monthly_fees
set calculation_type = 'per_session'
where calculation_type is null
   or calculation_type not in ('per_session', 'monthly_fixed');

alter table public.monthly_fees
alter column calculation_type set default 'per_session',
alter column calculation_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monthly_fees_calculation_type_check'
      and conrelid = 'public.monthly_fees'::regclass
  ) then
    alter table public.monthly_fees
    add constraint monthly_fees_calculation_type_check
    check (calculation_type in ('per_session', 'monthly_fixed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'monthly_fees_fixed_monthly_fee_check'
      and conrelid = 'public.monthly_fees'::regclass
  ) then
    alter table public.monthly_fees
    add constraint monthly_fees_fixed_monthly_fee_check
    check (fixed_monthly_fee is null or fixed_monthly_fee >= 0);
  end if;
end $$;

comment on column public.monthly_fees.calculation_type
is 'Monthly fee calculation snapshot: per_session for 校隊, monthly_fixed for 社區球員固定月繳.';

comment on column public.monthly_fees.fixed_monthly_fee
is 'Fixed monthly fee snapshot used when calculation_type = monthly_fixed.';

create or replace view public.team_members_safe
with (security_invoker = true)
as
select
  tm.id,
  tm.name,
  tm.role,
  tm.team_group,
  tm.status,
  tm.birth_date,
  tm.is_early_enrollment,
  tm.is_primary_payer,
  tm.is_half_price,
  tm.jersey_number,
  tm.jersey_name,
  tm.jersey_size,
  tm.low_income_qualification,
  tm.sibling_ids,
  tm.sibling_id,
  tm.throwing_hand,
  tm.batting_hand,
  tm.contact_relation,
  tm.guardian_name,
  tm.portrait_auth,
  tm.notes,
  tm.avatar_url,
  tm.created_at,
  tm.is_inactive_or_graduated,
  tm.fee_billing_mode
from public.team_members tm;

grant select on public.team_members_safe to anon, authenticated, service_role;

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
    when p_role = '校隊' then 'monthly'
    when p_role = '球員' and coalesce(p_fee_billing_mode, 'role_default') = 'monthly_fixed' then 'monthly'
    when p_role = '球員' then 'quarterly'
    else null
  end;
$$;

drop function if exists public.get_monthly_fee_calculation_type(text, text);

create or replace function public.get_monthly_fee_calculation_type(
  p_role text,
  p_fee_billing_mode text default 'role_default'
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_role = '球員' and coalesce(p_fee_billing_mode, 'role_default') = 'monthly_fixed' then 'monthly_fixed'
    else 'per_session'
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
    public.get_effective_payment_billing_mode(team_members.role::text, team_members.fee_billing_mode::text) as billing_mode,
    team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) as is_linked,
    public.get_player_balance_unchecked(team_members.id) as balance_amount
  from public.profiles
  join public.team_members
    on (
      team_members.role in ('校隊', '球員')
      and (
        team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        or public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
      )
    )
  where profiles.id = v_user_id
  order by
    case when team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) then 0 else 1 end,
    case when team_members.role = '校隊' then 0 when team_members.fee_billing_mode = 'monthly_fixed' then 1 else 2 end,
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
  v_billing_mode text;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select public.get_effective_payment_billing_mode(team_members.role::text, team_members.fee_billing_mode::text)
  into v_billing_mode
  from public.profiles
  join public.team_members
    on team_members.id = p_member_id
  where profiles.id = v_user_id
    and (
      public.has_app_permission('fees', 'VIEW')
      or public.has_app_permission('fees', 'EDIT')
      or p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
    );

  if v_billing_mode is null then
    raise exception 'member is not viewable by current profile or has unsupported role';
  end if;

  if v_billing_mode = 'monthly' then
    return query
    select
      monthly_fees.member_id,
      team_members.name::text,
      'monthly'::text,
      monthly_fees.year_month::text,
      monthly_fees.year_month::text,
      coalesce(monthly_fees.payable_amount, 0),
      coalesce(monthly_fees.balance_amount, 0),
      greatest(coalesce(monthly_fees.payable_amount, 0) - coalesce(monthly_fees.balance_amount, 0), 0),
      coalesce(monthly_fees.status, 'unpaid')::text,
      monthly_fees.payment_method::text,
      monthly_fees.account_last_5::text,
      monthly_fees.remittance_date,
      monthly_fees.updated_at
    from public.monthly_fees
    join public.team_members
      on team_members.id = monthly_fees.member_id
    where monthly_fees.member_id = p_member_id
    order by monthly_fees.year_month desc, monthly_fees.updated_at desc;

    return;
  end if;

  if v_billing_mode = 'quarterly' then
    return query
    select
      p_member_id,
      team_members.name::text,
      'quarterly'::text,
      quarterly_fees.year_quarter::text,
      quarterly_fees.year_quarter::text,
      coalesce(quarterly_fees.amount, 0),
      coalesce(quarterly_fees.balance_amount, 0),
      greatest(coalesce(quarterly_fees.amount, 0) - coalesce(quarterly_fees.balance_amount, 0), 0),
      coalesce(quarterly_fees.status, 'pending_review')::text,
      quarterly_fees.payment_method::text,
      quarterly_fees.account_last_5::text,
      quarterly_fees.remittance_date,
      quarterly_fees.updated_at
    from public.quarterly_fees
    join public.team_members
      on team_members.id = p_member_id
    where quarterly_fees.member_id = p_member_id
      or p_member_id = any(coalesce(quarterly_fees.member_ids, array[]::uuid[]))
    order by quarterly_fees.year_quarter desc, quarterly_fees.updated_at desc;

    return;
  end if;
end;
$$;

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
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

  select public.get_effective_payment_billing_mode(team_members.role::text, team_members.fee_billing_mode::text)
  into v_billing_mode
  from public.profiles
  join public.team_members
    on team_members.id = p_member_id
  where profiles.id = v_user_id
    and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]));

  if v_billing_mode is null then
    raise exception 'member not linked to current profile or unsupported member role';
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
    v_payment_method := coalesce(v_payment_method, '餘額扣款');
  elsif v_payment_method is null then
    raise exception 'payment_method is required';
  end if;

  v_requires_account_last_5 := v_external_amount > 0
    and v_payment_method in ('銀行轉帳', '郵局', '郵局無摺', 'ATM存款');

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
  returning *
  into v_submission;

  return query
  select *
  from public.list_my_payment_submissions(v_submission.member_id) submissions
  where submissions.id = v_submission.id;
end;
$$;

create or replace function public.review_profile_payment_submission(
  p_submission_id uuid,
  p_status text,
  p_overpayment_amount integer default 0
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
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.profile_payment_submissions%rowtype;
  v_overpayment_amount integer := greatest(coalesce(p_overpayment_amount, 0), 0);
  v_quarterly_fee_id uuid;
  v_monthly_calculation_type text := 'per_session';
  v_fixed_monthly_fee integer := null;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'unsupported review status';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  select *
  into v_submission
  from public.profile_payment_submissions
  where profile_payment_submissions.id = p_submission_id
    and profile_payment_submissions.status = 'pending_review'
  for update;

  if not found then
    raise exception 'submission not found or already reviewed';
  end if;

  if p_status = 'approved' then
    select
      public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text),
      case
        when public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text) = 'monthly_fixed'
          then coalesce(fs.monthly_fixed_fee, 2000)
        else null
      end
    into v_monthly_calculation_type, v_fixed_monthly_fee
    from public.team_members tm
    left join public.fee_settings fs
      on fs.member_id = tm.id
    where tm.id = v_submission.member_id
    for update of tm;

    if not found then
      raise exception 'member not found';
    end if;

    if coalesce(v_submission.balance_amount, 0) > public.get_player_balance_unchecked(v_submission.member_id) then
      raise exception 'player balance is not enough';
    end if;

    if coalesce(v_submission.balance_amount, 0) > 0 then
      insert into public.player_balance_transactions (
        member_id,
        delta,
        reason,
        source,
        related_profile_payment_submission_id,
        idempotency_key,
        created_by
      )
      values (
        v_submission.member_id,
        -v_submission.balance_amount,
        format('繳費扣抵 %s', v_submission.period_key),
        'payment_deduction',
        v_submission.id,
        format('profile_payment:%s:balance', v_submission.id),
        v_user_id
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if v_overpayment_amount > 0 then
      insert into public.player_balance_transactions (
        member_id,
        delta,
        reason,
        source,
        related_profile_payment_submission_id,
        idempotency_key,
        created_by
      )
      values (
        v_submission.member_id,
        v_overpayment_amount,
        format('繳費溢繳轉入 %s', v_submission.period_key),
        'overpayment',
        v_submission.id,
        format('profile_payment:%s:overpayment', v_submission.id),
        v_user_id
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if v_submission.billing_mode = 'monthly' then
      insert into public.monthly_fees (
        member_id,
        year_month,
        payable_amount,
        deduction_amount,
        calculation_type,
        fixed_monthly_fee,
        status,
        paid_at,
        payment_method,
        account_last_5,
        remittance_date,
        balance_amount,
        updated_at
      )
      values (
        v_submission.member_id,
        v_submission.period_key,
        v_submission.amount,
        0,
        v_monthly_calculation_type,
        v_fixed_monthly_fee,
        'paid',
        now(),
        v_submission.payment_method,
        v_submission.account_last_5,
        v_submission.remittance_date,
        coalesce(v_submission.balance_amount, 0),
        now()
      )
      on conflict (member_id, year_month) do update
      set
        payable_amount = excluded.payable_amount,
        calculation_type = excluded.calculation_type,
        fixed_monthly_fee = excluded.fixed_monthly_fee,
        status = 'paid',
        paid_at = excluded.paid_at,
        payment_method = excluded.payment_method,
        account_last_5 = excluded.account_last_5,
        remittance_date = excluded.remittance_date,
        balance_amount = excluded.balance_amount,
        updated_at = excluded.updated_at;
    elsif v_submission.billing_mode = 'quarterly' then
      select qf.id
      into v_quarterly_fee_id
      from public.quarterly_fees qf
      where qf.year_quarter = v_submission.period_key
        and (
          qf.member_id = v_submission.member_id
          or v_submission.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
        )
      order by coalesce(qf.updated_at, qf.created_at) desc nulls last
      limit 1;

      if v_quarterly_fee_id is not null then
        update public.quarterly_fees
        set
          amount = v_submission.amount,
          payment_method = v_submission.payment_method,
          account_last_5 = v_submission.account_last_5,
          remittance_date = v_submission.remittance_date,
          balance_amount = coalesce(v_submission.balance_amount, 0),
          status = 'paid',
          paid_at = now(),
          updated_at = now()
        where quarterly_fees.id = v_quarterly_fee_id;
      else
        insert into public.quarterly_fees (
          member_id,
          member_ids,
          year_quarter,
          amount_type,
          amount,
          payment_method,
          account_last_5,
          remittance_date,
          payment_items,
          balance_amount,
          status,
          paid_at,
          updated_at
        )
        values (
          v_submission.member_id,
          array[v_submission.member_id],
          v_submission.period_key,
          'other',
          v_submission.amount,
          v_submission.payment_method,
          v_submission.account_last_5,
          v_submission.remittance_date,
          '["自助繳費"]'::jsonb,
          coalesce(v_submission.balance_amount, 0),
          'paid',
          now(),
          now()
        );
      end if;
    end if;
  end if;

  update public.profile_payment_submissions
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where profile_payment_submissions.id = p_submission_id;

  return query
  select *
  from public.list_my_payment_submissions(v_submission.member_id) submissions
  where submissions.id = p_submission_id;
end;
$$;

drop function if exists public.get_my_payment_submission_estimate(uuid, text);

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
stored_monthly_total as (
  select
    case
      when count(distinct monthly_fees.total_sessions) = 1 then max(monthly_fees.total_sessions)
      else 4
    end as total_sessions
  from normalized_input
  left join public.monthly_fees
    on monthly_fees.year_month = normalized_input.period_key
),
monthly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    normalized_input.period_key,
    coalesce(monthly_fees.calculation_type, linked_member.calculation_type) as calculation_type,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed'
        then coalesce(monthly_fees.fixed_monthly_fee, linked_member.monthly_fixed_fee, 2000)
      else null
    end as fixed_monthly_fee,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      else coalesce(monthly_fees.total_sessions, stored_monthly_total.total_sessions, 4)
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
  cross join normalized_input
  cross join stored_monthly_total
  left join public.monthly_fees
    on monthly_fees.member_id = linked_member.member_id
   and monthly_fees.year_month = normalized_input.period_key
  left join lateral (
    select
      coalesce(count(distinct leave_day::date), 0)::integer as leave_sessions
    from public.leave_requests
    cross join lateral generate_series(
      greatest(
        leave_requests.start_date,
        to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD')
      ),
      least(
        leave_requests.end_date,
        (to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
      ),
      interval '1 day'
    ) as leave_day
    where leave_requests.user_id = linked_member.member_id
      and leave_requests.start_date <= (to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
      and leave_requests.end_date >= to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD')
  ) as leave_stats on normalized_input.period_key ~ '^[0-9]{4}-[0-9]{2}$'
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
    and normalized_input.period_key ~ '^[0-9]{4}-[0-9]{2}$'
),
quarterly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    normalized_input.period_key,
    coalesce(quarterly_fee.amount, 0) as amount
  from linked_member
  cross join normalized_input
  left join lateral (
    select quarterly_fees.amount
    from public.quarterly_fees
    where (
      quarterly_fees.member_id = linked_member.member_id
      or linked_member.member_id = any(coalesce(quarterly_fees.member_ids, array[]::uuid[]))
    )
      and quarterly_fees.year_quarter = normalized_input.period_key
    order by quarterly_fees.updated_at desc nulls last, quarterly_fees.created_at desc nulls last
    limit 1
  ) as quarterly_fee on true
  where linked_member.billing_mode = 'quarterly'
    and normalized_input.period_key ~ '^[0-9]{4}-Q[1-4]$'
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

create or replace function public.get_my_home_snapshot(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := coalesce(p_today, current_date);
  v_linked_ids uuid[] := '{}'::uuid[];
  v_members jsonb := '[]'::jsonb;
  v_next_event jsonb := null;
  v_today_leaves jsonb := '[]'::jsonb;
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
        m.match_date::text as date,
        nullif(m.match_time, '')::text as time,
        nullif(m.location, '')::text as location,
        nullif(m.opponent, '')::text as opponent,
        nullif(m.category_group, '')::text as category_group,
        nullif(m.match_level, '')::text as match_level,
        nullif(m.coaches, '')::text as coaches,
        nullif(m.players, '')::text as players,
        format('/match-records?match_id=%s', m.id::text) as route
      from public.matches m
      where m.match_date >= v_today

      union all

      select
        ae.id,
        'attendance'::text as type,
        coalesce(nullif(ae.title, ''), '球隊活動')::text as title,
        ae.date::date as event_date,
        ae.date::text as date,
        null::text as time,
        null::text as location,
        null::text as opponent,
        null::text as category_group,
        nullif(ae.event_type, '')::text as match_level,
        null::text as coaches,
        null::text as players,
        '/calendar'::text as route
      from public.attendance_events ae
      where ae.date >= v_today
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
    order by event_date asc, coalesce(time, '23:59') asc
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
      and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'monthly'
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
        and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
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
        '個人付款待確認'::text as title,
        format('%s 筆個人付款回報等待確認，合計 $%s。', item_count, total_amount) as body,
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
        '裝備付款待確認'::text as title,
        format('%s 筆裝備付款回報等待確認，合計 $%s。', item_count, total_amount) as body,
        item_count,
        total_amount,
        'urgent'::text as severity,
        case
          when latest_id is not null then format('/fees?tab=equipment&highlight_submission_id=%s', latest_id)
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
        '裝備請購待審核'::text as title,
        format('%s 筆裝備加購申請等待審核，預估合計 $%s。', item_count, total_amount) as body,
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
        '裝備請購處理中'::text as title,
        format('%s 筆裝備加購已核准或可領取，預估合計 $%s。', item_count, total_amount) as body,
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
        '月費待追蹤'::text as title,
        format('%s 位月繳成員在 %s 尚未標記已繳，已建檔金額合計 $%s。', item_count, v_monthly_period, total_amount) as body,
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
        where public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'monthly'
          and tm.status is distinct from '退隊'
          and tm.status is distinct from '離隊'
          and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')
      ) monthly_unpaid

      union all

      select
        'quarterly-unpaid'::text as id,
        'quarterlyUnpaid'::text as kind,
        '球員季費待追蹤'::text as title,
        format('%s 位球員在 %s 尚未標記已繳，已建檔金額合計 $%s。', item_count, v_quarterly_period, total_amount) as body,
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
        where public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
          and tm.status is distinct from '退隊'
          and tm.status is distinct from '離隊'
          and coalesce(qf.status, 'unpaid') not in ('paid', 'approved')
      ) quarterly_unpaid

      union all

      select
        'equipment-unpaid'::text as id,
        'equipmentUnpaid'::text as kind,
        '裝備款項待追蹤'::text as title,
        format('%s 筆已領取裝備尚未付款，合計 $%s。', item_count, total_amount) as body,
        item_count,
        total_amount,
        'info'::text as severity,
        case
          when latest_request_id is not null then format('/fees?tab=equipment&highlight_id=%s', latest_request_id)
          else '/fees?tab=equipment'::text
        end as link,
        coalesce(latest_created_at, now()) as created_at,
        3 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(coalesce(t.unit_price, e.purchase_price, 0) * t.quantity), 0)::integer as total_amount,
          (array_agg(r.id::text order by t.created_at desc) filter (where r.id is not null))[1] as latest_request_id,
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
revoke all on function public.get_monthly_fee_calculation_type(text, text) from public;
revoke all on function public.list_my_payment_members() from public;
revoke all on function public.get_my_payment_records(uuid) from public;
revoke all on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer) from public;
revoke all on function public.review_profile_payment_submission(uuid, text, integer) from public;
revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public;
revoke all on function public.get_my_home_snapshot(date) from public;
revoke all on function public.get_fee_management_reminders() from public;

grant execute on function public.get_effective_payment_billing_mode(text, text) to authenticated, service_role;
grant execute on function public.get_monthly_fee_calculation_type(text, text) to authenticated, service_role;
grant execute on function public.list_my_payment_members() to authenticated, service_role;
grant execute on function public.get_my_payment_records(uuid) to authenticated, service_role;
grant execute on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer) to authenticated, service_role;
grant execute on function public.review_profile_payment_submission(uuid, text, integer) to authenticated, service_role;
grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated, service_role;
grant execute on function public.get_my_home_snapshot(date) to authenticated, service_role;
grant execute on function public.get_fee_management_reminders() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
