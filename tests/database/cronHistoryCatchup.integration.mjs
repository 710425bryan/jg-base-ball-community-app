// Isolated PostgreSQL regression; never connects to Supabase.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const retention = read('supabase/migrations/20261009051707_cron_run_history_retention.sql')
const catchup = read('supabase/migrations/20261017145209_cron_history_catchup.sql')
const activation = read('scripts/activate-cron-history-catchup.sql')
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++ }

const db = new PGlite()
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]
const remaining = async () => Number((await one(`select count(*) c from cron.job_run_details
  where end_time < now() - interval '30 days'`)).c)
const scheduled = async () => Boolean(await one(`select 1 from cron.job where jobname = 'cron-run-history-catchup'`))

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema cron;
    create table cron.job(jobid bigserial primary key, jobname text unique, schedule text,
      command text, active boolean not null default true);
    create table cron.job_run_details(runid bigint primary key, jobid bigint, status text,
      start_time timestamptz, end_time timestamptz, command text, return_message text);
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
    insert into cron.job(jobname, schedule) values ('minute-notification-dispatcher', '* * * * *'),
      ('team-member-grade-yearly-refresh', '5 16 18 6 *');
  `)
  await db.exec(retention)
  await db.exec(catchup)

  const meta = await one(`select p.prokind, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') a,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') u,
      has_function_privilege('service_role', p.oid, 'EXECUTE') s
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'prune_cron_history_catchup'`)
  check(meta.prokind === 'p' && !meta.prosecdef && meta.proconfig === null,
    'catch-up is an invoker procedure without SET so nested batches can commit')
  check(!meta.a && !meta.u && !meta.s, 'catch-up is unavailable to API roles')

  // 25,000 old completed runs (backlog), two protected yearly runs among them,
  // plus recent runs that must survive.
  await db.exec(`
    insert into cron.job_run_details(runid, jobid, status, start_time, end_time)
    select n, case when n in (3, 4) then 2 else 1 end, 'succeeded',
      now() - interval '120 days' + n * interval '1 minute', now() - interval '120 days' + n * interval '1 minute'
    from generate_series(1, 25000) n;
    insert into cron.job_run_details(runid, jobid, status, start_time, end_time)
    select n, 1, 'succeeded', now() - interval '1 day', now() - interval '1 day'
    from generate_series(25001, 26000) n;
  `)
  // pg_cron's schedule() is only stubbed; the activation guard needs postgres + UTC.
  await db.exec(`select cron.schedule('cron-run-history-catchup', '*/15 17,18,20 * * *',
    'call private.prune_cron_history_catchup();')`)
  check(activation.includes("'*/15 17,18,20 * * *'") && activation.includes('call private.prune_cron_history_catchup();'),
    'activation script schedules the off-peak catch-up command')

  const before = await remaining()
  await db.exec('call private.prune_cron_history_catchup()')
  const afterFirst = await remaining()
  check(before - afterFirst === 10000, 'one call deletes at most the daily 10,000 cap')
  check(await scheduled(), 'catch-up stays scheduled while backlog remains')

  await db.exec('call private.prune_cron_history_catchup()')
  await db.exec('call private.prune_cron_history_catchup()')
  check(await remaining() <= 2, 'repeated calls clear the backlog except protected rows')
  check(Number((await one(`select count(*) c from cron.job_run_details where runid > 25000`)).c) === 1000,
    'recent history is retained')
  check(Number((await one(`select count(*) c from cron.job_run_details where jobid = 2`)).c) === 2,
    'rare job latest runs stay protected')
  check(await scheduled(), 'job is still scheduled until a call observes no backlog')

  await db.exec('call private.prune_cron_history_catchup()')
  check(!(await scheduled()), 'catch-up unschedules itself once only protected old rows remain')
  const deletedBefore = Number((await one('select total_deleted v from private.cron_history_retention_state')).v)
  await db.exec('call private.prune_cron_history_catchup()')
  check(Number((await one('select total_deleted v from private.cron_history_retention_state')).v) === deletedBefore,
    'a finished catch-up performs no further cleanup work')

  // Overlap protection comes from the daily procedure's advisory lock, which
  // the catch-up reuses rather than reimplementing.
  check(catchup.includes('call private.prune_cron_history_daily(10000, 100000, 20)'),
    'catch-up reuses the bounded daily procedure')
  console.log(`cron history catch-up SQL checks passed: ${checks}`)
} finally {
  await db.close()
}
