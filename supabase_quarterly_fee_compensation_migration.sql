begin;

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.system_settings enable row level security;

insert into public.system_settings (key, value, description)
values (
  'quarterly_fee_compensation_defaults',
  jsonb_build_object(
    'regular_daily_credit', 500,
    'discount_daily_credit', 250
  ),
  '季費堂數不足補償每日折抵預設'
)
on conflict (key) do nothing;

alter table public.player_balance_transactions
  drop constraint if exists player_balance_transactions_source_check;

alter table public.player_balance_transactions
  add constraint player_balance_transactions_source_check check (
    source in ('manual_adjustment', 'payment_deduction', 'overpayment', 'quarterly_compensation')
  );

create table if not exists public.quarterly_fee_compensation_items (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  month_start date not null,
  member_id uuid not null references public.team_members(id) on delete cascade,
  baseline_session_count integer not null default 0 check (baseline_session_count >= 0),
  configured_session_count integer not null default 0 check (configured_session_count >= 0),
  compensation_days integer not null default 0 check (compensation_days >= 0),
  daily_credit_amount integer not null default 0 check (daily_credit_amount >= 0),
  suggested_amount integer not null default 0 check (suggested_amount >= 0),
  approved_amount integer not null default 0 check (approved_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'skipped')),
  note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  balance_transaction_id uuid references public.player_balance_transactions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint quarterly_fee_compensation_items_month_start_check check (date_trunc('month', month_start)::date = month_start),
  constraint quarterly_fee_compensation_items_unique unique (period_key, month_start, member_id)
);

create index if not exists quarterly_fee_compensation_items_period_month_status_idx
  on public.quarterly_fee_compensation_items (period_key, month_start, status);

create index if not exists quarterly_fee_compensation_items_member_created_idx
  on public.quarterly_fee_compensation_items (member_id, created_at desc);

alter table public.quarterly_fee_compensation_items enable row level security;

drop policy if exists "quarterly_fee_compensation_items_select_fees_view" on public.quarterly_fee_compensation_items;
create policy "quarterly_fee_compensation_items_select_fees_view"
  on public.quarterly_fee_compensation_items
  for select
  to authenticated
  using (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
  );

drop policy if exists "quarterly_fee_compensation_items_insert_fees_edit" on public.quarterly_fee_compensation_items;
create policy "quarterly_fee_compensation_items_insert_fees_edit"
  on public.quarterly_fee_compensation_items
  for insert
  to authenticated
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "quarterly_fee_compensation_items_update_fees_edit" on public.quarterly_fee_compensation_items;
create policy "quarterly_fee_compensation_items_update_fees_edit"
  on public.quarterly_fee_compensation_items
  for update
  to authenticated
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "quarterly_fee_compensation_items_delete_fees_delete" on public.quarterly_fee_compensation_items;
create policy "quarterly_fee_compensation_items_delete_fees_delete"
  on public.quarterly_fee_compensation_items
  for delete
  to authenticated
  using (public.has_app_permission('fees', 'DELETE'));

grant select, insert, update, delete on public.quarterly_fee_compensation_items to authenticated, service_role;

create or replace function public.get_quarterly_fee_compensation_defaults()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_value jsonb := '{}'::jsonb;
  v_regular_daily_credit integer := 500;
  v_discount_daily_credit integer := 250;
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
  ) then
    raise exception 'fees VIEW permission required';
  end if;

  select coalesce(system_settings.value, '{}'::jsonb)
  into v_value
  from public.system_settings
  where system_settings.key = 'quarterly_fee_compensation_defaults';

  if jsonb_typeof(v_value->'regular_daily_credit') = 'number' then
    v_regular_daily_credit := greatest(trunc((v_value->>'regular_daily_credit')::numeric)::integer, 0);
  end if;

  if jsonb_typeof(v_value->'discount_daily_credit') = 'number' then
    v_discount_daily_credit := greatest(trunc((v_value->>'discount_daily_credit')::numeric)::integer, 0);
  end if;

  return jsonb_build_object(
    'regular_daily_credit', v_regular_daily_credit,
    'discount_daily_credit', v_discount_daily_credit
  );
end;
$$;

