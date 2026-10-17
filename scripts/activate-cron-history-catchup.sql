-- Run only after migration 20261017145209_cron_history_catchup.sql and after
-- confirming the previous nights' cron-run-history-retention runs succeeded.
-- Schedules a temporary off-peak catch-up: every 15 minutes during
-- 01:00-02:45 and 04:00-04:45 Asia/Taipei (UTC 17, 18 and 20), skipping the
-- 03:20 pg_net VACUUM and 03:30 retention. At most 12 calls x 10,000 deletes
-- = 120,000 rows per night. The job unschedules itself when the backlog is gone.
-- Stop early with: select cron.unschedule('cron-run-history-catchup');
begin;
do $$
begin
  if coalesce(current_setting('cron.timezone', true), '') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'Expected UTC cron.timezone before enabling catch-up';
  end if;
  if current_user <> 'postgres' then
    raise exception 'Catch-up schedule must run as postgres';
  end if;
  if not exists (select 1 from pg_settings where name = 'statement_timeout'
    and unit = 'ms' and setting::bigint between 1 and 120000) then
    raise exception 'Expected a finite statement_timeout of at most 120 seconds';
  end if;
  if to_regprocedure('private.prune_cron_history_catchup()') is null then
    raise exception 'Apply 20261017145209_cron_history_catchup.sql first';
  end if;
end;
$$;
select cron.schedule(
  'cron-run-history-catchup',
  '*/15 17,18,20 * * *',
  $job$call private.prune_cron_history_catchup();$job$
);
commit;
