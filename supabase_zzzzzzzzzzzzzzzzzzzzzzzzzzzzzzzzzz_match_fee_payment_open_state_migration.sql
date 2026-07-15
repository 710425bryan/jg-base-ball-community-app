begin;

alter table public.matches
  add column if not exists match_fee_payment_opened_at timestamptz,
  add column if not exists match_fee_payment_opened_by uuid references public.profiles(id) on delete set null,
  add column if not exists match_fee_payment_signature text;

comment on column public.matches.match_fee_payment_opened_at is
  '比賽費由管理者開放給家長付款的時間；null 代表尚未開放。';
comment on column public.matches.match_fee_payment_opened_by is
  '最近一次開放比賽費付款的管理者 profile id。';
comment on column public.matches.match_fee_payment_signature is
  '開放時應繳球員與金額的穩定簽章，用於應收內容異動後自動關閉。';

create index if not exists match_payment_submission_items_fee_item_idx
  on public.match_payment_submission_items(match_fee_item_id);

create index if not exists match_fee_items_payment_submission_idx
  on public.match_fee_items(payment_submission_id)
  where payment_submission_id is not null;

create index if not exists match_payment_submissions_profile_idx
  on public.match_payment_submissions(profile_id);

create or replace function public.get_match_fee_payment_signature(p_match_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce(
      string_agg(
        fi.member_id::text || ':' || fi.amount::text,
        ','
        order by fi.member_id
      ),
      ''
    )
  )
  from public.match_fee_items fi
  where fi.match_id = p_match_id
    and fi.payment_status <> 'cancelled';
$$;

create or replace function public.sync_match_fee_items_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_current_signature text;
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
            and public.leave_request_overlaps_event(
              lr.start_date,
              lr.end_date,
              lr.leave_time_segment,
              v_match.match_date,
              public.get_match_leave_event_time(v_match.match_time, v_match.note)
            )
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
      amount = case
        when exists (
          select 1
          from public.match_payment_submission_items history_link
          where history_link.match_fee_item_id = match_fee_items.id
        ) then match_fee_items.amount
        else excluded.amount
      end,
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
      and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) <> 'none'
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
          and public.leave_request_overlaps_event(
            lr.start_date,
            lr.end_date,
            lr.leave_time_segment,
            v_match.match_date,
            public.get_match_leave_event_time(v_match.match_time, v_match.note)
          )
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

  v_current_signature := public.get_match_fee_payment_signature(v_match.id);

  if v_match.match_fee_payment_opened_at is not null
    and v_match.match_fee_payment_signature is distinct from v_current_signature
    and not exists (
      select 1
      from public.match_fee_items history_item
      join public.match_payment_submission_items history_link
        on history_link.match_fee_item_id = history_item.id
      where history_item.match_id = v_match.id
    )
  then
    update public.matches
    set
      match_fee_payment_opened_at = null,
      match_fee_payment_opened_by = null,
      match_fee_payment_signature = null
    where matches.id = v_match.id;
  end if;
end;
$$;

