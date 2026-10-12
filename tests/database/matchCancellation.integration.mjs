// Isolated PostgreSQL verification. No network, production writes or real users.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { id } from './quarterlyPaymentOwnership.fixture.mjs'
import { setupMatchCancellation } from './matchCancellation.fixture.mjs'

const migrationPath = '../../supabase/migrations/20261012024808_match_cancellation.sql'
const rawMigration = readFileSync(new URL(migrationPath, import.meta.url), 'utf8')
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
  const match = async (n = 41) => (await query('select *,updated_at::text version from matches where id=$1', [id(n)]))[0]
  const cancel = async (n = 41, reason = '豪雨停賽', version = null) =>
    query('select * from cancel_match($1,$2,$3)', [id(n), reason, version])
  const fee = async (member = 11, n = 41) => (await query('select * from match_fee_items where member_id=$1 and match_id=$2', [id(member), id(n)]))[0]
  const open = n => query('select * from set_match_fee_payment_open_state($1,true)', [id(n)])
  const submit = row => query("select * from create_match_payment_submission($1,'現金')", [[row.id]])
  try {
    await setupMatchCancellation(db)
    await login(3)
    await fails(() => cancel(), /does not exist/)
    await open(41)
    await open(42)
    await login(1)
    // Two independent payments exercise pending and paid history preservation.
    await submit(await fee(11, 41))
    await submit(await fee(11, 42))
    await query("update match_fee_items set payment_status='paid' where match_id=$1", [id(42)])
    const before = await match()
    const payments = await query('select * from match_payment_submissions order by id')
    const pending = await fee(11, 41)
    const paid = await fee(11, 42)
    const assignments = await query('select * from coach_schedule_assignments')
    const balances = await query('select * from player_balance_transactions')
    const otherMoney = await query('select * from quarterly_fees order by id')
    const patchedSignatures = [
      'public.set_match_fee_payment_open_state(uuid,boolean)',
      'public.sync_match_fee_items_for_match(uuid)',
      'public.set_match_fee_item_exemption(uuid,boolean,timestamptz)',
      'public.create_match_payment_submission(uuid[],text,text,date,text,integer)'
    ]
    const securityMetadata = signature => query('select proowner,proacl::text,prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [signature])
    const metadataBefore = new Map()
    for (const signature of patchedSignatures) {
      metadataBefore.set(signature, await securityMetadata(signature))
      if (variant === 'CRLF') {
        const definition = await scalar('select pg_get_functiondef($1::regprocedure)', [signature])
        await db.exec(definition.replace(/\r?\n/g, '\r\n'))
      }
    }
    await db.exec(migration)
    await db.exec(migration)
    for (const signature of ['public.cancel_match(uuid,text,timestamptz)', ...patchedSignatures]) {
      const definition = await scalar('select pg_get_functiondef($1::regprocedure)', [signature])
      const lock = 'pg_catalog.pg_advisory_xact_lock(20360924, 1)'
      check(definition.includes(lock) && definition.indexOf(lock) < definition.toLowerCase().indexOf('for update'), true, `${signature} takes advisory lock before the match row`)
      check(definition.split(lock).length - 1, 1, `${signature} replay does not duplicate lock patch`)
    }
    for (const signature of patchedSignatures) {
      check(await securityMetadata(signature), metadataBefore.get(signature), `${signature} owner, grants, SECURITY mode and search_path preserved`)
    }
    await login(3)
    check((await open(42))[0].is_payment_open, true, 'active-match opening still works with the corrected lock order')
    await login(1)
    check(await query('select * from match_payment_submissions order by id'), payments, 'migration is non-destructive and replayable')
    check(await scalar("select has_function_privilege('anon','cancel_match(uuid,text,timestamptz)','EXECUTE')"), false, 'anonymous RPC grant denied')
    check(await scalar("select has_function_privilege('authenticated','cancel_match(uuid,text,timestamptz)','EXECUTE')"), true, 'authenticated RPC granted')
    check(await scalar("select has_function_privilege('authenticated','sync_match_fee_items_for_match(uuid)','EXECUTE')"), false, 'billing helper ACL retained')
    await fails(() => cancel(), /編輯權限/)
    await login(null)
    await fails(() => cancel(), /有效帳號/)
    await login(6)
    await query('update profiles set is_active=false where id=$1', [id(6)])
    await fails(() => cancel(), /有效帳號/)
    await query('update profiles set is_active=true,access_start=now()+interval \'1 day\' where id=$1', [id(6)])
    await fails(() => cancel(), /有效帳號/)
    await query('update profiles set access_start=null,access_end=now()-interval \'1 day\' where id=$1', [id(6)])
    await fails(() => cancel(), /有效帳號/)
    await login(5) // Existing permitted manager, not an ADMIN-only operation.
    await fails(() => cancel(41, ''), /1 至 500/)
    await fails(() => cancel(41, ' '.repeat(20)), /1 至 500/)
    await fails(() => cancel(41, '雨'.repeat(501)), /1 至 500/)
    await fails(() => cancel(999), /找不到/)
    await query("insert into matches(id,match_level,match_name,match_date) values($1,'特訓課','特訓','2026-09-29')", [id(49)])
    await fails(() => cancel(49), /特訓課/)
    await fails(() => cancel(41, '雨', '2000-01-01T00:00:00Z'), /已更新/)
    await db.exec('set role authenticated')
    await fails(() => query("update matches set cancelled_at=now(),cancelled_by=$1,cancellation_reason='繞過 RPC' where id=$2", [id(5), id(41)]), /取消比賽功能/)
    await fails(() => query("insert into matches(id,cancelled_at,cancelled_by,cancellation_reason) values($1,now(),$2,'繞過 RPC')", [id(48), id(5)]), /取消比賽功能/)
    const [result] = await cancel(41, '  豪雨停賽  ', before.version)
    await db.exec('reset role')
    check([result.cancelled_by, result.cancellation_reason], [id(5), '豪雨停賽'], 'authorized manager records trimmed reason and actor')
    check([result.id, result.players, result.photo_url, result.batting_stats], [before.id, before.players, before.photo_url, before.batting_stats], 'identity, participants, photos and records retained')
    check(result.cancelled_at !== null, true, 'cancellation timestamp assigned')
    const cancelled = await match()
    await cancel(41, '重送原因', before.version)
    check(await match(), cancelled, 'retry does not write, change reason or reject an old version')
    check(await fee(11, 41), pending, 'pending amount, links and timestamps unchanged')
    check([(await fee(12, 41)).payment_status, (await fee(12, 41)).amount], ['cancelled', 500], 'unpaid item cancelled without amount mutation')
    check((await match()).match_fee_payment_opened_at, null, 'new payments closed even when pending history exists')
    await fails(() => open(41), /已取消比賽/)
    await fails(async () => submit(await fee(12, 41)), /not payable|已取消比賽/)
    await query('select sync_match_fee_items_for_match($1)', [id(41)])
    check((await fee(12, 41)).payment_status, 'cancelled', 'sync cannot revive charges')
    await query("update matches set match_name='日曆更新',players='兄,弟,新球員',match_fee_amount=900 where id=$1", [id(41)])
    check([(await match()).cancellation_reason, (await fee(12, 41)).amount], ['豪雨停賽', 500], 'calendar and amount updates retain cancellation and fee snapshot')
    await query("insert into team_members(id,name) values ($1,'新球員')", [id(13)])
    await query('select sync_match_fee_items_for_match($1)', [id(41)])
    check(await fee(13, 41), undefined, 'newly eligible member is not billed for cancelled match')
    await db.exec('set role authenticated')
    await fails(() => query('update matches set cancelled_at=null,cancellation_reason=null,cancelled_by=null where id=$1', [id(41)]), /不可變更或恢復/)
    await db.exec('reset role')
    check(await scalar('select status from coach_schedule_events where id=$1', [id(61)]), 'cancelled', 'linked coach schedule cancelled')
    check(await query('select * from coach_schedule_assignments'), assignments, 'coach assignments remain auditable')
    await fails(() => query("update coach_schedule_events set status='scheduled' where id=$1", [id(61)]), /不可恢復教練排班/)
    check((await scalar("select private.list_coach_schedule_admin_month_base('2026-09-01')")).some(row => row.source_id === id(41)), false, 'cancelled match is not offered as a new coach candidate')
    await login(1)
    check(await scalar("select get_my_home_next_event($1,'2026-09-27')->>'id'", [id(11)]), id(42), 'Next Up skips cancelled match before limiting')
    check((await scalar("select get_public_landing_snapshot('2026-09-27')->'upcomingMatches'")).some(row => row.id === id(41)), false, 'public landing omits cancelled match')
    check((await query('select * from get_my_player_match_records($1)', [id(11)])).some(row => row.id === id(41)), false, 'personal stats exclude all cancelled match branches')
    check((await query('select * from private.notification_feed_before_coach_leave(10,false)')).map(row => row.id), [id(72)], 'old reminder excluded without deleting history')
    await login(3)
    await cancel(42)
    check(await fee(11, 42), paid, 'paid fee remains unchanged after cancellation')
    check(await query('select * from match_payment_submissions order by id'), payments, 'all payment submissions remain unchanged')
    // Simulate existing review/withdrawal RPC unbinding a pending item.
    await query("update match_fee_items set payment_status='unpaid',payment_submission_id=null where id=$1", [pending.id])
    check((await fee(11, 41)).payment_status, 'cancelled', 'later rejection cannot recreate payable debt')
    await fails(() => query("update match_fee_items set payment_status='pending_review' where id=$1", [pending.id]), /不可新增付款回報/)
    check(await query('select * from player_balance_transactions'), balances, 'no automatic refund or balance change')
    check(await query('select * from quarterly_fees order by id'), otherMoney, 'team fees remain unchanged')
    check(await scalar('select count(*) from push_dispatch_events'), 2, 'historical notification audit retained')
    const stable = await query('select * from match_fee_items order by id')
    await db.exec(migration)
    check(await query('select * from match_fee_items order by id'), stable, 'replay does not mutate cancelled or financial history')
    // Execute each patched entry, including the exemption -> sync -> close
    // branch that previously inverted the advisory/row lock ordering.
    await query("insert into matches(id,players,match_name,match_date,match_fee_amount) values($1,'兄','鎖順序回歸','2026-10-30',800)", [id(43)])
    await open(43)
    const newFee = await fee(11, 43)
    const feeVersion = await scalar('select updated_at::text from match_fee_items where id=$1', [newFee.id])
    await query('select set_match_fee_item_exemption($1,true,$2)', [newFee.id, feeVersion])
    check([(await fee(11, 43)).is_exempt, (await fee(11, 43)).payment_status, (await match(43)).match_fee_payment_opened_at], [true, 'cancelled', null], 'exemption still closes changed receivables with the corrected lock order')
    await query('select set_match_fee_item_exemption($1,false,$2)', [newFee.id, await scalar('select updated_at::text from match_fee_items where id=$1', [newFee.id])])
    check((await fee(11, 43)).payment_status, 'unpaid', 'removing exemption still restores an active match fee')
    await open(43)
    await login(1)
    await submit(await fee(11, 43))
    check((await fee(11, 43)).payment_status, 'pending_review', 'new active payment still succeeds after lock patch')
    // Unknown deployed function shapes must fail atomically instead of
    // silently shipping only some of the lock-order changes.
    for (const signature of patchedSignatures.slice(1)) {
      const definition = await scalar('select pg_get_functiondef($1::regprocedure)', [signature])
      const divergent = definition.replace('-- match-cancellation-billing-lock-order', '-- fixture catalog divergence')
        .replace(/for update/i, 'for no key update')
      await db.exec(divergent)
      await fails(() => db.exec(migration), /Unexpected public\.(sync_match_fee_items_for_match|set_match_fee_item_exemption|create_match_payment_submission).*definition/)
      await db.exec('rollback')
      await db.exec(definition)
    }
    console.log(`PASS: match cancellation ${variant}`)
  } catch (error) {
    console.error(`${variant}: ${error.message}`)
    console.error(error.stack?.split('\n').filter(line => line.includes('tests/database')).join('\n'))
    process.exitCode = 1
    break
  } finally { await db.close() }
}
if (!process.exitCode) console.log(`PASS: ${checks} match cancellation SQL checks.`)
