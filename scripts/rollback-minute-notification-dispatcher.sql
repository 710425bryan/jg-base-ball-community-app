-- Rollback for 20261017145208_minute_notification_dispatcher.sql schedules only.
-- Restores the four individual every-minute jobs exactly as they existed in
-- production on 2026-10-17 (read-only inventory) and removes the dispatcher.
-- Functions/state created by the migration are left in place (unused). The
-- health/diagnostics RPC rewrites remain; they also work with the legacy job
-- names (health falls back to match-reminder-checker).
begin;
do $$
begin
  if not exists (select 1 from private.minute_notification_dispatch_state s
    where s.target = 'match_reminder' and s.function_url like 'https://%') then
    raise exception 'Captured match reminder URL is missing; restore that job manually';
  end if;
end;
$$;
select cron.unschedule(j.jobid) from cron.job j where j.jobname in (
  'minute-notification-dispatcher',
  'team-member-notification-outbox-worker',
  'coach-leave-notification-outbox-worker',
  'match-reminder-checker',
  'holiday-theme-notification-checker'
);

select cron.schedule('team-member-notification-outbox-worker', '* * * * *', $job$
  do $cron$
  declare v_url text; v_authorization text; v_secret text;
  begin
    select nullif(ds.decrypted_secret, '') into v_url from vault.decrypted_secrets ds
      where ds.name = 'team_member_outbox_function_url' limit 1;
    select nullif(ds.decrypted_secret, '') into v_authorization from vault.decrypted_secrets ds
      where ds.name = 'team_member_outbox_authorization' limit 1;
    select nullif(ds.decrypted_secret, '') into v_secret from vault.decrypted_secrets ds
      where ds.name = 'team_member_outbox_secret' limit 1;
    if v_url is null or v_authorization is null or v_secret is null then
      raise notice 'team member outbox Vault settings are incomplete; skip worker call';
      return;
    end if;
    perform net.http_post(url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', v_authorization, 'x-sync-secret', v_secret),
      body := jsonb_build_object('source', 'pg_cron', 'event_limit', 25, 'delivery_limit', 100),
      timeout_milliseconds := 55000);
  end
  $cron$;
$job$);

select cron.schedule('coach-leave-notification-outbox-worker', '* * * * *', $job$ do $cron$
  declare v_url text; v_auth text; v_secret text;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name='coach_leave_outbox_function_url' limit 1;
    select decrypted_secret into v_auth from vault.decrypted_secrets where name='coach_leave_outbox_authorization' limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name='coach_leave_outbox_secret' limit 1;
    if coalesce(v_url,'')='' or coalesce(v_auth,'')='' or coalesce(v_secret,'')='' then
      raise notice 'Coach leave outbox Vault configuration is incomplete'; return;
    end if;
    perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json',
      'Authorization',v_auth,'x-sync-secret',v_secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
  end $cron$; $job$);

-- The production URL is taken from the dispatcher state captured at migration time.
select cron.schedule('match-reminder-checker', '* * * * *', format($job$
  with secrets as (
    select
      max(decrypted_secret) filter (where name = 'match_reminder_authorization') as auth_header,
      max(decrypted_secret) filter (where name = 'match_reminder_secret') as sync_secret
    from vault.decrypted_secrets
    where name in ('match_reminder_authorization', 'match_reminder_secret')
  )
  select net.http_post(
    url := %L,
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', nullif(auth_header, ''),
      'x-sync-secret', nullif(sync_secret, '')
    )),
    body := jsonb_build_object('source', 'pg_cron', 'schedule', 'every minute Asia/Taipei', 'mode', 'auto'),
    timeout_milliseconds := 60000
  ) as request_id
  from secrets
  where nullif(auth_header, '') is not null
    and nullif(sync_secret, '') is not null;
$job$, (select s.function_url from private.minute_notification_dispatch_state s
        where s.target = 'match_reminder' and s.function_url is not null)));

select cron.schedule('holiday-theme-notification-checker', '* * * * *', $job$
  select net.http_post(
    url := current_setting('app.holiday_theme_function_url', true),
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', current_setting('app.holiday_theme_authorization', true),
      'x-sync-secret', nullif(current_setting('app.holiday_theme_secret', true), '')
    )),
    body := jsonb_build_object('source', 'pg_cron', 'mode', 'auto'),
    timeout_milliseconds := 60000
  ) as request_id
  where nullif(current_setting('app.holiday_theme_function_url', true), '') is not null;
$job$);
commit;
