begin;

-- Match deletions/updates previously took a row lock before the schedule statement lock.
-- Acquire the shared lock first, including calendar sync, to preserve one lock ordering.
create trigger coach_training_slots_lock before insert or update or delete on public.matches
for each statement execute function private.lock_coach_training_slots();

-- One transaction lock shared with training-slot source reconciliation and schedule saves.
-- Coach identity is a profile UUID; player leave/attendance/billing are intentionally separate.
create or replace function private.coach_profile_is_schedulable(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_profile_id
    and (upper(btrim(p.role)) in ('HEAD_COACH', 'COACH') or btrim(p.role) in ('總教練', '教練'))
    and coalesce(p.is_active, true)
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now()));
$$;
create or replace function private.assert_active_coach_user()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid()
    and coalesce(p.is_active, true) and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now())) then
    raise exception using errcode = '42501', message = '登入狀態已過期或帳號已停用。';
  end if;
end;
$$;
create or replace function public.assert_coach_schedules_permission(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_active_coach_user();
  if not public.has_app_permission('coach_schedules', p_action) then
    raise exception using errcode = '42501', message = 'coach_schedules:' || p_action || ' permission required';
  end if;
end;
$$;

-- Parse safely; malformed/absent times stay unknown. Half-open intervals meet at 13:00.
create or replace function private.coach_time_minutes(p_text text, p_index integer default 1)
returns integer language plpgsql immutable set search_path = '' as $$
declare v_match text[]; v_index integer := 0; v_hour integer; v_minute integer; v_marker text;
begin
  for v_match in select regexp_matches(coalesce(p_text, ''), '(?<![0-9])(上午|早上|am|下午|晚上|pm)?[[:space:]]*([0-9]{1,2})[:：.．]([0-5][0-9])(?![0-9])', 'gi') loop
    v_index := v_index + 1;
    if v_index <> p_index then continue; end if;
    v_marker := lower(coalesce(v_match[1], ''));
    v_hour := v_match[2]::integer; v_minute := v_match[3]::integer;
    if v_hour > 23 then return null; end if;
    if v_marker in ('下午', '晚上', 'pm') and v_hour between 1 and 11 then v_hour := v_hour + 12;
    elsif v_marker in ('上午', '早上', 'am') and v_hour = 12 then v_hour := 0; end if;
    return v_hour * 60 + v_minute;
  end loop;
  return null;
end;
$$;
create or replace function private.coach_intervals_overlap(p_start text, p_end text, p_other_start text, p_other_end text)
returns boolean language sql immutable set search_path = '' as $$
  select case when private.coach_time_minutes(p_start) is null or private.coach_time_minutes(p_end) is null
    or private.coach_time_minutes(p_other_start) is null or private.coach_time_minutes(p_other_end) is null
    or private.coach_time_minutes(p_end) <= private.coach_time_minutes(p_start)
    or private.coach_time_minutes(p_other_end) <= private.coach_time_minutes(p_other_start)
    then true else private.coach_time_minutes(p_start) < private.coach_time_minutes(p_other_end)
      and private.coach_time_minutes(p_end) > private.coach_time_minutes(p_other_start) end;
$$;
create or replace function private.coach_leave_overlaps(p_segment text, p_start text, p_end text)
returns boolean language sql immutable set search_path = '' as $$
  select case when p_segment='full_day' then true
    when private.coach_time_minutes(p_start) is null or private.coach_time_minutes(p_end) is null
      or private.coach_time_minutes(p_end)<=private.coach_time_minutes(p_start) then true
    else private.coach_time_minutes(p_start)<case when p_segment='morning' then 780 else 1440 end
      and private.coach_time_minutes(p_end)>case when p_segment='morning' then 0 else 780 end end;
$$;

create table public.coach_leave_requests (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null, end_date date not null,
  time_segment text not null default 'full_day' check (time_segment in ('full_day', 'morning', 'afternoon')),
  reason text check (length(reason) <= 500),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  revision bigint not null default 1,
  create_request_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (end_date >= start_date), check (start_date = end_date or time_segment = 'full_day'),
  unique (created_by, create_request_id)
);
create index coach_leave_active_dates on public.coach_leave_requests(coach_profile_id, start_date, end_date) where status = 'active';
create table private.coach_leave_audit (
  id bigint generated always as identity primary key, leave_id uuid not null,
  operation text not null, actor_profile_id uuid, before_snapshot jsonb, after_snapshot jsonb,
  changed_at timestamptz not null default clock_timestamp()
);
create table private.coach_schedule_assignment_changes (
  id bigint generated always as identity primary key,
  event_id uuid not null, coach_profile_id uuid not null, coach_name text,
  leave_id uuid not null, leave_revision bigint not null, event_snapshot jsonb not null,
  assignment_snapshot jsonb not null, changed_at timestamptz not null default clock_timestamp(),
  unique(event_id, coach_profile_id, leave_id, leave_revision)
);
create table private.coach_schedule_auto_fill_receipts (
  actor_profile_id uuid not null, month_start date not null, fingerprint text not null,
  event_keys text[] not null, event_ids uuid[] not null, required_actions text[] not null, created_at timestamptz not null default clock_timestamp(),
  primary key(actor_profile_id, month_start, fingerprint, event_keys)
);
alter table public.coach_leave_requests enable row level security;
alter table private.coach_leave_audit enable row level security;
alter table private.coach_schedule_assignment_changes enable row level security;
alter table private.coach_schedule_auto_fill_receipts enable row level security;
revoke all on public.coach_leave_requests from public, anon, authenticated;
revoke all on private.coach_leave_audit, private.coach_schedule_assignment_changes, private.coach_schedule_auto_fill_receipts from public, anon, authenticated;
-- Raw SELECT is unnecessary: reason is disclosed only by the permission-checked leave RPC.
grant select, insert, update, delete on public.coach_leave_requests to service_role;
alter table public.push_dispatch_events add column if not exists coach_leave_payload jsonb;

insert into public.app_role_permissions(role_key, feature, action)
select role_key, feature, action from (values ('ADMIN'), ('HEAD_COACH'), ('COACH')) r(role_key)
cross join (values ('my_coach_leave_requests')) f(feature) cross join (values ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) a(action)
on conflict do nothing;
insert into public.app_role_permissions(role_key, feature, action)
select 'ADMIN', 'coach_leave_requests', action from (values ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) a(action)
on conflict do nothing;

create or replace function private.assert_coach_leave_permission(p_action text, p_manage boolean, p_coach_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_feature text := case when p_manage then 'coach_leave_requests' else 'my_coach_leave_requests' end;
begin
  perform private.assert_active_coach_user();
  if not public.has_app_permission(v_feature, p_action) then
    raise exception using errcode = '42501', message = v_feature || ':' || p_action || ' permission required';
  end if;
  if p_manage is not true and (p_coach_id is distinct from auth.uid() or not private.coach_profile_is_schedulable(auth.uid())) then
    raise exception using errcode = '42501', message = '只能處理本人教練假單。';
  end if;
end;
$$;
create or replace function private.coach_has_leave(p_coach_id uuid, p_date date, p_start text, p_end text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.coach_leave_requests l where l.coach_profile_id = p_coach_id
    and l.status = 'active' and p_date between l.start_date and l.end_date
    and private.coach_leave_overlaps(l.time_segment, p_start, p_end));
$$;
create or replace function private.coach_has_booking(p_coach_id uuid, p_date date, p_start text, p_end text, p_event_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.coach_schedule_assignments a join public.coach_schedule_events e on e.id = a.event_id
    where a.coach_profile_id = p_coach_id and e.status = 'scheduled' and e.schedule_date = p_date
      and e.id is distinct from p_event_id and private.coach_intervals_overlap(e.start_time, e.end_time, p_start, p_end));
$$;

create or replace function private.apply_coach_leave_to_schedules(p_leave_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row record; v_event_ids uuid[] := '{}'; v_previous_flag text;
begin
  for v_row in select e.*, a.id as assignment_id, to_jsonb(a) as assignment_snapshot,
    l.id as leave_id, l.revision as leave_revision, coalesce(p.nickname, p.name) as coach_name, a.coach_profile_id
    from public.coach_schedule_events e join public.coach_schedule_assignments a on a.event_id = e.id
    join public.coach_leave_requests l on l.coach_profile_id = a.coach_profile_id
    join public.profiles p on p.id = a.coach_profile_id
    where l.status = 'active' and (p_leave_id is null or l.id = p_leave_id)
      and e.schedule_date >= (now() at time zone 'Asia/Taipei')::date and e.status = 'scheduled'
      and e.schedule_date between l.start_date and l.end_date
      and private.coach_leave_overlaps(l.time_segment, e.start_time, e.end_time)
    order by e.id, a.id, l.id
  loop
    if not exists(select 1 from public.coach_schedule_assignments where id = v_row.assignment_id) then continue; end if;
    insert into private.coach_schedule_assignment_changes(event_id, coach_profile_id, coach_name,
      leave_id, leave_revision, event_snapshot, assignment_snapshot)
      values(v_row.id, v_row.coach_profile_id, v_row.coach_name, v_row.leave_id, v_row.leave_revision,
        to_jsonb(v_row) - 'assignment_snapshot' - 'assignment_id', v_row.assignment_snapshot) on conflict do nothing;
    delete from public.coach_schedule_assignments where id = v_row.assignment_id;
    v_event_ids := array_append(v_event_ids, v_row.id);
  end loop;
  v_previous_flag := current_setting('jg.coach_leave_recheck',true);
  perform set_config('jg.coach_leave_recheck','1',true);
  update public.coach_schedule_events set updated_by = auth.uid(),
    updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond') where id = any(v_event_ids);
  perform set_config('jg.coach_leave_recheck',coalesce(v_previous_flag,''),true);
end;
$$;
create or replace function private.recheck_coach_leave_after_source_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('jg.coach_leave_recheck',true)='1' then return null; end if;
  perform private.apply_coach_leave_to_schedules(); return null;
end;
$$;
create trigger coach_leave_recheck_source after update on public.coach_schedule_events
for each statement execute function private.recheck_coach_leave_after_source_change();

create or replace function private.enqueue_coach_leave(p_leave public.coach_leave_requests, p_operation text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.push_dispatch_events(event_key, feature, action, title, body, url, dispatch_mode, dispatch_status, coach_leave_payload)
  values('coach_leave:' || p_leave.id || ':' || p_leave.revision || ':' || p_operation, 'coach_leave_requests', 'VIEW',
    case p_operation when 'created' then '教練新增請假' when 'updated' then '教練請假已修改' else '教練請假已取消' end,
    (select coalesce(nullif(p.nickname, ''), p.name, '教練') from public.profiles p where p.id = p_leave.coach_profile_id)
      || '：' || p_leave.start_date || case when p_leave.end_date <> p_leave.start_date then ' 至 ' || p_leave.end_date else '' end
      || '（' || case p_leave.time_segment when 'morning' then '上午' when 'afternoon' then '下午' else '全日' end || '）'
      || case p_operation when 'created' then '已新增請假' when 'updated' then '已修改請假' else '已取消請假，可重新安排排班' end,
    '/coach-leave-requests?highlight_leave_id=' || p_leave.id, 'outbox', 'pending',
    jsonb_build_object('leave_id', p_leave.id, 'coach_profile_id', p_leave.coach_profile_id, 'start_date', p_leave.start_date,
      'end_date', p_leave.end_date, 'time_segment', p_leave.time_segment, 'operation', p_operation, 'revision', p_leave.revision))
    on conflict(event_key) do nothing;
end;
$$;
create or replace function public.list_coach_leave_requests(p_month date default null, p_status text default 'all', p_coach_profile_id uuid default null, p_manage boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_leaves jsonb; v_coaches jsonb := '[]';
begin
  perform private.assert_coach_leave_permission('VIEW', p_manage, auth.uid());
  if p_status not in ('all', 'active', 'cancelled') then raise exception '不支援的假單狀態。'; end if;
  if p_manage is not true and p_coach_profile_id is not null and p_coach_profile_id <> auth.uid() then raise exception using errcode = '42501', message = '只能查看本人教練假單。'; end if;
  select coalesce(jsonb_agg(to_jsonb(l) - 'create_request_id' - 'created_by' - 'updated_by'
    || jsonb_build_object('coach_name', p.name, 'coach_nickname', p.nickname) order by l.start_date desc, l.id), '[]') into v_leaves
  from public.coach_leave_requests l join public.profiles p on p.id = l.coach_profile_id
  where (p_manage or l.coach_profile_id = auth.uid())
    and (not p_manage or p_coach_profile_id is null or l.coach_profile_id = p_coach_profile_id)
    and (p_status = 'all' or l.status = p_status)
    and (p_month is null or (l.start_date < (date_trunc('month', p_month)::date + interval '1 month')::date and l.end_date >= date_trunc('month', p_month)::date));
  if p_manage then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'nickname',p.nickname,'role',p.role,'avatar_url',p.avatar_url)
      order by coalesce(p.nickname,p.name),p.id), '[]') into v_coaches from public.profiles p where private.coach_profile_is_schedulable(p.id);
  end if;
  return jsonb_build_object('leaves',v_leaves,'coaches',v_coaches);
end;
$$;
create or replace function public.save_coach_leave_request(p_leave jsonb, p_manage boolean default false, p_request_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p_leave->>'id','')::uuid; v_coach uuid;
  v_start date := nullif(p_leave->>'start_date','')::date; v_end date := nullif(p_leave->>'end_date','')::date;
  v_segment text := coalesce(nullif(p_leave->>'time_segment',''),'full_day'); v_reason text := nullif(btrim(p_leave->>'reason'),'');
  v_old public.coach_leave_requests%rowtype; v_new public.coach_leave_requests%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);
  if v_id is not null then
    select * into v_old from public.coach_leave_requests where id = v_id for update;
    if not found then raise exception '假單已刪除，請重新整理。'; end if;
    v_coach := v_old.coach_profile_id;
    perform private.assert_coach_leave_permission('EDIT',p_manage,v_coach);
    if nullif(p_leave->>'coach_profile_id','') is not null and (p_leave->>'coach_profile_id')::uuid <> v_coach then raise exception '不能更換假單教練。'; end if;
    if v_old.status <> 'active' or v_old.end_date < (now() at time zone 'Asia/Taipei')::date then raise exception '歷史或已取消假單不可修改。'; end if;
    if nullif(p_leave->>'updated_at','') is null or v_old.updated_at <> (p_leave->>'updated_at')::timestamptz then raise exception '假單已更新，請重新整理後再修改。'; end if;
  else
    v_coach := case when p_manage then nullif(p_leave->>'coach_profile_id','')::uuid else auth.uid() end;
    perform private.assert_coach_leave_permission('CREATE',p_manage,v_coach);
    if p_manage is not true and nullif(p_leave->>'coach_profile_id','') is not null and (p_leave->>'coach_profile_id')::uuid <> auth.uid() then raise exception using errcode='42501',message='只能建立本人教練假單。'; end if;
    if p_request_id is not null then
      select * into v_old from public.coach_leave_requests where created_by=auth.uid() and create_request_id=p_request_id;
      if found then
        if v_old.coach_profile_id=v_coach and v_old.start_date=v_start and v_old.end_date=v_end and v_old.time_segment=v_segment and v_old.reason is not distinct from v_reason then return v_old.id; end if;
        raise exception '重複送出識別碼已使用，請重新填寫。';
      end if;
    end if;
  end if;
  if not private.coach_profile_is_schedulable(v_coach) then raise exception '教練帳號已停用或不符合排班資格。'; end if;
  if v_start is null or v_end is null or v_end < v_start or v_start < (now() at time zone 'Asia/Taipei')::date then raise exception '請假日期必須是今天起的有效日期範圍。'; end if;
  if v_segment not in ('full_day','morning','afternoon') or (v_start<>v_end and v_segment<>'full_day') then raise exception '多日請假必須選全日。'; end if;
  if length(v_reason)>500 then raise exception '請假原因最多500字。'; end if;
  if exists(select 1 from public.coach_leave_requests l where l.coach_profile_id=v_coach and l.status='active' and l.id is distinct from v_id
    and l.start_date<=v_end and l.end_date>=v_start and (l.time_segment='full_day' or v_segment='full_day' or l.time_segment=v_segment)) then raise exception '與現有有效假單重疊，請修改原假單。'; end if;
  if v_id is null then
    insert into public.coach_leave_requests(coach_profile_id,start_date,end_date,time_segment,reason,created_by,updated_by,create_request_id)
      values(v_coach,v_start,v_end,v_segment,v_reason,auth.uid(),auth.uid(),p_request_id) returning * into v_new;
  else
    if v_old.start_date=v_start and v_old.end_date=v_end and v_old.time_segment=v_segment and v_old.reason is not distinct from v_reason then return v_id; end if;
    update public.coach_leave_requests set start_date=v_start,end_date=v_end,time_segment=v_segment,reason=v_reason,
      revision=revision+1,updated_by=auth.uid(),updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=v_id returning * into v_new;
  end if;
  insert into private.coach_leave_audit(leave_id,operation,actor_profile_id,before_snapshot,after_snapshot)
    values(v_new.id,case when v_id is null then 'created' else 'updated' end,auth.uid(),case when v_id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
  perform private.apply_coach_leave_to_schedules(v_new.id);
  perform private.enqueue_coach_leave(v_new,case when v_id is null then 'created' else 'updated' end);
  return v_new.id;
end;
$$;
create or replace function public.cancel_coach_leave_request(p_leave_id uuid, p_updated_at timestamptz, p_manage boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.coach_leave_requests%rowtype; v_new public.coach_leave_requests%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(20360924,1);
  select * into v_old from public.coach_leave_requests where id=p_leave_id for update;
  if not found then raise exception '假單不存在。'; end if;
  perform private.assert_coach_leave_permission('DELETE',p_manage,v_old.coach_profile_id);
  if v_old.end_date<(now() at time zone 'Asia/Taipei')::date then raise exception '歷史假單不可取消。'; end if;
  if v_old.status='cancelled' then return; end if;
  if p_updated_at is null or p_updated_at<>v_old.updated_at then raise exception '假單已更新，請重新整理後再取消。'; end if;
  update public.coach_leave_requests set status='cancelled',revision=revision+1,updated_by=auth.uid(),updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=p_leave_id returning * into v_new;
  insert into private.coach_leave_audit(leave_id,operation,actor_profile_id,before_snapshot,after_snapshot) values(p_leave_id,'cancelled',auth.uid(),to_jsonb(v_old),to_jsonb(v_new));
  perform private.enqueue_coach_leave(v_new,'cancelled');
  -- Deliberately never restore a removed assignment after cancellation or a reduced range.
end;
$$;

create or replace function public.list_schedulable_coaches()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_coach_schedules_permission('VIEW');
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'nickname',p.nickname,'role',p.role,'avatar_url',p.avatar_url)
    order by coalesce(p.nickname,p.name),p.id) from public.profiles p where private.coach_profile_is_schedulable(p.id)), '[]');
