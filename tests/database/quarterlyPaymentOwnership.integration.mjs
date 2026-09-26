// Run: node tests/database/quarterlyPaymentOwnership.integration.mjs
// Optional argument: locally captured pg_get_functiondef JSON (no row data).
// Every query, including approval, runs in isolated PGlite; never connects remotely.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { baselineDefinitions, id, read, setup } from './quarterlyPaymentOwnership.fixture.mjs'

const db = new PGlite()
const migration = read('supabase/migrations/20260926105948_quarterly_payment_member_ownership.sql')
const migrationBody = migration.replace(/^begin;\s*/, '').replace(/commit;\s*$/, '')
const definitions = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : baselineDefinitions()
const query = async (sql, values = []) => {
  try { return (await db.query(sql, values)).rows }
  catch (error) { throw new Error(`${sql}\n${JSON.stringify(values)}\n${error.message}`) }
}
const scalar = async (sql, values = []) => Object.values((await query(sql, values))[0])[0]
let checks = 0
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++ }
const fails = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++ }
const login = async n => query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : ''])
const records = member => query('select amount,status from get_my_payment_records($1) where period_key=$2 order by amount', [id(member), '2026-Q4'])
const estimate = (member, period = '2026-Q4') => query('select amount from get_my_payment_submission_estimate($1,$2)', [id(member), period])
const feeSnapshot = () => query('select * from quarterly_fees order by id')
const transaction = async fn => {
  await db.exec('begin')
  try { await fn() } finally { await db.exec('rollback') }
}
const single = async (member, amount, balance = 0) => (await query(`select * from create_my_payment_submission($1,'2026-Q4',99999,'銀行轉帳','12345','2026-09-26',null,$2,$3,null)`, [id(member), balance, amount]))[0]
const approve = async submission => {
  await login(3)
  await query("select * from review_profile_payment_submission($1,'approved',0,null)", [submission.id])
}
const functionBody = name => scalar('select prosrc from pg_proc where pronamespace=\'public\'::regnamespace and proname=$1', [name])
const monthlyExamples = async () => {
  let result
  await transaction(async () => {
    await db.exec(`
      insert into team_members(id,name,role,fee_billing_mode,training_program,is_half_price) values
        ('${id(21)}','中港一般','校隊','role_default','chunggang_school_team',false),
        ('${id(22)}','中港半價','校隊','role_default','chunggang_school_team',true),
        ('${id(23)}','國中一般','校隊','role_default','junior_high_school_team',false),
        ('${id(24)}','國中半價','校隊','role_default','junior_high_school_team',true),
        ('${id(25)}','社區固定','球員','monthly_fixed',null,false),
        ('${id(26)}','社區計次','球員','monthly_per_session',null,false);
      update profiles set linked_team_member_ids=array['${id(21)}','${id(22)}','${id(23)}','${id(24)}','${id(25)}','${id(26)}']::uuid[] where id='${id(1)}';
      insert into fee_settings values ('${id(26)}',400,null);
    `)
    result = await query("select tm.name,e.amount from team_members tm cross join lateral get_my_payment_submission_estimate(tm.id,'2026-08') e where tm.id=any($1) order by tm.id", [[21,22,23,24,25,26].map(id)])
  })
  return result
}

