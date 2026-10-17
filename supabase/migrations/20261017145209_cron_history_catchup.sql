begin;

-- Temporary off-peak catch-up for the pre-retention cron history backlog. The
-- daily 03:30 retention (10,000 deletes/day) leaves only ~4,000 rows/day of
-- catch-up capacity, so the 2026-10-17 backlog (~346,000 rows older than 30
-- days) would take months. Activation is separate:
-- scripts/activate-cron-history-catchup.sql. Each call reuses the existing
-- bounded daily procedure (500-row batches, 10,000 deletes, 20 s soft budget)
-- and its advisory lock, so it never overlaps the nightly retention job.
--
-- The job unschedules itself once the oldest 500 history rows are mostly
-- retained (fewer than 50 deletable), or after 2027-01-01 UTC at the latest.
-- Rare jobs' protected latest-ten rows (for example the yearly grade refresh)
-- can stay old forever, hence a threshold instead of zero.
create or replace procedure private.prune_cron_history_catchup()
language plpgsql
security invoker
as $$
declare
  v_deletable integer;
begin
  select count(*)::integer into v_deletable
  from (
    select d.status, d.end_time
    from cron.job_run_details d
    order by d.runid
    limit 500
  ) oldest
  where oldest.end_time < pg_catalog.statement_timestamp() - interval '30 days'
    and oldest.status in ('succeeded', 'failed');

  if v_deletable < 50
    or pg_catalog.statement_timestamp() >= timestamptz '2027-01-01 00:00:00+00' then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'cron-run-history-catchup';
    return;
  end if;

  call private.prune_cron_history_daily(10000, 100000, 20);
end;
$$;
revoke all on procedure private.prune_cron_history_catchup()
  from public, anon, authenticated, service_role;

commit;