create or replace function public.set_match_fee_payment_open_state(
  p_match_id uuid,
  p_is_open boolean
)
returns table (
  match_id uuid,
  is_payment_open boolean,
  payment_opened_at timestamptz,
  payable_item_count integer,
  payable_amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.matches%rowtype;
  v_item_count integer := 0;
  v_amount integer := 0;
  v_signature text;
begin
  if v_user_id is null then
    raise exception '請先登入';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception '需要收費編輯權限';
  end if;

  select *
  into v_match
  from public.matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception '找不到指定的比賽';
  end if;

  if coalesce(p_is_open, false) then
    if coalesce(v_match.match_fee_amount, 0) <= 0 then
      raise exception '請先在賽事中設定每位球員的比賽費用';
    end if;

    perform public.sync_match_fee_items_for_match(v_match.id);

    select
      count(*)::integer,
      coalesce(sum(fi.amount), 0)::integer
    into v_item_count, v_amount
    from public.match_fee_items fi
    where fi.match_id = v_match.id
      and fi.payment_status <> 'cancelled';

    if v_item_count = 0 then
      raise exception '目前沒有可開放繳費的球員';
    end if;

    v_signature := public.get_match_fee_payment_signature(v_match.id);

    update public.matches
    set
      match_fee_payment_opened_at = coalesce(match_fee_payment_opened_at, now()),
      match_fee_payment_opened_by = coalesce(match_fee_payment_opened_by, v_user_id),
      match_fee_payment_signature = v_signature
    where matches.id = v_match.id;
  else
    if exists (
      select 1
      from public.match_fee_items fi
      join public.match_payment_submission_items si
        on si.match_fee_item_id = fi.id
      where fi.match_id = v_match.id
    ) then
      raise exception '此比賽已有付款歷程，不能關閉繳費';
    end if;

    update public.matches
    set
      match_fee_payment_opened_at = null,
      match_fee_payment_opened_by = null,
      match_fee_payment_signature = null
    where matches.id = v_match.id;
  end if;

  return query
  select
    m.id,
    m.match_fee_payment_opened_at is not null,
    m.match_fee_payment_opened_at,
    count(fi.id) filter (where fi.payment_status <> 'cancelled')::integer,
    coalesce(sum(fi.amount) filter (where fi.payment_status <> 'cancelled'), 0)::integer
  from public.matches m
  left join public.match_fee_items fi on fi.match_id = m.id
  where m.id = v_match.id
  group by m.id, m.match_fee_payment_opened_at;
end;
$$;

drop function if exists public.list_my_match_fee_items(uuid);

create function public.list_my_match_fee_items(p_member_id uuid)
returns table (
  id uuid,
  match_id uuid,
  member_id uuid,
  member_name text,
  match_name text,
  tournament_name text,
  match_date date,
  match_time text,
  category_group text,
  fee_month text,
  amount integer,
  payment_status text,
  payment_submission_id uuid,
  paid_at timestamptz,
  cancelled_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  payment_opened_at timestamptz,
  has_payment_history boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_manage boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  v_can_manage := public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT');

  if not (
    v_can_manage
    or exists (
      select 1
      from public.profiles p
      where p.id = v_user_id
        and p_member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    )
  ) then
    raise exception 'member is not viewable by current profile';
  end if;

  perform public.sync_match_fee_items_for_match(m.id)
  from public.matches m
  join public.team_members tm on tm.id = p_member_id
  where coalesce(m.match_fee_amount, 0) > 0
    and m.match_date is not null
    and exists (
      select 1
      from public.split_match_fee_player_names(m.players) pn
      where public.normalize_match_fee_player_name(pn.player_name)
        = public.normalize_match_fee_player_name(tm.name::text)
    );

  return query
  select
    fi.id,
    fi.match_id,
    fi.member_id,
    fi.member_name_snapshot::text,
    fi.match_name_snapshot::text,
    fi.tournament_name_snapshot::text,
    fi.match_date_snapshot,
    fi.match_time_snapshot::text,
    fi.category_group_snapshot::text,
    fi.fee_month::text,
    fi.amount,
    fi.payment_status::text,
    fi.payment_submission_id,
    fi.paid_at,
    fi.cancelled_reason::text,
    fi.created_at,
    fi.updated_at,
    visible_match.match_fee_payment_opened_at,
    exists (
      select 1
      from public.match_payment_submission_items history_link
      where history_link.match_fee_item_id = fi.id
    )
  from public.match_fee_items fi
  left join public.matches visible_match on visible_match.id = fi.match_id
  where fi.member_id = p_member_id
    and (
      v_can_manage
      or visible_match.match_fee_payment_opened_at is not null
      or exists (
        select 1
        from public.match_payment_submission_items history_link
        where history_link.match_fee_item_id = fi.id
      )
    )
  order by
    case fi.payment_status
      when 'unpaid' then 0
      when 'pending_review' then 1
      when 'paid' then 2
      else 3
    end,
    fi.match_date_snapshot desc,
    fi.created_at desc;
end;
$$;

drop function if exists public.list_match_fee_items_by_month(text);

create function public.list_match_fee_items_by_month(p_fee_month text)
returns table (
  id uuid,
  match_id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  match_name text,
  tournament_name text,
  match_date date,
  match_time text,
  category_group text,
  fee_month text,
  amount integer,
  match_fee_amount integer,
  payment_opened_at timestamptz,
  payment_opened_by_name text,
  has_payment_history boolean,
  payment_status text,
  payment_submission_id uuid,
  payment_submission_status text,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  balance_amount integer,
  paid_at timestamptz,
  cancelled_reason text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_fee_month text := nullif(btrim(p_fee_month), '');
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
  ) then
    raise exception 'fees VIEW permission required';
  end if;

  perform public.sync_match_fee_items_for_month(v_fee_month);

  return query
  select
    fi.id,
    fi.match_id,
    fi.member_id,
    fi.member_name_snapshot::text,
    tm.role::text,
    fi.match_name_snapshot::text,
    fi.tournament_name_snapshot::text,
    fi.match_date_snapshot,
    fi.match_time_snapshot::text,
    fi.category_group_snapshot::text,
    fi.fee_month::text,
    fi.amount,
    m.match_fee_amount,
    m.match_fee_payment_opened_at,
    coalesce(opener.nickname, opener.name, opener.email)::text,
    exists (
      select 1
      from public.match_payment_submission_items history_link
      where history_link.match_fee_item_id = fi.id
    ),
    fi.payment_status::text,
    fi.payment_submission_id,
    s.status::text,
    s.payment_method::text,
    s.account_last_5::text,
    s.remittance_date,
    coalesce(s.balance_amount, 0),
    fi.paid_at,
    fi.cancelled_reason::text,
    fi.created_at,
    fi.updated_at
  from public.match_fee_items fi
  join public.team_members tm on tm.id = fi.member_id
  left join public.matches m on m.id = fi.match_id
  left join public.profiles opener on opener.id = m.match_fee_payment_opened_by
  left join public.match_payment_submissions s on s.id = fi.payment_submission_id
  where fi.fee_month = v_fee_month
  order by
    fi.match_date_snapshot asc nulls last,
    case
      when substring(fi.match_time_snapshot from '([0-9]{1,2}:[0-9]{2})') is null then 1
      else 0
    end,
    lpad(substring(fi.match_time_snapshot from '([0-9]{1,2}:[0-9]{2})'), 5, '0') asc nulls last,
    fi.match_name_snapshot asc,
    fi.member_name_snapshot asc;
end;
$$;

create or replace function public.create_match_payment_submission(
  p_match_fee_item_ids uuid[],
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
  v_item_ids uuid[];
  v_match_ids uuid[];
  v_match_id uuid;
  v_missing_match_count integer := 0;
  v_closed_match_count integer := 0;
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

  select array_agg(distinct item_id)
  into v_item_ids
  from unnest(coalesce(p_match_fee_item_ids, array[]::uuid[])) as item_id;

  if v_item_ids is null or cardinality(v_item_ids) = 0 then
    raise exception 'match_fee_item_ids is required';
  end if;

  select
    array_agg(distinct fi.match_id) filter (where fi.match_id is not null),
    count(*) filter (where fi.match_id is null)::integer
  into v_match_ids, v_missing_match_count
  from public.match_fee_items fi
  where fi.id = any(v_item_ids);

  if v_match_ids is null or v_missing_match_count > 0 then
    raise exception '部分比賽費用已失效，請重新整理';
  end if;

  perform 1
  from public.matches m
  where m.id = any(v_match_ids)
  order by m.id
  for update;

  foreach v_match_id in array v_match_ids
  loop
    perform public.sync_match_fee_items_for_match(v_match_id);
  end loop;

  perform 1
  from public.match_fee_items fi
  where fi.id = any(v_item_ids)
  order by fi.id
  for update;

  select
    count(*),
    count(distinct fi.member_id),
    (array_agg(fi.member_id))[1],
    sum(fi.amount),
    count(*) filter (where m.match_fee_payment_opened_at is null)::integer
  into v_count, v_member_count, v_member_id, v_amount, v_closed_match_count
  from public.match_fee_items fi
  join public.matches m on m.id = fi.match_id
  where fi.id = any(v_item_ids)
    and fi.payment_status = 'unpaid'
    and fi.payment_submission_id is null;

  if v_closed_match_count > 0 then
    raise exception '部分比賽費用尚未開放或已關閉，請重新整理';
  end if;

  if v_count <> cardinality(v_item_ids) then
    raise exception 'some match fee items are not payable';
  end if;

  if v_member_count <> 1 or v_member_id is null then
    raise exception 'all match fee items must belong to the same member';
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

  insert into public.match_payment_submissions (
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
  returning match_payment_submissions.id into v_submission_id;

  insert into public.match_payment_submission_items (submission_id, match_fee_item_id)
  select v_submission_id, item_id
  from unnest(v_item_ids) as item_id;

  update public.match_fee_items
  set
    payment_status = 'pending_review',
    payment_submission_id = v_submission_id,
    updated_at = now()
  where match_fee_items.id = any(v_item_ids);

  return query
  select *
  from public.list_match_payment_submissions() submissions
  where submissions.id = v_submission_id;
end;
$$;

create or replace function public.delete_cancelled_match_fee_group(p_match_fee_item_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anchor public.match_fee_items%rowtype;
  v_group_ids uuid[];
  v_deleted integer := 0;
begin
  if v_user_id is null then
    raise exception '請先登入';
  end if;

  if not public.has_app_permission('fees', 'DELETE') then
    raise exception '需要收費刪除權限';
  end if;

  select *
  into v_anchor
  from public.match_fee_items fi
  where fi.id = p_match_fee_item_id
  for update;

  if not found then
    raise exception '找不到指定的比賽費用';
  end if;

  if v_anchor.match_id is not null then
    perform 1
    from public.matches m
    where m.id = v_anchor.match_id
    for update;

    perform 1
    from public.match_fee_items fi
    where fi.match_id = v_anchor.match_id
    for update;

    select array_agg(fi.id order by fi.id)
    into v_group_ids
    from public.match_fee_items fi
    where fi.match_id = v_anchor.match_id;
  else
    perform 1
    from public.match_fee_items fi
    where fi.match_id is null
      and fi.match_name_snapshot is not distinct from v_anchor.match_name_snapshot
      and fi.tournament_name_snapshot is not distinct from v_anchor.tournament_name_snapshot
      and fi.match_date_snapshot is not distinct from v_anchor.match_date_snapshot
      and fi.match_time_snapshot is not distinct from v_anchor.match_time_snapshot
      and fi.category_group_snapshot is not distinct from v_anchor.category_group_snapshot
    for update;

    select array_agg(fi.id order by fi.id)
    into v_group_ids
    from public.match_fee_items fi
    where fi.match_id is null
      and fi.match_name_snapshot is not distinct from v_anchor.match_name_snapshot
      and fi.tournament_name_snapshot is not distinct from v_anchor.tournament_name_snapshot
      and fi.match_date_snapshot is not distinct from v_anchor.match_date_snapshot
      and fi.match_time_snapshot is not distinct from v_anchor.match_time_snapshot
      and fi.category_group_snapshot is not distinct from v_anchor.category_group_snapshot;
  end if;

  if v_group_ids is null or cardinality(v_group_ids) = 0 then
    raise exception '找不到可刪除的比賽費用群組';
  end if;

  if exists (
    select 1
    from public.match_fee_items fi
    where fi.id = any(v_group_ids)
      and fi.payment_status <> 'cancelled'
  ) then
    raise exception '只有整場皆為已取消的比賽費用才能刪除';
  end if;

  if exists (
    select 1
    from public.match_fee_items fi
    where fi.id = any(v_group_ids)
      and fi.payment_submission_id is not null
  ) or exists (
    select 1
    from public.match_payment_submission_items si
    where si.match_fee_item_id = any(v_group_ids)
  ) then
    raise exception '此比賽已有付款歷程，不能刪除';
  end if;

  delete from public.match_fee_items fi
  where fi.id = any(v_group_ids);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.detach_match_fee_items_before_match_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.match_fee_items fi
    where fi.match_id = old.id
      and (
        fi.payment_status in ('pending_review', 'paid')
        or fi.payment_submission_id is not null
      )
  ) then
    raise exception '此比賽仍有待確認或已付款的費用，請先退回、退款或作廢付款後再刪除';
  end if;

  update public.match_fee_items fi
  set
    member_name_snapshot = coalesce(fi.member_name_snapshot, ''),
    match_name_snapshot = coalesce(nullif(old.match_name, ''), fi.match_name_snapshot),
    tournament_name_snapshot = coalesce(nullif(old.tournament_name, ''), fi.tournament_name_snapshot),
    match_date_snapshot = coalesce(old.match_date, fi.match_date_snapshot),
    match_time_snapshot = coalesce(nullif(old.match_time, ''), fi.match_time_snapshot),
    category_group_snapshot = coalesce(nullif(old.category_group, ''), fi.category_group_snapshot),
    payment_status = 'cancelled',
    payment_submission_id = null,
    cancelled_at = coalesce(fi.cancelled_at, now()),
    cancelled_reason = '比賽已刪除',
    match_id = null,
    updated_at = now()
  where fi.match_id = old.id
    and exists (
      select 1
      from public.match_payment_submission_items si
      where si.match_fee_item_id = fi.id
    );

  delete from public.match_fee_items fi
  where fi.match_id = old.id
    and not exists (
      select 1
      from public.match_payment_submission_items si
      where si.match_fee_item_id = fi.id
    );

  return old;
end;
$$;

drop policy if exists "match_fee_items_select_allowed" on public.match_fee_items;
create policy "match_fee_items_select_allowed"
  on public.match_fee_items
  for select
  to authenticated
  using (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and match_fee_items.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
        and (
          exists (
            select 1
            from public.matches visible_match
            where visible_match.id = match_fee_items.match_id
              and visible_match.match_fee_payment_opened_at is not null
          )
          or exists (
            select 1
            from public.match_payment_submission_items history_link
            where history_link.match_fee_item_id = match_fee_items.id
          )
        )
    )
  );

drop policy if exists "match_fee_items_manage_fees_edit" on public.match_fee_items;
drop policy if exists "match_payment_submission_items_manage_fees_edit" on public.match_payment_submission_items;

drop policy if exists "match_payment_submissions_select_allowed" on public.match_payment_submissions;
create policy "match_payment_submissions_select_allowed"
  on public.match_payment_submissions
  for select
  to authenticated
  using (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
    or profile_id = (select auth.uid())
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and match_payment_submissions.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    )
  );

drop policy if exists "match_payment_submissions_insert_own" on public.match_payment_submissions;
drop policy if exists "match_payment_submissions_update_fees_edit" on public.match_payment_submissions;

drop policy if exists "match_payment_submission_items_select_allowed" on public.match_payment_submission_items;
create policy "match_payment_submission_items_select_allowed"
  on public.match_payment_submission_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.match_payment_submissions s
      where s.id = match_payment_submission_items.submission_id
        and (
          public.has_app_permission('fees', 'VIEW')
          or public.has_app_permission('fees', 'EDIT')
          or s.profile_id = (select auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and s.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
          )
        )
    )
  );