end;
$$;

-- Preserve the complete existing source resolver and save implementation behind guarded RPCs.
alter function public.list_coach_schedule_admin_month(date) set schema private;
alter function private.list_coach_schedule_admin_month(date) rename to list_coach_schedule_admin_month_base;
alter function public.list_coach_schedule_dashboard(date) set schema private;
alter function private.list_coach_schedule_dashboard(date) rename to list_coach_schedule_dashboard_base;
-- Preserve own-dashboard access for the same legacy values accepted by shared eligibility.
do $normalize_dashboard$
declare v_definition text;
begin
  v_definition := pg_get_functiondef('private.list_coach_schedule_dashboard_base(date)'::regprocedure);
  v_definition := replace(v_definition, $old$coalesce(v_role, '') not in ('HEAD_COACH', 'COACH')$old$,
    'not private.coach_profile_is_schedulable(v_user_id)');
  execute v_definition;
end;
$normalize_dashboard$;

create or replace function private.save_coach_schedule_event_base(
  p_event jsonb,
  p_coach_profile_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid := nullif(p_event->>'id', '')::uuid;
  v_existing_id uuid;
  v_source_type text := nullif(btrim(coalesce(p_event->>'source_type', '')), '');
  v_source_id uuid := nullif(p_event->>'source_id', '')::uuid;
  v_source_venue_id uuid := nullif(p_event->>'source_venue_id', '')::uuid;
  v_schedule_date date := nullif(p_event->>'schedule_date', '')::date;
  v_start_time text := nullif(btrim(coalesce(p_event->>'start_time', '')), '');
  v_end_time text := nullif(btrim(coalesce(p_event->>'end_time', '')), '');
  v_title text := nullif(btrim(coalesce(p_event->>'title', '')), '');
  v_location text := nullif(btrim(coalesce(p_event->>'location', '')), '');
  v_location_url text := nullif(btrim(coalesce(p_event->>'location_url', '')), '');
  v_legacy_coaches text := nullif(btrim(coalesce(p_event->>'legacy_coaches', '')), '');
  v_status text := coalesce(nullif(btrim(coalesce(p_event->>'status', '')), ''), 'scheduled');
  v_note text := nullif(btrim(coalesce(p_event->>'note', '')), '');
  v_coach_ids uuid[];
  v_slot record;
  v_existing public.coach_schedule_events%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_source_type not in ('training_date', 'training_location', 'match', 'training_class', 'manual') then
    raise exception 'unsupported source_type';
  end if;

  if v_status not in ('scheduled', 'cancelled') then
    raise exception 'unsupported status';
  end if;

  if v_schedule_date is null then
    raise exception 'schedule_date is required';
  end if;

  if v_title is null then
    raise exception 'title is required';
  end if;

  select coalesce(array_agg(distinct coach_id), '{}'::uuid[])
  into v_coach_ids
  from unnest(coalesce(p_coach_profile_ids, '{}'::uuid[])) as coach_id
  where coach_id is not null;

  if exists(select 1 from unnest(v_coach_ids) as c(id) where not private.coach_profile_is_schedulable(c.id)) then
    raise exception 'invalid coach profile';
  end if;

  -- Lock before lookup so two program sources cannot race to create separate events.
  perform pg_catalog.pg_advisory_xact_lock(20360924, 1);
  if v_source_type = 'training_location' then
    select g.* into v_slot from private.coach_schedule_training_sources s
    join private.coach_schedule_training_slots g using (slot_key)
    where s.source_id = v_source_id and s.source_venue_id = v_source_venue_id;
    if not found then
      raise exception using errcode = '23503', message = '原場地配置已刪除或變更，請重新整理教練排班表。';
    end if;
    v_source_id := v_slot.source_id;
    v_source_venue_id := v_slot.source_venue_id;
  end if;

  if v_event_id is not null then
    select id into v_existing_id
    from public.coach_schedule_events
    where id = v_event_id
    for update;

    if v_existing_id is null then
      raise exception '排班已合併或刪除，請重新整理教練排班表。';
    end if;

    perform public.assert_coach_schedules_permission('EDIT');
  elsif v_source_type = 'training_date' then
    select id into v_existing_id
    from public.coach_schedule_events
    where source_type = 'training_date'
      and source_id is null
      and source_venue_id is null
      and schedule_date = v_schedule_date
    for update;

    if v_existing_id is null then
      perform public.assert_coach_schedules_permission('CREATE');
    else
      perform public.assert_coach_schedules_permission('EDIT');
    end if;
  elsif v_source_type <> 'manual' and v_source_id is not null then
    select id into v_existing_id
    from public.coach_schedule_events
    where source_type = v_source_type
      and source_id = v_source_id
      and coalesce(source_venue_id, '00000000-0000-0000-0000-000000000000'::uuid) =
        coalesce(v_source_venue_id, '00000000-0000-0000-0000-000000000000'::uuid)
    for update;

    if v_existing_id is null then
      perform public.assert_coach_schedules_permission('CREATE');
    else
      perform public.assert_coach_schedules_permission('EDIT');
    end if;
  else
    perform public.assert_coach_schedules_permission('CREATE');
  end if;

  if v_existing_id is not null and v_source_type = 'training_location' then
    select * into v_existing from public.coach_schedule_events where id = v_existing_id;
    if v_existing.training_slot_key is distinct from v_slot.slot_key then
      raise exception '場地配置已變更，請重新整理教練排班表。';
    end if;
    if nullif(p_event->>'updated_at', '') is not null
       and v_existing.updated_at <> (p_event->>'updated_at')::timestamptz then
      raise exception '排班已由其他操作更新，請重新整理後再儲存。';
    end if;
    -- Retrying an identical create is safe. A stale unassigned candidate must not
    -- replace coaches already saved through another program or browser.
    if v_event_id is null then
      if v_existing.status = v_status and v_existing.note is not distinct from v_note
        and v_coach_ids @> array(select coach_profile_id from public.coach_schedule_assignments where event_id = v_existing_id)
        and v_coach_ids <@ array(select coach_profile_id from public.coach_schedule_assignments where event_id = v_existing_id) then
        return v_existing_id;
      end if;
      raise exception '這場訓練已有教練排班，請重新整理後再更新。';
    end if;
  end if;

  if v_existing_id is null then
    insert into public.coach_schedule_events (
      source_type,
      source_id,
      source_venue_id,
      schedule_date,
      start_time,
      end_time,
      title,
      location,
      location_url,
      legacy_coaches,
      status,
      note,
      created_by,
      updated_by
    )
    values (
      v_source_type,
      v_source_id,
      v_source_venue_id,
      v_schedule_date,
      v_start_time,
      v_end_time,
      v_title,
      v_location,
      v_location_url,
      v_legacy_coaches,
      v_status,
      v_note,
      v_user_id,
      v_user_id
    )
    returning id into v_existing_id;
  else
    update public.coach_schedule_events
    set
      source_type = v_source_type,
      source_id = v_source_id,
      source_venue_id = v_source_venue_id,
      schedule_date = v_schedule_date,
      start_time = v_start_time,
      end_time = v_end_time,
      title = v_title,
      location = v_location,
      location_url = v_location_url,
      legacy_coaches = v_legacy_coaches,
      status = v_status,
      note = v_note,
      updated_by = v_user_id,
      updated_at = timezone('utc', now())
    where id = v_existing_id;
  end if;

  delete from public.coach_schedule_assignments
  where event_id = v_existing_id
    and not (coach_profile_id = any(v_coach_ids));

  insert into public.coach_schedule_assignments (
    event_id,
    coach_profile_id,
    created_by,
    updated_by
  )
  select
    v_existing_id,
    coach_id,
    v_user_id,
    v_user_id
  from unnest(v_coach_ids) as coach_id
  on conflict (event_id, coach_profile_id) do update
  set
    updated_by = excluded.updated_by,
    updated_at = timezone('utc', now());

  return v_existing_id;
end;
$$;

create or replace function private.enrich_coach_schedule_payload(p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_events jsonb;
begin
  select coalesce(jsonb_agg(e.value || jsonb_build_object(
    'venue_id', case when e.value->>'source_type'='training_location' then
      (select to_jsonb(sv.venue_id) from public.training_location_session_venues sv where sv.id=nullif(e.value->>'source_venue_id','')::uuid) else 'null'::jsonb end,
    'unavailable_coach_profile_ids', coalesce((select jsonb_agg(p.id order by p.id) from public.profiles p
      where (p_payload->>'scope' in ('admin','all') or p.id=auth.uid())
      and private.coach_has_leave(p.id,(e.value->>'schedule_date')::date,e.value->>'start_time',e.value->>'end_time')), '[]'),
    'assignment_changes', coalesce((select jsonb_agg(jsonb_build_object('event_id',c.event_id,'coach_profile_id',c.coach_profile_id,
      'coach_name',c.coach_name,'leave_id',c.leave_id,'changed_at',c.changed_at) order by c.changed_at,c.id)
      from private.coach_schedule_assignment_changes c where c.event_id=nullif(e.value->>'id','')::uuid
        and (p_payload->>'scope' in ('admin','all') or c.coach_profile_id=auth.uid())), '[]')
  ) order by e.ordinality), '[]') into v_events from jsonb_array_elements(p_payload->'events') with ordinality e(value,ordinality);
  return jsonb_set(p_payload,'{events}',v_events);
end;
$$;
create or replace function public.list_coach_schedule_admin_month(p_month date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_coach_schedules_permission('VIEW');
  return private.enrich_coach_schedule_payload(private.list_coach_schedule_admin_month_base(p_month));
end;
$$;
create or replace function public.list_coach_schedule_dashboard(p_month date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_active_coach_user();
  return private.enrich_coach_schedule_payload(private.list_coach_schedule_dashboard_base(p_month));
end;
$$;

create or replace function public.save_coach_schedule_event(p_event jsonb,p_coach_profile_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_event jsonb := p_event; v_id uuid := nullif(p_event->>'id','')::uuid;
  v_existing public.coach_schedule_events%rowtype; v_slot record; v_match record;
  v_source text:=nullif(btrim(p_event->>'source_type'),''); v_date date; v_start text; v_end text; v_coach uuid;
  v_ids uuid[] := '{}'; v_status text:=coalesce(nullif(btrim(p_event->>'status'),''),'scheduled'); v_note text:=nullif(btrim(p_event->>'note'),'');
  v_same boolean;
begin
  perform private.assert_active_coach_user();
  perform pg_catalog.pg_advisory_xact_lock(20360924,1);
  select coalesce(array_agg(distinct c order by c),'{}') into v_ids from unnest(coalesce(p_coach_profile_ids,'{}')) c where c is not null;
  v_event:=v_event || jsonb_build_object('source_type',v_source,'status',v_status);
  if v_source='training_location' then
    select g.* into v_slot from private.coach_schedule_training_sources s join private.coach_schedule_training_slots g using(slot_key)
      where s.source_id=nullif(p_event->>'source_id','')::uuid and s.source_venue_id=nullif(p_event->>'source_venue_id','')::uuid;
    if not found or not v_slot.is_active then raise exception '原場地配置已刪除或變更，請重新整理教練排班表。'; end if;
    v_event:=v_event || jsonb_build_object('source_id',v_slot.source_id,'source_venue_id',v_slot.source_venue_id,
      'schedule_date',v_slot.schedule_date,'start_time',v_slot.start_time,'end_time',v_slot.end_time,'title',v_slot.title,
      'location',v_slot.location,'location_url',v_slot.location_url);
  elsif v_source in ('match','training_class') then
    select m.* into v_match from public.matches m where m.id=nullif(p_event->>'source_id','')::uuid for key share;
    if not found or v_source<>(case when v_match.match_level='特訓課' then 'training_class' else 'match' end) then raise exception '賽事來源已刪除或變更，請重新整理。'; end if;
    v_event:=v_event || jsonb_build_object('schedule_date',v_match.match_date,
      'start_time',case when private.coach_time_minutes(v_match.match_time) is null then null else to_char(time '00:00'+private.coach_time_minutes(v_match.match_time)*interval '1 minute','HH24:MI') end,
      'end_time',case when private.coach_time_minutes(v_match.match_time,2) is null then null else to_char(time '00:00'+private.coach_time_minutes(v_match.match_time,2)*interval '1 minute','HH24:MI') end,
      'title',coalesce(nullif(btrim(v_match.match_name),''),nullif(btrim(v_match.tournament_name),''),nullif(btrim(v_match.opponent),''),case when v_source='training_class' then '特訓課' else '比賽' end),
      'location',nullif(btrim(v_match.location),''));
  end if;
  v_date:=(v_event->>'schedule_date')::date; v_start:=v_event->>'start_time'; v_end:=v_event->>'end_time';
  if v_id is not null then
    select * into v_existing from public.coach_schedule_events where id=v_id for update;
    if not found then raise exception '排班已合併或刪除，請重新整理教練排班表。'; end if;
    perform public.assert_coach_schedules_permission('EDIT');
    if nullif(p_event->>'updated_at','') is null or v_existing.updated_at<>(p_event->>'updated_at')::timestamptz then raise exception '排班已由其他操作更新，請重新整理後再儲存。'; end if;
    if v_existing.source_type<>v_source or v_existing.source_id is distinct from nullif(v_event->>'source_id','')::uuid
      or v_existing.source_venue_id is distinct from nullif(v_event->>'source_venue_id','')::uuid then raise exception '排班來源已變更，請重新整理。'; end if;
  elsif v_source<>'manual' then
    select * into v_existing from public.coach_schedule_events e where e.source_type=v_source and
      ((v_source='training_date' and e.schedule_date=v_date and e.source_id is null)
      or (v_source<>'training_date' and e.source_id=nullif(v_event->>'source_id','')::uuid and e.source_venue_id is not distinct from nullif(v_event->>'source_venue_id','')::uuid)) for update;
    if found then
      perform public.assert_coach_schedules_permission('CREATE');
      select v_existing.status=v_status and v_existing.note is not distinct from v_note and
        v_ids=coalesce((select array_agg(a.coach_profile_id order by a.coach_profile_id) from public.coach_schedule_assignments a where a.event_id=v_existing.id),'{}'::uuid[]) into v_same;
      if v_same then return v_existing.id; end if;
      raise exception '這個活動已有教練排班，請重新整理後再更新。';
    end if;
    perform public.assert_coach_schedules_permission('CREATE');
  else perform public.assert_coach_schedules_permission('CREATE'); end if;
  if v_source='training_date' and v_id is null and not exists(select 1 from jsonb_array_elements(public.list_coach_schedule_admin_month(date_trunc('month',v_date)::date)->'events') e
    where e->>'source_type'='training_date' and (e->>'schedule_date')::date=v_date and (e->>'is_candidate')::boolean) then raise exception '訓練日期已變更，請重新整理。'; end if;
  foreach v_coach in array v_ids loop
    if not private.coach_profile_is_schedulable(v_coach) then raise exception '教練帳號已停用或不符合排班資格。'; end if;
    if v_status='scheduled' and private.coach_has_leave(v_coach,v_date,v_start,v_end) then raise exception '教練已請假，請改派其他教練。'; end if;
    if v_status='scheduled' and private.coach_has_booking(v_coach,v_date,v_start,v_end,v_id) then raise exception '教練同時段已有排班，請改派其他教練。'; end if;
  end loop;
  return private.save_coach_schedule_event_base(v_event,v_ids);
end;
$$;
-- Browser code has always used RPCs. Prevent bypassing leave/conflict checks with raw REST writes.
revoke insert,update,delete on public.coach_schedule_events,public.coach_schedule_assignments from authenticated;

create table public.coach_schedule_templates (
  id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 100),
  is_active boolean not null default true, weekday integer not null check(weekday between 0 and 6),
  source_type text not null check(source_type in ('training_date','training_location')),
  venue_id uuid references public.training_venues(id) on delete restrict,
  start_time text not null check(start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  title text not null check(length(btrim(title)) between 1 and 160),
  coach_profile_ids uuid[] not null check(cardinality(coach_profile_ids)>0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  check((source_type='training_location' and venue_id is not null) or (source_type='training_date' and venue_id is null))
);
create unique index coach_schedule_templates_active_match_unique on public.coach_schedule_templates
  (source_type,weekday,coalesce(venue_id,'00000000-0000-0000-0000-000000000000'::uuid),start_time,title) where is_active;
alter table public.coach_schedule_templates enable row level security;
revoke all on public.coach_schedule_templates from public,anon,authenticated;
grant select,insert,update,delete on public.coach_schedule_templates to service_role;
create or replace function public.list_coach_schedule_templates()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_coach_schedules_permission('VIEW');
  return coalesce((select jsonb_agg(to_jsonb(t)-'created_by'-'updated_by' order by t.name,t.id) from public.coach_schedule_templates t),'[]');
end;
$$;
create or replace function public.save_coach_schedule_template(p_template jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid:=nullif(p_template->>'id','')::uuid; v_ids uuid[]; v_old public.coach_schedule_templates%rowtype;
  v_start integer:=private.coach_time_minutes(p_template->>'start_time'); v_start_text text;
begin
  perform pg_catalog.pg_advisory_xact_lock(20360924,1);
  if v_id is null then perform public.assert_coach_schedules_permission('CREATE');
  else
    perform public.assert_coach_schedules_permission('EDIT');
    select * into v_old from public.coach_schedule_templates where id=v_id for update;
    if not found or nullif(p_template->>'updated_at','') is null or v_old.updated_at<>(p_template->>'updated_at')::timestamptz then raise exception '範本已更新或刪除，請重新整理。'; end if;
  end if;
  if v_start is null then raise exception '請選擇有效開始時間。'; end if;
  v_start_text:=to_char(time '00:00'+v_start*interval '1 minute','HH24:MI');
  select coalesce(array_agg(distinct c.value::uuid order by c.value::uuid),'{}') into v_ids from jsonb_array_elements_text(coalesce(p_template->'coach_profile_ids','[]')) c(value);
  if cardinality(v_ids)=0 or exists(select 1 from unnest(v_ids) c where not private.coach_profile_is_schedulable(c)) then raise exception '請選擇至少一位有效教練。'; end if;
  if v_id is null then
    insert into public.coach_schedule_templates(name,is_active,weekday,source_type,venue_id,start_time,title,coach_profile_ids,created_by,updated_by)
      values(btrim(p_template->>'name'),coalesce((p_template->>'is_active')::boolean,true),(p_template->>'weekday')::integer,
      p_template->>'source_type',nullif(p_template->>'venue_id','')::uuid,v_start_text,btrim(p_template->>'title'),v_ids,auth.uid(),auth.uid()) returning id into v_id;
  else
    update public.coach_schedule_templates set name=btrim(p_template->>'name'),is_active=coalesce((p_template->>'is_active')::boolean,true),
      weekday=(p_template->>'weekday')::integer,source_type=p_template->>'source_type',venue_id=nullif(p_template->>'venue_id','')::uuid,
      start_time=v_start_text,title=btrim(p_template->>'title'),coach_profile_ids=v_ids,updated_by=auth.uid(),updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=v_id;
  end if;
  return v_id;
exception when unique_violation then raise exception '相同活動條件已有啟用範本，請先停用或修改原範本。';
end;
$$;
create or replace function public.delete_coach_schedule_template(p_template_id uuid,p_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.coach_schedule_templates%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(20360924,1); perform public.assert_coach_schedules_permission('DELETE');
  select * into v_old from public.coach_schedule_templates where id=p_template_id for update;
  if not found or p_updated_at is null or v_old.updated_at<>p_updated_at then raise exception '範本已更新或刪除，請重新整理。'; end if;
  delete from public.coach_schedule_templates where id=p_template_id;
end;
$$;

create or replace function private.coach_schedule_event_key(p_event jsonb)
returns text language sql immutable set search_path = '' as $$
  select case when p_event->>'source_type'='training_date' then 'training_date:' || (p_event->>'schedule_date')
    when p_event->>'source_type'<>'manual' and nullif(p_event->>'source_id','') is not null then (p_event->>'source_type') || ':' || (p_event->>'source_id') || ':' || coalesce(nullif(p_event->>'source_venue_id',''),'none')
    else 'manual:' || coalesce(nullif(p_event->>'id',''),p_event->>'schedule_date') end;
$$;
create or replace function public.preview_coach_schedule_auto_fill(p_month date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_event jsonb; v_template public.coach_schedule_templates%rowtype;
  v_rows jsonb:='[]'; v_reserved jsonb:='[]'; v_proposed uuid[]; v_excluded jsonb;
  v_coach uuid; v_reason text; v_date date; v_key text; v_incomplete boolean;
  v_state jsonb; v_fingerprint text;
begin
  perform public.assert_coach_schedules_permission('VIEW');
  v_payload:=public.list_coach_schedule_admin_month(p_month);
  for v_event in select value from jsonb_array_elements(v_payload->'events')
    order by value->>'schedule_date',value->>'start_time',private.coach_schedule_event_key(value) loop
    if v_event->>'source_type' not in ('training_date','training_location') or v_event->>'status'<>'scheduled'
      or not coalesce((v_event->>'is_candidate')::boolean,false) or jsonb_array_length(v_event->'coach_profile_ids')<>0 then continue; end if;
    v_date:=(v_event->>'schedule_date')::date;
    if v_date<(now() at time zone 'Asia/Taipei')::date then continue; end if;
    select * into v_template from public.coach_schedule_templates t where t.is_active
      and t.source_type=v_event->>'source_type' and t.weekday=extract(dow from v_date)::integer
      and t.venue_id is not distinct from nullif(v_event->>'venue_id','')::uuid
      and t.start_time=to_char(time '00:00'+private.coach_time_minutes(v_event->>'start_time')*interval '1 minute','HH24:MI')
      and t.title=btrim(v_event->>'title');
    if not found then continue; end if;
    v_proposed:='{}'; v_excluded:='[]'; v_key:=private.coach_schedule_event_key(v_event);
    v_incomplete:=private.coach_time_minutes(v_event->>'start_time') is null or private.coach_time_minutes(v_event->>'end_time') is null
      or private.coach_time_minutes(v_event->>'end_time')<=private.coach_time_minutes(v_event->>'start_time');
    foreach v_coach in array v_template.coach_profile_ids loop
      v_reason:=null;
      if not private.coach_profile_is_schedulable(v_coach) then v_reason:='教練帳號已停用或不符合排班資格';
      elsif private.coach_has_leave(v_coach,v_date,v_event->>'start_time',v_event->>'end_time') then v_reason:='教練已請假';
      elsif private.coach_has_booking(v_coach,v_date,v_event->>'start_time',v_event->>'end_time',nullif(v_event->>'id','')::uuid)
        or exists(select 1 from jsonb_array_elements(v_reserved) r where r->>'coach_id'=v_coach::text and (r->>'date')::date=v_date
          and private.coach_intervals_overlap(r->>'start_time',r->>'end_time',v_event->>'start_time',v_event->>'end_time')) then v_reason:='教練同時段已有排班'; end if;
      if v_reason is null then
        v_proposed:=array_append(v_proposed,v_coach);
        v_reserved:=v_reserved || jsonb_build_array(jsonb_build_object('coach_id',v_coach,'date',v_date,'start_time',v_event->>'start_time','end_time',v_event->>'end_time'));
      else v_excluded:=v_excluded || jsonb_build_array(jsonb_build_object('id',v_coach,'name',coalesce((select coalesce(p.nickname,p.name) from public.profiles p where p.id=v_coach),'未知教練'),'reason',v_reason)); end if;
    end loop;
    v_rows:=v_rows || jsonb_build_array(jsonb_build_object('event_key',v_key,'event',v_event,'template_id',v_template.id,'template_name',v_template.name,
      'proposed_coach_profile_ids',v_proposed,'excluded_coaches',v_excluded,'vacancy_count',cardinality(v_template.coach_profile_ids)-cardinality(v_proposed),'time_incomplete',v_incomplete));
  end loop;
  -- Include all eligible state, including reasons-free leave metadata. Any intervening change invalidates the batch.
  v_state:=jsonb_build_object('events',v_payload->'events','templates',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.coach_schedule_templates t),
    'leaves',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'revision',l.revision,'status',l.status) order by l.id),'[]') from public.coach_leave_requests l),
    'coaches',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'eligible',private.coach_profile_is_schedulable(p.id)) order by p.id),'[]') from public.profiles p));
  v_fingerprint:=md5(v_state::text || v_rows::text);
  return jsonb_build_object('fingerprint',v_fingerprint,'rows',v_rows);
