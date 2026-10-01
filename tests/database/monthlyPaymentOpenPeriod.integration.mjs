// No network or production writes. Optional JSON contains pg_get_functiondef only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { id } from './quarterlyPaymentOwnership.fixture.mjs'
import { setupMonthlyPayments } from './monthlyPaymentOpenPeriod.fixture.mjs'

if (process.argv.includes('--newline-matrix')) {
  const forwarded = process.argv.slice(2).filter(arg=>arg!=='--newline-matrix')
  for (const args of [[],['--migration-crlf'],['--function-crlf'],['--migration-crlf','--function-crlf']]) {
    console.log(`SQL newline regression: ${args.join(' ') || 'LF script / LF functions'}`)
    const result = spawnSync(process.execPath,[fileURLToPath(import.meta.url),...forwarded,...args],{stdio:'inherit'})
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status || 1)
  }
  process.exit(0)
}

const db = new PGlite()
let checks = 0
const check = (actual,expected,message) => { assert.deepEqual(actual,expected,message); checks++ }
const query = async (sql,args=[]) => (await db.query(sql,args)).rows
const scalar = async (sql,args=[]) => Object.values((await query(sql,args))[0])[0]
const fails = async (fn,pattern) => { await assert.rejects(fn,pattern); checks++ }
const date = value => query("select set_config('test.payment_date',$1,false)",[value])
const login = n => query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : ''])
const estimate = (n,period='2026-10') => query('select amount,calculation_type from get_my_payment_submission_estimate($1,$2)',[id(n),period])
const create = (n,period='2026-10',amount=2000,balance=0) => query(
  "select * from create_my_payment_submission($1,$2,99999,'現金',null,current_date,null,$3,$4,null)",
  [id(n),period,balance,amount])
const transaction = async fn => {
  await db.exec('begin')
  try { await fn() } finally { await db.exec('rollback') }
}
const snapshots = () => query(`select * from (select 'monthly' as source,to_jsonb(mf) as row from monthly_fees mf
  union all select 'quarterly',to_jsonb(qf) from quarterly_fees qf
  union all select 'submission',to_jsonb(pps) from profile_payment_submissions pps
  union all select 'balance',to_jsonb(pbt) from player_balance_transactions pbt) snapshot
  order by source,row::text`)
const acls = () => query("select oid,proacl::text from pg_proc where pronamespace='public'::regnamespace order by oid")

