// Actual payment RPC execution, isolated in PGlite. No production data or writes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { id, read } from './quarterlyPaymentOwnership.fixture.mjs'
import { setupAdminPayments } from './adminPaymentSubmission.fixture.mjs'

const db = new PGlite()
let checks = 0
let inTransaction = false
const query = async (sql, args = []) => {
  try { return (await db.query(sql,args)).rows }
  catch(e) { throw new Error(`${sql}\n${e.message}`) }
}
const scalar = async (sql,args) => Object.values((await query(sql,args))[0])[0]
const check = (actual,expected,message) => { assert.deepEqual(actual,expected,message); checks++ }
const fails = async (fn, pattern = /linked|invalid|valid|失效|無法操作|payable/) => {
  if (inTransaction) await db.exec('savepoint expected_failure')
  try { await assert.rejects(fn,pattern); checks++ }
  finally { if (inTransaction) await db.exec('rollback to expected_failure') }
}
const login = n => query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : ''])
const transaction = async fn => {
  await db.exec('begin')
  inTransaction = true
  try { await fn() } finally { await db.exec('rollback'); inTransaction = false }
}
const create = {
  membership: () => query("select * from create_my_payment_submission($1,'2026-Q4',99999,'現金',null,current_date,null,0,3700,null)",[id(12)]),
  quarterly: () => query("select * from create_my_quarterly_payment_submission($1,'現金')",[JSON.stringify([11,12].map(n=>({member_id:id(n),period_key:'2026-Q4',reported_external_amount:n===11?6700:3700})))]),
  equipment: () => query("select * from create_equipment_payment_submission($1,'現金')",[[id(31)]]),
  match: () => query("select * from create_match_payment_submission($1,'現金')",[[id(51)]])
}
const pending = () => scalar('select list_my_pending_payment_submissions()')
const stamp = (table,key) => scalar(`select updated_at::text from ${table} where id=$1`,[key])
const mutate = (kind,key,version,changes=null,remove=false) => query('select mutate_my_pending_payment_submission($1,$2,$3,$4,$5)',[kind,key,version,changes,remove])

