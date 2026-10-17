// Isolated PostgreSQL regression; never connects to Supabase or sends HTTP.
// pg_cron, pg_net and Vault are replaced by minimal local stubs.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const migrationSource = read('supabase/migrations/20261017145208_minute_notification_dispatcher.sql')
const fixtures = read('tests/database/fixtures/trainingGateLiveFunctions.sql')
const diagnosticsSource = fixtures.match(
  /CREATE OR REPLACE FUNCTION public\.get_training_registration_notification_diagnostics\([\s\S]*?\$function\$\s*;/
)[0]
const ADMIN = '00000000-0000-0000-0000-000000000001'
const PARENT = '00000000-0000-0000-0000-000000000002'
const OLD_MATCH_URL = 'https://example-project.supabase.co/functions/v1/send-match-reminders'
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++ }
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++ }

const legacyJobs = [
  ['team-member-notification-outbox-worker', '* * * * *', 'do $cron$ begin perform 1; end $cron$;'],
  ['coach-leave-notification-outbox-worker', '* * * * *', 'do $cron$ begin perform 1; end $cron$;'],
  ['match-reminder-checker', '* * * * *',
    `select net.http_post(url := '${OLD_MATCH_URL}', headers := '{}'::jsonb) from secrets;`],
  ['holiday-theme-notification-checker', '* * * * *', 'select 1;'],
  ['training-registration-notification-checker', '*/5 * * * *', 'do $cron$ begin perform 1; end $cron$;'],
  ['cron-run-history-retention', '30 19 * * *', 'call private.prune_cron_history_daily(10000, 100000, 20);'],
]

const stubs = `
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema private; create schema extensions;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create schema cron;
  create table cron.job(jobid bigserial primary key, jobname text unique, schedule text,
    command text, active boolean not null default true, username text default current_user);
  create table cron.job_run_details(runid bigint primary key, jobid bigint, status text,
    return_message text, start_time timestamptz, end_time timestamptz, command text);
  create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
  language plpgsql as $$
  declare v_id bigint;
  begin
    delete from cron.job where jobname = p_name;
    insert into cron.job(jobname, schedule, command) values (p_name, p_schedule, p_command)
    returning jobid into v_id;
    return v_id;
  end $$;
  create function cron.unschedule(p_jobid bigint) returns boolean language plpgsql as $$
  begin delete from cron.job where jobid = p_jobid; return found; end $$;

  create schema net;
  create table net.requests(id bigserial primary key, url text, body jsonb, headers jsonb,
    timeout_milliseconds integer);
  create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
    headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000) returns bigint
  language sql as $$
    insert into net.requests(url, body, headers, timeout_milliseconds)
    values (url, body, headers, timeout_milliseconds) returning id
  $$;
  create table net._http_response(id bigint primary key, status_code integer, content text,
    timed_out boolean, error_msg text, created timestamptz not null default now());

  create schema vault;
  create table vault.decrypted_secrets(name text primary key, decrypted_secret text);

  create table public.system_settings(key text primary key, value jsonb not null default '{}'::jsonb,
    description text, updated_at timestamptz);
  create table public.profiles(id uuid primary key, role text, is_active boolean default true,
    access_start timestamptz, access_end timestamptz, linked_team_member_ids uuid[]);
  create table public.push_dispatch_events(id uuid primary key default gen_random_uuid(),
    event_key text unique, feature text, action text default 'VIEW', title text, body text, url text,
    match_id uuid, target_user_id uuid, dispatch_mode text not null default 'recorded',
    dispatch_status text not null default 'recorded', created_at timestamptz not null default now());
  create table public.push_dispatch_deliveries(id uuid primary key default gen_random_uuid(),
    event_id uuid references public.push_dispatch_events(id) on delete cascade, status text not null);

  -- Minimal runtime for the live training diagnostics definition.
  create function public.has_app_permission(p_feature text, p_action text default 'VIEW') returns boolean
    language sql stable as $$ select true $$;
  create function private.assert_training_view_permission() returns void language sql as $$ select $$;
  create function public.get_training_registration_notification_config() returns jsonb
    language sql stable as $$ select '{"enabled":true,"sync_secret":"hidden"}'::jsonb $$;
  create table public.matches(id uuid primary key, match_name text, match_date date, match_time text,
    location text, match_level text);
  create table public.training_session_settings(id uuid primary key, match_id uuid, manual_status text,
    registration_start_at timestamptz, registration_end_at timestamptz, capacity integer,
    point_cost integer, created_at timestamptz default now());
  create table public.training_registrations(id uuid primary key default gen_random_uuid(),
    session_id uuid, status text);
  create table public.app_role_permissions(role_key text, feature text, action text);
  create table public.team_members_safe(id uuid primary key, role text, status text);
  create table public.web_push_subscriptions(user_id uuid, enabled boolean);
`