try {
  const capture = process.argv.find(arg=>arg.endsWith('.json'))
  await setupMonthlyPayments(db,capture ? JSON.parse(readFileSync(capture,'utf8')) : {})
  if (process.argv.includes('--function-crlf')) {
    const definitions = await query("select pg_get_functiondef(oid) as definition from pg_proc where oid in ('public.get_my_home_snapshot(date)'::regprocedure,'public.get_my_payment_submission_estimate(uuid,text)'::regprocedure,'public.guard_profile_payment_submission_monthly_open_period()'::regprocedure)")
    for (const {definition} of definitions) await db.exec(definition.replace(/\r?\n/g,'\r\n'))
  }
  await login(1)
  await date('2026-09-25')
  if (process.argv.includes('--red')) {
    await create(21) // Must succeed after repair; fails with the original trigger.
    throw new Error('Expected old trigger to reject the opened junior-high period')
  }
  await fails(()=>create(21),/monthly period .*not open yet/)
  check(await estimate(21,'2026-11'),[{amount:2000,calculation_type:'monthly_fixed'}],
    'reproduce old estimator exposing a future month')
  console.log('Reproduced: junior-high advance payment rejected without a fee row; unopened month estimated.')

  await date('2026-10-01')
  await query(`insert into monthly_fees(member_id,year_month,calculation_type,payable_amount,status,fixed_monthly_fee)
    values ($1,'2026-10','per_session',2345,'paid',null),
           ($2,'2026-10','monthly_fixed',1000,'pending_review',1000),
           ($3,'2026-10','per_session',2200,'unpaid',null)`,[id(21),id(22),id(23)])
  await query(`insert into profile_payment_submissions(profile_id,member_id,billing_mode,period_key,
    amount,expected_amount,reported_external_amount,status)
    values ($1,$2,'monthly','2026-08',2000,2000,2000,'approved'),
           ($1,$2,'monthly','2026-09',2000,2000,2000,'pending_review'),
           ($1,$3,'monthly','2026-08',1000,1000,1000,'rejected')`,[id(1),id(21),id(22)])
  await query("insert into player_balance_transactions(member_id,delta,source) values ($1,300,'manual')",[id(25)])
  const before = await snapshots()
  const aclBefore = await acls()
  // Preserve the actual bytes: shared read() normalizes CRLF and would hide a
  // SQL Editor copy/paste mismatch between dollar-quoted predicates and functions.
  const migrationSource = readFileSync(new URL('../../supabase/migrations/20261001032108_junior_high_payment_open_period.sql',import.meta.url),'utf8')
  const migration = process.argv.includes('--migration-crlf')
    ? migrationSource.replace(/\r?\n/g,'\r\n') : migrationSource
  const rpcDefinitions = () => query("select proname,pg_get_functiondef(oid) as definition from pg_proc where oid in ('public.get_my_home_snapshot(date)'::regprocedure,'public.get_my_payment_submission_estimate(uuid,text)'::regprocedure,'public.guard_profile_payment_submission_monthly_open_period()'::regprocedure) order by proname")
  // Preserve the fail-closed safeguard: unknown layouts must roll back the new
  // helper, trigger and any earlier predicate patch, without touching fee data.
  for (const [name,previous,replacement] of [
    ['get_my_home_snapshot','public.is_monthly_payment_period_open(','public.is_monthly_payment_period_open(/* unsupported layout */'],
    ['get_my_payment_submission_estimate',"where linked_member.billing_mode = 'monthly'","where linked_member.billing_mode = /* unsupported layout */ 'monthly'"]
  ]) {
    const original = (await rpcDefinitions()).find(row=>row.proname===name).definition
    assert.ok(original.includes(previous),'drift fixture must change the intended predicate')
    await db.exec(original.replace(previous,replacement))
    const driftBefore = await rpcDefinitions()
    await fails(()=>db.exec(migration),new RegExp(`${name} monthly availability predicate not found`))
    await db.exec('rollback')
    check(await rpcDefinitions(),driftBefore,`${name} drift rolls back all patched RPCs`)
    check(await scalar("select to_regprocedure('public.get_monthly_payment_open_calculation_type(text,text,text,text)') is null"),true,'failed migration leaves no partial helper')
    check(await snapshots(),before,'failed migration leaves all payment rows unchanged')
    await db.exec(original)
  }
  await db.exec(migration)
  await db.exec(migration)
  check(await snapshots(),before,'migration never changes fees, reviewed history, pending reports or balances')
  check((await acls()).filter(row=>aclBefore.some(old=>old.oid===row.oid)),aclBefore,'existing RPC ACLs preserved')
  check(await scalar("select has_function_privilege('authenticated','public.get_monthly_payment_open_calculation_type(text,text,text,text)','execute')"),false,'new helper is internal')
  check(await scalar("select has_function_privilege('anon','public.get_monthly_payment_open_calculation_type(text,text,text,text)','execute')"),false,'anonymous cannot call internal helper')

  // Actual home payment projection, extracted unchanged from the patched RPC.
  const homeBody = await scalar("select prosrc from pg_proc where oid='public.get_my_home_snapshot(date)'::regprocedure")
  const homeSql = homeBody.slice(homeBody.indexOf('with official_due as ('),homeBody.indexOf('from official_due;')+'from official_due;'.length)
    .replace('into v_payment_summary','').replaceAll('v_linked_ids','$1::uuid[]').replaceAll('v_today','$2::date')
  const home = async (members,day) => scalar(homeSql,[members.map(id),day])
  await transaction(async()=>{
    await query("update monthly_fees set status='unpaid' where member_id=$1",[id(21)])
    check((await home([21],'2026-09-24')).unpaid_count,0,'home excludes unopened junior-high period')
    check((await home([21],'2026-09-25')).total_unpaid_amount,2345,'home opens per-session snapshot for junior-high on 25th')
    check((await home([23],'2026-10-31')).unpaid_count,0,'home keeps Chunggang month closed through month end')
    check((await home([23],'2026-11-01')).total_unpaid_amount,2200,'home opens Chunggang on following 1st')
  })
  check((await home([21],'2026-10-01')).unpaid_count,0,'paid history is not shown as unpaid')

  await db.exec('delete from monthly_fees') // Fixture only; subsequent cases have no saved fee row.
  await db.exec('delete from profile_payment_submissions')
  for (const mode of ['single_monthly','training_dates']) {
    await query("select set_config('test.junior_mode',$1,false)",[mode])
    for (const [day,openPeriod,nextPeriod] of [
      ['2026-09-24','2026-09','2026-10'],['2026-09-25','2026-10','2026-11'],
      ['2026-10-01','2026-10','2026-11'],['2026-10-25','2026-11','2026-12'],
      ['2026-12-25','2027-01','2027-02']
    ]) {
      await date(day)
      check((await estimate(21,openPeriod)).length,1,`${mode} opens ${openPeriod} on ${day}`)
      check(await estimate(21,nextPeriod),[],`${mode} estimator hides unopened ${nextPeriod}`)
      await fails(()=>create(21,nextPeriod),/expected amount is unavailable|not open yet/)
      await transaction(async()=>{
        const [{amount}] = await estimate(21,openPeriod)
        await db.exec('set local role authenticated')
        const [report] = await create(21,openPeriod,amount)
        check([report.profile_id,report.period_key,report.expected_amount],[id(1),openPeriod,amount],
          `${mode} linked parent can submit without saved fee row on ${day}`)
      })
    }
  }
  await date('2026-10-01')
  await query("select set_config('test.junior_mode','single_monthly',false)")
  check(await estimate(21),[{amount:2000,calculation_type:'monthly_fixed'}],'junior-high regular amount unchanged')
  check(await estimate(22),[{amount:1000,calculation_type:'monthly_fixed'}],'junior-high manual half price unchanged')
  check(await estimate(23),[],'Chunggang has not ended yet')
  check(await estimate(24),[],'community per-session has not ended yet')
  check(await estimate(25),[{amount:2000,calculation_type:'monthly_fixed'}],'community fixed remains advance payment')
  check(await estimate(26),[],'no-fee member has no new payable item')
  check(await estimate(27),[],'team group alone does not classify junior-high')
  await date('2026-11-01')
  check((await estimate(23))[0].amount,2500,'Chunggang regular fee unchanged when open')
  check((await estimate(24))[0].amount,2000,'community per-session fee unchanged when open')

  await date('2026-10-01')
  await transaction(async()=>{
    await query("insert into monthly_fees(member_id,year_month,calculation_type,payable_amount,fixed_monthly_fee) values ($1,'2026-10','per_session',2468,null)",[id(21)])
    check((await estimate(21))[0].amount,2468,'existing per-session snapshot amount preserved')
    check((await create(21,'2026-10',2468))[0].expected_amount,2468,'snapshot does not delay advance payment')
  })
  await transaction(async()=>{
    await query('insert into player_balance_transactions(member_id,delta) values ($1,300)',[id(21)])
    check((await create(21,'2026-10',1700,300))[0].expected_amount,2000,'balance does not alter fee principal')
    await db.exec('savepoint invalid_balance')
    await fails(()=>create(22,'2026-10',700,300),/balance is not enough/)
    await db.exec('rollback to invalid_balance')
  })
  await login(4)
  check(await estimate(21),[],'unlinked ordinary user cannot estimate another player')
  await fails(()=>create(21),/linked|valid|無法操作/)
  await login(3)
  await transaction(async()=>{check((await create(21))[0].profile_id,id(3),'valid admin exception retained')})
  await login(null)
  await fails(()=>create(21),/auth.uid/)
  console.log(`PASS: ${checks} SQL checks for junior-high advance periods, actual estimates/submissions/home, snapshots and permissions.`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally { await db.close() }
