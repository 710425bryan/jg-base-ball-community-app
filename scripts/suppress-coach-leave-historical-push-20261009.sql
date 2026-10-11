-- One-time administrative DML, not a schema migration. User decision:
-- keep the eleven historical coach-leave notifications in the site feed and
-- send browser pushes only for new events. Do not deploy/invoke the worker until
-- this transaction and its post-check are verified.
--
-- The operator must first run the metadata fingerprint SELECT below read-only,
-- confirm exactly eleven pristine rows and zero deliveries, then replace the
-- single fingerprint placeholder in the DO block with that verified digest.
-- Never substitute a digest from a changed/expanded set without reviewing it.
--
-- select count(*) as event_count,
--   md5(coalesce(jsonb_agg(jsonb_build_object(
--     'id',e.id,'event_key',e.event_key,'feature',e.feature,'action',e.action,
--     'created_at_epoch',extract(epoch from e.created_at),
--     'updated_at_epoch',extract(epoch from e.updated_at),
--     'dispatch_mode',e.dispatch_mode,'dispatch_status',e.dispatch_status,
--     'locked_at_epoch',extract(epoch from e.locked_at),
--     'completed_at_epoch',extract(epoch from e.completed_at),
--     'target_count',e.target_count,'sent_count',e.sent_count,
--     'expired_count',e.expired_count,'failed_count',e.failed_count,
--     'provider_counts',e.provider_counts,'last_error',e.last_error
--   ) order by e.id),'[]'::jsonb)::text) as metadata_md5
-- from public.push_dispatch_events e
-- where e.feature='coach_leave_requests' and e.action='VIEW'
--   and e.dispatch_mode='outbox' and e.event_key like 'coach_leave:%'
--   and e.created_at <= '2026-10-06T07:07:21.743675Z'::timestamptz;

begin;
set local lock_timeout = '1s';
set local statement_timeout = '10s';

do $suppress_history$
declare
  v_expected_metadata_md5 constant text := '__EXPECTED_METADATA_MD5__';
  v_cutoff constant timestamptz := '2026-10-06T07:07:21.743675Z';
  v_ids uuid[];
  v_count integer;
  v_not_pristine integer;
  v_updated integer;
  v_metadata_md5 text;
  v_content_before text;
  v_content_after text;
begin
  if v_expected_metadata_md5 !~ '^[0-9a-f]{32}$' then
    raise exception using errcode='22023',message='A verified historical metadata fingerprint is required';
  end if;

  -- No broad table lock and no status predicate that could hide a drifted row.
  -- A concurrent worker uses SKIP LOCKED and cannot claim these pending events.
  perform e.id from public.push_dispatch_events e
    where e.feature='coach_leave_requests' and e.action='VIEW'
      and e.dispatch_mode='outbox' and e.event_key like 'coach_leave:%'
      and e.created_at <= v_cutoff
    order by e.id for update;

  select array_agg(e.id order by e.id),count(*)::integer,
    count(*) filter(where e.dispatch_status is distinct from 'pending'
      or e.locked_at is not null or e.completed_at is not null or e.last_error is not null
      or e.target_count is distinct from 0 or e.sent_count is distinct from 0
      or e.expired_count is distinct from 0 or e.failed_count is distinct from 0
      or e.provider_counts is distinct from '{}'::jsonb)::integer,
    md5(coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'event_key',e.event_key,'feature',e.feature,'action',e.action,
      'created_at_epoch',extract(epoch from e.created_at),
      'updated_at_epoch',extract(epoch from e.updated_at),
      'dispatch_mode',e.dispatch_mode,'dispatch_status',e.dispatch_status,
      'locked_at_epoch',extract(epoch from e.locked_at),
      'completed_at_epoch',extract(epoch from e.completed_at),
      'target_count',e.target_count,'sent_count',e.sent_count,
      'expired_count',e.expired_count,'failed_count',e.failed_count,
      'provider_counts',e.provider_counts,'last_error',e.last_error
    ) order by e.id),'[]'::jsonb)::text),
    md5(string_agg(jsonb_build_array(e.id,e.event_key,e.feature,e.action,e.title,e.body,e.url,
      e.coach_leave_payload,extract(epoch from e.created_at))::text,E'\n' order by e.id))
  into v_ids,v_count,v_not_pristine,v_metadata_md5,v_content_before
  from public.push_dispatch_events e
  where e.feature='coach_leave_requests' and e.action='VIEW'
    and e.dispatch_mode='outbox' and e.event_key like 'coach_leave:%'
    and e.created_at <= v_cutoff;

  if v_count <> 11 or v_not_pristine <> 0 or v_metadata_md5 <> v_expected_metadata_md5 then
    raise exception using errcode='55000',message='Historical notification snapshot changed; no events were modified';
  end if;
  if exists(select 1 from public.push_dispatch_deliveries d where d.event_id=any(v_ids)) then
    raise exception using errcode='55000',message='Historical notification already has deliveries; no events were modified';
  end if;

  -- "recorded" is an existing status for site records, never a successful send.
  -- Keep outbox mode and all event content unchanged; terminate only this fixed
  -- historical set. New events after the cutoff remain pending and claimable.
  update public.push_dispatch_events e set dispatch_status='recorded',
    completed_at=clock_timestamp(),updated_at=clock_timestamp()
  where e.id=any(v_ids) and e.dispatch_status='pending';
  get diagnostics v_updated=row_count;
  if v_updated <> 11 then
    raise exception using errcode='55000',message='Unexpected historical notification update count';
  end if;

  select md5(string_agg(jsonb_build_array(e.id,e.event_key,e.feature,e.action,e.title,e.body,e.url,
    e.coach_leave_payload,extract(epoch from e.created_at))::text,E'\n' order by e.id))
  into v_content_after from public.push_dispatch_events e where e.id=any(v_ids);
  if v_content_after is distinct from v_content_before or exists(
    select 1 from public.push_dispatch_events e where e.id=any(v_ids)
      and (e.dispatch_status is distinct from 'recorded' or e.dispatch_mode is distinct from 'outbox'
        or e.locked_at is not null or e.completed_at is null
        or e.target_count is distinct from 0 or e.sent_count is distinct from 0
        or e.expired_count is distinct from 0 or e.failed_count is distinct from 0)
  ) then
    raise exception using errcode='55000',message='Historical notification post-check failed';
  end if;
  raise notice 'Recorded-only history verified: % events; preserved content MD5 %',v_updated,v_content_after;
end;
$suppress_history$;
commit;

-- Safe post-check: return only counts and the same DB-side content digest used
-- in the production preflight; never return names, reasons or notification text.
select count(*)::integer as historical_events,
  count(*) filter(where e.dispatch_status='recorded')::integer as recorded_only_events,
  count(*) filter(where e.sent_count<>0 or e.target_count<>0)::integer as unexpected_delivery_counts,
  md5(string_agg(jsonb_build_array(e.id,e.event_key,e.feature,e.action,e.title,e.body,e.url,
    e.coach_leave_payload,extract(epoch from e.created_at))::text,E'\n' order by e.id)) as preserved_content_md5
from public.push_dispatch_events e
where e.feature='coach_leave_requests' and e.action='VIEW'
  and e.dispatch_mode='outbox' and e.event_key like 'coach_leave:%'
  and e.created_at <= '2026-10-06T07:07:21.743675Z'::timestamptz;
