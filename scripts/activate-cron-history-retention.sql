-- Run only after the retention migration and a successful bounded batch probe.
-- This activates the user-approved daily 03:30 Asia/Taipei cleanup. All existing
-- application schedules are left unchanged. Current production cron.timezone is
-- GMT; abort on another timezone rather than silently scheduling at a wrong time.
begin;
do $$
begin
  if coalesce(current_setting('cron.timezone', true), '') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'Expected UTC cron.timezone before enabling retention';
  end if;
  if current_user <> 'postgres' then
    raise exception 'Retention schedule must run as postgres';
  end if;
  if not exists (select 1 from pg_settings where name = 'statement_timeout'
    and unit = 'ms' and setting::bigint between 1 and 120000) then
    raise exception 'Expected a finite statement_timeout of at most 120 seconds';
  end if;
end;
$$;
select cron.schedule(
  'cron-run-history-retention',
  '30 19 * * *',
  $job$call private.prune_cron_history_daily(10000, 100000, 20);$job$
);
commit;
