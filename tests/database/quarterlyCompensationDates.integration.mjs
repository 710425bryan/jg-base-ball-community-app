// Isolated PostgreSQL regression: no network, production records, or writes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { baselineDefinitions, extractFunction, id, read, setup } from './quarterlyPaymentOwnership.fixture.mjs'

if (process.argv.includes('--newline-matrix')) {
  for (const flags of [[], ['--migration-crlf'], ['--function-crlf'], ['--migration-crlf', '--function-crlf']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...flags], { stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status || 1)
  }
  process.exit(0)
}

const db = new PGlite()
const migrationPath = '../../supabase/migrations/20261008050733_quarterly_compensation_training_dates.sql'
// Read original bytes: exercise Windows migration files and catalog definitions independently.
const migrationBytes = readFileSync(new URL(migrationPath, import.meta.url), 'utf8')
const migration = process.argv.includes('--migration-crlf')
  ? migrationBytes.replace(/\r?\n/g, '\r\n') : migrationBytes
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0]
let checks = 0
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++ }
const fails = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++ }
const login = n => query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : ''])
const generate = (month = '2026-11-01', period = '2026-Q4') => query(
  'select member_id,baseline_session_count,configured_session_count,compensation_days,daily_credit_amount,suggested_amount,status,id from upsert_quarterly_fee_compensation_drafts($1,$2) order by member_id',
  [period, month])
const snapshots = () => query(`select * from (
  select 'quarterly' as source,to_jsonb(q) as row from quarterly_fees q
  union all select 'monthly',to_jsonb(m) from monthly_fees m
  union all select 'submissions',to_jsonb(s) from profile_payment_submissions s
  union all select 'balance',to_jsonb(b) from player_balance_transactions b
  union all select 'compensation',to_jsonb(c) from quarterly_fee_compensation_items c
) all_rows order by source,row::text`)
const transaction = async fn => {
  await db.exec('begin')
  try { await fn() } finally { await db.exec('rollback') }
}
const setDates = dates => query("update training_month_date_settings set training_dates=$1 where program_key='chunggang_school_team'", [dates])

