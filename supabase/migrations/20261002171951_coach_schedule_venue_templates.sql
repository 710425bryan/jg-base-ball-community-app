-- Venue-only templates. Requires the deployed coach leave/shared-slot core.
-- Existing narrow templates cannot be safely combined; never convert nonempty data implicitly.
begin;
do $$
begin
  if to_regclass('public.coach_schedule_templates') is null
    or to_regprocedure('private.enrich_coach_schedule_payload(jsonb)') is null
    or to_regprocedure('private.lock_coach_training_slots()') is null
    or to_regprocedure('public.confirm_coach_schedule_auto_fill(date,text,text[])') is null then
    raise exception using errcode='55000',message='請先完整套用教練請假與排班範本核心 migration。';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20360924,1);
  lock table public.coach_schedule_templates in access exclusive mode;
  if exists(select 1 from public.coach_schedule_templates) then
    raise exception using errcode='55000',message='已有固定排班範本，請先確認轉換方案；本次場地範本 migration 未套用。';
  end if;
end;
$$;
drop index public.coach_schedule_templates_active_match_unique;
alter table public.coach_schedule_templates
  drop column weekday,drop column source_type,drop column start_time,drop column title,
  alter column venue_id set not null;
create unique index coach_schedule_templates_active_venue_unique
  on public.coach_schedule_templates(venue_id) where is_active;
comment on table public.coach_schedule_templates is 'Fixed coach groups matched only by physical training venue; no weekday, time, title, or source restriction.';

-- Dictionary writes must lock before rows, including writes from location-session RPCs.
-- This also serializes venue name/active changes with preview confirmation.
create trigger coach_training_slots_lock before insert or update or delete on public.training_venues
  for each statement execute function private.lock_coach_training_slots();

-- Narrow dictionary read: schedule viewers do not gain training_locations access.
create or replace function public.list_coach_schedule_template_venues()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_coach_schedules_permission('VIEW');
  return coalesce((select jsonb_agg(jsonb_build_object('id',tv.id,'name',tv.name) order by tv.sort_order,tv.name,tv.id)
    from public.training_venues tv where tv.is_active),'[]');
end;
$$;
create or replace function public.list_coach_schedule_templates()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_coach_schedules_permission('VIEW');
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'is_active',t.is_active,
    'venue_id',t.venue_id,'venue_name',tv.name,'venue_is_active',tv.is_active,
    'coach_profile_ids',t.coach_profile_ids,'updated_at',t.updated_at,'match_mode','venue') order by t.name,t.id)
    from public.coach_schedule_templates t join public.training_venues tv on tv.id=t.venue_id),'[]');
