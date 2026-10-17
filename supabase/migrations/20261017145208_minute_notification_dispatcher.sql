begin;

-- Replaces the four unconditional every-minute notification cron jobs with one
-- short dispatcher command. Each target is pre-checked in SQL and only queues a
-- pg_net request when its Edge Function has work. Fewer cron runs also mean
-- fewer cron.job_run_details rows (previously ~5,760/day storing 600-1,200 byte
-- DO blocks) and far fewer net._http_response rows for pg_net to clean up.
create schema if not exists private;

-- Written only when a request is queued or a target fails, never on idle runs.
create table if not exists private.minute_notification_dispatch_state (
  target text primary key check (target in (
    'team_member_outbox', 'coach_leave_outbox', 'match_reminder', 'holiday_theme'
  )),
  function_url text,
  last_dispatched_at timestamptz,
  last_request_id bigint,
  dispatch_count bigint not null default 0,
  last_error text,
  last_error_at timestamptz
);
alter table private.minute_notification_dispatch_state enable row level security;
revoke all on table private.minute_notification_dispatch_state
  from public, anon, authenticated, service_role;
insert into private.minute_notification_dispatch_state(target)
values ('team_member_outbox'), ('coach_leave_outbox'), ('match_reminder'), ('holiday_theme')
on conflict (target) do nothing;

-- Production's match reminder job embeds its Edge Function URL in the command
-- rather than Vault/app settings. Keep that environment-specific URL.
update private.minute_notification_dispatch_state s
set function_url = captured.url
from (
  select substring(j.command from $re$url\s*:=\s*'(https://[^']+)'$re$) as url
  from cron.job j
  where j.jobname = 'match-reminder-checker'
  order by j.jobid desc
  limit 1
) captured
where s.target = 'match_reminder'
  and captured.url is not null
  and s.function_url is null;

