begin;

create or replace function public.is_member_fee_period_on_or_after_join(
  p_joined_date date,
  p_period_key text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_joined_date is null then true
    when upper(btrim(coalesce(p_period_key, ''))) ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
      make_date(
        substring(upper(btrim(p_period_key)) from 1 for 4)::integer,
        substring(upper(btrim(p_period_key)) from 6 for 2)::integer,
        1
      ) >= date_trunc('month', p_joined_date::timestamp)::date
    when upper(btrim(coalesce(p_period_key, ''))) ~ '^[0-9]{4}-Q[1-4]$' then
      make_date(
        substring(upper(btrim(p_period_key)) from 1 for 4)::integer,
        substring(upper(btrim(p_period_key)) from 7 for 1)::integer * 3,
        1
      ) >= date_trunc('month', p_joined_date::timestamp)::date
    else false
  end;
$$;

comment on function public.is_member_fee_period_on_or_after_join(date, text)
is 'Returns true when a monthly period starts on/after joined month or a quarterly period ends on/after joined month.';

revoke all on function public.is_member_fee_period_on_or_after_join(date, text) from public, anon;
grant execute on function public.is_member_fee_period_on_or_after_join(date, text) to authenticated, service_role;

create or replace function public.guard_member_fee_period_not_before_join()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  v_member_id uuid := nullif(to_jsonb(new) ->> 'member_id', '')::uuid;
  v_period_key text := coalesce(
    nullif(to_jsonb(new) ->> 'year_month', ''),
    nullif(to_jsonb(new) ->> 'year_quarter', '')
  );
  v_status text := lower(coalesce(nullif(to_jsonb(new) ->> 'status', ''), 'unpaid'));
  v_joined_date date;
begin
  if v_member_id is null or v_period_key is null or v_status in ('paid', 'approved') then
    return new;
  end if;

  select tm.joined_date
  into v_joined_date
  from public.team_members tm
  where tm.id = v_member_id;

  if not public.is_member_fee_period_on_or_after_join(v_joined_date, v_period_key) then
    raise exception 'fee period is before member joined month';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_monthly_fee_period_not_before_join on public.monthly_fees;
create trigger guard_monthly_fee_period_not_before_join
before insert or update on public.monthly_fees
for each row execute function public.guard_member_fee_period_not_before_join();

drop trigger if exists guard_quarterly_fee_period_not_before_join on public.quarterly_fees;
create trigger guard_quarterly_fee_period_not_before_join
before insert or update on public.quarterly_fees
for each row execute function public.guard_member_fee_period_not_before_join();

create or replace function public.get_my_payment_records(p_member_id uuid)
returns table(
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
stable
security definer
set search_path = 'public'
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
      tm.joined_date,
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
      and (
        coalesce(mf.status, 'unpaid') <> 'unpaid'
        or public.is_member_fee_period_on_or_after_join(target_member.joined_date, mf.year_month::text)
      )

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
      and (
        coalesce(qf.status, 'unpaid') <> 'unpaid'
        or public.is_member_fee_period_on_or_after_join(target_member.joined_date, qf.year_quarter::text)
      )
  )
  select *
  from payment_rows
  order by period_key desc, updated_at desc nulls last;
end;
$$;

do $migration$
declare
  v_function_def text;
  v_next_def text;
  v_joined_date_needle text := $needle$    coalesce(team_members.is_half_price, false) as is_half_price,$needle$;
  v_joined_date_replacement text := $replacement$    team_members.joined_date,
    coalesce(team_members.is_half_price, false) as is_half_price,$replacement$;
  v_monthly_needle text := $needle$  where linked_member.billing_mode = 'monthly'
     or (linked_member.billing_mode = 'none' and monthly_fees.id is not null)$needle$;
  v_monthly_replacement text := $replacement$  where (
      linked_member.billing_mode = 'monthly'
      or (linked_member.billing_mode = 'none' and monthly_fees.id is not null)
    )
    and public.is_member_fee_period_on_or_after_join(linked_member.joined_date, month_input.period_key)$replacement$;
  v_quarterly_needle text := $needle$    and public.is_quarterly_payment_period_open(normalized_input.period_key)$needle$;
  v_quarterly_replacement text := $replacement$    and public.is_quarterly_payment_period_open(normalized_input.period_key)
    and public.is_member_fee_period_on_or_after_join(linked_member.joined_date, normalized_input.period_key)$replacement$;
begin
  select pg_get_functiondef('public.get_my_payment_submission_estimate(uuid,text)'::regprocedure)
  into v_function_def;

  v_next_def := v_function_def;

  if position(v_joined_date_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_joined_date_needle, v_joined_date_replacement);
    if v_next_def = v_function_def then
      raise exception 'get_my_payment_submission_estimate joined_date select not found';
    end if;
  end if;

  v_function_def := v_next_def;
  if position(v_monthly_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_monthly_needle, v_monthly_replacement);
    if v_next_def = v_function_def then
      raise exception 'get_my_payment_submission_estimate monthly scope not found';
    end if;
  end if;

  v_function_def := v_next_def;
  if position(v_quarterly_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_quarterly_needle, v_quarterly_replacement);
    if v_next_def = v_function_def then
      raise exception 'get_my_payment_submission_estimate quarterly scope not found';
    end if;
  end if;

  execute v_next_def;
end $migration$;

do $migration$
declare
  v_function_def text;
  v_next_def text;
  v_needle text := $needle$  if v_balance_amount > public.get_player_balance_unchecked(p_member_id) then$needle$;
  v_replacement text := $replacement$  if not exists (
    select 1
    from public.team_members tm
    where tm.id = p_member_id
      and public.is_member_fee_period_on_or_after_join(tm.joined_date, v_period_key)
  ) then
    raise exception 'fee period is before member joined month';
  end if;

  if v_balance_amount > public.get_player_balance_unchecked(p_member_id) then$replacement$;
begin
  select pg_get_functiondef('public.create_my_payment_submission(uuid,text,integer,text,text,date,text,integer)'::regprocedure)
  into v_function_def;

  v_next_def := v_function_def;
  if position(v_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_needle, v_replacement);
    if v_next_def = v_function_def then
      raise exception 'create_my_payment_submission balance guard not found';
    end if;
  end if;

  execute v_next_def;
end $migration$;

do $migration$
declare
  v_function_def text;
  v_next_def text;
  v_needle text := $needle$        and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'$needle$;
  v_replacement text := $replacement$        and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
        and public.is_member_fee_period_on_or_after_join(tm.joined_date, item.period_key)$replacement$;
begin
  select pg_get_functiondef('public.create_my_quarterly_payment_submission(jsonb,text,text,date,text)'::regprocedure)
  into v_function_def;

  v_next_def := v_function_def;
  if position(v_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_needle, v_replacement);
    if v_next_def = v_function_def then
      raise exception 'create_my_quarterly_payment_submission linked member guard not found';
    end if;
  end if;

  execute v_next_def;
end $migration$;

do $migration$
declare
  v_function_def text;
  v_next_def text;
  v_member_needle text := '      select tm.id, tm.name';
  v_member_replacement text := '      select tm.id, tm.name, tm.joined_date';
  v_monthly_needle text := $needle$        v_today
      )

    union all$needle$;
  v_monthly_replacement text := $replacement$        v_today
      )
      and public.is_member_fee_period_on_or_after_join(tm.joined_date, mf.year_month::text)

    union all$replacement$;
  v_quarterly_needle text := $needle$      and public.is_quarterly_payment_period_open(qf.year_quarter::text, v_today)$needle$;
  v_quarterly_replacement text := $replacement$      and public.is_quarterly_payment_period_open(qf.year_quarter::text, v_today)
      and public.is_member_fee_period_on_or_after_join(matched_member.joined_date, qf.year_quarter::text)$replacement$;
