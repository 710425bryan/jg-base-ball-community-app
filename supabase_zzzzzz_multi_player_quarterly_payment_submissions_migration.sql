begin;

create table if not exists public.profile_payment_submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.profile_payment_submissions(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete restrict,
  period_key text not null check (period_key ~ '^[0-9]{4}-Q[1-4]$'),
  amount integer not null check (amount > 0),
  balance_amount integer not null default 0 check (balance_amount >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_payment_submission_items_balance_check check (balance_amount <= amount),
  constraint profile_payment_submission_items_unique unique (submission_id, member_id, period_key)
);

create index if not exists profile_payment_submission_items_submission_id_idx
  on public.profile_payment_submission_items (submission_id);

create index if not exists profile_payment_submission_items_member_period_idx
  on public.profile_payment_submission_items (member_id, period_key);

alter table public.profile_payment_submission_items enable row level security;

drop policy if exists "profile_payment_submission_items_select_allowed" on public.profile_payment_submission_items;
create policy "profile_payment_submission_items_select_allowed"
  on public.profile_payment_submission_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profile_payment_submissions s
      where s.id = profile_payment_submission_items.submission_id
        and (
          s.profile_id = (select auth.uid())
          or public.has_app_permission('fees', 'VIEW')
          or public.has_app_permission('fees', 'EDIT')
        )
    )
  );

drop policy if exists "profile_payment_submission_items_insert_allowed" on public.profile_payment_submission_items;
create policy "profile_payment_submission_items_insert_allowed"
  on public.profile_payment_submission_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profile_payment_submissions s
      where s.id = profile_payment_submission_items.submission_id
        and (
          s.profile_id = (select auth.uid())
          or public.has_app_permission('fees', 'CREATE')
          or public.has_app_permission('fees', 'EDIT')
        )
    )
  );

drop policy if exists "profile_payment_submission_items_update_fees_edit" on public.profile_payment_submission_items;
create policy "profile_payment_submission_items_update_fees_edit"
  on public.profile_payment_submission_items
  for update
  to authenticated
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "profile_payment_submission_items_delete_fees_delete" on public.profile_payment_submission_items;
create policy "profile_payment_submission_items_delete_fees_delete"
  on public.profile_payment_submission_items
  for delete
  to authenticated
  using (public.has_app_permission('fees', 'DELETE'));

grant select, insert, update, delete on public.profile_payment_submission_items to authenticated, service_role;

drop function if exists public.list_my_payment_submissions(uuid);

create or replace function public.list_my_payment_submissions(
  p_member_id uuid default null
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
stable
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
    from public.profiles
    where profiles.id = v_user_id
      and (
        public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
        or p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      )
  ) then
    raise exception 'member is not viewable by current profile';
  end if;

  return query
  select
    s.id,
    s.member_id,
    case
      when jsonb_array_length(coalesce(item_summary.items, '[]'::jsonb)) > 0
        then coalesce(item_summary.member_names, tm.name::text)
      else tm.name::text
    end as member_name,
    s.billing_mode::text,
    s.period_key::text,
    s.period_key::text,
    s.amount,
    coalesce(s.balance_amount, 0),
    greatest(s.amount - coalesce(s.balance_amount, 0), 0),
    s.payment_method::text,
    s.account_last_5::text,
    s.remittance_date,
    s.note::text,
    s.status::text,
    s.created_at,
    s.updated_at,
    coalesce(item_summary.items, '[]'::jsonb)
  from public.profile_payment_submissions s
  join public.team_members tm on tm.id = s.member_id
  left join lateral (
    select
      string_agg(item_member.name::text, ', ' order by item_member.name) as member_names,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', si.id,
            'submission_id', si.submission_id,
            'member_id', si.member_id,
            'member_name', item_member.name,
            'period_key', si.period_key,
            'amount', si.amount,
            'balance_amount', coalesce(si.balance_amount, 0),
            'external_amount', greatest(si.amount - coalesce(si.balance_amount, 0), 0)
          )
          order by item_member.name, si.created_at
        ),
        '[]'::jsonb
      ) as items
    from public.profile_payment_submission_items si
    join public.team_members item_member on item_member.id = si.member_id
    where si.submission_id = s.id
  ) item_summary on true
  where
    (
      p_member_id is null
      and s.profile_id = v_user_id
    )
    or (
      p_member_id is not null
      and (
        s.member_id = p_member_id
        or exists (
          select 1
          from public.profile_payment_submission_items si
          where si.submission_id = s.id
            and si.member_id = p_member_id
        )
      )
      and (
        s.profile_id = v_user_id
        or public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
      )
    )
  order by s.created_at desc;
end;
$$;

