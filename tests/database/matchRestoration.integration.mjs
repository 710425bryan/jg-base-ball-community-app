// Isolated PostgreSQL verification using the real cancellation, fee and coach helpers.
// No network, production writes or real users.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { id, read } from './quarterlyPaymentOwnership.fixture.mjs'
import { setupMatchCancellation } from './matchCancellation.fixture.mjs'

const cancellationPath = 'supabase/migrations/20261012024808_match_cancellation.sql'
const restorationPath = 'supabase/migrations/20261012033832_match_restoration_audit.sql'
const rawMigration = readFileSync(new URL(`../../${restorationPath}`, import.meta.url), 'utf8')
const variants = process.argv.includes('--newline-matrix')
  ? [['LF', rawMigration.replace(/\r\n/g, '\n')], ['CRLF', rawMigration.replace(/\r?\n/g, '\r\n')]]
  : [['original', rawMigration]]
let checks = 0
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
const fails = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++ }

const privateFunction = (path, name) => {
  const sql = read(path)
  const start = sql.indexOf(`create or replace function private.${name}(`)
  assert.ok(start >= 0, `actual private helper ${name} exists`)
  const tail = sql.slice(start)
  return tail.slice(0, tail.indexOf('$$;', tail.indexOf('as $$') + 5) + 3)
}

