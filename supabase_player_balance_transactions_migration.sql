begin;

create table if not exists public.player_balance_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  delta integer not null,
  reason text,
  source text not null default 'manual_adjustment',
  related_profile_payment_submission_id uuid references public.profile_payment_submissions(id) on delete set null,
  related_equipment_payment_submission_id uuid references public.equipment_payment_submissions(id) on delete set null,
  idempotency_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint player_balance_transactions_delta_check check (delta <> 0),
  constraint player_balance_transactions_source_check check (
    source in ('manual_adjustment', 'payment_deduction', 'overpayment')
  ),
  constraint player_balance_transactions_idempotency_key_key unique (idempotency_key)
);

alter table public.profile_payment_submissions
  add column if not exists balance_amount integer not null default 0 check (balance_amount >= 0);

alter table public.equipment_payment_submissions
  add column if not exists balance_amount integer not null default 0 check (balance_amount >= 0);

alter table public.monthly_fees
  add column if not exists payment_method text,
  add column if not exists account_last_5 text,
  add column if not exists remittance_date date,
  add column if not exists balance_amount integer not null default 0 check (balance_amount >= 0);

alter table public.quarterly_fees
  add column if not exists member_ids uuid[] default '{}'::uuid[],
  add column if not exists payment_items jsonb default '[]'::jsonb,
  add column if not exists other_item_note text,
  add column if not exists balance_amount integer not null default 0 check (balance_amount >= 0);

create index if not exists player_balance_transactions_member_created_idx
  on public.player_balance_transactions (member_id, created_at desc);

create index if not exists player_balance_transactions_profile_submission_idx
  on public.player_balance_transactions (related_profile_payment_submission_id)
  where related_profile_payment_submission_id is not null;

create index if not exists player_balance_transactions_equipment_submission_idx
  on public.player_balance_transactions (related_equipment_payment_submission_id)
  where related_equipment_payment_submission_id is not null;

alter table public.player_balance_transactions enable row level security;

drop policy if exists "player_balance_transactions_select_allowed" on public.player_balance_transactions;
create policy "player_balance_transactions_select_allowed"
  on public.player_balance_transactions
  for select
  using (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and player_balance_transactions.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    )
  );

drop policy if exists "player_balance_transactions_insert_fees_edit" on public.player_balance_transactions;
create policy "player_balance_transactions_insert_fees_edit"
  on public.player_balance_transactions
  for insert
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "player_balance_transactions_update_none" on public.player_balance_transactions;
create policy "player_balance_transactions_update_none"
  on public.player_balance_transactions
  for update
  using (false)
  with check (false);

drop policy if exists "player_balance_transactions_delete_fees_delete" on public.player_balance_transactions;
create policy "player_balance_transactions_delete_fees_delete"
  on public.player_balance_transactions
  for delete
  using (public.has_app_permission('fees', 'DELETE'));

create or replace function public.get_player_balance_unchecked(p_member_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(pbt.delta), 0)::integer
  from public.player_balance_transactions pbt
  where pbt.member_id = p_member_id;
$$;

create or replace function public.can_view_player_balance(p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.has_app_permission('fees', 'VIEW'), false)
    or coalesce(public.has_app_permission('fees', 'EDIT'), false)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p_member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    );
$$;

create or replace function public.get_player_balance(p_member_id uuid)
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not public.can_view_player_balance(p_member_id) then
    raise exception 'member balance is not viewable by current profile';
  end if;

  return public.get_player_balance_unchecked(p_member_id);
end;
$$;