async function setup({ newline = 'LF', diagnostics = 'gated' } = {}) {
  const db = new PGlite()
  await db.exec(stubs)
  for (const [name, schedule, command] of legacyJobs) {
    await db.query('select cron.schedule($1, $2, $3)', [name, schedule, command])
  }
  if (diagnostics !== 'missing') {
    const source = newline === 'CRLF' ? diagnosticsSource.replace(/\r?\n/g, '\r\n') : diagnosticsSource
    await db.exec(diagnostics === 'unexpected'
      ? source.replace('order by jrd.start_time desc', 'order by jrd.end_time desc')
      : source)
    if (diagnostics !== 'ungated') {
      // Same textual injection as 20261011161249_training_view_permission_gate.sql.
      await db.exec(`do $x$
      declare v_oid regprocedure := 'public.get_training_registration_notification_diagnostics(integer)';
        v_body text; v_def text; v_pos integer;
      begin
        select prosrc into v_body from pg_proc where oid = v_oid;
        v_body := replace(v_body, E'\\r\\n', E'\\n');
        v_def := replace(pg_get_functiondef(v_oid), E'\\r\\n', E'\\n');
        v_pos := strpos(v_body, E'\\nbegin\\n');
        execute replace(v_def, v_body, overlay(v_body placing
          E'\\n  perform private.assert_training_view_permission();' from v_pos + 6 for 0));
      end $x$`)
    }
  }
  return db
}

const migrationFor = newline => newline === 'CRLF' ? migrationSource.replace(/\r?\n/g, '\r\n') : migrationSource