try {
  await setup(db, definitions)
  await db.exec(`
    insert into quarterly_fees(id,member_id,member_ids,year_quarter,amount,payment_items,updated_at) values
      ('${id(101)}','${id(11)}',array['${id(11)}','${id(12)}']::uuid[],'2026-Q4',6700,'["學費","入隊費"]','2026-09-26 10:00Z'),
      ('${id(102)}','${id(12)}',array['${id(11)}','${id(12)}']::uuid[],'2026-Q4',3700,'["學費","入隊費"]','2026-09-26 09:00Z');
  `)
  // Red: demonstrate both observed faults using the original RPCs.
  check((await records(12)).map(r => r.amount), [3700, 6700], 'old records leak both sibling amounts')
  check(await estimate(12), [{ amount: 6700 }], 'old estimate selects newer full-price sibling')
  await transaction(async () => {
    const submission = await single(12, 6700)
    await approve(submission)
    check(await scalar('select member_id from quarterly_fees where id=$1', [id(101)]), id(12), 'old approval steals sibling record')
  })
  console.log('Reproduced: duplicate records, wrong half-price estimate, and approval selecting the other sibling.')
  const monthlyBefore = await monthlyExamples()
  check(monthlyBefore.map(r => r.amount), [2500,1250,2000,1000,2000,2000], 'baseline monthly examples')

  // Migration changes function definitions only, including when applied twice.
  const beforeFees = await feeSnapshot()
  const beforeAcl = await query("select proname,proacl::text from pg_proc where pronamespace='public'::regnamespace order by oid")
  await db.exec(migration)
  await db.exec(migration)
  check(await monthlyExamples(), monthlyBefore, 'monthly estimates unchanged by quarterly fix')
  check(await feeSnapshot(), beforeFees, 'migration preserves every fee row')
  check(await query("select proname,proacl::text from pg_proc where pronamespace='public'::regnamespace order by oid"), beforeAcl, 'public RPC ACLs unchanged')
  check(await scalar("select has_function_privilege('authenticated','private.quarterly_fee_matches_member(uuid,uuid[],text,uuid)','execute')"), false, 'internal helper cannot be called by clients')
  await login(1)
  await db.exec('set role authenticated')
  check(await records(11), [{ amount: 6700, status: 'unpaid' }], 'full-price record')
  check(await records(12), [{ amount: 3700, status: 'unpaid' }], 'half-price record keeps entry fee')
  check(await estimate(11), [{ amount: 6700 }], 'full-price estimate')
  check(await estimate(12), [{ amount: 3700 }], 'half-price estimate')
  await db.exec('reset role')

  // Exact ownership wins regardless of sibling recency and paid/pending state.
  for (const status of ['paid', 'approved', 'pending_review', 'unpaid']) {
    await transaction(async () => {
      await query("update quarterly_fees set status=$1,updated_at='2099-01-01' where member_id=$2", [status, id(11)])
      check(await records(12), [{ amount: 3700, status: 'unpaid' }], `sibling ${status} is not mine`)
      check(await estimate(12), [{ amount: 3700 }], `sibling ${status} cannot alter estimate`)
    })
  }
  await transaction(async () => {
    await query('update quarterly_fees set member_ids=null where member_id=$1', [id(12)])
    check(await estimate(12), [{ amount: 3700 }], 'owner does not need family array')
  })
  // Preserve old family-only history, including owner-null imports.
  for (const status of ['paid', 'pending_review']) {
    await transaction(async () => {
      await query('delete from quarterly_fees where member_id=$1', [id(12)])
      await query('update quarterly_fees set member_id=null,amount=9000,status=$1', [status])
      const before = await feeSnapshot()
      check(await records(12), [{ amount: 9000, status }], 'legacy family history remains visible')
      await db.exec(migrationBody)
      check(await feeSnapshot(), before, 'legacy history unchanged')
    })
  }

  // New submissions must store authoritative amounts, ignoring client principal.
  await transaction(async () => {
    const siblingBefore = (await feeSnapshot())[0]
    const submission = await single(12, 3700)
    check(submission.expected_amount, 3700, 'single expected amount from DB')
    await approve(submission)
    check((await feeSnapshot())[0], siblingBefore, 'single approval preserves other sibling byte-for-byte')
    check((await feeSnapshot())[1].status, 'paid', 'single approval pays own record')
  })
  await login(1)
  await transaction(async () => {
    await db.exec(`insert into player_balance_transactions(member_id,delta) values ('${id(11)}',200),('${id(12)}',300)`)
    const submission = (await query("select * from create_my_quarterly_payment_submission($1,'銀行轉帳','12345','2026-09-26',null,null)", [
      JSON.stringify([{ member_id: id(11), period_key: '2026-Q4', amount: 1, balance_amount: 200, reported_external_amount: 6500 },
        { member_id: id(12), period_key: '2026-Q4', amount: 99999, balance_amount: 300, reported_external_amount: 3400 }])
    ]))[0]
    check(submission.expected_amount, 10400, 'combined principal is 6700 + 3700')
    check(submission.expected_external_amount, 9900, 'balance changes cash only')
    check(submission.items.map(i => i.expected_amount).sort((a,b) => a-b), [3700,6700], 'per-member snapshots')
    await approve(submission)
    check((await feeSnapshot()).map(r => [r.id,r.member_id,r.amount,r.status]), [[id(101),id(11),6700,'paid'],[id(102),id(12),3700,'paid']], 'multi approval keeps both record identities')
    check(await scalar('select get_player_balance_unchecked($1)', [id(12)]), 0, 'balance cannot go negative')
  })
  await login(1)
  await fails(() => single(12, 3300, 400), /balance is not enough/)
  await fails(() => single(12, 3000), /amount_mismatch_reason/)

  // Approval of a member without an individual row inserts one, preserving the
  // legacy row and its ownership instead of reassigning it.
  await transaction(async () => {
    await query('delete from quarterly_fees where member_id=$1', [id(12)])
    const legacyBefore = (await feeSnapshot())[0]
    const submission = await single(12, 6700)
    await approve(submission)
    check((await feeSnapshot()).find(r => r.id===id(101)), legacyBefore, 'approval never steals legacy owner')
    check(await scalar('select count(*)::integer from quarterly_fees where member_id=$1', [id(12)]), 1, 'new individual row')
  })
  await login(1)

  // Read the actual patched SQL fragments used by adjacent summaries. This
  // executes their quarterly projections without unrelated home/news/equipment.
  const home = await functionBody('get_my_home_snapshot')
  const homeSql = home.slice(home.indexOf('with official_due as ('), home.indexOf('from official_due;') + 'from official_due;'.length)
    .replace('into v_payment_summary', '').replaceAll('v_linked_ids', '$1::uuid[]').replaceAll('v_today', '$2::date')
  const homeArgs = ids => homeSql.includes('$2') ? [ids, '2026-09-26'] : [ids]
  const ownHome = await scalar(homeSql, homeArgs([id(12)]))
  check(ownHome.total_unpaid_amount, 3700, 'home for only discounted linked member')
  check(ownHome.unpaid_count, 1, 'home has one payable record')
  const familyHome = await scalar(homeSql, homeArgs([id(11),id(12)]))
  check(familyHome.total_unpaid_amount, 10400, 'family home total')
  const reminders = await functionBody('get_fee_management_reminders')
  const marker = reminders.indexOf("'quarterly-unpaid'")
  const reminderSql = reminders.slice(reminders.indexOf('select\n          count(*)', marker), reminders.indexOf(') quarterly_unpaid', marker)).replaceAll('v_quarterly_period', '$1')
  check((await query(reminderSql, ['2026-Q4']))[0].total_amount, 10400, 'management reminder total')
  const compensation = await functionBody('upsert_quarterly_fee_compensation_drafts')
  const priceSql = compensation.slice(compensation.indexOf('with quarterly_members as ('), compensation.indexOf('\n    select\n      v_period_key')).replaceAll('v_period_key', '$1') + ' select member_id,expected_amount from member_prices order by member_id'
  check(await query(priceSql, ['2026-Q4']), [{member_id:id(11),expected_amount:6700},{member_id:id(12),expected_amount:3700}], 'compensation uses correct own price')

  await login(2)
  check(await estimate(12), [{ amount: 3700 }], 'parent linked only to discounted sibling')
  check(await estimate(11), [], 'unlinked estimate is hidden')
  await fails(() => records(11), /not viewable/)
  await login(null)
  await fails(() => records(12), /auth.uid/)
  check(await estimate(12), [], 'anonymous cannot estimate')
  await login(1)
  check(await estimate(12, '2099-Q1'), [], 'future quarter stays closed')
  await transaction(async () => {
    await query("update team_members set fee_billing_mode='no_fee' where id=$1", [id(12)])
    check(await estimate(12), [{ amount: 3700 }], 'no-fee member keeps own existing debt')
    check(await estimate(12, '2026-Q3'), [], 'no new no-fee debt')
  })

  // Historical submissions are snapshots: deploying the fix does not rewrite
  // pending/approved/rejected expected or actual amounts, or balance ledgers.
  await transaction(async () => {
    for (const status of ['pending_review','approved','rejected']) {
      await query("insert into profile_payment_submissions(profile_id,member_id,billing_mode,period_key,amount,expected_amount,reported_external_amount,status) values ($1,$2,'quarterly','2026-Q4',6000,6000,6000,$3)", [id(1),id(12),status])
    }
    const before = await query('select * from profile_payment_submissions order by id')
    await db.exec(migrationBody)
    check(await query('select * from profile_payment_submissions order by id'), before, 'all submission history preserved')
    check(await query('select * from player_balance_transactions'), [], 'migration creates no balance transactions')
  })
  await transaction(async () => {
    await db.exec(definitions.review_profile_payment_submission.replace(/create function/i, 'create or replace function')
      .replace('qf.member_id = v_item.member_id or', 'qf.member_id = v_item.member_id  or'))
    await fails(() => db.exec(migrationBody), /Quarterly ownership patch mismatch/)
  })
  console.log(`PASS: ${checks} quarterly ownership SQL checks (${process.argv[2] ? 'captured live definitions' : 'repository definitions'})`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await db.close()
}
