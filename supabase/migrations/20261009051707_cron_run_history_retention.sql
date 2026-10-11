begin;

-- Only privileged maintenance uses this state. The extension table and its
-- policies/commands are unchanged; no index build or history scan at deployment.
create schema if not exists private;
create table private.cron_history_retention_state (
  singleton boolean primary key default true check (singleton),
  sweep_ceiling_runid bigint,
  next_before_runid bigint,
  retained_per_job jsonb not null default '{}'::jsonb,
  sweep_started_at timestamptz,
  last_sweep_completed_at timestamptz,
  last_batch_at timestamptz,
  total_scanned bigint not null default 0,
  total_deleted bigint not null default 0,
  last_batch_scanned integer not null default 0,
  last_batch_deleted integer not null default 0
);
alter table private.cron_history_retention_state enable row level security;
revoke all on table private.cron_history_retention_state from public, anon, authenticated, service_role;
insert into private.cron_history_retention_state(singleton) values (true);

-- A descending primary-key sweep avoids repeatedly scanning/sorting a large
-- extension table just to find each current job's latest ten records. Retention
-- counters are committed with each batch and never reset midway through a sweep.
-- New runs above the captured ceiling are intentionally left for the next sweep.
-- Retention uses completion time (not start time), and does not delete unfinished
-- records or unfamiliar statuses. No command/return_message leaves this routine.
create or replace function private.prune_cron_history_batch(p_scan_limit integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '500ms'
set enable_seqscan = off
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_cutoff timestamptz := statement_timestamp() - interval '30 days';
  v_state private.cron_history_retention_state%rowtype;
  v_current_jobs bigint[];
  v_record record;
  v_seen integer;
  v_scanned integer := 0;
  v_deleted integer := 0;
  v_delete_ids bigint[] := array[]::bigint[];
  v_last_runid bigint;
  v_scan_ceiling bigint;
  v_complete boolean := false;
begin
  if p_scan_limit is null or p_scan_limit < 1 or p_scan_limit > 500 then
    raise exception using errcode = '22023', message = 'scan limit must be between 1 and 500';
  end if;
  -- Shared with the daily procedure's session lock; another session cannot
  -- interleave manual cleanup with its sequence of individually committed batches.
  if not pg_try_advisory_xact_lock(20261009, 51103) then
    return jsonb_build_object('status', 'busy', 'scanned', 0, 'deleted', 0);
  end if;

  select * into strict v_state from private.cron_history_retention_state
    where singleton for update;
  select coalesce(array_agg(jobid), array[]::bigint[]) into v_current_jobs from cron.job;
  if v_state.sweep_ceiling_runid is null then
    select max(runid) into v_state.sweep_ceiling_runid from cron.job_run_details;
    v_state.next_before_runid := null;
    v_state.retained_per_job := '{}'::jsonb;
    v_state.sweep_started_at := v_started;
  end if;
  v_scan_ceiling := v_state.sweep_ceiling_runid;
  if v_state.next_before_runid is not null then
    v_scan_ceiling := case when v_state.next_before_runid > (-9223372036854775807::bigint - 1)
      then v_state.next_before_runid - 1 else null end;
  end if;

  -- Each query reads at most p_scan_limit PK-ordered records. Filtering by end
  -- time happens AFTER this limit, so sparse old/finished matches cannot force a
  -- whole-table scan. Prefer the existing PK even when extension statistics are
  -- stale (enable_seqscan is disabled only inside this maintenance function).
  for v_record in
    select d.runid, d.jobid, d.status, d.end_time
    from cron.job_run_details d
    where d.runid <= v_scan_ceiling
    order by d.runid desc limit p_scan_limit
  loop
    v_scanned := v_scanned + 1;
    v_last_runid := v_record.runid;
    v_seen := coalesce((v_state.retained_per_job ->> v_record.jobid::text)::integer, 0);
    if v_record.jobid = any(v_current_jobs) and v_seen < 10 then
      v_state.retained_per_job := jsonb_set(v_state.retained_per_job,
        array[v_record.jobid::text], to_jsonb(v_seen + 1), true);
    elsif v_record.end_time < v_cutoff and v_record.status in ('succeeded', 'failed') then
      v_delete_ids := array_append(v_delete_ids, v_record.runid);
    end if;
  end loop;

  -- Recheck terminal state and completion age under the DELETE's row lock.
  delete from cron.job_run_details d where d.runid = any(v_delete_ids)
    and d.end_time < v_cutoff and d.status in ('succeeded', 'failed');
  get diagnostics v_deleted = row_count;
  v_complete := v_scanned < p_scan_limit;

  update private.cron_history_retention_state set
    sweep_ceiling_runid = case when v_complete then null else v_state.sweep_ceiling_runid end,
    next_before_runid = case when v_complete then null else v_last_runid end,
    retained_per_job = case when v_complete then '{}'::jsonb else v_state.retained_per_job end,
    sweep_started_at = v_state.sweep_started_at,
    last_sweep_completed_at = case when v_complete then clock_timestamp() else last_sweep_completed_at end,
    last_batch_at = clock_timestamp(),
    total_scanned = total_scanned + v_scanned,
    total_deleted = total_deleted + v_deleted,
    last_batch_scanned = v_scanned,
    last_batch_deleted = v_deleted
  where singleton;

  return jsonb_build_object(
    'status', case when v_complete then 'sweep_complete' else 'progress' end,
    'scanned', v_scanned, 'deleted', v_deleted, 'cutoff', v_cutoff,
    'sweep_ceiling_runid', v_state.sweep_ceiling_runid,
    'next_before_runid', case when v_complete then null else v_last_runid end,
    'elapsed_ms', round(extract(epoch from clock_timestamp() - v_started) * 1000, 1)
  );
end;
$$;
revoke all on function private.prune_cron_history_batch(integer) from public, anon, authenticated, service_role;

-- Must be called as a standalone top-level CALL (not in a transaction or via
-- SELECT). SECURITY INVOKER and no SET clause are required for per-batch COMMIT.
-- The elapsed budget is checked between bounded batches, not a hard timeout for
-- a stalled backend. An external caller should also set a session statement
-- timeout BEFORE CALL. pg_cron closes its connection on completion/cancellation.
create or replace procedure private.prune_cron_history_daily(
  p_max_deleted integer default 10000,
  p_max_scanned integer default 100000,
  p_budget_seconds integer default 20
)
language plpgsql
security invoker
as $$
declare
  v_started timestamptz := pg_catalog.clock_timestamp();
  v_result jsonb;
  v_deleted integer := 0;
  v_scanned integer := 0;
  v_error_state text;
begin
  if p_max_deleted is null or p_max_deleted not between 1 and 10000
    or p_max_scanned is null or p_max_scanned not between 1 and 100000
    or p_budget_seconds is null or p_budget_seconds not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid cron history maintenance budget';
  end if;
  if not pg_catalog.pg_try_advisory_lock(20261009, 51103) then return; end if;
  loop
    exit when v_deleted >= p_max_deleted or v_scanned >= p_max_scanned
      or pg_catalog.clock_timestamp() - v_started >= pg_catalog.make_interval(secs => p_budget_seconds);
    v_error_state := null;
    begin
      v_result := private.prune_cron_history_batch(
        least(500, p_max_deleted - v_deleted, p_max_scanned - v_scanned));
    exception when query_canceled or others then
      v_error_state := sqlstate;
    end;
    if v_error_state is not null then
      perform pg_catalog.pg_advisory_unlock(20261009, 51103);
      raise exception using errcode = v_error_state, message = 'cron history cleanup batch stopped';
    end if;
    v_deleted := v_deleted + (v_result ->> 'deleted')::integer;
    v_scanned := v_scanned + (v_result ->> 'scanned')::integer;
    commit;
    exit when v_result ->> 'status' in ('sweep_complete', 'busy');
    begin
      perform pg_catalog.pg_sleep(0.1);
    exception when query_canceled or others then
      v_error_state := sqlstate;
    end;
    if v_error_state is not null then
      perform pg_catalog.pg_advisory_unlock(20261009, 51103);
      raise exception using errcode = v_error_state, message = 'cron history cleanup pause stopped';
    end if;
  end loop;
  perform pg_catalog.pg_advisory_unlock(20261009, 51103);
end;
$$;
revoke all on procedure private.prune_cron_history_daily(integer, integer, integer)
  from public, anon, authenticated, service_role;

-- Activation is intentionally separate: scripts/activate-cron-history-retention.sql.
-- Deployment alone does not delete history or activate a production schedule.
commit;
