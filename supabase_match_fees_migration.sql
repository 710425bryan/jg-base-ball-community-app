begin;

alter table public.matches
  add column if not exists match_fee_amount integer check (match_fee_amount is null or match_fee_amount >= 0);

create table if not exists public.match_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete restrict,
  amount integer not null check (amount > 0),
  balance_amount integer not null default 0 check (balance_amount >= 0),
  payment_method text not null,
  account_last_5 text,
  remittance_date date not null default current_date,
  note text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_fee_items (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.matches(id) on delete set null,
  member_id uuid not null references public.team_members(id) on delete restrict,
  member_name_snapshot text not null,
  match_name_snapshot text not null,
  tournament_name_snapshot text,
  match_date_snapshot date not null,
  match_time_snapshot text,
  category_group_snapshot text,
  fee_month varchar(7) not null check (fee_month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount integer not null check (amount > 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending_review', 'paid', 'cancelled')),
  payment_submission_id uuid references public.match_payment_submissions(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_payment_submission_items (
  submission_id uuid not null references public.match_payment_submissions(id) on delete cascade,
  match_fee_item_id uuid not null references public.match_fee_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (submission_id, match_fee_item_id)
);

alter table public.player_balance_transactions
  add column if not exists related_match_payment_submission_id uuid references public.match_payment_submissions(id) on delete set null;

create unique index if not exists match_fee_items_match_member_uidx
  on public.match_fee_items(match_id, member_id)
  where match_id is not null;

create index if not exists match_fee_items_member_month_idx
  on public.match_fee_items(member_id, fee_month desc);

create index if not exists match_fee_items_match_idx
  on public.match_fee_items(match_id)
  where match_id is not null;

create index if not exists match_fee_items_status_idx
  on public.match_fee_items(payment_status);

create index if not exists match_payment_submissions_member_idx
  on public.match_payment_submissions(member_id);

create index if not exists match_payment_submissions_status_idx
  on public.match_payment_submissions(status);

create index if not exists player_balance_transactions_match_submission_idx
  on public.player_balance_transactions(related_match_payment_submission_id)
  where related_match_payment_submission_id is not null;

alter table public.match_fee_items enable row level security;
alter table public.match_payment_submissions enable row level security;
alter table public.match_payment_submission_items enable row level security;

drop policy if exists "match_fee_items_select_allowed" on public.match_fee_items;
create policy "match_fee_items_select_allowed"
  on public.match_fee_items
  for select
  using (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and match_fee_items.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    )
  );

drop policy if exists "match_fee_items_manage_fees_edit" on public.match_fee_items;
create policy "match_fee_items_manage_fees_edit"
  on public.match_fee_items
  for all
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "match_payment_submissions_select_allowed" on public.match_payment_submissions;
create policy "match_payment_submissions_select_allowed"
  on public.match_payment_submissions
  for select
  using (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
    or profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and match_payment_submissions.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    )
  );

drop policy if exists "match_payment_submissions_insert_own" on public.match_payment_submissions;
create policy "match_payment_submissions_insert_own"
  on public.match_payment_submissions
  for insert
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and match_payment_submissions.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    )
  );

drop policy if exists "match_payment_submissions_update_fees_edit" on public.match_payment_submissions;
create policy "match_payment_submissions_update_fees_edit"
  on public.match_payment_submissions
  for update
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "match_payment_submission_items_select_allowed" on public.match_payment_submission_items;
create policy "match_payment_submission_items_select_allowed"
  on public.match_payment_submission_items
  for select
  using (
    exists (
      select 1
      from public.match_payment_submissions s
      where s.id = match_payment_submission_items.submission_id
        and (
          public.has_app_permission('fees', 'VIEW')
          or public.has_app_permission('fees', 'EDIT')
          or s.profile_id = auth.uid()
        )
    )
  );

drop policy if exists "match_payment_submission_items_manage_fees_edit" on public.match_payment_submission_items;
create policy "match_payment_submission_items_manage_fees_edit"
  on public.match_payment_submission_items
  for all
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

create or replace function public.normalize_match_fee_player_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_name, ''), '[\s·‧・．.]', '', 'g'));
$$;

