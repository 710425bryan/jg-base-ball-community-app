begin;

-- Cancellation preserves the match, media, lineup and all payment history.
alter table public.matches
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid;
-- Deliberately no FK to profiles: deleting an account must not erase this audit.
comment on column public.matches.cancelled_by is '取消比賽的登入者 ID；保留稽核，不隨帳號刪除。';
alter table public.matches drop constraint if exists matches_cancellation_state_check;
alter table public.matches add constraint matches_cancellation_state_check check (
  (cancelled_at is null and cancellation_reason is null and cancelled_by is null)
  or (cancelled_at is not null and cancelled_by is not null
    and cancellation_reason is not null
    and cancellation_reason = btrim(cancellation_reason)
    and char_length(cancellation_reason) between 1 and 500)
);

create schema if not exists private;
create or replace function public.cancel_match(
  p_match_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz default null
)
returns public.matches
language plpgsql security definer set search_path = '' as $$
declare
  v_match public.matches%rowtype;
  v_reason text := btrim(p_reason);
begin
  if auth.uid() is null or public.current_profile_role() is null then
    raise exception using errcode = '42501', message = '請先以有效帳號登入';
  end if;
  if not public.has_app_permission('matches', 'EDIT') then
    raise exception using errcode = '42501', message = '需要比賽編輯權限';
  end if;
  if coalesce(char_length(v_reason), 0) not between 1 and 500 then
    raise exception '請填寫 1 至 500 字的取消原因';
  end if;
  -- Same ordering as the existing match/coach source statement triggers.
  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception '找不到指定的比賽'; end if;
  if btrim(coalesce(v_match.match_level, '')) = '特訓課' then
    raise exception '特訓課請使用特訓管理流程';
  end if;
  -- An identical network retry remains successful even with the old version.
  if v_match.cancelled_at is not null then return v_match; end if;
  if p_expected_updated_at is not null
    and v_match.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0002', message = '比賽資料已更新，請重新整理後再取消';
  end if;
  update public.matches set
    cancelled_at = clock_timestamp(), cancellation_reason = v_reason,
    cancelled_by = auth.uid(),
    match_fee_payment_opened_at = null, match_fee_payment_opened_by = null,
    match_fee_payment_signature = null,
    updated_at = greatest(clock_timestamp(), coalesce(updated_at, '-infinity') + interval '1 microsecond')
  where id = p_match_id returning * into v_match;
  return v_match;
end;
$$;
revoke all on function public.cancel_match(uuid, text, timestamptz) from public, anon, service_role;
grant execute on function public.cancel_match(uuid, text, timestamptz) to authenticated;

-- Opening/closing fees updates matches, whose existing statement trigger takes
-- the coach source lock. Take that lock BEFORE the row here too, otherwise a
-- concurrent cancellation can hold the advisory lock while waiting for this
-- RPC's row lock, with this RPC waiting for the advisory lock on UPDATE.
do $$
declare
  v_oid regprocedure := 'public.set_match_fee_payment_open_state(uuid,boolean)'::regprocedure;
  v_sql text := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_anchor text := E'  select *\n  into v_match\n  from public.matches m\n  where m.id = p_match_id\n  for update;';
begin
  if position('-- match-cancellation-opening-lock-order' in v_sql) = 0 then
    if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception 'Unexpected set_match_fee_payment_open_state definition; cancellation migration aborted';
    end if;
    execute replace(v_sql, v_anchor,
      E'  -- match-cancellation-opening-lock-order\n  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);\n' || v_anchor);
  end if;
end;
$$;

