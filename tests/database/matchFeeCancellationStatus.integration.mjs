// Isolated verification of the finance-list projection. No network or real users.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { id, read } from './quarterlyPaymentOwnership.fixture.mjs'
import { setupMatchCancellation } from './matchCancellation.fixture.mjs'

const signature = 'public.list_match_fee_items_by_month_with_match_status(text)'
const rawMigration = readFileSync(new URL('../../supabase/migrations/20261012053334_match_fee_cancellation_status.sql', import.meta.url), 'utf8')
const variants = process.argv.includes('--newline-matrix')
  ? [['LF', rawMigration.replace(/\r\n/g, '\n')], ['CRLF', rawMigration.replace(/\r?\n/g, '\r\n')]]
  : [['original', rawMigration]]
let checks = 0
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
const fails = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++ }

for (const [variant, migration] of variants) {
  const db = new PGlite()
  const query = async (sql, args = []) => (await db.query(sql, args)).rows
  const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0]
  const login = n => query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : ''])
  const version = n => scalar('select updated_at::text from matches where id=$1', [id(n)])
  const fee = async (member, match) => (await query('select *,updated_at::text version from match_fee_items where member_id=$1 and match_id=$2', [id(member), id(match)]))[0]
  const list = month => query('select * from list_match_fee_items_by_month_with_match_status($1)', [month])
  const financialRows = () => query('select id,match_id,member_id,amount,payment_status,payment_submission_id,is_exempt,paid_at from match_fee_items order by id')
  try {
    await setupMatchCancellation(db)
    await db.exec(read('supabase/migrations/20261012024808_match_cancellation.sql'))
    await db.exec(read('supabase/migrations/20261012033832_match_restoration_audit.sql'))
    await db.exec(`insert into profiles(id,role,is_active) values ('${id(8)}','FEES_VIEW_ONLY',true);
      create or replace function public.has_app_permission(text,text) returns boolean language sql stable as $$
        select coalesce(public.current_profile_role() in ('ADMIN','MANAGER')
          or (public.current_profile_role()='FEES_VIEW_ONLY' and $1='fees' and $2='VIEW'), false)
      $$;`)
    await login(5)
    await query('select * from set_match_fee_payment_open_state($1,true)', [id(41)])
    await query('select * from set_match_fee_payment_open_state($1,true)', [id(42)])
    await login(1)
    await query("select * from create_match_payment_submission($1,'現金')", [[(await fee(11, 41)).id]])
    await query("select * from create_match_payment_submission($1,'現金')", [[(await fee(11, 42)).id]])
    await query("update match_fee_items set payment_status='paid' where match_id=$1", [id(42)])
    await login(5)
    await query('select * from cancel_match($1,$2,$3)', [id(41), '球場積水', await version(41)])
    await query('select * from cancel_match($1,$2,$3)', [id(42), '颱風停賽', await version(42)])
    await query("insert into matches(id,players,match_name,match_date,match_time,match_fee_amount) values($1,'兄','單場免繳測試','2026-09-29','09:00 - 12:00',600)", [id(43)])
    const exempt = await fee(11, 43)
    await query('select set_match_fee_item_exemption($1,true,$2)', [exempt.id, exempt.version])
    await query(`insert into match_fee_items(id,match_id,member_id,member_name_snapshot,match_name_snapshot,
      match_date_snapshot,fee_month,amount,payment_status,cancelled_at,cancelled_reason)
      values($1,null,$2,'兄','已移除的歷史場次','2026-09-30','2026-09',200,'cancelled',now(),'比賽已取消：歷史原因')`, [id(540), id(11)])
    const originalSignature = 'public.list_match_fee_items_by_month(text)'
    const originalFunction = await query('select pg_get_functiondef($1::regprocedure) definition,proowner,proacl::text,prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid=$1::regprocedure', [originalSignature])
    const financeBefore = await financialRows()
    const paymentsBefore = await query('select * from match_payment_submissions order by id')
    const balancesBefore = await query('select * from player_balance_transactions order by id')
    const noticesBefore = await query('select * from push_dispatch_events order by id')
    await fails(() => list('2026-09'), /does not exist/)
    await db.exec(migration)
    await db.exec(migration)
    check(await query('select pg_get_functiondef($1::regprocedure) definition,proowner,proacl::text,prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid=$1::regprocedure', [originalSignature]), originalFunction, 'original RPC definition, result and security unchanged')
    check(await financialRows(), financeBefore, 'migration performs no financial writes')
    for (const role of ['authenticated', 'service_role']) {
      check(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')', [role, signature]), true, `${role} follows original grant`)
    }
    check(await scalar("select has_function_privilege('anon',$1,'EXECUTE')", [signature]), false, 'anonymous grant denied')
    check(await query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [signature]), [{ prosecdef: true, proconfig: ['search_path=""'] }], 'fixed empty search_path')
    await login(null)
    await fails(() => list('2026-09'), /有效帳號/)
    await login(1)
    await fails(() => list('2026-09'), /fees VIEW/)
    await login(6)
    for (const patch of ['is_active=false', "is_active=true,access_start=now()+interval '1 day'", "access_start=null,access_end=now()-interval '1 day'"]) {
      await query(`update profiles set ${patch} where id=$1`, [id(6)])
      await fails(() => list('2026-09'), /有效帳號/)
    }
    await login(8)
    check(await scalar("select public.has_app_permission('matches','VIEW')"), false, 'fee-only viewer has no match permission')
    await db.exec('set role authenticated')
    // Same transaction time permits exact old-column comparison even though the
    // pre-existing list refreshes unpaid snapshots with now().
    await db.exec('begin')
    const original = await query('select * from list_match_fee_items_by_month($1)', ['2026-09'])
    const rows = await list('2026-09')
    check(rows.map(({ match_cancelled_at, match_cancellation_reason, ...rest }) => rest), original, 'wrapper preserves every original field and row order')
    await db.exec('commit; reset role')
    const cancelled = rows.filter(row => row.match_id === id(41))
    check(cancelled.map(row => row.payment_status).sort(), ['cancelled', 'pending_review'], 'cancelled match retains unpaid-cancelled and pending rows')
    check(cancelled.every(row => row.match_cancelled_at !== null && row.match_cancellation_reason === '球場積水'), true, 'authoritative cancellation included on every cancelled match row')
    const paid = rows.find(row => row.match_id === id(42))
    check([paid.payment_status, paid.match_cancellation_reason, paid.amount], ['paid', '颱風停賽', 300], 'paid fee also exposes match cancellation without changing amount')
    check(paid.match_cancelled_at !== null, true, 'paid match cancellation timestamp included')
    const exemption = rows.find(row => row.match_id === id(43))
    check([exemption.payment_status, exemption.is_exempt, exemption.match_cancelled_at, exemption.match_cancellation_reason], ['cancelled', true, null, null], 'single-match exemption does not imply cancelled match')
    const detached = rows.find(row => row.id === id(540))
    check([detached.match_id, detached.cancelled_reason, detached.match_cancelled_at, detached.match_cancellation_reason], [null, '比賽已取消：歷史原因', null, null], 'detached historical fee never implies current match cancellation')
    check(await financialRows(), financeBefore, 'listing preserves amounts, statuses, exemptions and payment links')
    check(await query('select * from match_payment_submissions order by id'), paymentsBefore, 'listing preserves payment submissions')
    check(await query('select * from player_balance_transactions order by id'), balancesBefore, 'listing has no balance effect')
    check(await query('select * from push_dispatch_events order by id'), noticesBefore, 'listing adds no notifications')
    check(await list('2027-01'), [], 'empty month stays empty')
    await login(5)
    await query('select * from restore_match($1,$2)', [id(41), await version(41)])
    const restoredRows = (await list('2026-09')).filter(row => row.match_id === id(41))
    check(restoredRows.every(row => row.match_cancelled_at === null && row.match_cancellation_reason === null), true, 'restoration clears authoritative list status')
    check(restoredRows.map(row => row.payment_status).sort(), ['pending_review', 'unpaid'], 'restored fee states still come from unchanged billing rules')
    check(restoredRows.every(row => row.payment_opened_at === null), true, 'wrapper does not reopen restored payment entry')
    console.log(`PASS: match fee cancellation status ${variant}`)
  } catch (error) {
    console.error(`${variant}: ${error.message}`)
    console.error(error.query || error.internalQuery || error.where || '')
    process.exitCode = 1
    break
  } finally { await db.close() }
}
if (!process.exitCode) console.log(`PASS: ${checks} match fee cancellation status SQL checks.`)