create or replace function private.minute_dispatch_secret(p_name text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(ds.decrypted_secret, '')
  from vault.decrypted_secrets ds
  where ds.name = p_name
  limit 1;
$$;

-- JavaScript Boolean(value) semantics for JSON values.
create or replace function private.jsonb_is_truthy(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p_value)
    when 'boolean' then p_value = 'true'::jsonb
    when 'number' then (p_value #>> '{}')::numeric <> 0
    when 'string' then (p_value #>> '{}') <> ''
    when 'object' then true
    when 'array' then true
    else false
  end;
$$;

-- Superset of the claim RPCs: any non-terminal event or unfinished delivery.
-- Delivery retries with a future next_attempt_at keep the worker scheduled
-- during the bounded (six attempt) retry window, as before.
create or replace function private.has_pending_outbox_work(p_feature text, p_event_key_prefix text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.push_dispatch_events e
    where e.dispatch_mode = 'outbox'
      and e.feature = p_feature
      and e.event_key like p_event_key_prefix || '%'
      and e.dispatch_status in ('pending', 'processing', 'retrying')
  ) or exists (
    select 1
    from public.push_dispatch_deliveries d
    join public.push_dispatch_events e on e.id = d.event_id
    where d.status in ('pending', 'processing')
      and e.dispatch_mode = 'outbox'
      and e.feature = p_feature
  );
$$;

-- Mirrors normalizeMatchReminderScheduleConfig() conservatively: returns every
-- enabled rule time the Edge Function could consider. When no rule has an
-- unambiguous valid days_before, the JavaScript default (20:00) may apply, so it
-- is included too. Extra times only cause a harmless no-op Edge call.
create or replace function private.match_reminder_rule_times(p_config jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rule jsonb;
  v_time text;
  v_days jsonb;
  v_days_text text;
  v_times text[] := array[]::text[];
  v_strict_valid integer := 0;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    return array['20:00'];
  end if;
  if p_config -> 'enabled' = 'false'::jsonb then
    return array[]::text[];
  end if;
  if jsonb_typeof(p_config -> 'rules') is distinct from 'array' then
    return array['20:00'];
  end if;

  for v_rule in select r.value from jsonb_array_elements(p_config -> 'rules') r loop
    continue when jsonb_typeof(v_rule) is distinct from 'object';
    v_time := case when jsonb_typeof(v_rule -> 'time') = 'string'
      then btrim(v_rule ->> 'time', E' \t\r\n') end;
    continue when v_time is null or v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

    v_days := v_rule -> 'days_before';
    v_days_text := case jsonb_typeof(v_days)
      when 'number' then v_days #>> '{}'
      when 'string' then btrim(v_days #>> '{}')
    end;
    if v_days_text ~ '^[0-9]{1,2}$' then
      if v_days_text::integer <= 30 then
        v_strict_valid := v_strict_valid + 1;
      end if;
    end if;

    if v_rule -> 'enabled' is distinct from 'false'::jsonb and not (v_time = any(v_times)) then
      v_times := v_times || v_time;
    end if;
  end loop;

  if v_strict_valid = 0 and not ('20:00' = any(v_times)) then
    v_times := v_times || '20:00'::text;
  end if;
  return v_times;
end;
$$;

-- send-match-reminders sends at the exact rule minute and checks for missing
-- events 3-30 minutes later. Call at minute 0 (plus 1 as a boundary guard) and
-- at 3/10/20/30 minutes instead of every minute of the day.
create or replace function private.has_due_match_reminder_work(p_now timestamptz)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_config jsonb;
  v_now timestamp := date_trunc('minute', p_now at time zone 'Asia/Taipei');
  v_time text;
  v_day date;
  v_diff integer;
begin
  select ss.value into v_config
  from public.system_settings ss
  where ss.key = 'match_reminder_schedule_config';

  foreach v_time in array private.match_reminder_rule_times(v_config) loop
    foreach v_day in array array[v_now::date, v_now::date - 1] loop
      v_diff := floor(extract(epoch from (v_now - (v_day + v_time::time))) / 60)::integer;
      if v_diff in (0, 1, 3, 10, 20, 30) then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end;
$$;

-- Only formats both JavaScript Date and PostgreSQL parse identically; anything
-- else returns null (unknown) and callers stay conservative.
create or replace function private.holiday_theme_time(p_value jsonb)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
  v_parts text[];
begin
  if jsonb_typeof(p_value) = 'number' then
    return to_timestamp((p_value #>> '{}')::double precision / 1000);
  end if;
  if jsonb_typeof(p_value) is distinct from 'string' then
    return null;
  end if;
  v_text := btrim(p_value #>> '{}', E' \t\r\n');
  v_parts := regexp_match(v_text,
    '^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:[T ]([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?)?$');
  begin
    if v_parts is not null then
      return make_timestamptz(v_parts[1]::integer, v_parts[2]::integer, v_parts[3]::integer,
        coalesce(v_parts[4], '0')::integer, coalesce(v_parts[5], '0')::integer,
        coalesce(v_parts[6], '0')::double precision, 'Asia/Taipei');
    end if;
    if v_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:?[0-9]{2})$' then
      return v_text::timestamptz;
    end if;
  exception when others then
    return null;
  end;
  return null;
end;
$$;

-- Mirrors getDueHolidayThemeActivities(): notify-on-start, schedule enabled,
-- not yet sent, started and not ended. Unknown time formats count as due.
create or replace function private.has_due_holiday_theme_notification(p_now timestamptz)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_value jsonb;
  v_config jsonb;
  v_activity jsonb;
  v_start_raw jsonb;
  v_start timestamptz;
  v_end timestamptz;
begin
  select ss.value into v_value
  from public.system_settings ss
  where ss.key = 'holiday_theme_config';

  if jsonb_typeof(v_value) = 'string' then
    begin
      v_config := (v_value #>> '{}')::jsonb;
    exception when others then
      return false;
    end;
  else
    v_config := v_value;
  end if;
  if jsonb_typeof(v_config) is distinct from 'object'
    or jsonb_typeof(v_config -> 'activities') is distinct from 'array' then
    return false;
  end if;

  for v_activity in select a.value from jsonb_array_elements(v_config -> 'activities') a loop
    continue when jsonb_typeof(v_activity) is distinct from 'object';
    continue when not private.jsonb_is_truthy(v_activity -> 'notifyOnStart')
      or not private.jsonb_is_truthy(v_activity -> 'scheduleEnabled');
    continue when private.holiday_theme_time(v_activity -> 'notificationAutoSentAt') is not null;

    v_start_raw := v_activity -> 'scheduleStartAt';
    continue when case jsonb_typeof(v_start_raw)
      when 'string' then btrim(v_start_raw #>> '{}', E' \t\r\n') = ''
      when 'number' then (v_start_raw #>> '{}')::numeric = 0
      else true
    end;
    v_start := private.holiday_theme_time(v_start_raw);
    continue when v_start is not null and p_now < v_start;
    v_end := private.holiday_theme_time(v_activity -> 'scheduleEndAt');
    continue when v_end is not null and p_now > v_end;
    return true;
  end loop;
  return false;
end;
$$;

-- One target failing (missing Vault view, pg_net error) never blocks the others.
-- Request headers/bodies match the previous individual cron commands.
create or replace function private.run_minute_notification_dispatch(p_now timestamptz default now())
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_target text;
  v_url text;
  v_auth text;
  v_secret text;
  v_headers jsonb;
  v_body jsonb;
  v_timeout integer;
  v_request_id bigint;
  v_error text;
begin
  foreach v_target in array array[
    'team_member_outbox', 'coach_leave_outbox', 'match_reminder', 'holiday_theme'
  ] loop
    begin
      v_url := null; v_auth := null; v_secret := null;
      if v_target = 'team_member_outbox' then
        if not private.has_pending_outbox_work('players', 'team_member:') then
          v_result := v_result || jsonb_build_object(v_target, 'idle'); continue;
        end if;
        v_url := private.minute_dispatch_secret('team_member_outbox_function_url');
        v_auth := private.minute_dispatch_secret('team_member_outbox_authorization');
        v_secret := private.minute_dispatch_secret('team_member_outbox_secret');
        v_headers := jsonb_build_object('Content-Type', 'application/json',
          'Authorization', v_auth, 'x-sync-secret', v_secret);
        v_body := jsonb_build_object('source', 'pg_cron', 'event_limit', 25, 'delivery_limit', 100);
        v_timeout := 55000;
      elsif v_target = 'coach_leave_outbox' then
        if not private.has_pending_outbox_work('coach_leave_requests', 'coach_leave:') then
          v_result := v_result || jsonb_build_object(v_target, 'idle'); continue;
        end if;
        v_url := private.minute_dispatch_secret('coach_leave_outbox_function_url');
        v_auth := private.minute_dispatch_secret('coach_leave_outbox_authorization');
        v_secret := private.minute_dispatch_secret('coach_leave_outbox_secret');
        v_headers := jsonb_build_object('Content-Type', 'application/json',
          'Authorization', v_auth, 'x-sync-secret', v_secret);
        v_body := '{}'::jsonb;
        v_timeout := 55000;
      elsif v_target = 'match_reminder' then
        if not private.has_due_match_reminder_work(p_now) then
          v_result := v_result || jsonb_build_object(v_target, 'idle'); continue;
        end if;
        select coalesce(s.function_url,
            private.minute_dispatch_secret('match_reminder_function_url'),
            nullif(current_setting('app.match_reminder_function_url', true), ''))
          into v_url
        from private.minute_notification_dispatch_state s where s.target = v_target;
        v_auth := coalesce(private.minute_dispatch_secret('match_reminder_authorization'),
          nullif(current_setting('app.match_reminder_authorization', true), ''));
        v_secret := coalesce(private.minute_dispatch_secret('match_reminder_secret'),
          nullif(current_setting('app.match_reminder_secret', true), ''));
        v_headers := jsonb_build_object('Content-Type', 'application/json',
          'Authorization', v_auth, 'x-sync-secret', v_secret);
        v_body := jsonb_build_object('source', 'pg_cron',
          'schedule', 'minute dispatcher Asia/Taipei', 'mode', 'auto');
        v_timeout := 60000;
      else
        v_url := coalesce(nullif(current_setting('app.holiday_theme_function_url', true), ''),
          private.minute_dispatch_secret('holiday_theme_function_url'));
        if v_url is null then
          v_result := v_result || jsonb_build_object(v_target, 'not_configured'); continue;
        end if;
        if not private.has_due_holiday_theme_notification(p_now) then
          v_result := v_result || jsonb_build_object(v_target, 'idle'); continue;
        end if;
        v_auth := coalesce(nullif(current_setting('app.holiday_theme_authorization', true), ''),
          private.minute_dispatch_secret('holiday_theme_authorization'));
        v_secret := coalesce(nullif(current_setting('app.holiday_theme_secret', true), ''),
          private.minute_dispatch_secret('holiday_theme_secret'));
        -- The previous holiday job sent without optional credentials as well.
        v_headers := jsonb_strip_nulls(jsonb_build_object('Content-Type', 'application/json',
          'Authorization', v_auth, 'x-sync-secret', v_secret));
        v_body := jsonb_build_object('source', 'pg_cron', 'mode', 'auto');
        v_timeout := 60000;
      end if;

      if v_url is null or (v_target <> 'holiday_theme' and (v_auth is null or v_secret is null)) then
        v_result := v_result || jsonb_build_object(v_target, 'not_configured'); continue;
      end if;

      v_request_id := net.http_post(url := v_url, body := v_body, headers := v_headers,
        timeout_milliseconds := v_timeout);
      update private.minute_notification_dispatch_state
      set last_dispatched_at = p_now, last_request_id = v_request_id,
        dispatch_count = dispatch_count + 1
      where target = v_target;
      v_result := v_result || jsonb_build_object(v_target, 'dispatched');
    exception when others then
      v_error := left(sqlstate || ': ' || sqlerrm, 500);
      -- Rewrite a repeating identical error at most hourly.
      update private.minute_notification_dispatch_state
      set last_error = v_error, last_error_at = p_now
      where target = v_target
        and (last_error is distinct from v_error or last_error_at is null
          or last_error_at < p_now - interval '1 hour'
          or last_error_at < coalesce(last_dispatched_at, '-infinity'::timestamptz));
      v_result := v_result || jsonb_build_object(v_target, 'error');
    end;
  end loop;
  return v_result;
end;
$$;

revoke all on function private.minute_dispatch_secret(text) from public, anon, authenticated, service_role;
revoke all on function private.jsonb_is_truthy(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.has_pending_outbox_work(text, text) from public, anon, authenticated, service_role;
revoke all on function private.match_reminder_rule_times(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.has_due_match_reminder_work(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.holiday_theme_time(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.has_due_holiday_theme_notification(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.run_minute_notification_dispatch(timestamptz) from public, anon, authenticated, service_role;

-- Health status no longer sorts the whole cron history by start_time nor scans
-- net._http_response content with LIKE. Cron runs are read from the newest
-- primary-key window; the HTTP result is the dispatcher's last request by id.
create or replace function public.get_match_reminder_health_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, extensions, cron, net
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_job_id bigint;
  v_job_schedule text;
  v_job_active boolean := false;
  v_run_floor bigint;
  v_last_run_status text;
  v_last_run_return_message text;
  v_last_run_start_time timestamptz;
  v_last_run_end_time timestamptz;
  v_last_http_status_code integer;
  v_last_http_timed_out boolean := false;
  v_last_http_error_message text;
  v_last_http_created_at timestamptz;
  v_dispatch private.minute_notification_dispatch_state%rowtype;
  v_config jsonb;
  v_config_enabled boolean := false;
  v_rule_count integer := 0;
  v_recent_alert_count integer := 0;
  v_status text := 'healthy';
  v_messages text[] := '{}'::text[];
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = v_user_id;

  -- A user without a profile row is denied as well (previously null <> 'ADMIN').
  if v_role is distinct from 'ADMIN' then
    raise exception 'permission denied for match reminder health status';
  end if;

  select ss.value
  into v_config
  from public.system_settings ss
  where ss.key = 'match_reminder_schedule_config';

  v_config_enabled := case
    when jsonb_typeof(v_config->'enabled') = 'boolean' then coalesce((v_config->>'enabled')::boolean, false)
    else false
  end;
  v_rule_count := case
    when jsonb_typeof(v_config->'rules') = 'array' then jsonb_array_length(v_config->'rules')
    else 0
  end;

  select j.jobid, j.schedule, j.active
  into v_job_id, v_job_schedule, v_job_active
  from cron.job j
  where j.jobname in ('minute-notification-dispatcher', 'match-reminder-checker')
  order by (j.jobname = 'minute-notification-dispatcher') desc, j.jobid desc
  limit 1;

  if v_job_id is not null then
    select coalesce(max(r.runid), 0) - 5000 into v_run_floor from cron.job_run_details r;
    select d.status, d.return_message, d.start_time, d.end_time
    into v_last_run_status, v_last_run_return_message, v_last_run_start_time, v_last_run_end_time
    from cron.job_run_details d
    where d.jobid = v_job_id
      and d.runid > v_run_floor
    order by d.runid desc
    limit 1;
  end if;

  select * into v_dispatch
  from private.minute_notification_dispatch_state s
  where s.target = 'match_reminder';

  if v_dispatch.last_request_id is not null then
    select r.status_code, r.timed_out, r.error_msg, r.created
    into v_last_http_status_code, v_last_http_timed_out, v_last_http_error_message, v_last_http_created_at
    from net._http_response r
    where r.id = v_dispatch.last_request_id;
  end if;

  select count(*)::integer
  into v_recent_alert_count
  from public.push_dispatch_events pde
  where pde.feature = 'matches'
    and pde.action = 'HEALTH_ALERT'
    and pde.created_at >= now() - interval '24 hours';

  if v_job_id is null or coalesce(v_job_active, false) = false then
    v_status := 'unhealthy';
    v_messages := array_append(v_messages, '賽事提醒 cron 未啟用');
  elsif v_last_run_status is null then
    v_status := 'warning';
    v_messages := array_append(v_messages, '尚未找到最近一次 cron 執行紀錄');
  elsif v_last_run_status <> 'succeeded' then
    v_status := 'unhealthy';
    v_messages := array_append(v_messages, format('最近一次 cron 執行失敗：%s', coalesce(v_last_run_return_message, v_last_run_status)));
  elsif v_last_run_start_time < now() - interval '5 minutes' then
    v_status := 'warning';
    v_messages := array_append(v_messages, 'cron 最近 5 分鐘內沒有執行紀錄');
  end if;

  if v_dispatch.last_error_at is not null
    and v_dispatch.last_error_at >= coalesce(v_dispatch.last_dispatched_at, '-infinity'::timestamptz) then
    v_status := 'unhealthy';
    v_messages := array_append(v_messages, format('最近一次呼叫 send-match-reminders 失敗：%s', v_dispatch.last_error));
  end if;

  if v_dispatch.last_dispatched_at is null then
    v_messages := array_append(v_messages, '尚無 send-match-reminders 派送紀錄（到達提醒時間才會呼叫）');
  elsif v_config_enabled and v_dispatch.last_dispatched_at < now() - interval '25 hours' then
    if v_status = 'healthy' then
      v_status := 'warning';
    end if;
    v_messages := array_append(v_messages, '超過 25 小時沒有呼叫 send-match-reminders');
  end if;

  if coalesce(v_last_http_timed_out, false) or coalesce(v_last_http_status_code, 0) >= 400 then
    v_status := 'unhealthy';
    v_messages := array_append(v_messages, format('最近一次 send-match-reminders HTTP 狀態異常：%s', coalesce(v_last_http_status_code::text, v_last_http_error_message, 'unknown')));
  end if;

  if not v_config_enabled then
    if v_status = 'healthy' then
      v_status := 'warning';
    end if;
    v_messages := array_append(v_messages, '賽事提醒排程目前停用');
  end if;

  if v_recent_alert_count > 0 then
    v_status := 'unhealthy';
    v_messages := array_append(v_messages, format('最近 24 小時有 %s 筆健康警報', v_recent_alert_count));
  end if;

  return jsonb_build_object(
    'status', v_status,
    'messages', to_jsonb(v_messages),
    'checked_at', now(),
    'cron', jsonb_build_object(
      'exists', v_job_id is not null,
      'active', coalesce(v_job_active, false),
      'schedule', v_job_schedule,
      'last_status', v_last_run_status,
      'last_return_message', v_last_run_return_message,
      'last_start_time', v_last_run_start_time,
      'last_end_time', v_last_run_end_time
    ),
    'http', jsonb_build_object(
      'last_status_code', v_last_http_status_code,
      'last_timed_out', coalesce(v_last_http_timed_out, false),
      'last_error_message', v_last_http_error_message,
      'last_created_at', v_last_http_created_at,
      'last_dispatched_at', v_dispatch.last_dispatched_at,
      'last_dispatch_error', v_dispatch.last_error,
      'last_dispatch_error_at', v_dispatch.last_error_at
    ),
    'config', jsonb_build_object(
      'enabled', v_config_enabled,
      'rule_count', v_rule_count
    ),
    'recent_alert_count', v_recent_alert_count
  );
end;
$$;

revoke all on function public.get_match_reminder_health_status() from public;
grant execute on function public.get_match_reminder_health_status() to authenticated, service_role;

-- The live training diagnostics RPC (with its injected training:VIEW gate) sorted
-- every cron run by start_time. Rewrite only that CTE to the newest primary-key
-- window; refuse an unexpected definition instead of guessing.
do $migration$
declare
  v_oid regprocedure := to_regprocedure('public.get_training_registration_notification_diagnostics(integer)');
  v_definition text;
  v_old text := E'    where j.jobname = ''training-registration-notification-checker''\n'
    || E'    order by jrd.start_time desc\n    limit 10';
  v_new text := E'    where j.jobname = ''training-registration-notification-checker''\n'
    || E'      and jrd.runid > (select coalesce(max(recent.runid), 0) - 5000 from cron.job_run_details recent)\n'
    || E'    order by jrd.runid desc\n    limit 10';
begin
  if v_oid is null then
    raise exception 'Required training diagnostics RPC is missing';
  end if;
  v_definition := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  if strpos(v_definition, 'private.assert_training_view_permission()') = 0 then
    raise exception 'Unexpected training diagnostics definition: training:VIEW gate missing';
  end if;
  if strpos(v_definition, v_new) > 0 then
    return;
  end if;
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Unexpected training diagnostics definition';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

select cron.unschedule(j.jobid)
from cron.job j
where j.jobname in (
  'team-member-notification-outbox-worker',
  'coach-leave-notification-outbox-worker',
  'match-reminder-checker',
  'holiday-theme-notification-checker',
  'minute-notification-dispatcher'
);

select cron.schedule(
  'minute-notification-dispatcher',
  '* * * * *',
  $job$select private.run_minute_notification_dispatch();$job$
);

notify pgrst, 'reload schema';

commit;
