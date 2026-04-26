create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Runs at 00:00 Asia/Taipei. Supabase hosted Postgres runs pg_cron in UTC,
-- so the cron expression is 16:00 UTC on the previous calendar day.
--
-- Required database settings before the first scheduled run:
--   alter database postgres set app.match_calendar_sync_function_url = 'https://<project-ref>.supabase.co/functions/v1/sync-match-calendar';
--   alter database postgres set app.match_calendar_sync_authorization = 'Bearer <anon-or-service-role-jwt>';
--   alter database postgres set app.match_calendar_sync_secret = '<same-secret>';

select cron.unschedule('match-calendar-daily-sync')
where exists (
  select 1
  from cron.job
  where jobname = 'match-calendar-daily-sync'
);

select cron.schedule(
  'match-calendar-daily-sync',
  '0 16 * * *',
  $$
  select net.http_post(
    url := current_setting('app.match_calendar_sync_function_url', true),
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', current_setting('app.match_calendar_sync_authorization', true),
      'x-sync-secret', nullif(current_setting('app.match_calendar_sync_secret', true), '')
    )),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'schedule', 'daily 00:00 Asia/Taipei'
    ),
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