for (const [variant, migration] of variants) {
  const db = new PGlite()
  const query = async (sql, args = []) => (await db.query(sql, args)).rows
  const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0]
  const login = n => query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : ''])
  const match = async (n = 41) => (await query('select *,updated_at::text version from matches where id=$1', [id(n)]))[0]
  const cancel = (n, version, reason = '豪雨停賽') =>
    query('select m.*,m.updated_at::text version from cancel_match($1,$2,$3) m', [id(n), reason, version])
  const restore = (n, version) =>
    query('select m.*,m.updated_at::text version from restore_match($1,$2) m', [id(n), version])
  const fee = async (member = 11, n = 41) => (await query('select * from match_fee_items where member_id=$1 and match_id=$2', [id(member), id(n)]))[0]
  const open = n => query('select * from set_match_fee_payment_open_state($1,true)', [id(n)])
  const submit = row => query("select * from create_match_payment_submission($1,'現金')", [[row.id]])
  const audits = n => query('select * from private.match_cancellation_events where match_id=$1 order by result_updated_at,action', [id(n)])
  const metadata = signature => query('select proowner,proacl::text,prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [signature])
  try {
    await setupMatchCancellation(db)
    await db.exec(`
      alter table coach_schedule_events add column schedule_date date default '2026-09-27',
        add column start_time text default '09:00', add column end_time text default '12:00';
      create table coach_leave_requests(id uuid primary key,coach_profile_id uuid,start_date date,end_date date,time_segment text,status text);
      insert into profiles(id,role,is_active) values ('${id(7)}','SCHEDULINGCOACH',true);
      update coach_schedule_assignments set coach_profile_id='${id(7)}';
      insert into coach_schedule_events(id,source_type,source_id,status) values ('${id(63)}','match','${id(41)}','cancelled');
      grant select,update on matches to service_role;
      grant usage on schema private to service_role;
      alter role service_role bypassrls;
    `)
    const coachPath = 'supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql'
    for (const name of ['coach_time_minutes', 'coach_intervals_overlap', 'coach_leave_overlaps', 'coach_has_leave', 'coach_has_booking']) {
      await db.exec(privateFunction(coachPath, name))
    }
    await db.exec(privateFunction('supabase/migrations/20261002180340_coach_schedule_scheduling_coach_eligibility.sql', 'coach_profile_is_schedulable'))
    await db.exec(privateFunction('supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql', 'lock_coach_training_slots'))
    await db.exec(`create trigger coach_training_slots_lock before insert or update or delete on matches
      for each statement execute function private.lock_coach_training_slots();`)
    await db.exec(read(cancellationPath))
    await login(3)
    await open(41)
    await open(42)
    await login(1)
    await submit(await fee(11, 41))
    await submit(await fee(11, 42))
    await query("update match_fee_items set payment_status='paid' where match_id=$1", [id(42)])
    const pending = await fee(11, 41)
    const paid = await fee(11, 42)
    const payments = await query('select * from match_payment_submissions order by id')
    const links = await query('select * from match_payment_submission_items order by submission_id,match_fee_item_id')
    const balances = await query('select * from player_balance_transactions')
    const notices = await query('select * from push_dispatch_events order by id')
    const assignments = await query('select * from coach_schedule_assignments')
    const teamFees = await query('select * from quarterly_fees order by id')
    await login(5)
    await cancel(42, (await match(42)).version, '舊版取消')
    const oldCancelled = await match(42)
    await fails(() => restore(42, oldCancelled.version), /does not exist/)
    const before = await match(41)
    const cancelMetadata = await metadata('public.cancel_match(uuid,text,timestamptz)')
    const billingDefinition = await scalar("select pg_get_functiondef('public.sync_match_fee_items_for_match(uuid)'::regprocedure)")
    await db.exec(migration)
    await db.exec(migration)
    check(await metadata('public.cancel_match(uuid,text,timestamptz)'), cancelMetadata, 'cancel owner/ACL/security/search_path preserved')
    check(await scalar("select pg_get_functiondef('public.sync_match_fee_items_for_match(uuid)'::regprocedure)"), billingDefinition, 'restore reuses unchanged installed billing rules')
    check((await audits(42)).length, 1, 'old cancellation backfilled exactly once')
    check((await audits(42))[0].previous_updated_at, null, 'backfill does not invent a request version')
    check(await match(42), oldCancelled, 'backfill leaves cancelled match untouched')
    for (const signature of ['public.cancel_match(uuid,text,timestamptz)', 'public.restore_match(uuid,timestamptz)']) {
      const definition = await scalar('select pg_get_functiondef($1::regprocedure)', [signature])
      check(definition.indexOf('pg_advisory_xact_lock(20360924, 1)') < definition.toLowerCase().indexOf('for update'), true, `${signature} advisory before row`)
      check(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')", [signature]), true, `${signature} authenticated granted`)
      for (const role of ['anon', 'service_role']) check(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')', [role, signature]), false, `${role} RPC denied`)
    }
    check(await scalar("select relrowsecurity from pg_class where oid='private.match_cancellation_events'::regclass"), true, 'private history has RLS')
    for (const role of ['anon', 'authenticated', 'service_role']) {
      check(await scalar("select has_table_privilege($1,'private.match_cancellation_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')", [role]), false, `${role} has no audit read/write grant`)
    }
    await login(1)
    await fails(() => restore(42, oldCancelled.version), /編輯權限/)
    await login(null)
    await fails(() => restore(42, oldCancelled.version), /有效帳號/)
    await login(6)
    for (const patch of ['is_active=false', "is_active=true,access_start=now()+interval '1 day'", "access_start=null,access_end=now()-interval '1 day'"]) {
      await query(`update profiles set ${patch} where id=$1`, [id(6)])
      await fails(() => restore(42, oldCancelled.version), /有效帳號/)
    }
    await login(5)
    await fails(() => restore(42, null), /缺少比賽版本/)
    await fails(() => cancel(41, null), /缺少比賽版本/)
    await fails(() => restore(42, before.version), /已更新/)
    await fails(() => restore(999, before.version), /找不到/)
    await fails(() => restore(41, before.version), /目前未取消/)
    await query("insert into matches(id,match_name,match_level,match_date) values($1,'特訓','特訓課','2026-09-29')", [id(49)])
    await fails(async () => restore(49, (await match(49)).version), /特訓課/)
    for (const role of ['authenticated', 'service_role']) {
      await db.exec(`set role ${role}`)
      await fails(() => query('update matches set cancelled_at=null,cancellation_reason=null,cancelled_by=null where id=$1', [id(42)]), /取消或恢復比賽功能/)
      await fails(() => query("update matches set cancellation_reason='偽造' where id=$1", [id(42)]), /不可直接變更/)
      await fails(() => query('select * from private.match_cancellation_events'), /permission denied/)
      await fails(() => query('delete from private.match_cancellation_events'), /permission denied/)
      await fails(() => query("insert into private.match_cancellation_events(match_id,action,actor_id,result_updated_at,cancelled_at,cancellation_reason,cancelled_by) values($1,'restored',$2,now(),now(),'偽造',$2)", [id(42), id(5)]), /permission denied/)
      await db.exec('reset role')
    }
    await fails(() => query('delete from private.match_cancellation_events'), /歷程不可变更|歷程不可變更/)
    await fails(() => query("update private.match_cancellation_events set cancellation_reason='變更'"), /歷程不可變更/)
    await db.exec('set role authenticated')
    await restore(42, oldCancelled.version)
    await db.exec('reset role')
    check(await fee(11, 42), paid, 'legacy restoration preserves paid snapshot exactly')
    check((await match(42)).match_fee_payment_opened_at, null, 'restored paid match remains closed')
    check((await audits(42)).map(row => [row.action, row.cancellation_reason]), [['cancelled', '舊版取消'], ['restored', '舊版取消']], 'legacy restore keeps prior cancellation audit')

    await db.exec('set role authenticated')
    const [cancelled] = await cancel(41, before.version, '  豪雨停賽  ')
    await db.exec('reset role')
    const cancelledSnapshot = await match(41)
    await cancel(41, before.version, '重送不同文字')
    check(await match(41), cancelledSnapshot, 'same cancellation retry preserves reason and version')
    check((await audits(41)).length, 1, 'cancel retry does not duplicate audit')
    check((await fee(12, 41)).payment_status, 'cancelled', 'unpaid disabled during cancellation')
    const [restored] = await restore(41, cancelled.version)
    check([restored.cancelled_at, restored.cancellation_reason, restored.cancelled_by], [null, null, null], 'restore clears only current cancellation fields')
    for (const key of ['id', 'players', 'photo_url', 'batting_stats', 'match_name', 'match_date', 'match_time']) {
      check(restored[key], before[key], `${key} survives cancel and restore`)
    }
    check(await scalar('select $1::timestamptz>$2::timestamptz', [restored.version, cancelled.version]), true, 'restore version strictly advances')
    check((await fee(12, 41)).payment_status, 'unpaid', 'eligible unpaid charge restored by normal billing rules')
    check(await fee(11, 41), pending, 'pending amount, status, links and timestamps preserved')
    check([restored.match_fee_payment_opened_at, restored.match_fee_payment_opened_by, restored.match_fee_payment_signature], [null, null, null], 'payment remains closed after restore')
    await login(1)
    await fails(async () => submit(await fee(12, 41)), /not open|尚未開放|開放/)
    await login(5)
    check(await scalar('select status from coach_schedule_events where id=$1', [id(61)]), 'scheduled', 'unmodified safe coach event restored')
    check(await scalar('select status from coach_schedule_events where id=$1', [id(63)]), 'cancelled', 'previously independent cancellation not reopened')
    check(await query('select * from coach_schedule_assignments'), assignments, 'all assignment records preserved')
    check((await audits(41)).map(row => [row.action, row.cancellation_reason, row.actor_id]), [['cancelled', '豪雨停賽', id(5)], ['restored', '豪雨停賽', id(5)]], 'both transitions audited with original reason and actor')
    await restore(41, cancelled.version)
    check(await match(41), restored, 'exact restore retry returns unchanged result')
    check((await audits(41)).length, 2, 'restore retry does not duplicate audit')
    await fails(() => cancel(41, before.version), /已更新/)
    await fails(() => cancel(41, null), /缺少比賽版本/)
    check((await match(41)).cancelled_at, null, 'late old cancel cannot undo restore')
    await login(1)
    check(await scalar("select get_my_home_next_event($1,'2026-09-27')->>'id'", [id(11)]), id(41), 'restored match returns to Next Up')
    check((await scalar("select get_public_landing_snapshot('2026-09-27')->'upcomingMatches'")).some(row => row.id === id(41)), true, 'restored public schedule visible')
    check((await query('select * from get_my_player_match_records($1)', [id(11)])).some(row => row.id === id(41)), true, 'restored personal record visible')
    check((await scalar("select private.list_coach_schedule_admin_month_base('2026-09-01')")).some(row => row.source_id === id(41)), true, 'restored match is a coach candidate')
    await login(5)
    await query("update matches set location='同步更新',updated_at=updated_at+interval '1 second' where id=$1 and cancelled_at is null", [id(41)])
    check((await match(41)).location, '同步更新', 'calendar active predicate accepts restored row')
    await fails(() => restore(41, cancelled.version), /已更新/)
    const nextActive = await match(41)
    const [cancelledAgain] = await cancel(41, nextActive.version, '第二次取消')
    await fails(() => cancel(41, before.version), /已更新/)
    await fails(() => restore(41, cancelled.version), /已更新/)
    check((await match(41)).cancellation_reason, '第二次取消', 'old-cycle retries cannot touch a newer cancellation')
    await restore(41, cancelledAgain.version)
    check((await audits(41)).map(row => row.action), ['cancelled', 'restored', 'cancelled', 'restored'], 'multiple cycles retain full history')

    // Exemptions, changed eligibility and previous payment snapshots use the
    // installed billing helper, not a bespoke restoration amount calculation.
    await query("insert into matches(id,players,match_name,match_date,match_time,match_fee_amount) values($1,'兄,弟','免繳測試','2026-10-30','09:00 - 12:00',700)", [id(43)])
    const exempt = await fee(11, 43)
    await query('select set_match_fee_item_exemption($1,true,$2)', [exempt.id, await scalar('select updated_at::text from match_fee_items where id=$1', [exempt.id])])
    const exemptionBefore = await fee(11, 43)
    const [cancelledExempt] = await cancel(43, (await match(43)).version)
    await query("insert into leave_requests values($1,'2026-10-30','2026-10-30','full_day')", [id(12)])
    await restore(43, cancelledExempt.version)
    const exemptionAfter = await fee(11, 43)
    check([exemptionAfter.is_exempt, exemptionAfter.amount, exemptionAfter.payment_status], [true, exemptionBefore.amount, 'cancelled'], 'single-match exemption survives restoration')
    check((await fee(12, 43)).payment_status, 'cancelled', 'new leave prevents unpaid restoration')
    await query("insert into matches(id,players,match_name,match_date,match_time,match_fee_amount) values($1,'兄','歷史金額','2026-10-31','09:00 - 12:00',700)", [id(44)])
    await open(44)
    await login(1)
    await submit(await fee(11, 44))
    const historicalFee = await fee(11, 44)
    await query("update match_payment_submissions set status='rejected' where id=$1", [historicalFee.payment_submission_id])
    await query("update match_fee_items set payment_status='unpaid',payment_submission_id=null where id=$1", [historicalFee.id])
    await login(5)
    const [cancelledHistory] = await cancel(44, (await match(44)).version)
    await query('update matches set match_fee_amount=900 where id=$1', [id(44)])
    await restore(44, cancelledHistory.version)
    check([(await fee(11, 44)).amount, (await fee(11, 44)).payment_status], [700, 'unpaid'], 'rejected historical amount snapshot is not recalculated')
    await query("insert into matches(id,players,match_name,match_date,match_time,match_fee_amount) values($1,'','名單變更','2026-10-31','09:00 - 12:00',600)", [id(45)])
    const [cancelledRoster] = await cancel(45, (await match(45)).version)
    await query('update matches set players=$1,absent_players=$2 where id=$3', ['兄,弟', JSON.stringify([{ name: '弟' }]), id(45)])
    check(await fee(11, 45), undefined, 'cancelled match still does not create newly eligible charges')
    await restore(45, cancelledRoster.version)
    check([(await fee(11, 45)).amount, (await fee(11, 45)).payment_status], [600, 'unpaid'], 'restore creates newly eligible unpaid charge under normal rules')
    check(await fee(12, 45), undefined, 'restore respects absence when generating new charge')

    // Safety of reactivating saved coach assignments, using the real helpers.
    for (const [index, kind] of ['leave', 'booking', 'inactive', 'edited'].entries()) {
      const n = 100 + index
      const event = 200 + index
      await query("insert into matches(id,match_name,match_date,match_level) values($1,$2,'2026-11-01','友誼賽')", [id(n), kind])
      await query("insert into coach_schedule_events(id,source_type,source_id,status,schedule_date) values($1,'match',$2,'scheduled','2026-11-01')", [id(event), id(n)])
      await query('insert into coach_schedule_assignments values($1,$2,$3)', [id(300 + index), id(event), id(7)])
      const [closed] = await cancel(n, (await match(n)).version)
      if (kind === 'leave') await query("insert into coach_leave_requests values($1,$2,'2026-11-01','2026-11-01','morning','active')", [id(400), id(7)])
      if (kind === 'booking') {
        await query("insert into coach_schedule_events(id,source_type,status,schedule_date) values($1,'manual','scheduled','2026-11-01')", [id(401)])
        await query('insert into coach_schedule_assignments values($1,$2,$3)', [id(402), id(401), id(7)])
      }
      if (kind === 'inactive') await query('update profiles set is_active=false where id=$1', [id(7)])
      if (kind === 'edited') await query("update coach_schedule_events set updated_at=updated_at+interval '1 second' where id=$1", [id(event)])
      const eventBefore = await query('select * from coach_schedule_events where id=$1', [id(event)])
      const assignmentBefore = await query('select * from coach_schedule_assignments where event_id=$1', [id(event)])
      await restore(n, closed.version)
      check((await match(n)).cancelled_at, null, `${kind} does not prevent restoring the match`)
      check(await query('select * from coach_schedule_events where id=$1', [id(event)]), eventBefore, `${kind} coach schedule is conservatively preserved`)
      check(await query('select * from coach_schedule_assignments where event_id=$1', [id(event)]), assignmentBefore, `${kind} assignment audit not deleted`)
      await query('delete from coach_leave_requests')
      await query('delete from coach_schedule_assignments where event_id=$1', [id(401)])
      await query('delete from coach_schedule_events where id=$1', [id(401)])
      await query('update profiles set is_active=true where id=$1', [id(7)])
    }
    // Native timestamp comparison retains microseconds beyond JS Date precision.
    await query("insert into matches(id,match_name,updated_at) values($1,'微秒版本','2035-01-01T00:00:00.123456Z')", [id(47)])
    const [microCancelled] = await cancel(47, (await match(47)).version)
    const [microRestored] = await restore(47, microCancelled.version)
    check(microCancelled.version, '2035-01-01 00:00:00.123457+00', 'cancel advances exact microsecond')
    check(microRestored.version, '2035-01-01 00:00:00.123458+00', 'restore advances exact microsecond')
    await fails(() => cancel(47, '2035-01-01T00:00:00.123456Z'), /已更新/)
    await db.exec(`create function fixture_stale_match_timestamp() returns trigger language plpgsql as $$
      begin new.updated_at:=old.updated_at; return new; end; $$;
      create trigger zz_fixture_stale_match_timestamp before update on matches
        for each row execute function fixture_stale_match_timestamp();`)
    await fails(() => cancel(47, microRestored.version), /必須更新版本/)
    check(await match(47), microRestored, 'unexpected later timestamp trigger cannot commit a repeated version')
    await db.exec('drop trigger zz_fixture_stale_match_timestamp on matches; drop function fixture_stale_match_timestamp()')
    const [rollbackCancelled] = await cancel(41, (await match(41)).version)
    const rollbackMatch = await match(41)
    const rollbackFees = await query('select * from match_fee_items where match_id=$1 order by id', [id(41)])
    const rollbackCoach = await query('select * from coach_schedule_events where source_id=$1 order by id', [id(41)])
    const rollbackHistory = await audits(41)
    await db.exec(`create function fixture_fail_restore_audit() returns trigger language plpgsql as $$
      begin if new.action='restored' then raise exception 'fixture audit failure'; end if; return new; end; $$;
      create trigger fixture_fail_restore_audit before insert on private.match_cancellation_events
        for each row execute function fixture_fail_restore_audit();`)
    await fails(() => restore(41, rollbackCancelled.version), /fixture audit failure/)
    check(await match(41), rollbackMatch, 'audit failure rolls back restoration state')
    check(await query('select * from match_fee_items where match_id=$1 order by id', [id(41)]), rollbackFees, 'audit failure rolls back fee restoration')
    check(await query('select * from coach_schedule_events where source_id=$1 order by id', [id(41)]), rollbackCoach, 'audit failure rolls back coach restoration')
    check(await audits(41), rollbackHistory, 'audit failure leaves no partial history')
    await db.exec('drop trigger fixture_fail_restore_audit on private.match_cancellation_events; drop function fixture_fail_restore_audit()')
    await restore(41, rollbackCancelled.version)
    check(await query('select * from match_payment_submissions where id=any($1::uuid[]) order by id', [payments.map(row => row.id)]), payments, 'existing pending/paid submissions unchanged')
    check(await query('select * from match_payment_submission_items where submission_id=any($1::uuid[]) order by submission_id,match_fee_item_id', [payments.map(row => row.id)]), links, 'existing payment links unchanged')
    check(await query('select * from player_balance_transactions'), balances, 'no refund or balance change')
    check(await query('select * from quarterly_fees order by id'), teamFees, 'team fees unchanged')
    check(await query('select * from push_dispatch_events order by id'), notices, 'no automatic notification or history deletion')
    const stableAudit = await query('select * from private.match_cancellation_events order by id')
    const stableFees = await query('select * from match_fee_items order by id')
    await db.exec(migration)
    check(await query('select * from private.match_cancellation_events order by id'), stableAudit, 'migration replay is audit-idempotent')
    check(await query('select * from match_fee_items order by id'), stableFees, 'migration replay preserves finance state')
    console.log(`PASS: match restoration ${variant}`)
  } catch (error) {
    console.error(`${variant}: ${error.message}`)
    console.error(error.query || error.internalQuery || error.where || '')
    console.error(error.stack?.split('\n').filter(line => line.includes('tests/database')).join('\n'))
    process.exitCode = 1
    break
  } finally { await db.close() }
}
if (!process.exitCode) console.log(`PASS: ${checks} match restoration SQL checks.`)