create or replace function public.list_profile_payment_submissions()
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
stable
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
  select
    s.id,
    s.member_id,
    case
      when jsonb_array_length(coalesce(item_summary.items, '[]'::jsonb)) > 0
        then coalesce(item_summary.member_names, tm.name::text)
      else tm.name::text
    end as member_name,
    s.billing_mode::text,
    s.period_key::text,
    s.period_key::text,
    s.amount,
    coalesce(s.balance_amount, 0),
    greatest(s.amount - coalesce(s.balance_amount, 0), 0),
    s.payment_method::text,
    s.account_last_5::text,
    s.remittance_date,
    s.note::text,
    s.status::text,
    s.created_at,
    s.updated_at,
    coalesce(item_summary.items, '[]'::jsonb)
  from public.profile_payment_submissions s
  join public.team_members tm on tm.id = s.member_id
  left join lateral (
    select
      string_agg(item_member.name::text, ', ' order by item_member.name) as member_names,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', si.id,
            'submission_id', si.submission_id,
            'member_id', si.member_id,
            'member_name', item_member.name,
            'period_key', si.period_key,
            'amount', si.amount,
            'balance_amount', coalesce(si.balance_amount, 0),
            'external_amount', greatest(si.amount - coalesce(si.balance_amount, 0), 0)
          )
          order by item_member.name, si.created_at
        ),
        '[]'::jsonb
      ) as items
    from public.profile_payment_submission_items si
    join public.team_members item_member on item_member.id = si.member_id
    where si.submission_id = s.id
  ) item_summary on true
  order by s.created_at desc;
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
  join public.team_members on team_members.id = p_member_id
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

drop function if exists public.review_profile_payment_submission(uuid, text);
drop function if exists public.review_profile_payment_submission(uuid, text, integer);

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
  updated_at timestamptz,
  items jsonb
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
  v_item_count integer := 0;
  v_item record;
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

  select count(*)
  into v_item_count
  from public.profile_payment_submission_items
  where submission_id = p_submission_id;

  if v_item_count > 0 and v_submission.billing_mode <> 'quarterly' then
    raise exception 'profile payment submission items are only supported for quarterly payments';
  end if;

  if v_item_count > 0 and v_overpayment_amount > 0 then
    raise exception 'grouped quarterly submissions do not support a single overpayment amount';
  end if;

  if p_status = 'approved' then
    if v_item_count > 0 then
      for v_item in
        select
          si.member_id,
          si.period_key,
          si.amount,
          coalesce(si.balance_amount, 0) as balance_amount
        from public.profile_payment_submission_items si
        where si.submission_id = p_submission_id
        order by si.created_at, si.member_id
      loop
        perform 1
        from public.team_members tm
        where tm.id = v_item.member_id
        for update;

        if v_item.balance_amount > public.get_player_balance_unchecked(v_item.member_id) then
          raise exception 'player balance is not enough';
        end if;

        if v_item.balance_amount > 0 then
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
            v_item.member_id,
            -v_item.balance_amount,
            format('Quarterly payment deduction %s', v_item.period_key),
            'payment_deduction',
            v_submission.id,
            format('profile_payment:%s:%s:balance', v_submission.id, v_item.member_id),
            v_user_id
          )
          on conflict (idempotency_key) do nothing;
        end if;

        select qf.id
        into v_quarterly_fee_id
        from public.quarterly_fees qf
        where qf.year_quarter = v_item.period_key
          and (
            qf.member_id = v_item.member_id
            or v_item.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
          )
        order by
          case
            when qf.member_id = v_item.member_id and cardinality(coalesce(qf.member_ids, array[]::uuid[])) <= 1 then 0
            else 1
          end,
          coalesce(qf.updated_at, qf.created_at) desc nulls last
        limit 1
        for update;

        if v_quarterly_fee_id is not null then
          update public.quarterly_fees
          set
            member_id = v_item.member_id,
            member_ids = array[v_item.member_id],
            amount = v_item.amount,
            payment_method = v_submission.payment_method,
            account_last_5 = v_submission.account_last_5,
            remittance_date = v_submission.remittance_date,
            payment_items = '["profile_payment_submission"]'::jsonb,
            balance_amount = v_item.balance_amount,
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
            v_item.member_id,
            array[v_item.member_id],
            v_item.period_key,
            'other',
            v_item.amount,
            v_submission.payment_method,
            v_submission.account_last_5,
            v_submission.remittance_date,
            '["profile_payment_submission"]'::jsonb,
            v_item.balance_amount,
            'paid',
            now(),
            now()
          );
        end if;
      end loop;
    else
      select
        public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text),
        case
          when public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text) = 'monthly_fixed'
            then coalesce(fs.monthly_fixed_fee, 2000)
          else null
        end
      into v_monthly_calculation_type, v_fixed_monthly_fee
      from public.team_members tm
      left join public.fee_settings fs on fs.member_id = tm.id
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
          format('Payment deduction %s', v_submission.period_key),
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
          format('Payment overpayment %s', v_submission.period_key),
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
        limit 1
        for update;

        if v_quarterly_fee_id is not null then
          update public.quarterly_fees
          set
            member_id = v_submission.member_id,
            member_ids = array[v_submission.member_id],
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
            '["profile_payment_submission"]'::jsonb,
            coalesce(v_submission.balance_amount, 0),
            'paid',
            now(),
            now()
          );
        end if;
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

revoke all on function public.list_my_payment_submissions(uuid) from public;
revoke all on function public.list_profile_payment_submissions() from public;
revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public;
revoke all on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer) from public;
revoke all on function public.create_my_quarterly_payment_submission(jsonb, text, text, date, text) from public;
revoke all on function public.review_profile_payment_submission(uuid, text, integer) from public;

grant execute on function public.list_my_payment_submissions(uuid) to authenticated, service_role;
grant execute on function public.list_profile_payment_submissions() to authenticated, service_role;
grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated, service_role;
grant execute on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer) to authenticated, service_role;
grant execute on function public.create_my_quarterly_payment_submission(jsonb, text, text, date, text) to authenticated, service_role;
grant execute on function public.review_profile_payment_submission(uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
