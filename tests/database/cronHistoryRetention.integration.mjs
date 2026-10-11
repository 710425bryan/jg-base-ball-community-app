// Isolated PostgreSQL regression; never connects to Supabase or sends HTTP.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++ }
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const batch = async (limit = 500) => (await query(
  'select private.prune_cron_history_batch($1) as result', [limit]
))[0].result
const reject = async (operation, code) => {
  await assert.rejects(operation, error => error.code === code)
  checks++
}
const migration = readFileSync(new URL(
  '../../supabase/migrations/20261009051707_cron_run_history_retention.sql', import.meta.url
), 'utf8')
const resetSweep = () => db.exec(`update private.cron_history_retention_state set
  sweep_ceiling_runid=null,next_before_runid=null,retained_per_job='{}'`)
const runSweep = async limit => {
  let scanned = 0, deleted = 0
  for (let iteration = 0; iteration < 100; iteration++) {
    const result = await batch(limit)
    check(result.scanned <= limit && result.deleted <= result.scanned, 'each batch is bounded')
    scanned += result.scanned
    deleted += result.deleted
    if (result.status === 'sweep_complete') return { scanned, deleted }
  }
  assert.fail('sweep did not terminate')
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema cron;
    create table cron.job(jobid bigint primary key, active boolean);
    create table cron.job_run_details(
      runid bigint primary key, jobid bigint, status text,
      start_time timestamptz, end_time timestamptz,
      command text, return_message text
    );
    insert into cron.job values (1,true),(2,false),(3,true);
  `)
  await db.exec(migration)

  const metadata = await query(`
    select p.prokind,p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,
      has_function_privilege('service_role',p.oid,'EXECUTE') as service_role
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname like 'prune_cron_history_%'
  `)
  check(metadata.length === 2, 'batch function and daily procedure exist')
  check(metadata.every(row => !row.prosecdef && !row.anon && !row.authenticated && !row.service_role),
    'maintenance keeps caller privileges and is unavailable to API roles')
  check(metadata.find(row => row.prokind === 'f').proconfig.includes('search_path=""'),
    'batch function has a fixed search path')
  check(metadata.find(row => row.prokind === 'p').proconfig === null,
    'daily procedure can commit between batches')
  check((await query(`select relrowsecurity from pg_class
    where oid='private.cron_history_retention_state'::regclass`))[0].relrowsecurity,
    'private state uses RLS as defense in depth')
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec(`set role ${role}`)
    await reject(() => batch(), '42501')
    await reject(() => query('select * from private.cron_history_retention_state'), '42501')
    await db.exec('reset role')
  }
  for (const limit of [0, -1, 501, null]) await reject(() => batch(limit), '22023')
  const empty = await batch()
  check(empty.status === 'sweep_complete' && empty.scanned === 0, 'empty history ends the sweep')

  await db.exec(`
    insert into cron.job_run_details
    select n, case when n <= 30 then 1 when n <= 60 then 2 else 99 end,
      case when n%2=0 then 'succeeded' else 'failed' end,
      now()-interval '60 days', now()-interval '59 days', 'secret command', 'private error'
    from generate_series(1,80) n;
    -- Recent completion, running, pending, unknown state and NULL completion are
    -- protected even though they are outside each job's latest-ten exception.
    update cron.job_run_details set end_time=now()-interval '1 day' where runid=1;
    update cron.job_run_details set status='running' where runid=2;
    update cron.job_run_details set status='starting' where runid=3;
    update cron.job_run_details set status='new_extension_status' where runid=4;
    update cron.job_run_details set end_time=null where runid=5;
  `)
  const partial = await batch(7)
  check(partial.scanned === 7 && partial.deleted === 7 && partial.next_before_runid === 74,
    'descending keyset returns exact progress without scanning past its limit')
  check(!JSON.stringify(partial).includes('secret') && !JSON.stringify(partial).includes('private error'),
    'return value contains no cron commands or response contents')
  const first = await runSweep(7)
  check(first.deleted + partial.deleted === 55, 'only eligible terminal history is deleted')
  const ids = (await query('select runid::int as id from cron.job_run_details order by runid')).map(row => row.id)
  assert.deepEqual(ids, [1,2,3,4,5,...Array.from({length:10},(_,i)=>21+i),...Array.from({length:10},(_,i)=>51+i)])
  checks++
  check((await query('select count(*)::int as n from cron.job'))[0].n === 3, 'job settings are preserved')
  const second = await runSweep(7)
  check(second.deleted === 0, 'a repeat sweep preserves the same newest ten and exceptions')

  await db.exec(`
    insert into cron.job_run_details select n,1,'succeeded',now(),now(),null,null
      from generate_series(81,100) n;
  `)
  const newHead = await batch(10)
  check(newHead.sweep_ceiling_runid === 100, 'new sweep snapshots its upper runid bound')
  await db.exec(`insert into cron.job_run_details values
    (101,1,'succeeded',now(),now(),null,null)`)
  await runSweep(10)
  check((await query('select count(*)::int as n from cron.job_run_details where runid=101'))[0].n === 1,
    'concurrent new records above the ceiling are not touched')
  check((await query('select count(*)::int as n from cron.job_run_details where runid between 21 and 30'))[0].n === 0,
    'previously protected rows expire once ten newer records exist')

  // 31-day-old rare annual jobs retain their latest ten across small batches;
  // a removed job gets no exception, and its old completed records can be pruned.
  await db.exec(`
    insert into cron.job_run_details select n,3,'succeeded',now()-interval '40 days',
      now()-interval '31 days',null,null from generate_series(200,211) n;
    delete from cron.job where jobid=2;
  `)
  await runSweep(3)
  check((await query('select count(*)::int as n from cron.job_run_details where jobid=3'))[0].n === 10,
    'rare current jobs retain ten records across batch boundaries')
  check((await query('select count(*)::int as n from cron.job_run_details where jobid=2'))[0].n === 0,
    'removed jobs do not keep obsolete latest-ten exceptions')

  // An aborted transaction must roll back both deletions and progress.
  await db.exec(`insert into cron.job_run_details values
    (900,99,'succeeded',now()-interval '60 days',now()-interval '60 days',null,null)`)
  await resetSweep()
  const before = (await query('select to_jsonb(s) as state from private.cron_history_retention_state s'))[0].state
  await db.exec('begin')
  await batch(3)
  await db.exec('rollback')
  assert.deepEqual((await query('select to_jsonb(s) as state from private.cron_history_retention_state s'))[0].state,before)
  checks++
  check((await query('select count(*)::int as n from cron.job_run_details where runid=900'))[0].n === 1,
    'an aborted batch rolls back its history deletion too')
  await db.exec('delete from cron.job_run_details where runid=900')

  // Procedure commits are tested through a true top-level CALL in PGlite.
  await db.exec(`insert into cron.job_run_details select n,99,'failed',now()-interval '60 days',
    now()-interval '60 days',null,null from generate_series(1000,2199) n`)
  await resetSweep()
  await db.exec('call private.prune_cron_history_daily(600,1000,20)')
  check((await query('select count(*)::int as n from cron.job_run_details where jobid=99'))[0].n === 600,
    'daily procedure obeys its delete cap over separately committed batches')
  check((await query('select count(*)::int as n from pg_locks where locktype=\'advisory\''))[0].n === 0,
    'daily procedure releases maintenance advisory lock')
  await reject(() => db.exec('call private.prune_cron_history_daily(10001,100000,20)'), '22023')
  await reject(() => db.exec('call private.prune_cron_history_daily(10000,100001,20)'), '22023')
  await reject(() => db.exec('call private.prune_cron_history_daily(10000,100000,21)'), '22023')
  await db.exec(`insert into cron.job_run_details values
    (9223372036854775807,99,'failed',now()-interval '60 days',now()-interval '60 days',null,null)`)
  await resetSweep()
  const maxKey = await batch(1)
  check(maxKey.deleted === 1, 'keyset does not lose the largest bigint runid')

  // The activation scripts are separately testable and idempotent. The stub
  // only records job settings; it never starts a scheduler or a network worker.
  await db.exec(`
    alter table cron.job add column jobname text unique;
    alter table cron.job add column schedule text;
    alter table cron.job add column command text;
    create function cron.schedule(p_name text,p_schedule text,p_command text)
    returns bigint language plpgsql as $$
    declare v_id bigint;
    begin
      insert into cron.job(jobid,active,jobname,schedule,command)
      values ((select coalesce(max(jobid),0)+1 from cron.job),true,p_name,p_schedule,p_command)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command
      returning jobid into v_id;
      return v_id;
    end;
    $$;
  `)
  const activateRetention = readFileSync(new URL('../../scripts/activate-cron-history-retention.sql',import.meta.url),'utf8')
  const activatePgNet = readFileSync(new URL('../../scripts/activate-pg-net-response-maintenance.sql',import.meta.url),'utf8')
  await query("select set_config('cron.timezone','GMT',false)")
  await db.exec("set statement_timeout = '120s'")
  await db.exec(activateRetention)
  await db.exec(activateRetention)
  await db.exec(activatePgNet)
  await db.exec(activatePgNet)
  const jobs = await query('select jobname,schedule,command from cron.job where jobname is not null order by jobname')
  check(jobs.length === 2, 'activating twice does not duplicate either maintenance job')
  check(jobs[0].schedule === '30 19 * * *' && jobs[1].schedule === '20 19 * * *',
    'UTC schedules map to 03:30 and 03:20 Taiwan time')
  check((await query('select count(*)::int as n from cron.job where jobname is null'))[0].n === 2,
    'activation preserves unrelated current application jobs')
  await db.exec('create schema net; create table net._http_response(created timestamptz)')
  await db.exec(jobs[1].command)
  check(true,'scheduled VACUUM is valid as a standalone PostgreSQL command')
  await query("select set_config('cron.timezone','Asia/Taipei',false)")
  await reject(() => db.exec(activateRetention),'P0001')
  await db.exec('rollback')
  console.log(`PASS: ${checks} cron history retention PostgreSQL checks`)
} finally {
  await db.close()
}