create or replace function public.list_player_balances()
returns table (
  member_id uuid,
  member_name text,
  role text,
  balance_amount integer,
  is_linked boolean
)
language sql
security definer
stable
set search_path = public
as $$
  with current_profile as (
    select
      p.id,
      coalesce(p.linked_team_member_ids, array[]::uuid[]) as linked_member_ids,
      (
        public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
      ) as can_view_fees
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    tm.id,
    tm.name::text,
    tm.role::text,
    public.get_player_balance_unchecked(tm.id),
    tm.id = any(cp.linked_member_ids) as is_linked
  from current_profile cp
  join public.team_members tm
    on tm.role in ('校隊', '球員')
   and coalesce(tm.status, '') <> '退隊'
   and (
     cp.can_view_fees
     or tm.id = any(cp.linked_member_ids)
   )
  order by
    case when tm.id = any(cp.linked_member_ids) then 0 else 1 end,
    case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
    tm.name asc;
$$;

create or replace function public.list_player_balance_transactions(p_member_id uuid default null)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  delta integer,
  balance_after integer,
  reason text,
  source text,
  related_profile_payment_submission_id uuid,
  related_equipment_payment_submission_id uuid,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
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

  if p_member_id is not null and not public.can_view_player_balance(p_member_id) then
    raise exception 'member is not viewable by current profile';
  end if;

  return query
  with accessible_members as (
    select balances.member_id
    from public.list_player_balances() balances
    where p_member_id is null or balances.member_id = p_member_id
  ),
  running_transactions as (
    select
      pbt.id,
      pbt.member_id,
      tm.name::text as member_name,
      pbt.delta,
      sum(pbt.delta) over (
        partition by pbt.member_id
        order by pbt.created_at asc, pbt.id asc
        rows between unbounded preceding and current row
      )::integer as balance_after,
      pbt.reason::text,
      pbt.source::text,
      pbt.related_profile_payment_submission_id,
      pbt.related_equipment_payment_submission_id,
      pbt.created_by,
      coalesce(p.nickname, p.name)::text as created_by_name,
      pbt.created_at
    from public.player_balance_transactions pbt
    join accessible_members am on am.member_id = pbt.member_id
    join public.team_members tm on tm.id = pbt.member_id
    left join public.profiles p on p.id = pbt.created_by
  )
  select *
  from running_transactions
  order by created_at desc, id desc;
end;
$$;

create or replace function public.adjust_player_balance(
  p_member_id uuid,
  p_delta integer,
  p_reason text default null
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  delta integer,
  balance_after integer,
  reason text,
  source text,
  related_profile_payment_submission_id uuid,
  related_equipment_payment_submission_id uuid,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  if coalesce(p_delta, 0) = 0 then
    raise exception 'delta must not be 0';
  end if;

  perform 1
  from public.team_members tm
  where tm.id = p_member_id
    and tm.role in ('校隊', '球員')
  for update;

  if not found then
    raise exception 'member not found';
  end if;

  if public.get_player_balance_unchecked(p_member_id) + p_delta < 0 then
    raise exception 'player balance cannot be negative';
  end if;

  insert into public.player_balance_transactions (
    member_id,
    delta,
    reason,
    source,
    created_by
  )
  values (
    p_member_id,
    p_delta,
    nullif(btrim(p_reason), ''),
    'manual_adjustment',
    v_user_id
  )
  returning player_balance_transactions.id into v_transaction_id;

  return query
  select *
  from public.list_player_balance_transactions(p_member_id) transactions
  where transactions.id = v_transaction_id;
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
    case
      when team_members.role = '校隊' then 'monthly'
      when team_members.role = '球員' then 'quarterly'
      else null
    end::text as billing_mode,
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
    case when team_members.role = '校隊' then 0 else 1 end,
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
      and (
        public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
        or p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      )
  ) then
    raise exception 'member is not viewable by current profile';
  end if;

  if exists (
    select 1
    from public.team_members
    where team_members.id = p_member_id
      and team_members.role = '校隊'
  ) then
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

  if exists (
    select 1
    from public.team_members
    where team_members.id = p_member_id
      and team_members.role = '球員'
  ) then
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

  raise exception 'unsupported member role for payment records';
end;
$$;

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
    profile_payment_submissions.id,
    profile_payment_submissions.member_id,
    team_members.name::text,
    profile_payment_submissions.billing_mode::text,
    profile_payment_submissions.period_key::text,
    profile_payment_submissions.period_key::text,
    profile_payment_submissions.amount,
    coalesce(profile_payment_submissions.balance_amount, 0),
    greatest(profile_payment_submissions.amount - coalesce(profile_payment_submissions.balance_amount, 0), 0),
    profile_payment_submissions.payment_method::text,
    profile_payment_submissions.account_last_5::text,
    profile_payment_submissions.remittance_date,
    profile_payment_submissions.note::text,
    profile_payment_submissions.status::text,
    profile_payment_submissions.created_at,
    profile_payment_submissions.updated_at
  from public.profile_payment_submissions
  join public.team_members
    on team_members.id = profile_payment_submissions.member_id
  where
    (
      p_member_id is null
      and profile_payment_submissions.profile_id = v_user_id
    )
    or (
      p_member_id is not null
      and profile_payment_submissions.member_id = p_member_id
      and (
        profile_payment_submissions.profile_id = v_user_id
        or exists (
          select 1
          from public.profiles
          where profiles.id = v_user_id
            and (
              public.has_app_permission('fees', 'VIEW')
              or public.has_app_permission('fees', 'EDIT')
            )
        )
      )
    )
  order by profile_payment_submissions.created_at desc;
end;
$$;

drop function if exists public.create_my_payment_submission(uuid, text, integer, text, text, date, text);

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

  if not exists (
    select 1
    from public.profiles
    join public.team_members
      on team_members.id = p_member_id
    where profiles.id = v_user_id
      and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  if exists (
    select 1
    from public.profiles
    join public.team_members
      on team_members.id = p_member_id
    where profiles.id = v_user_id
      and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      and team_members.role = '校隊'
  ) then
    v_billing_mode := 'monthly';
    if v_period_key is null or v_period_key !~ '^[0-9]{4}-[0-9]{2}$' then
      raise exception 'monthly period_key must look like YYYY-MM';
    end if;
  elsif exists (
    select 1
    from public.profiles
    join public.team_members
      on team_members.id = p_member_id
    where profiles.id = v_user_id
      and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      and team_members.role = '球員'
  ) then
    v_billing_mode := 'quarterly';
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
    perform 1
    from public.team_members tm
    where tm.id = v_submission.member_id
    for update;

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

drop function if exists public.list_equipment_payment_submissions();

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
stable
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
    or public.has_app_permission('fees', 'EDIT')
    or public.has_app_permission('equipment', 'VIEW')
    or public.has_app_permission('equipment', 'EDIT')
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
          'quantity', t.quantity,
          'unit_price', coalesce(t.unit_price, e.purchase_price, 0),
          'total_amount', coalesce(t.unit_price, e.purchase_price, 0) * t.quantity,
          'payment_status', coalesce(t.payment_status, 'unpaid'),
          'payment_submission_id', t.payment_submission_id,
          'transaction_date', t.transaction_date,
          'request_status', r.status,
          'picked_up_at', r.picked_up_at
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

drop function if exists public.create_equipment_payment_submission(uuid[], text, text, date, text);

create or replace function public.create_equipment_payment_submission(
  p_transaction_ids uuid[],
  p_payment_method text,
  p_account_last_5 text default null,
  p_remittance_date date default null,
  p_note text default null,
  p_balance_amount integer default 0
)
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
  v_transaction_ids uuid[];
  v_count integer;
  v_member_count integer;
  v_member_id uuid;
  v_amount integer;
  v_balance_amount integer := greatest(coalesce(p_balance_amount, 0), 0);
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

  select array_agg(distinct transaction_id)
  into v_transaction_ids
  from unnest(coalesce(p_transaction_ids, array[]::uuid[])) as transaction_id;

  if v_transaction_ids is null or cardinality(v_transaction_ids) = 0 then
    raise exception 'transaction_ids is required';
  end if;

  select
    count(*),
    count(distinct t.member_id),
    (array_agg(t.member_id))[1],
    sum(coalesce(t.unit_price, e.purchase_price, 0) * t.quantity)
  into v_count, v_member_count, v_member_id, v_amount
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where t.id = any(v_transaction_ids)
    and t.transaction_type = 'purchase'
    and t.member_id is not null
    and coalesce(t.payment_status, 'unpaid') = 'unpaid'
    and t.payment_submission_id is null
    and (
      t.request_item_id is null
      or r.status in ('approved', 'ready_for_pickup', 'picked_up')
    );

  if v_count <> cardinality(v_transaction_ids) then
    raise exception 'some equipment transactions are not payable';
  end if;

  if v_member_count <> 1 or v_member_id is null then
    raise exception 'all transactions must belong to the same member';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  if v_balance_amount > v_amount then
    raise exception 'balance_amount cannot exceed amount';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and v_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  if v_balance_amount > public.get_player_balance_unchecked(v_member_id) then
    raise exception 'player balance is not enough';
  end if;

  v_external_amount := greatest(v_amount - v_balance_amount, 0);

  if v_external_amount = 0 then
    v_payment_method := coalesce(v_payment_method, '餘額扣款');
  elsif v_payment_method is null then
    raise exception 'payment_method is required';
  end if;

  v_requires_account_last_5 := v_external_amount > 0
    and v_payment_method in ('銀行轉帳', '郵局', '郵局無摺', 'ATM存款');

  if v_requires_account_last_5 and (v_account_last_5 is null or v_account_last_5 !~ '^[0-9]{5}$') then
    raise exception 'account_last_5 must be 5 digits for transfer payments';
  end if;

  if not v_requires_account_last_5 then
    v_account_last_5 := null;
  end if;

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
    v_user_id,
    v_member_id,
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
  returning equipment_payment_submissions.id into v_submission_id;

  insert into public.equipment_payment_submission_items (submission_id, transaction_id)
  select v_submission_id, transaction_id
  from unnest(v_transaction_ids) as transaction_id;

  update public.equipment_transactions
  set
    payment_status = 'pending_review',
    payment_submission_id = v_submission_id,
    updated_at = now()
  where equipment_transactions.id = any(v_transaction_ids);

  return query
  select *
  from public.list_equipment_payment_submissions() submissions
  where submissions.id = v_submission_id;
end;
$$;

drop function if exists public.review_equipment_payment_submission(uuid, text);

create or replace function public.review_equipment_payment_submission(
  p_submission_id uuid,
  p_status text,
  p_overpayment_amount integer default 0
)
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
  v_submission public.equipment_payment_submissions%rowtype;
  v_overpayment_amount integer := greatest(coalesce(p_overpayment_amount, 0), 0);
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'unsupported review status';
  end if;

  if not (
    public.has_app_permission('fees', 'EDIT')
    or public.has_app_permission('equipment', 'EDIT')
  ) then
    raise exception 'permission denied';
  end if;

  select *
  into v_submission
  from public.equipment_payment_submissions
  where equipment_payment_submissions.id = p_submission_id
    and equipment_payment_submissions.status = 'pending_review'
  for update;

  if not found then
    raise exception 'submission not found or already reviewed';
  end if;

  if p_status = 'approved' then
    perform 1
    from public.team_members tm
    where tm.id = v_submission.member_id
    for update;

    if coalesce(v_submission.balance_amount, 0) > public.get_player_balance_unchecked(v_submission.member_id) then
      raise exception 'player balance is not enough';
    end if;

    if coalesce(v_submission.balance_amount, 0) > 0 then
      insert into public.player_balance_transactions (
        member_id,
        delta,
        reason,
        source,
        related_equipment_payment_submission_id,
        idempotency_key,
        created_by
      )
      values (
        v_submission.member_id,
        -v_submission.balance_amount,
        '裝備付款扣抵',
        'payment_deduction',
        v_submission.id,
        format('equipment_payment:%s:balance', v_submission.id),
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
        related_equipment_payment_submission_id,
        idempotency_key,
        created_by
      )
      values (
        v_submission.member_id,
        v_overpayment_amount,
        '裝備付款溢繳轉入',
        'overpayment',
        v_submission.id,
        format('equipment_payment:%s:overpayment', v_submission.id),
        v_user_id
      )
      on conflict (idempotency_key) do nothing;
    end if;

    update public.equipment_transactions
    set
      payment_status = 'paid',
      paid_at = now(),
      paid_by = v_user_id,
      updated_at = now()
    where equipment_transactions.id in (
      select transaction_id
      from public.equipment_payment_submission_items
      where submission_id = p_submission_id
    );
  else
    update public.equipment_transactions
    set
      payment_status = 'unpaid',
      payment_submission_id = null,
      updated_at = now()
    where equipment_transactions.id in (
      select transaction_id
      from public.equipment_payment_submission_items
      where submission_id = p_submission_id
    );
  end if;

  update public.equipment_payment_submissions
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where equipment_payment_submissions.id = p_submission_id;

  return query
  select *
  from public.list_equipment_payment_submissions() submissions
  where submissions.id = p_submission_id;
end;
$$;

grant select, insert, delete on public.player_balance_transactions to authenticated, service_role;

revoke all on function public.get_player_balance_unchecked(uuid) from public;
revoke all on function public.get_player_balance(uuid) from public;
revoke all on function public.can_view_player_balance(uuid) from public;
revoke all on function public.list_player_balances() from public;
revoke all on function public.list_player_balance_transactions(uuid) from public;
revoke all on function public.adjust_player_balance(uuid, integer, text) from public;
revoke all on function public.list_my_payment_members() from public;
revoke all on function public.get_my_payment_records(uuid) from public;
revoke all on function public.list_my_payment_submissions(uuid) from public;
revoke all on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer) from public;
revoke all on function public.review_profile_payment_submission(uuid, text, integer) from public;
revoke all on function public.list_equipment_payment_submissions() from public;
revoke all on function public.create_equipment_payment_submission(uuid[], text, text, date, text, integer) from public;
revoke all on function public.review_equipment_payment_submission(uuid, text, integer) from public;

grant execute on function public.get_player_balance_unchecked(uuid) to service_role;
grant execute on function public.get_player_balance(uuid) to authenticated, service_role;
grant execute on function public.can_view_player_balance(uuid) to authenticated, service_role;
grant execute on function public.list_player_balances() to authenticated, service_role;
grant execute on function public.list_player_balance_transactions(uuid) to authenticated, service_role;
grant execute on function public.adjust_player_balance(uuid, integer, text) to authenticated, service_role;
grant execute on function public.list_my_payment_members() to authenticated, service_role;
grant execute on function public.get_my_payment_records(uuid) to authenticated, service_role;
grant execute on function public.list_my_payment_submissions(uuid) to authenticated, service_role;
grant execute on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text, integer) to authenticated, service_role;
grant execute on function public.review_profile_payment_submission(uuid, text, integer) to authenticated, service_role;
grant execute on function public.list_equipment_payment_submissions() to authenticated, service_role;
grant execute on function public.create_equipment_payment_submission(uuid[], text, text, date, text, integer) to authenticated, service_role;
grant execute on function public.review_equipment_payment_submission(uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