create or replace function public.split_match_fee_player_names(p_players text)
returns table (player_name text)
language sql
immutable
as $$
  with parsed_names as (
    select nullif(btrim(regexp_replace(raw_name, '^\s*[0-9]{1,3}\s*[.)、．-]\s*', '')), '') as player_name
    from regexp_split_to_table(coalesce(p_players, ''), '[,，、/;；\n]+') as raw_name
    where nullif(btrim(raw_name), '') is not null
  )
  select parsed_names.player_name
  from parsed_names
  where parsed_names.player_name is not null
    and parsed_names.player_name !~ '^[[:space:]]*比賽費用[[:space:]]*[:：]?.*$'
    and parsed_names.player_name !~ '^[[:space:]]*[0-9]([0-9,]|[[:space:]])*元?[[:space:]]*$';
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

create or replace function public.sync_match_fee_items_for_month(p_fee_month text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_fee_month text := nullif(btrim(p_fee_month), '');
begin
  if v_fee_month is null or v_fee_month !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'fee_month must look like YYYY-MM';
  end if;

  for v_match in
    select id
    from public.matches
    where to_char(match_date, 'YYYY-MM') = v_fee_month
  loop
    perform public.sync_match_fee_items_for_match(v_match.id);
  end loop;
end;
$$;

create or replace function public.sync_match_fee_items_after_match_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_match_fee_items_for_match(new.id);
  return new;
end;
$$;

create or replace function public.detach_match_fee_items_before_match_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.match_fee_items
  set
    payment_status = case when payment_status = 'unpaid' then 'cancelled' else payment_status end,
    cancelled_at = case when payment_status = 'unpaid' then now() else cancelled_at end,
    cancelled_reason = case when payment_status = 'unpaid' then '比賽已刪除' else cancelled_reason end,
    match_id = null,
    updated_at = now()
  where match_id = old.id;

  return old;
end;
$$;

create or replace function public.sync_match_fee_items_after_leave_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
  v_match record;
begin
  if tg_op = 'DELETE' then
    v_start_date := old.start_date;
    v_end_date := coalesce(old.end_date, old.start_date);
  elsif tg_op = 'UPDATE' then
    v_start_date := least(old.start_date, new.start_date);
    v_end_date := greatest(coalesce(old.end_date, old.start_date), coalesce(new.end_date, new.start_date));
  else
    v_start_date := new.start_date;
    v_end_date := coalesce(new.end_date, new.start_date);
  end if;

  for v_match in
    select id
    from public.matches
    where match_date between v_start_date and v_end_date
  loop
    perform public.sync_match_fee_items_for_match(v_match.id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_match_fee_items_after_match_change on public.matches;
create trigger sync_match_fee_items_after_match_change
after insert or update of match_fee_amount, match_name, tournament_name, match_date, match_time, category_group, players, absent_players
on public.matches
for each row
execute function public.sync_match_fee_items_after_match_change();

drop trigger if exists detach_match_fee_items_before_match_delete on public.matches;
create trigger detach_match_fee_items_before_match_delete
before delete on public.matches
for each row
execute function public.detach_match_fee_items_before_match_delete();

drop trigger if exists sync_match_fee_items_after_leave_change on public.leave_requests;
create trigger sync_match_fee_items_after_leave_change
after insert or update or delete on public.leave_requests
for each row
execute function public.sync_match_fee_items_after_leave_change();

create or replace function public.list_my_match_fee_items(p_member_id uuid)
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

  if not (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
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
    fi.updated_at
  from public.match_fee_items fi
  where fi.member_id = p_member_id
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

create or replace function public.list_match_fee_items_by_month(p_fee_month text)
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
  left join public.match_payment_submissions s on s.id = fi.payment_submission_id
  where fi.fee_month = v_fee_month
  order by fi.match_date_snapshot desc, fi.match_time_snapshot desc, fi.match_name_snapshot, fi.member_name_snapshot;
end;
$$;

create or replace function public.list_match_payment_submissions()
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
  v_can_manage boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  v_can_manage := public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT');

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
          'id', fi.id,
          'match_id', fi.match_id,
          'member_id', fi.member_id,
          'member_name', fi.member_name_snapshot,
          'match_name', fi.match_name_snapshot,
          'tournament_name', fi.tournament_name_snapshot,
          'match_date', fi.match_date_snapshot,
          'match_time', fi.match_time_snapshot,
          'category_group', fi.category_group_snapshot,
          'fee_month', fi.fee_month,
          'amount', fi.amount,
          'payment_status', fi.payment_status,
          'payment_submission_id', fi.payment_submission_id
        )
        order by fi.match_date_snapshot desc, fi.created_at desc
      ) filter (where fi.id is not null),
      '[]'::jsonb
    ) as items
  from public.match_payment_submissions s
  join public.team_members tm on tm.id = s.member_id
  left join public.match_payment_submission_items si on si.submission_id = s.id
  left join public.match_fee_items fi on fi.id = si.match_fee_item_id
  where v_can_manage or s.profile_id = v_user_id
  group by s.id, tm.name
  order by s.created_at desc;
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

  perform 1
  from public.match_fee_items fi
  where fi.id = any(v_item_ids)
  for update;

  select
    count(*),
    count(distinct fi.member_id),
    (array_agg(fi.member_id))[1],
    sum(fi.amount)
  into v_count, v_member_count, v_member_id, v_amount
  from public.match_fee_items fi
  where fi.id = any(v_item_ids)
    and fi.payment_status = 'unpaid'
    and fi.payment_submission_id is null;

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