revoke insert, update, delete, truncate on public.match_fee_items from anon, authenticated;
grant select on public.match_fee_items to authenticated;

revoke insert, update, delete, truncate on public.match_payment_submission_items from anon, authenticated;
grant select on public.match_payment_submission_items to authenticated;

revoke insert, update, delete, truncate on public.match_payment_submissions from anon, authenticated;
grant select on public.match_payment_submissions to authenticated;

do $$
declare
  v_insert_columns text;
  v_update_columns text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
  into v_insert_columns
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'matches'
    and c.is_generated = 'NEVER'
    and c.column_name not in (
      'match_fee_payment_opened_at',
      'match_fee_payment_opened_by',
      'match_fee_payment_signature'
    );

  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
  into v_update_columns
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'matches'
    and c.is_generated = 'NEVER'
    and c.column_name not in (
      'match_fee_payment_opened_at',
      'match_fee_payment_opened_by',
      'match_fee_payment_signature'
    );

  revoke insert, update on public.matches from anon, authenticated;

  if v_insert_columns is not null then
    execute format('grant insert (%s) on public.matches to authenticated', v_insert_columns);
  end if;

  if v_update_columns is not null then
    execute format('grant update (%s) on public.matches to authenticated', v_update_columns);
  end if;
end;
$$;