begin
  select pg_get_functiondef('public.get_my_home_snapshot(date)'::regprocedure)
  into v_function_def;

  v_next_def := v_function_def;
  if position(v_member_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_member_needle, v_member_replacement);
    if v_next_def = v_function_def then
      raise exception 'get_my_home_snapshot quarterly member select not found';
    end if;
  end if;

  v_function_def := v_next_def;
  if position(v_monthly_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_monthly_needle, v_monthly_replacement);
    if v_next_def = v_function_def then
      raise exception 'get_my_home_snapshot monthly due scope not found';
    end if;
  end if;

  v_function_def := v_next_def;
  if position(v_quarterly_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_quarterly_needle, v_quarterly_replacement);
    if v_next_def = v_function_def then
      raise exception 'get_my_home_snapshot quarterly due scope not found';
    end if;
  end if;

  execute v_next_def;
end $migration$;

do $migration$
declare
  v_function_def text;
  v_next_def text;
  v_monthly_needle text := $needle$        where public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'monthly'$needle$;
  v_monthly_replacement text := $replacement$        where public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'monthly'
          and public.is_member_fee_period_on_or_after_join(tm.joined_date, v_monthly_period)$replacement$;
  v_quarterly_needle text := $needle$        where public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'$needle$;
  v_quarterly_replacement text := $replacement$        where public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
          and public.is_member_fee_period_on_or_after_join(tm.joined_date, v_quarterly_period)$replacement$;
begin
  select pg_get_functiondef('public.get_fee_management_reminders()'::regprocedure)
  into v_function_def;

  v_next_def := v_function_def;
  if position(v_monthly_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_monthly_needle, v_monthly_replacement);
    if v_next_def = v_function_def then
      raise exception 'get_fee_management_reminders monthly scope not found';
    end if;
  end if;

  v_function_def := v_next_def;
  if position(v_quarterly_replacement in v_next_def) = 0 then
    v_next_def := replace(v_next_def, v_quarterly_needle, v_quarterly_replacement);
    if v_next_def = v_function_def then
      raise exception 'get_fee_management_reminders quarterly scope not found';
    end if;
  end if;

  execute v_next_def;
end $migration$;

revoke all on function public.guard_member_fee_period_not_before_join() from public, anon;

notify pgrst, 'reload schema';

commit;