-- Every entry that may sync charges and consequently close a changed payment
-- opening needs the same order. Locking inside sync alone is insufficient for
-- callers that already hold a match row (exemption/payment submission).
do $$
declare v_entry record; v_sql text;
begin
  for v_entry in select * from (values
    ('public.sync_match_fee_items_for_match(uuid)',
      E'  select *\n  into v_match\n  from public.matches\n  where matches.id = p_match_id\n  for update;'),
    ('public.set_match_fee_item_exemption(uuid,boolean,timestamptz)',
      '  perform 1 from public.matches m where m.id = v_match_id for update;'),
    ('public.create_match_payment_submission(uuid[],text,text,date,text,integer)',
      E'  perform 1\n  from public.matches m\n  where m.id = any(v_match_ids)\n  order by m.id\n  for update;')
  ) as entry(signature, anchor)
  loop
    v_sql := replace(pg_get_functiondef(v_entry.signature::regprocedure), E'\r\n', E'\n');
    if position('-- match-cancellation-billing-lock-order' in v_sql) = 0 then
      if (length(v_sql) - length(replace(v_sql, v_entry.anchor, ''))) / length(v_entry.anchor) <> 1 then
        raise exception 'Unexpected % definition; cancellation migration aborted', v_entry.signature;
      end if;
      execute replace(v_sql, v_entry.anchor,
        E'  -- match-cancellation-billing-lock-order\n  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);\n' || v_entry.anchor);
    end if;
  end loop;
end;
$$;

-- INVOKER is intentional: REST DML executes as authenticated/service_role,
-- while the narrowly authorized RPC executes as its owner. Do not use a
-- caller-settable GUC as an authorization bypass.
create or replace function private.protect_match_cancellation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.cancelled_at is not null then
    if row(new.cancelled_at, new.cancellation_reason, new.cancelled_by)
      is distinct from row(old.cancelled_at, old.cancellation_reason, old.cancelled_by) then
      raise exception '已取消比賽的取消紀錄不可變更或恢復';
    end if;
  elsif new.cancelled_at is not null or new.cancellation_reason is not null or new.cancelled_by is not null then
    if tg_op = 'INSERT' or current_user <> (
      select pg_catalog.pg_get_userbyid(p.proowner) from pg_catalog.pg_proc p
      where p.oid = 'public.cancel_match(uuid,text,timestamp with time zone)'::regprocedure
    ) then
      raise exception using errcode = '42501', message = '請使用取消比賽功能';
    end if;
  end if;
  if new.cancelled_at is not null and new.match_fee_payment_opened_at is not null then
    raise exception '已取消比賽不可開放繳費';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_match_cancellation() from public, anon, authenticated;
drop trigger if exists protect_match_cancellation on public.matches;
create trigger protect_match_cancellation before insert or update on public.matches
for each row execute function private.protect_match_cancellation();

-- Extend the currently installed billing function, preserving subsequent
-- exemption/independent-billing fixes rather than reinstalling older bodies.
do $$
declare
  v_oid regprocedure := 'public.sync_match_fee_items_for_match(uuid)'::regprocedure;
  v_sql text := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_anchor text := E'  if coalesce(v_match.match_fee_amount, 0) > 0 and v_match.match_date is not null then';
  v_insert text := $patch$  -- match-cancellation: never recreate charges or rewrite pending/paid history.
  if v_match.cancelled_at is not null then
    update public.match_fee_items fi set payment_status = 'cancelled',
      cancelled_at = v_match.cancelled_at,
      cancelled_reason = '比賽已取消：' || v_match.cancellation_reason,
      updated_at = now()
    where fi.match_id = v_match.id and fi.payment_status = 'unpaid'
      and fi.payment_submission_id is null;
    return;
  end if;

$patch$;
begin
  if position('-- match-cancellation:' in v_sql) = 0 then
    if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception 'Unexpected sync_match_fee_items_for_match definition; cancellation migration aborted';
    end if;
    execute replace(v_sql, v_anchor, v_insert || v_anchor);
  end if;
end;
$$;

create or replace function private.after_match_cancellation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.cancelled_at is null and new.cancelled_at is not null then
    perform public.sync_match_fee_items_for_match(new.id);
    if to_regclass('public.coach_schedule_events') is not null then
      update public.coach_schedule_events set status = 'cancelled',
        updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
      where source_type = 'match' and source_id = new.id and status <> 'cancelled';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.after_match_cancellation() from public, anon, authenticated;
drop trigger if exists after_match_cancellation on public.matches;
create trigger after_match_cancellation after update of cancelled_at on public.matches
for each row execute function private.after_match_cancellation();