end;
$$;
create or replace function public.confirm_coach_schedule_auto_fill(p_month date,p_fingerprint text,p_event_keys text[])
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare v_month date:=public.coach_schedule_month_start(p_month); v_keys text[]; v_preview jsonb; v_row jsonb; v_ids uuid[]:='{}'; v_id uuid; v_coaches uuid[]; v_required text[]; v_action text;
begin
  perform public.assert_coach_schedules_permission('VIEW'); perform pg_catalog.pg_advisory_xact_lock(20360924,1);
  select coalesce(array_agg(distinct k order by k),'{}') into v_keys from unnest(coalesce(p_event_keys,'{}')) k where nullif(k,'') is not null;
  if cardinality(v_keys)=0 then raise exception '請選擇至少一筆有可用教練的排班。'; end if;
  select event_ids,required_actions into v_ids,v_required from private.coach_schedule_auto_fill_receipts where actor_profile_id=auth.uid() and month_start=v_month and fingerprint=p_fingerprint and event_keys=v_keys;
  if found then
    -- Retried confirmations still require current write access and valid session.
    foreach v_action in array v_required loop perform public.assert_coach_schedules_permission(v_action); end loop;
    return v_ids;
  end if;
  v_ids:='{}'; v_preview:=public.preview_coach_schedule_auto_fill(v_month);
  if p_fingerprint is null or p_fingerprint<>v_preview->>'fingerprint' then raise exception '排班、請假或範本已更新，請重新產生預覽。'; end if;
  if cardinality(v_keys)<>(select count(*) from jsonb_array_elements(v_preview->'rows') r where r->>'event_key'=any(v_keys) and jsonb_array_length(r->'proposed_coach_profile_ids')>0) then raise exception '選取的活動無可用教練或已失效，請重新預覽。'; end if;
  select array_agg(distinct case when nullif(r->'event'->>'id','') is null then 'CREATE' else 'EDIT' end) into v_required
    from jsonb_array_elements(v_preview->'rows') r where r->>'event_key'=any(v_keys);
  for v_row in select value from jsonb_array_elements(v_preview->'rows') where value->>'event_key'=any(v_keys) loop
    select array_agg(c::uuid) into v_coaches from jsonb_array_elements_text(v_row->'proposed_coach_profile_ids') c;
    v_id:=public.save_coach_schedule_event(v_row->'event',v_coaches); v_ids:=array_append(v_ids,v_id);
  end loop;
  insert into private.coach_schedule_auto_fill_receipts(actor_profile_id,month_start,fingerprint,event_keys,event_ids,required_actions) values(auth.uid(),v_month,p_fingerprint,v_keys,v_ids,v_required);
  return v_ids;