try {
  await setup(db, baselineDefinitions())
  await db.exec(`
    alter table profiles add column name text, add column nickname text;
    alter table training_month_date_settings add column id uuid default gen_random_uuid(), add column note text, add column updated_at timestamptz;
    create table training_program_settings(program_key text primary key,label text,default_weekdays integer[],is_active boolean default true);
    insert into training_program_settings(program_key,label,default_weekdays) values ('chunggang_school_team','中港總部','{6}'),('junior_high_school_team','國中部','{0}');
  `)
  const programs = 'supabase_zzzzzzzzzzzzzzzzzz_training_program_scope_migration.sql'
  for (const name of ['normalize_training_program_key', 'get_default_training_month_dates', 'get_training_month_dates']) {
    await db.exec(extractFunction(programs, name))
  }
  await db.exec(extractFunction('supabase_training_dates_migration.sql', 'get_default_training_month_dates'))
  await db.exec(read('supabase_quarterly_fee_compensation_migration.sql'))
  await db.exec(read('supabase/migrations/20260926105948_quarterly_payment_member_ownership.sql'))
  if (process.argv.includes('--function-crlf')) {
    const definition = await scalar("select pg_get_functiondef('upsert_quarterly_fee_compensation_drafts(text,date)'::regprocedure)")
    await db.exec(definition.replace(/\r?\n/g, '\r\n'))
  }
  await db.exec(`
    insert into training_month_date_settings(month_start,program_key,training_dates) values
      ('2026-11-01','chunggang_school_team','{2026-11-07,2026-11-14,2026-11-21}'),
      ('2026-11-01','junior_high_school_team','{2026-11-01,2026-11-08,2026-11-15,2026-11-22,2026-11-29}');
    insert into quarterly_fees(member_id,member_ids,year_quarter,amount,status) values
      ('${id(11)}',array['${id(11)}','${id(12)}']::uuid[],'2026-Q4',6700,'paid'),
      ('${id(12)}',array['${id(11)}','${id(12)}']::uuid[],'2026-Q4',3700,'pending_review');
    insert into team_members(id,name,role,fee_billing_mode) values
      ('${id(21)}','校隊月費','校隊','role_default'),
      ('${id(22)}','固定月費','球員','monthly_fixed'),
      ('${id(23)}','計次月費','球員','monthly_per_session'),
      ('${id(24)}','不收隊費','球員','no_fee'),
      ('${id(25)}','已退隊','球員','role_default');
    update team_members set status='退隊' where id='${id(25)}';
    insert into monthly_fees(member_id,year_month,payable_amount,status) values ('${id(21)}','2026-10',2000,'paid');
    insert into profile_payment_submissions(profile_id,member_id,status,expected_amount) values
      ('${id(1)}','${id(11)}','approved',6700),('${id(1)}','${id(12)}','pending_review',3700);
    insert into player_balance_transactions(member_id,delta,source) values ('${id(11)}',100,'manual_adjustment');
  `)
  await login(3)
  check(await generate(), [], 'old SQL mixes other dates and produces no November drafts')
  console.log('Reproduced: November 4 baseline / 3 quarterly dates + 5 unrelated dates yields zero drafts.')
  const before = await snapshots()
  const aclBefore = await query("select proacl::text,proconfig,prosecdef from pg_proc where oid='upsert_quarterly_fee_compensation_drafts(text,date)'::regprocedure")
  await db.exec(migration)
  await db.exec(migration)
  check(await snapshots(), before, 'migration preserves financial snapshots and balance ledger')
  check(await query("select proacl::text,proconfig,prosecdef from pg_proc where oid='upsert_quarterly_fee_compensation_drafts(text,date)'::regprocedure"), aclBefore, 'RPC ACL, security mode and search path preserved')
  const rows = await generate()
  check(rows.map(r => [r.member_id,r.baseline_session_count,r.configured_session_count,r.compensation_days,r.daily_credit_amount,r.suggested_amount,r.status]),
    [[id(11),4,3,1,500,500,'pending'],[id(12),4,3,1,250,250,'pending']], 'only quarterly members receive one day, with their own regular/discount amount')
  const ids = rows.map(r => r.id)
  check((await generate()).map(r => r.id), ids, 'repeat generation reuses drafts')
  check(await scalar('select count(*)::integer from player_balance_transactions'), 1, 'drafts do not credit balances')

  await transaction(async () => {
    await query('select * from approve_quarterly_fee_compensation_item($1,500,null)', [ids[0]])
    await query('select * from skip_quarterly_fee_compensation_item($1,null)', [ids[1]])
    const reviewed = await snapshots()
    await generate()
    check(await snapshots(), reviewed, 'generation does not overwrite approved or skipped records or their credits')
    await fails(() => query('select * from approve_quarterly_fee_compensation_item($1,500,null)', [ids[0]]), /already reviewed/)
  })

  for (const [dates, expectedCount, expectedDays] of [
    [['2026-11-07','2026-11-14','2026-11-21','2026-11-27'],4,0],
    [['2026-11-07','2026-11-14','2026-11-21','2026-11-27','2026-11-29'],5,0],
    [['2026-11-07','2026-11-07','2026-11-14','2026-11-21','2026-12-05'],3,1],
    [[],0,4]
  ]) await transaction(async () => {
    await db.exec('delete from quarterly_fee_compensation_items')
    await setDates(dates)
    const generated = await generate()
    check(generated.length, expectedDays > 0 ? 2 : 0, 'makeup, extra, duplicate, out-of-month and empty dates')
    if (expectedDays > 0) check(generated.map(r => [r.configured_session_count,r.compensation_days]), [[expectedCount,expectedDays],[expectedCount,expectedDays]], 'normalized quarterly dates only')
  })
  await transaction(async () => {
    await db.exec("delete from quarterly_fee_compensation_items; delete from training_month_date_settings where program_key='chunggang_school_team'")
    check(await generate(), [], 'missing quarterly setting falls back to default dates despite other programs')
    await db.exec("update training_program_settings set default_weekdays='{5}' where program_key='chunggang_school_team'")
    check(await generate(), [], 'default weekdays use the same date source as the UI')
  })
  await transaction(async () => {
    await db.exec("delete from quarterly_fee_compensation_items; update training_program_settings set default_weekdays='{0}' where program_key='chunggang_school_team'")
    check((await generate()).map(r => r.baseline_session_count), [4,4], 'quarterly baseline stays Saturday count regardless of program defaults')
  })
  await transaction(async () => {
    await db.exec("update training_month_date_settings set month_start='2099-11-01',training_dates='{2099-11-07}' where program_key='chunggang_school_team'")
    check((await generate('2099-11-01','2099-Q4')).length, 2, 'future selected months can generate drafts')
  })
  await login(1)
  await fails(() => generate(), /fees EDIT permission required/)
  await login(null)
  await fails(() => generate(), /auth.uid/)
  await transaction(async () => {
    const definition = await scalar("select pg_get_functiondef('upsert_quarterly_fee_compensation_drafts(text,date)'::regprocedure)")
    await db.exec(definition.replace('v_configured_count := cardinality', 'v_configured_count := 0 + cardinality'))
    await fails(() => db.exec(migration.replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '')), /Quarterly compensation date patch mismatch/)
  })
  console.log(`PASS: ${checks} quarterly compensation date SQL checks (${process.argv.slice(2).join(' ') || 'LF'})`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await db.close()
}
