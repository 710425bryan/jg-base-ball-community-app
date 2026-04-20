create table if not exists public.profile_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  billing_mode text not null check (billing_mode in ('monthly', 'quarterly')),
  period_key text not null,
  amount integer not null check (amount > 0),
  payment_method text not null,
  account_last_5 varchar(5),
  remittance_date date not null,
  note text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists profile_payment_submissions_profile_id_idx
  on public.profile_payment_submissions(profile_id, created_at desc);

create index if not exists profile_payment_submissions_member_id_idx
  on public.profile_payment_submissions(member_id, created_at desc);

create index if not exists profile_payment_submissions_status_idx
  on public.profile_payment_submissions(status, created_at desc);

alter table public.profile_payment_submissions enable row level security;

drop policy if exists "Enable profile payment submission select for own profile" on public.profile_payment_submissions;
create policy "Enable profile payment submission select for own profile"
  on public.profile_payment_submissions
  for select
  using (profile_id = auth.uid());

drop policy if exists "Enable profile payment submission insert for own profile" on public.profile_payment_submissions;
create policy "Enable profile payment submission insert for own profile"
  on public.profile_payment_submissions
  for insert
  with check (profile_id = auth.uid());

drop policy if exists "Enable profile payment submission admin management" on public.profile_payment_submissions;
create policy "Enable profile payment submission admin management"
  on public.profile_payment_submissions
  for all
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('ADMIN', 'MANAGER')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('ADMIN', 'MANAGER')
    )
  );

drop function if exists public.list_my_payment_members();

create or replace function public.list_my_payment_members()
returns table (
  member_id uuid,
  name text,
  role text,
  billing_mode text,
  is_linked boolean
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
    team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) as is_linked
  from public.profiles
  join public.team_members
    on (
      team_members.role in ('校隊', '球員')
      and (
        team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        or profiles.role = 'ADMIN'
      )
    )
  where profiles.id = v_user_id
  order by
    case when team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) then 0 else 1 end,
    case when team_members.role = '校隊' then 0 else 1 end,
    team_members.name asc;
end;
$$;

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
  status text,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  updated_at timestamptz
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

  if not exists (
    select 1
    from public.profiles
    join public.team_members
      on team_members.id = p_member_id
    where profiles.id = v_user_id
      and (
        profiles.role = 'ADMIN'
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
      coalesce(monthly_fees.status, 'unpaid')::text,
      null::text,
      null::text,
      null::date,
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
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_member_id is not null and not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and (
        profiles.role = 'ADMIN'
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
            and profiles.role = 'ADMIN'
        )
      )
    )
  order by profile_payment_submissions.created_at desc;
end;
$$;

create or replace function public.create_my_payment_submission(
  p_member_id uuid,
  p_period_key text,
  p_amount integer,
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
  v_requires_account_last_5 boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  if v_payment_method is null then
    raise exception 'payment_method is required';
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

  v_requires_account_last_5 := v_payment_method in ('銀行轉帳', '郵局', '郵局無摺', 'ATM存款');

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

  id := v_submission.id;
  member_id := v_submission.member_id;
  select team_members.name::text
  into member_name
  from public.team_members
  where team_members.id = v_submission.member_id;
  billing_mode := v_submission.billing_mode::text;
  period_key := v_submission.period_key::text;
  period_label := v_submission.period_key::text;
  amount := v_submission.amount;
  payment_method := v_submission.payment_method::text;
  account_last_5 := v_submission.account_last_5::text;
  remittance_date := v_submission.remittance_date;
  note := v_submission.note::text;
  status := v_submission.status::text;
  created_at := v_submission.created_at;
  updated_at := v_submission.updated_at;

  return next;
  return;
end;
$$;

grant execute on function public.list_my_payment_members() to authenticated;
grant execute on function public.get_my_payment_records(uuid) to authenticated;
grant execute on function public.list_my_payment_submissions(uuid) to authenticated;
grant execute on function public.create_my_payment_submission(uuid, text, integer, text, text, date, text) to authenticated;