create or replace function public.review_match_payment_submission(
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
  v_submission public.match_payment_submissions%rowtype;
  v_overpayment_amount integer := greatest(coalesce(p_overpayment_amount, 0), 0);
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
  from public.match_payment_submissions
  where match_payment_submissions.id = p_submission_id
    and match_payment_submissions.status = 'pending_review'
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
        related_match_payment_submission_id,
        idempotency_key,
        created_by
      )
      values (
        v_submission.member_id,
        -v_submission.balance_amount,
        '比賽費用扣抵',
        'payment_deduction',
        v_submission.id,
        format('match_payment:%s:balance', v_submission.id),
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
        related_match_payment_submission_id,
        idempotency_key,
        created_by
      )
      values (
        v_submission.member_id,
        v_overpayment_amount,
        '比賽費用溢繳轉入',
        'overpayment',
        v_submission.id,
        format('match_payment:%s:overpayment', v_submission.id),
        v_user_id
      )
      on conflict (idempotency_key) do nothing;
    end if;

    update public.match_fee_items
    set
      payment_status = 'paid',
      paid_at = now(),
      paid_by = v_user_id,
      updated_at = now()
    where match_fee_items.id in (
      select match_fee_item_id
      from public.match_payment_submission_items
      where submission_id = p_submission_id
    );
  else
    update public.match_fee_items
    set
      payment_status = 'unpaid',
      payment_submission_id = null,
      updated_at = now()
    where match_fee_items.id in (
      select match_fee_item_id
      from public.match_payment_submission_items
      where submission_id = p_submission_id
    );
  end if;

  update public.match_payment_submissions
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where match_payment_submissions.id = p_submission_id;

  return query
  select *
  from public.list_match_payment_submissions() submissions
  where submissions.id = p_submission_id;
end;
$$;