async function run(newline) {
  const db = await setup({ newline })
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows
  const one = async (sql, args = []) => (await rows(sql, args))[0]
  const dispatch = async at => (await one('select private.run_minute_notification_dispatch($1::timestamptz) as r', [at])).r
  const requests = async () => rows('select url, body, headers, timeout_milliseconds from net.requests order by id')
  const clearRequests = () => db.exec('delete from net.requests')
  const state = async target => one('select * from private.minute_notification_dispatch_state where target = $1', [target])
  const setVault = async (prefix, values) => {
    for (const [key, value] of Object.entries(values)) {
      await db.query(`insert into vault.decrypted_secrets values ($1, $2)
        on conflict (name) do update set decrypted_secret = excluded.decrypted_secret`, [`${prefix}_${key}`, value])
    }
  }
  const setSetting = (key, value) => db.query(`insert into public.system_settings(key, value) values ($1, $2::jsonb)
    on conflict (key) do update set value = excluded.value`, [key, JSON.stringify(value)])
  const asUser = async user => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || ''])
    await db.exec('set role authenticated')
  }

  try {
    await db.exec(migrationFor(newline))

    // Schedules: four legacy jobs replaced by one short command, others untouched.
    const jobs = await rows('select jobname, schedule, command from cron.job order by jobname')
    equal(jobs.map(job => job.jobname), [
      'cron-run-history-retention', 'minute-notification-dispatcher', 'training-registration-notification-checker',
    ], `${newline}: only the dispatcher replaces the four every-minute jobs`)
    const dispatcherJob = jobs.find(job => job.jobname === 'minute-notification-dispatcher')
    check(dispatcherJob.schedule === '* * * * *'
      && dispatcherJob.command === 'select private.run_minute_notification_dispatch();',
      `${newline}: dispatcher command stays short in every cron history row`)
    equal((await state('match_reminder')).function_url, OLD_MATCH_URL,
      `${newline}: environment-specific match reminder URL is preserved from the old job`)

    // Privileges.
    const fns = await rows(`select p.proname, p.prosecdef,
        has_function_privilege('anon', p.oid, 'EXECUTE') a,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') u,
        has_function_privilege('service_role', p.oid, 'EXECUTE') s
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'
        and p.proname in ('run_minute_notification_dispatch','minute_dispatch_secret','has_pending_outbox_work',
          'match_reminder_rule_times','has_due_match_reminder_work','holiday_theme_time',
          'has_due_holiday_theme_notification','jsonb_is_truthy')`)
    check(fns.length === 8 && fns.every(f => !f.prosecdef && !f.a && !f.u && !f.s),
      `${newline}: dispatcher helpers are invoker-only and unavailable to API roles`)
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(dispatch('2026-10-17T00:00:00Z'), error => error.code === '42501'); checks++
      await assert.rejects(rows('select * from private.minute_notification_dispatch_state'),
        error => error.code === '42501'); checks++
      await db.exec('reset role')
    }

    // Idle: no work and no configuration queue nothing and write no state.
    const quietMinute = '2026-10-17T03:15:00Z' // 11:15 Taipei
    equal(await dispatch(quietMinute), {
      team_member_outbox: 'idle', coach_leave_outbox: 'idle', match_reminder: 'idle', holiday_theme: 'not_configured',
    }, `${newline}: an idle minute reports every target`)
    equal((await requests()).length, 0, `${newline}: idle minute sends no HTTP request`)
    check((await rows('select * from private.minute_notification_dispatch_state where dispatch_count > 0 or last_error is not null')).length === 0,
      `${newline}: idle minute writes no dispatch state`)

    // Team member outbox.
    await db.exec(`insert into public.push_dispatch_events(event_key, feature, dispatch_mode, dispatch_status)
      values ('team_member:done', 'players', 'outbox', 'completed'),
             ('team_member:recorded', 'players', 'recorded', 'recorded'),
             ('coach_leave:historical', 'coach_leave_requests', 'outbox', 'recorded')`)
    equal((await dispatch(quietMinute)).team_member_outbox, 'idle', `${newline}: terminal outbox events are idle`)
    await db.exec(`insert into public.push_dispatch_events(event_key, feature, dispatch_mode, dispatch_status)
      values ('team_member:new', 'players', 'outbox', 'pending')`)
    equal((await dispatch(quietMinute)).team_member_outbox, 'not_configured',
      `${newline}: pending work without complete Vault settings does not post`)
    await setVault('team_member_outbox', { function_url: 'https://fn/team', authorization: 'Bearer t' })
    equal((await dispatch(quietMinute)).team_member_outbox, 'not_configured', `${newline}: missing secret still skips`)
    await setVault('team_member_outbox', { secret: 's1' })
    equal((await dispatch(quietMinute)).team_member_outbox, 'dispatched', `${newline}: pending team member event dispatches`)
    equal(await requests(), [{
      url: 'https://fn/team', body: { source: 'pg_cron', event_limit: 25, delivery_limit: 100 },
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t', 'x-sync-secret': 's1' },
      timeout_milliseconds: 55000,
    }], `${newline}: team member request matches the previous worker call`)
    const teamState = await state('team_member_outbox')
    check(teamState.dispatch_count === 1n || teamState.dispatch_count === 1, `${newline}: dispatch count recorded`)
    check(teamState.last_request_id !== null && teamState.last_dispatched_at !== null, `${newline}: request id and time recorded`)
    await clearRequests()
    await db.exec(`update public.push_dispatch_events set dispatch_status = 'retrying' where event_key = 'team_member:new'`)
    equal((await dispatch(quietMinute)).team_member_outbox, 'dispatched', `${newline}: retrying event keeps the worker scheduled`)
    await db.exec(`update public.push_dispatch_events set dispatch_status = 'completed' where event_key = 'team_member:new';
      insert into public.push_dispatch_deliveries(event_id, status)
        select id, 'pending' from public.push_dispatch_events where event_key = 'team_member:done'`)
    equal((await dispatch(quietMinute)).team_member_outbox, 'dispatched', `${newline}: unfinished delivery is due`)
    await db.exec(`update public.push_dispatch_deliveries set status = 'sent'`)
    await clearRequests()
    equal((await dispatch(quietMinute)).team_member_outbox, 'idle', `${newline}: finished deliveries return to idle`)

    // Coach leave outbox: historical recorded events stay idle; incomplete Vault never posts.
    equal((await dispatch(quietMinute)).coach_leave_outbox, 'idle', `${newline}: recorded historical coach events are idle`)
    await db.exec(`insert into public.push_dispatch_events(event_key, feature, dispatch_mode, dispatch_status)
      values ('coach_leave:new:1:created', 'coach_leave_requests', 'outbox', 'pending')`)
    equal((await dispatch(quietMinute)).coach_leave_outbox, 'not_configured',
      `${newline}: coach worker stays silent until Vault is complete`)
    await setVault('coach_leave_outbox', { function_url: 'https://fn/coach', authorization: 'Bearer c', secret: 's2' })
    equal((await dispatch(quietMinute)).coach_leave_outbox, 'dispatched', `${newline}: complete coach configuration dispatches`)
    equal((await requests()).find(r => r.url === 'https://fn/coach').body, {}, `${newline}: coach request body unchanged`)
    await db.exec(`update public.push_dispatch_events set dispatch_status = 'completed' where feature = 'coach_leave_requests'`)
    await clearRequests()

    // Match reminder windows (default config: 20:00 Taipei = 12:00 UTC).
    const matchStatusAt = async iso => (await dispatch(iso)).match_reminder
    equal(await matchStatusAt('2026-10-17T12:00:00Z'), 'not_configured',
      `${newline}: due reminder without Vault auth/secret does not post`)
    await setVault('match_reminder', { authorization: 'Bearer m', secret: 's3' })
    const windows = {
      '2026-10-17T11:59:00Z': 'idle', '2026-10-17T12:00:00Z': 'dispatched', '2026-10-17T12:00:45Z': 'dispatched',
      '2026-10-17T12:01:00Z': 'dispatched', '2026-10-17T12:02:00Z': 'idle', '2026-10-17T12:03:00Z': 'dispatched',
      '2026-10-17T12:10:00Z': 'dispatched', '2026-10-17T12:20:00Z': 'dispatched', '2026-10-17T12:30:00Z': 'dispatched',
      '2026-10-17T12:31:00Z': 'idle', '2026-10-17T13:00:00Z': 'idle',
    }
    for (const [at, expected] of Object.entries(windows)) {
      equal(await matchStatusAt(at), expected, `${newline}: default rule at ${at} is ${expected}`)
    }
    const matchRequest = (await requests())[0]
    equal(matchRequest, {
      url: OLD_MATCH_URL, body: { source: 'pg_cron', schedule: 'minute dispatcher Asia/Taipei', mode: 'auto' },
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer m', 'x-sync-secret': 's3' },
      timeout_milliseconds: 60000,
    }, `${newline}: match reminder request keeps URL, auth and body semantics`)
    equal((await requests()).length, 7, `${newline}: a rule causes seven calls a day instead of 1,440`)
    await clearRequests()

    await setSetting('match_reminder_schedule_config', { version: 1, enabled: true, rules: [
      { id: 'late', days_before: 1, time: '23:50', enabled: true },
      { id: 'off', days_before: 0, time: '08:00', enabled: false },
    ] })
    equal(await matchStatusAt('2026-10-17T16:10:00Z'), 'dispatched', `${newline}: window crossing Taipei midnight`)
    equal(await matchStatusAt('2026-10-17T00:00:00Z'), 'idle', `${newline}: disabled rule is never due`)
    equal(await matchStatusAt('2026-10-17T12:00:00Z'), 'idle', `${newline}: valid custom rules suppress the default`)
    await setSetting('match_reminder_schedule_config', { enabled: false, rules: [{ days_before: 1, time: '20:00' }] })
    equal(await matchStatusAt('2026-10-17T12:00:00Z'), 'idle', `${newline}: disabled schedule never dispatches`)
    await setSetting('match_reminder_schedule_config', { enabled: true, rules: [{ days_before: 'x', time: ' 07:30 ' }] })
    equal(await matchStatusAt('2026-10-16T23:30:00Z'), 'dispatched', `${newline}: trimmed rule time is honored`)
    equal(await matchStatusAt('2026-10-17T12:00:00Z'), 'dispatched',
      `${newline}: ambiguous days_before keeps the JavaScript default fallback`)
    await setSetting('match_reminder_schedule_config', 'not an object')
    equal(await matchStatusAt('2026-10-17T12:00:00Z'), 'dispatched', `${newline}: invalid config uses the default rule`)
    equal(await one(`select private.match_reminder_rule_times('{"rules":[{"days_before":2,"time":"25:00"},{"days_before":1,"time":"06:00"},{"days_before":3,"time":"06:00"}]}') v`),
      { v: ['06:00'] }, `${newline}: invalid and duplicate times are removed`)
    await clearRequests()

    // Holiday theme: unconfigured in production; with a URL only due activities post.
    await db.exec(`select set_config('app.holiday_theme_function_url', 'https://fn/holiday', false)`)
    const holidayAt = async (config, at = '2026-10-17T03:15:00Z') => {
      await setSetting('holiday_theme_config', config)
      return (await dispatch(at)).holiday_theme
    }
    const activity = extra => ({ version: 2, activities: [{ id: 'a', activeTheme: 'player_mvp',
      notifyOnStart: true, scheduleEnabled: true, scheduleStartAt: '2026-10-17T00:00:00Z', ...extra }] })
    equal(await holidayAt(activity({})), 'dispatched', `${newline}: started unsent activity dispatches`)
    equal((await requests())[0], { url: 'https://fn/holiday', body: { source: 'pg_cron', mode: 'auto' },
      headers: { 'Content-Type': 'application/json' }, timeout_milliseconds: 60000 },
    `${newline}: holiday request strips missing optional credentials like before`)
    equal(await holidayAt(activity({ notificationAutoSentAt: '2026-10-17T00:01:00.000Z' })), 'idle', `${newline}: sent activity idle`)
    equal(await holidayAt(activity({ scheduleStartAt: '2026-10-18T00:00:00Z' })), 'idle', `${newline}: future start idle`)
    equal(await holidayAt(activity({ scheduleEndAt: '2026-10-17T01:00:00Z' })), 'idle', `${newline}: ended activity idle`)
    equal(await holidayAt(activity({ notifyOnStart: false })), 'idle', `${newline}: notify-on-start off idle`)
    equal(await holidayAt(activity({ scheduleEnabled: 0 })), 'idle', `${newline}: falsy schedule flag idle`)
    equal(await holidayAt(activity({ scheduleStartAt: '' })), 'idle', `${newline}: blank start is never due`)
    equal(await holidayAt(activity({ scheduleStartAt: '2026-10-17 11:00' })), 'dispatched',
      `${newline}: legacy local time is Taipei (03:00Z) and due at 03:15Z`)
    equal(await holidayAt(activity({ scheduleStartAt: '2026-10-17 11:30' })), 'idle',
      `${newline}: legacy local time 11:30 Taipei is still in the future`)
    equal(await holidayAt(activity({ scheduleStartAt: 'Oct 17 2026' })), 'dispatched',
      `${newline}: unknown time formats stay conservative`)
    equal(await holidayAt(JSON.stringify(activity({}))), 'dispatched', `${newline}: string-encoded config is parsed`)
    equal(await holidayAt({ activeTheme: 'player_mvp', scheduleEnabled: true }), 'idle',
      `${newline}: legacy single-theme config never auto-notifies`)
    await db.exec(`select set_config('app.holiday_theme_function_url', '', false)`)
    await clearRequests()

    // Failure isolation: one broken target does not block the others.
    await db.exec(`update public.push_dispatch_events set dispatch_status = 'pending' where event_key = 'team_member:new';
      alter function net.http_post(text, jsonb, jsonb, jsonb, integer) rename to http_post_disabled`)
    await setSetting('match_reminder_schedule_config', { enabled: true, rules: [{ days_before: 1, time: '20:00', enabled: true }] })
    equal(await dispatch('2026-10-17T12:30:00Z'), {
      team_member_outbox: 'error', coach_leave_outbox: 'idle', match_reminder: 'error', holiday_theme: 'not_configured',
    }, `${newline}: each target fails independently`)
    const failed = await state('match_reminder')
    check(failed.last_error.startsWith('42883') && failed.last_error_at !== null, `${newline}: error stored without secrets`)
    await db.exec(`alter function net.http_post_disabled(text, jsonb, jsonb, jsonb, integer) rename to http_post;
      update public.push_dispatch_events set dispatch_status = 'completed' where event_key = 'team_member:new'`)

    // Health RPC.
    await db.exec(`insert into public.profiles(id, role) values ('${ADMIN}', 'ADMIN'), ('${PARENT}', 'PARENT')`)
    const health = async () => {
      await asUser(ADMIN)
      const value = (await one('select public.get_match_reminder_health_status() v')).v
      await db.exec('reset role')
      return value
    }
    for (const user of [PARENT, '00000000-0000-0000-0000-000000000099']) {
      await asUser(user)
      await assert.rejects(one('select public.get_match_reminder_health_status()'), /permission denied/); checks++
      await db.exec('reset role')
    }
    const jobId = (await one(`select jobid from cron.job where jobname = 'minute-notification-dispatcher'`)).jobid
    await db.query(`insert into cron.job_run_details(runid, jobid, status, start_time, end_time)
      select n, case when n = 9000 then $1 else 999 end, 'succeeded', now() - interval '1 minute', now()
      from generate_series(1, 9000) n`, [jobId])
    let status = await health()
    equal(status.status, 'unhealthy', `${newline}: dispatch error after the last success is unhealthy`)
    check(status.cron.exists && status.cron.last_status === 'succeeded', `${newline}: windowed cron lookup finds the latest run`)
    check(status.messages.some(m => m.includes('42883')), `${newline}: dispatch error message is surfaced`)
    await db.exec(`update private.minute_notification_dispatch_state set last_error = null, last_error_at = null,
      last_dispatched_at = now() - interval '1 hour', last_request_id = 77 where target = 'match_reminder';
      insert into net._http_response(id, status_code, content) values (77, 200, '{"ok":true}'), (78, 500, null)`)
    status = await health()
    equal([status.status, status.http.last_status_code], ['healthy', 200], `${newline}: successful response is healthy`)
    await db.exec(`update private.minute_notification_dispatch_state set last_request_id = 78 where target = 'match_reminder'`)
    status = await health()
    equal([status.status, status.http.last_status_code], ['unhealthy', 500], `${newline}: failed response is unhealthy`)
    await db.exec(`update private.minute_notification_dispatch_state set last_request_id = 79 where target = 'match_reminder'`)
    equal((await health()).status, 'healthy', `${newline}: expired response (past pg_net TTL) is not an error`)
    await db.exec(`update private.minute_notification_dispatch_state set last_dispatched_at = now() - interval '26 hours'
      where target = 'match_reminder'`)
    status = await health()
    check(status.status === 'warning' && status.messages.includes('超過 25 小時沒有呼叫 send-match-reminders'),
      `${newline}: missing daily dispatch is a warning`)
    await db.exec(`update private.minute_notification_dispatch_state set last_dispatched_at = null, last_request_id = null
      where target = 'match_reminder'`)
    status = await health()
    check(status.status === 'healthy' && status.messages.some(m => m.startsWith('尚無 send-match-reminders 派送紀錄')),
      `${newline}: no dispatch yet is informational only`)
    await db.exec(`update cron.job_run_details set start_time = now() - interval '10 minutes' where runid = 9000`)
    equal((await health()).status, 'warning', `${newline}: stale dispatcher run still warns`)
    await db.exec(`update cron.job_run_details set status = 'failed', return_message = 'boom' where runid = 9000`)
    equal((await health()).status, 'unhealthy', `${newline}: failed dispatcher run is unhealthy`)
    await db.query(`update cron.job_run_details set jobid = $1 where runid = 50`, [jobId])
    await db.exec(`delete from cron.job_run_details where runid = 9000`)
    equal((await health()).cron.last_status, null, `${newline}: runs outside the newest window are not scanned`)

    // Training diagnostics: only the cron-run CTE changes; the VIEW gate remains.
    const definition = (await one(`select pg_get_functiondef('public.get_training_registration_notification_diagnostics(integer)'::regprocedure) v`)).v
    check(definition.includes('private.assert_training_view_permission()'), `${newline}: training VIEW gate is retained`)
    check(definition.includes('order by jrd.runid desc') && !definition.includes('order by jrd.start_time desc'),
      `${newline}: diagnostics reads the newest primary-key window`)
    check(!definition.includes('\r'), `${newline}: rewritten definition is newline-normalized`)
    const trainingJob = (await one(`select jobid from cron.job where jobname = 'training-registration-notification-checker'`)).jobid
    await db.query(`update cron.job_run_details set jobid = $1, start_time = now() - (9000 - runid) * interval '1 second'
      where runid in (100, 8990, 8991, 8992)`, [trainingJob])
    await asUser(ADMIN)
    const diagnostics = (await one('select public.get_training_registration_notification_diagnostics(5) v')).v
    await db.exec('reset role')
    equal(diagnostics.cron.recent_runs.map(run => Number(run.runid)), [8992, 8991, 8990],
      `${newline}: diagnostics returns recent runs only`)
    check(!('sync_secret' in diagnostics.settings), `${newline}: diagnostics still hides secrets`)

    // Re-running the migration is idempotent.
    await db.exec(migrationFor(newline))
    equal((await rows(`select count(*)::int c from cron.job where jobname = 'minute-notification-dispatcher'`))[0].c, 1,
      `${newline}: rerun keeps a single dispatcher job`)
    equal((await state('match_reminder')).function_url, OLD_MATCH_URL, `${newline}: rerun keeps the captured URL`)

    // Rollback script restores the four legacy jobs and removes the dispatcher.
    await db.exec(read('scripts/rollback-minute-notification-dispatcher.sql'))
    const restored = await rows('select jobname, schedule, command from cron.job order by jobname')
    equal(restored.map(job => job.jobname), [
      'coach-leave-notification-outbox-worker', 'cron-run-history-retention', 'holiday-theme-notification-checker',
      'match-reminder-checker', 'team-member-notification-outbox-worker', 'training-registration-notification-checker',
    ], `${newline}: rollback restores the legacy schedules`)
    check(restored.find(job => job.jobname === 'match-reminder-checker').command.includes(`url := '${OLD_MATCH_URL}'`),
      `${newline}: rollback restores the captured match reminder URL`)
    check(restored.filter(job => job.schedule === '* * * * *').length === 4, `${newline}: rollback keeps every-minute cadence`)
  } finally {
    await db.close()
  }
}

async function rejectsUnexpected(diagnostics, pattern) {
  const db = await setup({ diagnostics })
  try {
    await assert.rejects(db.exec(migrationSource), pattern); checks++
    await db.exec('rollback')
    const jobs = (await db.query('select jobname from cron.job order by jobname')).rows.map(row => row.jobname)
    check(jobs.includes('match-reminder-checker') && !jobs.includes('minute-notification-dispatcher'),
      `${diagnostics}: failed migration leaves existing schedules untouched`)
    check((await db.query(`select to_regclass('private.minute_notification_dispatch_state') v`)).rows[0].v === null,
      `${diagnostics}: failed migration rolls back new objects`)
  } finally {
    await db.close()
  }
}

await run('LF')
await run('CRLF')
await rejectsUnexpected('missing', /diagnostics RPC is missing/)
await rejectsUnexpected('ungated', /training:VIEW gate missing/)
await rejectsUnexpected('unexpected', /Unexpected training diagnostics definition/)
console.log(`minute notification dispatcher SQL checks passed: ${checks}`)