-- A subsequent rejection/deletion of a pending payment must not revive debt.
-- Existing pending -> paid review remains a deliberate finance operation.
create or replace function private.guard_cancelled_match_fee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id = new.match_id;
  if v_match.cancelled_at is null then return new; end if;
  if new.payment_status = 'pending_review'
    and (tg_op = 'INSERT' or old.payment_status <> 'pending_review'
      or new.payment_submission_id is distinct from old.payment_submission_id) then
    raise exception '已取消比賽不可新增付款回報';
  end if;
  if new.payment_status = 'unpaid' and new.payment_submission_id is null then
    new.payment_status := 'cancelled';
    new.cancelled_at := v_match.cancelled_at;
    new.cancelled_reason := '比賽已取消：' || v_match.cancellation_reason;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_cancelled_match_fee() from public, anon, authenticated;
drop trigger if exists guard_cancelled_match_fee on public.match_fee_items;
create trigger guard_cancelled_match_fee before insert or update on public.match_fee_items
for each row execute function private.guard_cancelled_match_fee();

-- Filter at the source, including OR-based player-stat selectors. Function
-- signatures, authorization and ACLs stay unchanged. Only existing optional
-- modules are patched, so this also supports installations without coaching.
do $$
declare v_function record; v_sql text; v_new text; v_required text;
begin
  for v_function in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in (
      'get_my_home_next_event', 'get_my_home_snapshot', 'get_my_player_match_records',
      'get_public_landing_snapshot', 'list_coach_schedule_admin_month'))
      or (n.nspname = 'private' and p.proname = 'list_coach_schedule_admin_month_base')
  loop
    v_sql := replace(pg_get_functiondef(v_function.oid), E'\r\n', E'\n');
    if position('-- active-match-cancellation-filter' in v_sql) > 0 then continue; end if;
    v_new := regexp_replace(v_sql, 'from public\.matches m\M',
      'from (select active_match.* from public.matches active_match where active_match.cancelled_at is null) m /* -- active-match-cancellation-filter */', 'gi');
    v_new := regexp_replace(v_new, 'from public\.matches([[:space:]]*\n)',
      E'from (select active_match.* from public.matches active_match where active_match.cancelled_at is null) matches /* -- active-match-cancellation-filter */\\1', 'gi');
    if v_new is distinct from v_sql then execute v_new; end if;
  end loop;
  -- These are established production read paths, not optional modules. Refuse
  -- an unexpected catalog rather than publish a partially filtered feature.
  foreach v_required in array array[
    'public.get_my_home_next_event(uuid,date)',
    'public.get_my_player_match_records(uuid)',
    'public.get_public_landing_snapshot(date)'
  ] loop
    if to_regprocedure(v_required) is null or position('-- active-match-cancellation-filter'
      in pg_get_functiondef(to_regprocedure(v_required))) = 0 then
      raise exception 'Cancellation filter missing for %, migration aborted', v_required;
    end if;
  end loop;
  -- Keep historical push event rows, but remove stale calls to gather/play.
  for v_function in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in ('get_notification_feed', 'notification_feed_before_coach_leave')
  loop
    v_sql := replace(pg_get_functiondef(v_function.oid), E'\r\n', E'\n');
    if position('-- cancelled-match-reminder-filter' in v_sql) > 0 then continue; end if;
    v_new := regexp_replace(v_sql, 'pde\.action[[:space:]]*=[[:space:]]*''REMINDER''',
      $filter$pde.action = 'REMINDER' and not exists (
        select 1 from public.matches cancelled_match
        where cancelled_match.id = pde.match_id and cancelled_match.cancelled_at is not null
      ) /* -- cancelled-match-reminder-filter */$filter$, 'g');
    if v_new is distinct from v_sql then execute v_new; end if;
  end loop;
end;
$$;

create or replace function private.guard_cancelled_match_coach_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source_type = 'match' and new.status <> 'cancelled' and exists (
    select 1 from public.matches where id = new.source_id and cancelled_at is not null
  ) then raise exception '比賽已取消，不可恢復教練排班'; end if;
  return new;
end;
$$;
revoke all on function private.guard_cancelled_match_coach_schedule() from public, anon, authenticated;
do $$ begin
  if to_regclass('public.coach_schedule_events') is not null then
    execute 'drop trigger if exists guard_cancelled_match_coach_schedule on public.coach_schedule_events';
    execute 'create trigger guard_cancelled_match_coach_schedule before insert or update on public.coach_schedule_events for each row execute function private.guard_cancelled_match_coach_schedule()';
  end if;
end; $$;

notify pgrst, 'reload schema';
commit;