try {
  await setupAdminPayments(db, process.argv[2] ? JSON.parse(readFileSync(process.argv[2],'utf8')) : {})
  await db.exec(read('supabase/migrations/20260926105948_quarterly_payment_member_ownership.sql'))
  await login(3)
  check((await query('select member_id,is_linked from list_my_payment_members()')).map(m=>m.is_linked),[false,false], 'admin can already see members without linking')
  for (const fn of Object.values(create)) await fails(fn)
  const moneyBefore = await query('select * from quarterly_fees order by member_id')
  const aclBefore = await query("select oid,proacl::text from pg_proc where pronamespace='public'::regnamespace order by oid")
  const migration = read('supabase/migrations/20260926111544_admin_payment_submission_members.sql')
  await db.exec(migration)
  await db.exec(migration)
  check(await query('select * from quarterly_fees order by member_id'),moneyBefore,'migration does not change money or history')
  check(await query("select oid,proacl::text from pg_proc where pronamespace='public'::regnamespace order by oid"),aclBefore,'public RPC grants unchanged')
  check(await scalar("select has_function_privilege('authenticated','private.can_submit_payment_for_member(uuid)','execute')"),false,'scope helper not exposed')
  for (const [kind,fn] of Object.entries(create)) {
    await transaction(async () => {
      await login(3)
      await db.exec('set local role authenticated')
      const [submission] = await fn()
      check(submission.profile_id,id(3),`${kind} records the real admin reporter`)
      check(submission.amount,{membership:3700,quarterly:10400,equipment:800,match:500}[kind],`${kind} amount remains authoritative`)
      const mutationKind = kind==='quarterly' ? 'membership' : kind
      const table = `${mutationKind==='membership'?'profile':kind}_payment_submissions`
      const reports = await pending()
      check(reports.length,1,`${kind} admin can manage their unlinked pending report`)
      const report = reports[0]
      await mutate(mutationKind,submission.id,report.updated_at,JSON.stringify({
        payment_method:'現金',remittance_date:'2026-09-26',note:'管理員更正',
        items:report.items.map(i=>({id:i.id,balance_amount:0,reported_external_amount:i.expected_amount}))
      }))
      await db.exec('reset role')
      check(await scalar(`select note from ${table} where id=$1`,[submission.id]),'管理員更正',`${kind} pending edit works`)
      let version = await stamp(table,submission.id)
      await login(6)
      check(await pending(),[],`${kind} another admin cannot self-service the original report`)
      await fails(()=>mutate(mutationKind,submission.id,version,null,true))
      await login(3)
      await fails(()=>mutate(mutationKind,submission.id,'2000-01-01',null,true))
      await db.exec('savepoint before_approval')
      await query(`update ${table} set status='approved',reviewed_at=now() where id=$1`,[submission.id])
      await fails(()=>mutate(mutationKind,submission.id,version,null,true))
      await db.exec('rollback to before_approval')
      // Withdrawal restores only the selected equipment/match payment rows.
      await mutate(mutationKind,submission.id,version,null,true)
      check(await pending(),[],`${kind} pending report can be withdrawn`)
      if (kind==='equipment' || kind==='match') {
        check(await scalar(`select payment_status from ${kind==='equipment'?'equipment_transactions':'match_fee_items'}`),'unpaid',`${kind} restores unpaid`)
      }
      check(await query('select * from quarterly_fees order by member_id'),moneyBefore,`${kind} never rewrites sibling charges`)
    })
  }
  for (const actor of [4,5]) {
    await login(actor)
    for (const fn of Object.values(create)) await fails(fn)
  }
  // Ordinary linked parent retains every existing payment flow.
  for (const fn of Object.values(create)) await transaction(async()=>{await login(1); check((await fn())[0].profile_id,id(1),'linked parent still reports')})
  // Partial family links must reject the whole combined submission.
  await login(2)
  await fails(create.quarterly)
  await transaction(async()=>{check((await create.membership())[0].amount,3700,'linked half-price parent keeps discount')})
  for (const restriction of ["is_active=false","access_start='2999-01-01'","access_end='2000-01-01'"]) {
    await transaction(async()=>{
      await query(`update profiles set ${restriction} where id=$1`,[id(3)])
      await login(3)
      for (const fn of Object.values(create)) {
        // A rejected RPC aborts only its savepoint; inspect all four boundaries.
        await db.exec('savepoint denied')
        await fails(fn)
        await db.exec('rollback to denied')
      }
      await fails(pending,/失效/)
    })
  }
  await login(null)
  for (const fn of Object.values(create)) await fails(fn,/auth.uid/)
  await login(3)
  await fails(()=>query("select * from create_equipment_payment_submission($1,'現金',null,current_date,null,1)",[[id(31)]]),/balance/)
  await transaction(async()=>{
    await db.exec('update matches set match_fee_payment_opened_at=null')
    await fails(create.match,/尚未開放/)
  })
  await transaction(async()=>{
    await db.exec("update equipment_transactions set payment_status='paid'")
    await fails(create.equipment,/payable/)
  })
  await transaction(async()=>{
    await db.exec("update team_members set fee_billing_mode='monthly_fixed' where id='"+id(12)+"'")
    const [monthly] = await query("select * from create_my_payment_submission($1,'2026-08',99999,'現金',null,current_date,null,0,2000,null)",[id(12)])
    check([monthly.profile_id,monthly.billing_mode,monthly.expected_amount],[id(3),'monthly',2000],'admin monthly estimates preserved')
  })
  console.log(`PASS: ${checks} SQL checks for admin submission scope, all four RPCs, self-service ownership and payment guards.`)
} finally { await db.close() }
