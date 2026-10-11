-- Activate only after the operator has verified the same standalone VACUUM in
-- production. 03:20 Asia/Taipei leaves ten minutes before cron-history cleanup.
-- pg_cron executes VACUUM as a standalone statement; do not wrap its COMMAND in
-- a transaction or prepend SET statements. ANALYZE only samples the indexed
-- retention timestamp; HTTP body/header payload statistics are not needed.
begin;
do $$
begin
  if coalesce(current_setting('cron.timezone', true), '') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'Expected UTC cron.timezone before enabling pg_net maintenance';
  end if;
  if current_user <> 'postgres' then
    raise exception 'pg_net maintenance schedule must run as postgres';
  end if;
  if not exists (select 1 from pg_settings where name = 'statement_timeout'
    and unit = 'ms' and setting::bigint between 1 and 120000) then
    raise exception 'Expected a finite statement_timeout of at most 120 seconds';
  end if;
end;
$$;
select cron.schedule(
  'pg-net-response-maintenance',
  '20 19 * * *',
  $job$vacuum (analyze, truncate false, parallel 0, buffer_usage_limit '256 kB') net._http_response(created);$job$
);
commit;