end;
$$;

-- Existing browser clients may invoke only these permission-checked public endpoints.
revoke all on function private.coach_profile_is_schedulable(uuid),private.assert_active_coach_user(),private.coach_time_minutes(text,integer),
  private.coach_intervals_overlap(text,text,text,text),private.coach_leave_overlaps(text,text,text),private.assert_coach_leave_permission(text,boolean,uuid),
  private.coach_has_leave(uuid,date,text,text),private.coach_has_booking(uuid,date,text,text,uuid),private.apply_coach_leave_to_schedules(uuid),
  private.recheck_coach_leave_after_source_change(),private.enqueue_coach_leave(public.coach_leave_requests,text),private.enrich_coach_schedule_payload(jsonb),
  private.coach_schedule_event_key(jsonb),private.list_coach_schedule_admin_month_base(date),private.list_coach_schedule_dashboard_base(date),
  private.save_coach_schedule_event_base(jsonb,uuid[]) from public,anon,authenticated;
revoke all on function public.assert_coach_schedules_permission(text) from public,anon;
revoke all on function public.list_coach_leave_requests(date,text,uuid,boolean),public.save_coach_leave_request(jsonb,boolean,uuid),
  public.cancel_coach_leave_request(uuid,timestamptz,boolean),public.list_schedulable_coaches(),public.list_coach_schedule_admin_month(date),
  public.list_coach_schedule_dashboard(date),public.save_coach_schedule_event(jsonb,uuid[]),public.list_coach_schedule_templates(),
  public.save_coach_schedule_template(jsonb),public.delete_coach_schedule_template(uuid,timestamptz),
  public.preview_coach_schedule_auto_fill(date),public.confirm_coach_schedule_auto_fill(date,text,text[]) from public,anon;
grant execute on function public.list_coach_leave_requests(date,text,uuid,boolean),public.save_coach_leave_request(jsonb,boolean,uuid),
  public.cancel_coach_leave_request(uuid,timestamptz,boolean),public.list_schedulable_coaches(),public.list_coach_schedule_admin_month(date),
  public.list_coach_schedule_dashboard(date),public.save_coach_schedule_event(jsonb,uuid[]),public.list_coach_schedule_templates(),
  public.save_coach_schedule_template(jsonb),public.delete_coach_schedule_template(uuid,timestamptz),
  public.preview_coach_schedule_auto_fill(date),public.confirm_coach_schedule_auto_fill(date,text,text[]) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
