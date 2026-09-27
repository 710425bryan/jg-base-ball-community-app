begin;

-- Preserve the original fee snapshot; exempt fees use the existing non-payable
-- cancelled state and are hidden by the personal-payment RPC.
alter table public.match_fee_items
  add column if not exists is_exempt boolean not null default false,
  add column if not exists exemption_updated_at timestamptz,
  add column if not exists exemption_updated_by uuid references public.profiles(id) on delete set null;

alter table public.match_fee_items
  drop constraint if exists match_fee_items_exemption_state_check;
alter table public.match_fee_items
  add constraint match_fee_items_exemption_state_check
  check (not is_exempt or (payment_status = 'cancelled' and payment_submission_id is null));

comment on column public.match_fee_items.is_exempt is
  '球員本場免繳；保留原金額供稽核，不列入應收、個人繳費清單或付款候選。';

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
  where matches.id = p_match_id
  for update;

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
        when match_fee_items.is_exempt or exists (
          select 1
          from public.match_payment_submission_items history_link
          where history_link.match_fee_item_id = match_fee_items.id
        ) then match_fee_items.amount
        else excluded.amount
      end,
      payment_status = case when match_fee_items.is_exempt then 'cancelled' else 'unpaid' end,
      payment_submission_id = null,
      cancelled_at = case when match_fee_items.is_exempt then match_fee_items.cancelled_at end,
      cancelled_reason = case when match_fee_items.is_exempt then '單場免繳' end,
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
    order by id
  loop
    perform public.sync_match_fee_items_for_match(v_match.id);
  end loop;
end;
$$;

create or replace function public.set_match_fee_item_exemption(
  p_match_fee_item_id uuid,
  p_is_exempt boolean,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id uuid;
  v_item public.match_fee_items%rowtype;
begin
  if auth.uid() is null or public.current_profile_role() is null then
    raise exception '請先以有效帳號登入';
  end if;
  if not public.has_app_permission('fees', 'EDIT') then
    raise exception '需要收費編輯權限';
  end if;
  if p_is_exempt is null or p_expected_updated_at is null then
    raise exception '缺少免繳設定或資料版本，請重新整理';
  end if;

  select fi.match_id into v_match_id
  from public.match_fee_items fi where fi.id = p_match_fee_item_id;
  if v_match_id is null then
    raise exception '找不到有效的比賽費用，請重新整理';
  end if;

  -- Same lock order as create_match_payment_submission: match, then fee item.
  perform 1 from public.matches m where m.id = v_match_id for update;
  if not found then
    raise exception '比賽已刪除，請重新整理';
  end if;
  select * into v_item from public.match_fee_items fi
  where fi.id = p_match_fee_item_id for update;
  if not found or v_item.match_id is distinct from v_match_id
    or v_item.updated_at is distinct from p_expected_updated_at then
    raise exception '比賽費用已更新，請重新整理後再操作' using errcode = 'P0002';
  end if;
  if v_item.payment_status not in ('unpaid', 'cancelled')
    or v_item.payment_submission_id is not null
    or exists (
      select 1 from public.match_payment_submission_items si
      join public.match_payment_submissions s on s.id = si.submission_id
      where si.match_fee_item_id = v_item.id and s.status in ('pending_review', 'approved')
    ) then
    raise exception '此筆費用待確認或已確認，請先退回付款再設定免繳';
  end if;
  if v_item.is_exempt = p_is_exempt then return; end if;

  update public.match_fee_items set
    is_exempt = p_is_exempt,
    exemption_updated_at = now(),
    exemption_updated_by = auth.uid(),
    payment_status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = case when p_is_exempt then '單場免繳' else '參賽名單或請假狀態已變更' end,
    updated_at = now()
  where id = v_item.id;

  -- Recheck participation when restoring payment; opening/signature rules stay
  -- authoritative and already exclude cancelled (including exempt) items.
  perform public.sync_match_fee_items_for_match(v_match_id);
end;
$$;

revoke all on function public.set_match_fee_item_exemption(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.set_match_fee_item_exemption(uuid, boolean, timestamptz) to authenticated;

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
    )
  order by m.id;

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
    and not fi.is_exempt
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

drop function public.list_match_fee_items_by_month(text);

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
  updated_at timestamptz,
  is_exempt boolean
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
    fi.updated_at,
    fi.is_exempt
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
  where fi.id = p_match_fee_item_id;

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
      and (fi.payment_status <> 'cancelled' or fi.is_exempt)
  ) then
    raise exception '只有整場皆為已取消且沒有單場免繳設定的比賽費用才能刪除';
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

revoke all on function public.list_match_fee_items_by_month(text) from public, anon;
grant execute on function public.list_match_fee_items_by_month(text) to authenticated, service_role;

revoke all on function public.sync_match_fee_items_for_match(uuid) from public, anon, authenticated;
revoke all on function public.sync_match_fee_items_for_month(text) from public, anon, authenticated;
grant execute on function public.sync_match_fee_items_for_match(uuid) to service_role;
grant execute on function public.sync_match_fee_items_for_month(text) to service_role;

-- Existing RPC-only write boundary also covers the new columns.
revoke insert, update, delete, truncate on public.match_fee_items from anon, authenticated;
notify pgrst, 'reload schema';
commit;
