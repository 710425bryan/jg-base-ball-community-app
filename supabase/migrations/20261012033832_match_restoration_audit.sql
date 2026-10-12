begin;

-- Keep the public row as the current state, with every transition retained in
-- a private, append-only audit. No profile/match FK may erase this history.
create table if not exists private.match_cancellation_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  action text not null check (action in ('cancelled', 'restored')),
  actor_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  previous_updated_at timestamptz,
  result_updated_at timestamptz not null,
  cancelled_at timestamptz not null,
  cancellation_reason text not null,
  cancelled_by uuid not null,
  coach_events jsonb not null default '[]'::jsonb,
  constraint match_cancellation_events_version_advances check (
    previous_updated_at is null or result_updated_at > previous_updated_at
  ),
  constraint match_cancellation_events_version_key unique (match_id, action, result_updated_at)
);
alter table private.match_cancellation_events enable row level security;
revoke all on table private.match_cancellation_events from public, anon, authenticated, service_role;

create or replace function private.protect_match_cancellation_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '比賽取消與恢復歷程不可變更或刪除';
end;
$$;
revoke all on function private.protect_match_cancellation_history() from public, anon, authenticated, service_role;
drop trigger if exists protect_match_cancellation_history on private.match_cancellation_events;
create trigger protect_match_cancellation_history before update or delete on private.match_cancellation_events
for each row execute function private.protect_match_cancellation_history();

-- Earlier installations have only the latest cancellation state. Preserve it
-- once, without inventing the pre-cancel version or previous coach statuses.
insert into private.match_cancellation_events (
  match_id, action, actor_id, occurred_at, result_updated_at,
  cancelled_at, cancellation_reason, cancelled_by
)
select m.id, 'cancelled', m.cancelled_by, m.cancelled_at, m.updated_at,
  m.cancelled_at, m.cancellation_reason, m.cancelled_by
from public.matches m
where m.cancelled_at is not null
  and not exists (select 1 from private.match_cancellation_events e
    where e.match_id = m.id and e.action = 'cancelled' and e.cancelled_at = m.cancelled_at)
on conflict do nothing;

create or replace function public.cancel_match(
  p_match_id uuid, p_reason text, p_expected_updated_at timestamptz default null
)
returns public.matches
language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype; v_reason text := btrim(p_reason);
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
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0002', message = '缺少比賽版本，請重新整理後再取消';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception '找不到指定的比賽'; end if;
  if btrim(coalesce(v_match.match_level, '')) = '特訓課' then
    raise exception '特訓課請使用特訓管理流程';
  end if;
  -- A retry belongs to one cancellation cycle, not any later cancellation.
  if v_match.cancelled_at is not null and exists (
    select 1 from private.match_cancellation_events e where e.match_id = v_match.id
      and e.action = 'cancelled' and e.cancelled_at = v_match.cancelled_at
      and e.previous_updated_at = p_expected_updated_at
  ) then return v_match; end if;
  if v_match.cancelled_at is not null or v_match.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0002', message = '比賽資料已更新，請重新整理後再取消';
  end if;
  update public.matches set cancelled_at = clock_timestamp(), cancellation_reason = v_reason,
    cancelled_by = auth.uid(), match_fee_payment_opened_at = null,
    match_fee_payment_opened_by = null, match_fee_payment_signature = null,
    updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
  where id = p_match_id returning * into v_match;
  return v_match;
end;
$$;
revoke all on function public.cancel_match(uuid,text,timestamptz) from public, anon, service_role;
grant execute on function public.cancel_match(uuid,text,timestamptz) to authenticated;

create or replace function public.restore_match(p_match_id uuid, p_expected_updated_at timestamptz)
returns public.matches
language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype;
begin
  if auth.uid() is null or public.current_profile_role() is null then
    raise exception using errcode = '42501', message = '請先以有效帳號登入';
  end if;
  if not public.has_app_permission('matches', 'EDIT') then
    raise exception using errcode = '42501', message = '需要比賽編輯權限';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0002', message = '缺少比賽版本，請重新整理後再恢復';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception '找不到指定的比賽'; end if;
  if btrim(coalesce(v_match.match_level, '')) = '特訓課' then
    raise exception '特訓課請使用特訓管理流程';
  end if;
  -- Only an unchanged result of this exact restore can be returned as a retry.
  if v_match.cancelled_at is null and exists (
    select 1 from private.match_cancellation_events e where e.match_id = v_match.id
      and e.action = 'restored' and e.previous_updated_at = p_expected_updated_at
      and e.result_updated_at = v_match.updated_at
  ) then return v_match; end if;
  if v_match.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0002', message = '比賽資料已更新，請重新整理後再恢復';
  end if;
  if v_match.cancelled_at is null then raise exception '比賽目前未取消，無須恢復'; end if;
  update public.matches set cancelled_at = null, cancellation_reason = null, cancelled_by = null,
    match_fee_payment_opened_at = null, match_fee_payment_opened_by = null,
    match_fee_payment_signature = null,
    updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
  where id = p_match_id returning * into v_match;
  return v_match;
end;
$$;
revoke all on function public.restore_match(uuid,timestamptz) from public, anon, service_role;
grant execute on function public.restore_match(uuid,timestamptz) to authenticated;

