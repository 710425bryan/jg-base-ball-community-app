begin;

-- Separate membership fees from match fees without changing existing balances,
-- submissions, participation or training/attendance eligibility.
alter table public.team_members
  add column if not exists match_fee_enabled boolean,
  add column if not exists match_fee_start_date date;

-- Only bootstrap missing settings. Replaying must not overwrite manual choices
-- or effective dates. Existing billable members retain historical eligibility.
update public.team_members
set match_fee_enabled = coalesce(role in ('球員', '校隊') and fee_billing_mode <> 'no_fee', false)
where match_fee_enabled is null;
alter table public.team_members alter column match_fee_enabled set not null;

comment on column public.team_members.match_fee_enabled is
  '比賽費獨立開關；不受隊費 fee_billing_mode 影響，仍依參賽、請假與單場免繳判斷。';
comment on column public.team_members.match_fee_start_date is
  '比賽費啟用日起算（台灣日期），由 trigger 維護；既有收費成員 null 代表保留原歷史範圍。';

create schema if not exists private;
create or replace function private.normalize_player_match_billing()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Omitted settings from Google sync / older clients inherit their old
    -- initial behavior. Explicit UI choices are independent of team fees.
    new.match_fee_enabled := coalesce(new.match_fee_enabled,
      new.role in ('球員', '校隊') and coalesce(new.fee_billing_mode, 'role_default') <> 'no_fee', false);
    new.match_fee_start_date := case when new.match_fee_enabled
      then (now() at time zone 'Asia/Taipei')::date end;
  elsif new.match_fee_enabled is distinct from old.match_fee_enabled then
    if new.match_fee_enabled is null then
      raise exception '請選擇是否收取比賽費';
    end if;
    new.match_fee_start_date := case when new.match_fee_enabled
      then (now() at time zone 'Asia/Taipei')::date end;
  else
    -- No client (including stale forms) may backdate an activation.
    new.match_fee_start_date := old.match_fee_start_date;
  end if;
  return new;
end;
$$;
revoke all on function private.normalize_player_match_billing() from public, anon, authenticated;
drop trigger if exists normalize_player_match_billing on public.team_members;
create trigger normalize_player_match_billing
  before insert or update on public.team_members
  for each row execute function private.normalize_player_match_billing();

-- Keep every existing safe column and append only the new non-sensitive fields.
-- Full-edit RPC returns SETOF team_members, so its existing auth guard is retained.
do $$
declare v_definition text;
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='team_members_safe' and column_name='match_fee_enabled') then
    v_definition := rtrim(pg_get_viewdef('public.team_members_safe'::regclass, true), E'; \n\r');
    execute 'create or replace view public.team_members_safe with (security_invoker = true) as '
      || 'select existing.*, billing.match_fee_enabled, billing.match_fee_start_date from ('
      || v_definition || ') existing join public.team_members billing on billing.id = existing.id';
  end if;
end;
$$;
alter view public.team_members_safe set (security_invoker = true);
grant select (match_fee_enabled, match_fee_start_date) on public.team_members to authenticated;

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
        and tm.match_fee_enabled
        and (tm.match_fee_start_date is null or v_match.match_date >= tm.match_fee_start_date)
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
      and tm.match_fee_enabled
        and (tm.match_fee_start_date is null or v_match.match_date >= tm.match_fee_start_date)
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
      else '比賽收費設定、參賽名單或請假狀態已變更'
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

-- Saving the switch refreshes affected matches in the same transaction. The
-- existing match-first/item-second lock order serializes with payment creation.
create or replace function private.sync_match_fees_after_player_billing_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_match_id uuid;
begin
  if new.match_fee_enabled is not distinct from old.match_fee_enabled then return new; end if;
  for v_match_id in
    select m.id from public.matches m
    where exists (
      select 1 from public.match_fee_items fi where fi.match_id=m.id and fi.member_id=new.id
    ) or exists (
      select 1 from public.split_match_fee_player_names(m.players) pn
      where public.normalize_match_fee_player_name(pn.player_name)
        = public.normalize_match_fee_player_name(new.name::text)
    )
    order by m.id
  loop
    perform public.sync_match_fee_items_for_match(v_match_id);
  end loop;
  return new;
end;
$$;
revoke all on function private.sync_match_fees_after_player_billing_change() from public, anon, authenticated;
drop trigger if exists sync_match_fees_after_player_billing_change on public.team_members;
create trigger sync_match_fees_after_player_billing_change
  after update of match_fee_enabled on public.team_members
  for each row execute function private.sync_match_fees_after_player_billing_change();

-- Existing team_members INSERT/UPDATE RLS continues to require players:CREATE /
-- players:EDIT. Do not expand writes or allow callers to invoke internal sync.
revoke all on function public.sync_match_fee_items_for_match(uuid) from public, anon, authenticated;
grant execute on function public.sync_match_fee_items_for_match(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