create or replace function public.save_quarterly_fee_compensation_defaults(
  p_regular_daily_credit integer,
  p_discount_daily_credit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_defaults jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  v_defaults := jsonb_build_object(
    'regular_daily_credit', greatest(coalesce(p_regular_daily_credit, 500), 0),
    'discount_daily_credit', greatest(coalesce(p_discount_daily_credit, 250), 0)
  );

  insert into public.system_settings (key, value, description, updated_at)
  values (
    'quarterly_fee_compensation_defaults',
    v_defaults,
    '季費堂數不足補償每日折抵預設',
    timezone('utc', now())
  )
  on conflict (key) do update
    set value = excluded.value,
        description = excluded.description,
        updated_at = timezone('utc', now());

  return v_defaults;
end;
$$;

create or replace function public.list_quarterly_fee_compensation_items(
  p_period_key text,
  p_month date
)
returns table (
  id uuid,
  period_key text,
  month_start date,
  month text,
  member_id uuid,
  member_name text,
  status text,
  baseline_session_count integer,
  configured_session_count integer,
  compensation_days integer,
  daily_credit_amount integer,
  suggested_amount integer,
  approved_amount integer,
  note text,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  balance_transaction_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_period_key text := nullif(btrim(coalesce(p_period_key, '')), '');
  v_month_start date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if v_period_key is null then
    raise exception 'period key is required';
  end if;

  if not (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
  ) then
    raise exception 'fees VIEW permission required';
  end if;

  return query
  select
    item.id,
    item.period_key::text,
    item.month_start,
    to_char(item.month_start, 'YYYY-MM')::text,
    item.member_id,
    tm.name::text,
    item.status::text,
    item.baseline_session_count,
    item.configured_session_count,
    item.compensation_days,
    item.daily_credit_amount,
    item.suggested_amount,
    item.approved_amount,
    item.note::text,
    item.reviewed_by,
    coalesce(reviewer.nickname, reviewer.name)::text,
    item.reviewed_at,
    item.balance_transaction_id,
    item.created_at,
    item.updated_at
  from public.quarterly_fee_compensation_items item
  join public.team_members tm on tm.id = item.member_id
  left join public.profiles reviewer on reviewer.id = item.reviewed_by
  where item.period_key = v_period_key
    and item.month_start = v_month_start
  order by
    case item.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    tm.name asc,
    item.created_at asc;
end;
$$;

create or replace function public.upsert_quarterly_fee_compensation_drafts(
  p_period_key text,
  p_month date
)
returns table (
  id uuid,
  period_key text,
  month_start date,
  month text,
  member_id uuid,
  member_name text,
  status text,
  baseline_session_count integer,
  configured_session_count integer,
  compensation_days integer,
  daily_credit_amount integer,
  suggested_amount integer,
  approved_amount integer,
  note text,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  balance_transaction_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_key text := nullif(btrim(coalesce(p_period_key, '')), '');
  v_month_start date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
  v_baseline_dates date[] := public.get_default_training_month_dates(date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date);
  v_configured_dates date[] := '{}'::date[];
  v_has_setting boolean := false;
  v_baseline_count integer := 0;
  v_configured_count integer := 0;
  v_compensation_days integer := 0;
  v_defaults jsonb;
  v_regular_daily_credit integer := 500;
  v_discount_daily_credit integer := 250;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if v_period_key is null then
    raise exception 'period key is required';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  v_baseline_count := cardinality(coalesce(v_baseline_dates, '{}'::date[]));

  select exists (
    select 1
    from public.training_month_date_settings settings
    where settings.month_start = v_month_start
  )
  into v_has_setting;

  if v_has_setting then
    select coalesce(array_agg(distinct training_date order by training_date), '{}'::date[])
    into v_configured_dates
    from public.training_month_date_settings settings
    cross join lateral unnest(coalesce(settings.training_dates, '{}'::date[])) as training_day(training_date)
    where settings.month_start = v_month_start
      and date_trunc('month', training_date)::date = v_month_start;
  else
    v_configured_dates := coalesce(v_baseline_dates, '{}'::date[]);
  end if;

  v_configured_count := cardinality(coalesce(v_configured_dates, '{}'::date[]));
  v_compensation_days := greatest(v_baseline_count - v_configured_count, 0);

  v_defaults := public.get_quarterly_fee_compensation_defaults();
  v_regular_daily_credit := greatest(trunc((v_defaults->>'regular_daily_credit')::numeric)::integer, 0);
  v_discount_daily_credit := greatest(trunc((v_defaults->>'discount_daily_credit')::numeric)::integer, 0);

  if v_compensation_days > 0 then
    insert into public.quarterly_fee_compensation_items (
      period_key,
      month_start,
      member_id,
      baseline_session_count,
      configured_session_count,
      compensation_days,
      daily_credit_amount,
      suggested_amount,
      approved_amount,
      status,
      note,
      created_by,
      updated_at
    )
    with quarterly_members as (
      select
        tm.id,
        tm.name,
        coalesce(tm.is_half_price, false) as is_half_price,
        coalesce(tm.is_primary_payer, false) as is_primary_payer,
        coalesce(tm.sibling_ids, '{}'::uuid[]) as sibling_ids
      from public.team_members tm
      where coalesce(tm.status, '') not in ('退隊', '離隊')
        and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
    ),
    member_prices as (
      select
        qm.id as member_id,
        coalesce(
          nullif(latest_quarterly_fee.amount, 0),
          case
            when qm.is_half_price then 3000
            when cardinality(qm.sibling_ids) > 0
              and not qm.is_primary_payer
              and (
                sibling_flags.has_primary_sibling
                or sibling_flags.has_fallback_discount
              )
              then 3000
            else 6000
          end
        ) as expected_amount
      from quarterly_members qm
      left join lateral (
        select qf.amount
        from public.quarterly_fees qf
        where qf.year_quarter = v_period_key
          and (
            qf.member_id = qm.id
            or qm.id = any(coalesce(qf.member_ids, array[]::uuid[]))
          )
        order by qf.updated_at desc nulls last, qf.created_at desc nulls last
        limit 1
      ) latest_quarterly_fee on true
      left join lateral (
        select
          exists (
            select 1
            from public.team_members sibling
            where sibling.id = any(qm.sibling_ids)
              and coalesce(sibling.is_primary_payer, false)
              and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'quarterly'
          ) as has_primary_sibling,
          exists (
            select 1
            from public.team_members sibling
            where sibling.id = any(qm.sibling_ids)
              and qm.id > sibling.id
              and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'quarterly'
          ) as has_fallback_discount
      ) sibling_flags on true
    )
    select
      v_period_key,
      v_month_start,
      member_prices.member_id,
      v_baseline_count,
      v_configured_count,
      v_compensation_days,
      case
        when member_prices.expected_amount < 6000 then v_discount_daily_credit
        else v_regular_daily_credit
      end as daily_credit_amount,
      v_compensation_days * case
        when member_prices.expected_amount < 6000 then v_discount_daily_credit
        else v_regular_daily_credit
      end as suggested_amount,
      0,
      'pending',
      null,
      v_user_id,
      timezone('utc', now())
    from member_prices
    on conflict on constraint quarterly_fee_compensation_items_unique do update
      set baseline_session_count = excluded.baseline_session_count,
          configured_session_count = excluded.configured_session_count,
          compensation_days = excluded.compensation_days,
          daily_credit_amount = excluded.daily_credit_amount,
          suggested_amount = excluded.suggested_amount,
          updated_at = timezone('utc', now())
      where quarterly_fee_compensation_items.status = 'pending';
  end if;

  return query
  select *
  from public.list_quarterly_fee_compensation_items(v_period_key, v_month_start);
end;
$$;

create or replace function public.approve_quarterly_fee_compensation_item(
  p_item_id uuid,
  p_approved_amount integer,
  p_note text default null
)
returns table (
  id uuid,
  period_key text,
  month_start date,
  month text,
  member_id uuid,
  member_name text,
  status text,
  baseline_session_count integer,
  configured_session_count integer,
  compensation_days integer,
  daily_credit_amount integer,
  suggested_amount integer,
  approved_amount integer,
  note text,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  balance_transaction_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.quarterly_fee_compensation_items%rowtype;
  v_approved_amount integer := greatest(coalesce(p_approved_amount, 0), 0);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_transaction_id uuid := null;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  select *
  into v_item
  from public.quarterly_fee_compensation_items
  where quarterly_fee_compensation_items.id = p_item_id
  for update;

  if not found then
    raise exception 'compensation item not found';
  end if;

  if v_item.status <> 'pending' then
    raise exception 'compensation item is already reviewed';
  end if;

  perform 1
  from public.team_members tm
  where tm.id = v_item.member_id
  for update;

  if v_approved_amount > 0 then
    insert into public.player_balance_transactions as inserted_transaction (
      member_id,
      delta,
      reason,
      source,
      idempotency_key,
      created_by
    )
    values (
      v_item.member_id,
      v_approved_amount,
      format(
        '季費補償 %s %s：補償 %s 天，每日 %s 元',
        v_item.period_key,
        to_char(v_item.month_start, 'YYYY-MM'),
        v_item.compensation_days,
        v_item.daily_credit_amount
      ),
      'quarterly_compensation',
      format('quarterly_compensation:%s', v_item.id),
      v_user_id
    )
    on conflict (idempotency_key) do nothing
    returning inserted_transaction.id into v_transaction_id;

    if v_transaction_id is null then
      select pbt.id
      into v_transaction_id
      from public.player_balance_transactions pbt
      where pbt.idempotency_key = format('quarterly_compensation:%s', v_item.id);
    end if;
  end if;

  update public.quarterly_fee_compensation_items
  set
    status = 'approved',
    approved_amount = v_approved_amount,
    note = v_note,
    reviewed_by = v_user_id,
    reviewed_at = timezone('utc', now()),
    balance_transaction_id = v_transaction_id,
    updated_at = timezone('utc', now())
  where quarterly_fee_compensation_items.id = v_item.id;

  return query
  select *
  from public.list_quarterly_fee_compensation_items(v_item.period_key, v_item.month_start) listed
  where listed.id = v_item.id;
end;
$$;

create or replace function public.skip_quarterly_fee_compensation_item(
  p_item_id uuid,
  p_note text default null
)
returns table (
  id uuid,
  period_key text,
  month_start date,
  month text,
  member_id uuid,
  member_name text,
  status text,
  baseline_session_count integer,
  configured_session_count integer,
  compensation_days integer,
  daily_credit_amount integer,
  suggested_amount integer,
  approved_amount integer,
  note text,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  balance_transaction_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.quarterly_fee_compensation_items%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  select *
  into v_item
  from public.quarterly_fee_compensation_items
  where quarterly_fee_compensation_items.id = p_item_id
  for update;

  if not found then
    raise exception 'compensation item not found';
  end if;

  if v_item.status <> 'pending' then
    raise exception 'compensation item is already reviewed';
  end if;

  update public.quarterly_fee_compensation_items
  set
    status = 'skipped',
    approved_amount = 0,
    note = v_note,
    reviewed_by = v_user_id,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where quarterly_fee_compensation_items.id = v_item.id;

  return query
  select *
  from public.list_quarterly_fee_compensation_items(v_item.period_key, v_item.month_start) listed
  where listed.id = v_item.id;
end;
$$;

revoke all on function public.get_quarterly_fee_compensation_defaults() from public;
grant execute on function public.get_quarterly_fee_compensation_defaults() to authenticated, service_role;

revoke all on function public.save_quarterly_fee_compensation_defaults(integer, integer) from public;
grant execute on function public.save_quarterly_fee_compensation_defaults(integer, integer) to authenticated, service_role;

revoke all on function public.list_quarterly_fee_compensation_items(text, date) from public;
grant execute on function public.list_quarterly_fee_compensation_items(text, date) to authenticated, service_role;

revoke all on function public.upsert_quarterly_fee_compensation_drafts(text, date) from public;
grant execute on function public.upsert_quarterly_fee_compensation_drafts(text, date) to authenticated, service_role;

revoke all on function public.approve_quarterly_fee_compensation_item(uuid, integer, text) from public;
grant execute on function public.approve_quarterly_fee_compensation_item(uuid, integer, text) to authenticated, service_role;

revoke all on function public.skip_quarterly_fee_compensation_item(uuid, text) from public;
grant execute on function public.skip_quarterly_fee_compensation_item(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