-- INVOKER distinguishes narrowly authorized definer RPCs from REST users and
-- service_role. A caller-settable GUC is never an authorization capability.
create or replace function private.protect_match_cancellation()
returns trigger language plpgsql set search_path = '' as $$
declare v_rpc regprocedure;
begin
  if tg_op = 'INSERT' then
    if new.cancelled_at is not null or new.cancellation_reason is not null or new.cancelled_by is not null then
      raise exception using errcode = '42501', message = '請使用取消比賽功能';
    end if;
  elsif row(new.cancelled_at, new.cancellation_reason, new.cancelled_by)
    is distinct from row(old.cancelled_at, old.cancellation_reason, old.cancelled_by) then
    if old.cancelled_at is null and new.cancelled_at is not null then
      v_rpc := 'public.cancel_match(uuid,text,timestamptz)'::regprocedure;
    elsif old.cancelled_at is not null and new.cancelled_at is null
      and new.cancellation_reason is null and new.cancelled_by is null then
      v_rpc := 'public.restore_match(uuid,timestamptz)'::regprocedure;
    else
      raise exception '已取消比賽的取消紀錄不可直接變更';
    end if;
    if current_user <> (select pg_catalog.pg_get_userbyid(p.proowner) from pg_catalog.pg_proc p where p.oid = v_rpc) then
      raise exception using errcode = '42501', message = '請使用取消或恢復比賽功能';
    end if;
    if new.updated_at is null or new.updated_at <= old.updated_at then
      raise exception '取消或恢復比賽必須更新版本';
    end if;
  end if;
  if new.cancelled_at is not null and new.match_fee_payment_opened_at is not null then
    raise exception '已取消比賽不可開放繳費';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_match_cancellation() from public, anon, authenticated, service_role;

create or replace function private.can_restore_match_coach_event(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_event record;
begin
  select * into v_event from public.coach_schedule_events where id = p_event_id;
  if not found then return false; end if;
  if not exists (select 1 from public.coach_schedule_assignments where event_id = p_event_id) then
    return true;
  end if;
  -- Optional/older coaching installations cannot safely infer eligibility.
  if to_regprocedure('private.coach_profile_is_schedulable(uuid)') is null
    or to_regprocedure('private.coach_has_leave(uuid,date,text,text)') is null
    or to_regprocedure('private.coach_has_booking(uuid,date,text,text,uuid)') is null then
    return false;
  end if;
  return not exists (select 1 from public.coach_schedule_assignments a where a.event_id = p_event_id
    and (not private.coach_profile_is_schedulable(a.coach_profile_id)
      or private.coach_has_leave(a.coach_profile_id, v_event.schedule_date, v_event.start_time, v_event.end_time)
      or private.coach_has_booking(a.coach_profile_id, v_event.schedule_date, v_event.start_time, v_event.end_time, p_event_id)));
end;
$$;
revoke all on function private.can_restore_match_coach_event(uuid) from public, anon, authenticated, service_role;

create or replace function private.after_match_cancellation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_coach_events jsonb := '[]'::jsonb;
begin
  -- Validate after all BEFORE triggers too: a timestamp trigger must never
  -- silently collapse two transitions into the same client-visible version.
  if (old.cancelled_at is null) <> (new.cancelled_at is null)
    and (new.updated_at is null or new.updated_at <= old.updated_at) then
    raise exception '取消或恢復比賽必須更新版本';
  end if;
  if old.cancelled_at is null and new.cancelled_at is not null then
    perform public.sync_match_fee_items_for_match(new.id);
    if to_regclass('public.coach_schedule_events') is not null then
      with changed as (
        update public.coach_schedule_events set status = 'cancelled',
          updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
        where source_type = 'match' and source_id = new.id and status = 'scheduled'
        returning id, updated_at
      ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at)), '[]'::jsonb)
        into v_coach_events from changed;
    end if;
    insert into private.match_cancellation_events (match_id, action, actor_id, previous_updated_at,
      result_updated_at, cancelled_at, cancellation_reason, cancelled_by, coach_events)
    values (new.id, 'cancelled', auth.uid(), old.updated_at, new.updated_at,
      new.cancelled_at, new.cancellation_reason, new.cancelled_by, v_coach_events);
  elsif old.cancelled_at is not null and new.cancelled_at is null then
    -- Existing billing rules retain pending/paid/history and single-game exemptions.
    perform public.sync_match_fee_items_for_match(new.id);
    select e.coach_events into v_coach_events from private.match_cancellation_events e
    where e.match_id = old.id and e.action = 'cancelled' and e.cancelled_at = old.cancelled_at
    order by e.result_updated_at desc limit 1;
    if to_regclass('public.coach_schedule_events') is not null then
      update public.coach_schedule_events e set status = 'scheduled',
        updated_at = greatest(clock_timestamp(), e.updated_at + interval '1 microsecond')
      from jsonb_to_recordset(coalesce(v_coach_events, '[]'::jsonb)) as receipt(id uuid, updated_at timestamptz)
      where e.id = receipt.id and e.updated_at = receipt.updated_at and e.status = 'cancelled'
        and e.source_type = 'match' and e.source_id = new.id
        and private.can_restore_match_coach_event(e.id);
    end if;
    insert into private.match_cancellation_events (match_id, action, actor_id, previous_updated_at,
      result_updated_at, cancelled_at, cancellation_reason, cancelled_by)
    values (new.id, 'restored', auth.uid(), old.updated_at, new.updated_at,
      old.cancelled_at, old.cancellation_reason, old.cancelled_by);
  end if;
  return new;
end;
$$;
revoke all on function private.after_match_cancellation() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