end;
$$;
create or replace function public.save_coach_schedule_template(p_template jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid:=nullif(p_template->>'id','')::uuid; v_ids uuid[]; v_old public.coach_schedule_templates%rowtype;
  v_venue_id uuid:=nullif(p_template->>'venue_id','')::uuid; v_venue public.training_venues%rowtype;
  v_venue_name text:=nullif(btrim(p_template->>'venue_name'),''); v_name text;
begin
  perform pg_catalog.pg_advisory_xact_lock(20360924,1);
  if v_id is null then perform public.assert_coach_schedules_permission('CREATE');
  else
    perform public.assert_coach_schedules_permission('EDIT');
    select * into v_old from public.coach_schedule_templates where id=v_id for update;
    if not found or nullif(p_template->>'updated_at','') is null or v_old.updated_at<>(p_template->>'updated_at')::timestamptz then
      raise exception '範本已更新或刪除，請重新整理。';
    end if;
  end if;
  if p_template->>'match_mode' is distinct from 'venue' then
    raise exception '範本配對方式已更新，請重新整理後再儲存。';
  end if;
  select coalesce(array_agg(distinct c.value::uuid order by c.value::uuid),'{}') into v_ids
    from jsonb_array_elements_text(coalesce(p_template->'coach_profile_ids','[]')) c(value);
  if cardinality(v_ids)=0 or exists(select 1 from unnest(v_ids) c where not private.coach_profile_is_schedulable(c)) then
    raise exception '請選擇至少一位有效教練。';
  end if;
  if v_venue_id is null then
    if v_venue_name is null or length(v_venue_name)>100 then raise exception '請選擇或輸入 1 至 100 字的場地名稱。'; end if;
    -- Save only the name. A failed template write rolls this insert back too.
    insert into public.training_venues(name,created_by) values(v_venue_name,auth.uid())
      on conflict(name) do nothing;
    select * into v_venue from public.training_venues where name=v_venue_name;
  else
    select * into v_venue from public.training_venues where id=v_venue_id;
  end if;
  if v_venue.id is null or not v_venue.is_active then raise exception '場地不存在或已停用，請重新選擇。'; end if;
  v_name:=coalesce(nullif(btrim(p_template->>'name'),''),v_venue.name);
  if length(v_name)>100 then raise exception '範本名稱最多 100 字。'; end if;
  if v_id is null then
    insert into public.coach_schedule_templates(name,is_active,venue_id,coach_profile_ids,created_by,updated_by)
      values(v_name,coalesce((p_template->>'is_active')::boolean,true),v_venue.id,v_ids,auth.uid(),auth.uid()) returning id into v_id;
  else
    update public.coach_schedule_templates set name=v_name,is_active=coalesce((p_template->>'is_active')::boolean,true),
      venue_id=v_venue.id,coach_profile_ids=v_ids,updated_by=auth.uid(),
      updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=v_id;
  end if;
  return v_id;
exception when unique_violation then raise exception '此場地已有啟用範本，請先停用或修改原範本。';
end;
$$;

create or replace function private.enrich_coach_schedule_payload(p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_events jsonb;
begin
  select coalesce(jsonb_agg(e.value || jsonb_build_object(
    'venue_id', case when e.value->>'source_type'='training_location' then
      (select to_jsonb(sv.venue_id) from public.training_location_session_venues sv where sv.id=nullif(e.value->>'source_venue_id','')::uuid) when e.value->>'source_type'='training_date' then
      (select to_jsonb(tv.id) from public.training_venues tv where tv.is_active and tv.name=nullif(btrim(e.value->>'location'),''))
      else 'null'::jsonb end,
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
    select t.* into v_template from public.coach_schedule_templates t
      join public.training_venues tv on tv.id=t.venue_id and tv.is_active
      where t.is_active and t.venue_id=nullif(v_event->>'venue_id','')::uuid;
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
    'venues',(select coalesce(jsonb_agg(jsonb_build_object('id',tv.id,'name',tv.name,'is_active',tv.is_active,'updated_at',tv.updated_at) order by tv.id),'[]') from public.training_venues tv),
    'leaves',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'revision',l.revision,'status',l.status) order by l.id),'[]') from public.coach_leave_requests l),
    'coaches',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'eligible',private.coach_profile_is_schedulable(p.id)) order by p.id),'[]') from public.profiles p));
  v_fingerprint:='venue-v2:' || md5(v_state::text || v_rows::text);
  return jsonb_build_object('fingerprint',v_fingerprint,'rows',v_rows);
end;
$$;

create or replace function public.confirm_coach_schedule_auto_fill(p_month date,p_fingerprint text,p_event_keys text[])
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare v_month date:=public.coach_schedule_month_start(p_month); v_keys text[]; v_preview jsonb; v_row jsonb; v_ids uuid[]:='{}'; v_id uuid; v_coaches uuid[]; v_required text[]; v_action text;
begin
  perform public.assert_coach_schedules_permission('VIEW'); perform pg_catalog.pg_advisory_xact_lock(20360924,1);
  -- Reject old clients before receipt retries: the old matching mode was narrower.
  if p_fingerprint is null or p_fingerprint not like 'venue-v2:%' then raise exception '範本配對方式已更新，請重新整理並產生預覽。'; end if;
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

-- Keep all reads/writes behind the existing feature and active-account guards.
revoke all on function private.enrich_coach_schedule_payload(jsonb) from public,anon,authenticated;
revoke all on function public.list_coach_schedule_template_venues(),public.list_coach_schedule_templates(),
  public.save_coach_schedule_template(jsonb),public.preview_coach_schedule_auto_fill(date),
  public.confirm_coach_schedule_auto_fill(date,text,text[]) from public,anon;
grant execute on function public.list_coach_schedule_template_venues(),public.list_coach_schedule_templates(),
  public.save_coach_schedule_template(jsonb),public.preview_coach_schedule_auto_fill(date),
  public.confirm_coach_schedule_auto_fill(date,text,text[]) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