update public.matches m
set
  match_fee_payment_opened_at = coalesce(
    (
      select max(s.created_at)
      from public.match_fee_items fi
      join public.match_payment_submission_items si on si.match_fee_item_id = fi.id
      join public.match_payment_submissions s on s.id = si.submission_id
      where fi.match_id = m.id
    ),
    now()
  ),
  match_fee_payment_opened_by = null,
  match_fee_payment_signature = public.get_match_fee_payment_signature(m.id)
where exists (
  select 1
  from public.match_fee_items fi
  join public.match_payment_submission_items si on si.match_fee_item_id = fi.id
  where fi.match_id = m.id
);

alter function public.normalize_match_fee_player_name(text) set search_path = public;
alter function public.split_match_fee_player_names(text) set search_path = public;

revoke all on function public.normalize_match_fee_player_name(text) from public, anon, authenticated;
revoke all on function public.split_match_fee_player_names(text) from public, anon, authenticated;
revoke all on function public.sync_match_fee_items_for_match(uuid) from public, anon, authenticated;
revoke all on function public.sync_match_fee_items_for_month(text) from public, anon, authenticated;
revoke all on function public.sync_match_fee_items_after_match_change() from public, anon, authenticated;
revoke all on function public.sync_match_fee_items_after_leave_change() from public, anon, authenticated;
revoke all on function public.get_match_fee_payment_signature(uuid) from public, anon, authenticated;
revoke all on function public.set_match_fee_payment_open_state(uuid, boolean) from public, anon;
revoke all on function public.delete_cancelled_match_fee_group(uuid) from public, anon;
revoke all on function public.list_my_match_fee_items(uuid) from public, anon;
revoke all on function public.list_match_fee_items_by_month(text) from public, anon;
revoke all on function public.list_match_payment_submissions() from public, anon;
revoke all on function public.create_match_payment_submission(uuid[], text, text, date, text, integer) from public, anon;
revoke all on function public.review_match_payment_submission(uuid, text, integer) from public, anon;
revoke all on function public.rollback_match_payment_submission(uuid) from public, anon;
revoke all on function public.detach_match_fee_items_before_match_delete() from public, anon, authenticated;

grant execute on function public.normalize_match_fee_player_name(text) to service_role;
grant execute on function public.split_match_fee_player_names(text) to service_role;
grant execute on function public.sync_match_fee_items_for_match(uuid) to service_role;
grant execute on function public.sync_match_fee_items_for_month(text) to service_role;
grant execute on function public.get_match_fee_payment_signature(uuid) to service_role;
grant execute on function public.set_match_fee_payment_open_state(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_cancelled_match_fee_group(uuid) to authenticated, service_role;
grant execute on function public.list_my_match_fee_items(uuid) to authenticated, service_role;
grant execute on function public.list_match_fee_items_by_month(text) to authenticated, service_role;
grant execute on function public.list_match_payment_submissions() to authenticated, service_role;
grant execute on function public.create_match_payment_submission(uuid[], text, text, date, text, integer) to authenticated, service_role;
grant execute on function public.review_match_payment_submission(uuid, text, integer) to authenticated, service_role;
grant execute on function public.rollback_match_payment_submission(uuid) to authenticated, service_role;
grant execute on function public.detach_match_fee_items_before_match_delete() to service_role;

notify pgrst, 'reload schema';

commit;