create or replace function public.rollback_match_payment_submission(p_submission_id uuid)
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
  v_submission public.match_payment_submissions%rowtype;
  v_balance_row record;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  select *
  into v_submission
  from public.match_payment_submissions
  where match_payment_submissions.id = p_submission_id
    and match_payment_submissions.status = 'approved'
  for update;

  if not found then
    raise exception 'submission not found or not approved';
  end if;

  perform 1
  from public.team_members tm
  where tm.id = v_submission.member_id
  for update;

  for v_balance_row in
    select
      pbt.source,
      coalesce(sum(pbt.delta), 0)::integer as original_delta,
      (-coalesce(sum(pbt.delta), 0))::integer as reversal_delta
    from public.player_balance_transactions pbt
    where pbt.related_match_payment_submission_id = p_submission_id
      and pbt.idempotency_key in (
        format('match_payment:%s:balance', p_submission_id),
        format('match_payment:%s:overpayment', p_submission_id)
      )
      and pbt.source in ('payment_deduction', 'overpayment')
    group by pbt.source
    having coalesce(sum(pbt.delta), 0) <> 0
    order by (-coalesce(sum(pbt.delta), 0)) desc
  loop
    if v_balance_row.reversal_delta < 0
      and public.get_player_balance_unchecked(v_submission.member_id) + v_balance_row.reversal_delta < 0
    then
      raise exception 'player balance is not enough to rollback this payment';
    end if;

    insert into public.player_balance_transactions (
      member_id,
      delta,
      reason,
      source,
      related_match_payment_submission_id,
      idempotency_key,
      created_by
    )
    values (
      v_submission.member_id,
      v_balance_row.reversal_delta,
      case
        when v_balance_row.source = 'payment_deduction' then '退回比賽費用扣抵'
        else '退回比賽費用溢繳'
      end,
      'manual_adjustment',
      v_submission.id,
      format('match_payment:%s:rollback:%s', v_submission.id, v_balance_row.source),
      v_user_id
    )
    on conflict (idempotency_key) do nothing;
  end loop;

  update public.match_fee_items
  set
    payment_status = 'unpaid',
    payment_submission_id = null,
    paid_at = null,
    paid_by = null,
    updated_at = now()
  where match_fee_items.id in (
    select match_fee_item_id
    from public.match_payment_submission_items
    where submission_id = p_submission_id
  )
    and match_fee_items.payment_status = 'paid';

  update public.match_payment_submissions
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where match_payment_submissions.id = p_submission_id;

  return query
  select *
  from public.list_match_payment_submissions() submissions
  where submissions.id = p_submission_id;
end;
$$;

update public.matches m
set players = coalesce(cleaned.players, '')
from (
  select
    m2.id,
    string_agg(pn.player_name, ',' order by pn.ordinality) as players
  from public.matches m2
  left join lateral public.split_match_fee_player_names(m2.players) with ordinality as pn(player_name, ordinality)
    on true
  where m2.players ~ '比賽費用'
  group by m2.id
) cleaned
where m.id = cleaned.id
  and m.players is distinct from coalesce(cleaned.players, '');

do $$
declare
  v_match record;
begin
  for v_match in
    select id
    from public.matches
    where coalesce(match_fee_amount, 0) > 0
  loop
    perform public.sync_match_fee_items_for_match(v_match.id);
  end loop;
end;
$$;

grant select, insert, update, delete on public.match_fee_items to authenticated, service_role;
grant select, insert, update, delete on public.match_payment_submissions to authenticated, service_role;
grant select, insert, update, delete on public.match_payment_submission_items to authenticated, service_role;

revoke all on function public.normalize_match_fee_player_name(text) from public;
revoke all on function public.split_match_fee_player_names(text) from public;
revoke all on function public.sync_match_fee_items_for_match(uuid) from public;
revoke all on function public.sync_match_fee_items_for_month(text) from public;
revoke all on function public.list_my_match_fee_items(uuid) from public;
revoke all on function public.list_match_fee_items_by_month(text) from public;
revoke all on function public.list_match_payment_submissions() from public;
revoke all on function public.create_match_payment_submission(uuid[], text, text, date, text, integer) from public;
revoke all on function public.review_match_payment_submission(uuid, text, integer) from public;
revoke all on function public.rollback_match_payment_submission(uuid) from public;

grant execute on function public.normalize_match_fee_player_name(text) to service_role;
grant execute on function public.split_match_fee_player_names(text) to service_role;
grant execute on function public.sync_match_fee_items_for_match(uuid) to authenticated, service_role;
grant execute on function public.sync_match_fee_items_for_month(text) to authenticated, service_role;
grant execute on function public.list_my_match_fee_items(uuid) to authenticated, service_role;
grant execute on function public.list_match_fee_items_by_month(text) to authenticated, service_role;
grant execute on function public.list_match_payment_submissions() to authenticated, service_role;
grant execute on function public.create_match_payment_submission(uuid[], text, text, date, text, integer) to authenticated, service_role;
grant execute on function public.review_match_payment_submission(uuid, text, integer) to authenticated, service_role;
grant execute on function public.rollback_match_payment_submission(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
