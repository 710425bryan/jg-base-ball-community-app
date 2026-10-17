// Isolated equivalence regression for the match fee no-op guard. The fixture
// builds the exact production definitions (md5 verified on 2026-10-17) of
// sync_match_fee_items_for_match and both fee triggers. The same scenario runs
// on a baseline database and on one with the migration; fee results must be
// identical while redundant row rewrites disappear. No network or real users.
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { read, id, extractFunction } from './quarterlyPaymentOwnership.fixture.mjs'
import { setupMatchCancellation } from './matchCancellation.fixture.mjs'

const rawMigration = read('supabase/migrations/20261017150507_match_fee_sync_noop_guard.sql')
const variants = process.argv.includes('--newline-matrix')
  ? [['LF', rawMigration], ['CRLF', rawMigration.replace(/\r?\n/g, '\r\n')]]
  : [['original', rawMigration]]
let checks = 0
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }

async function createDatabase(migration) {
  const db = new PGlite()
  await setupMatchCancellation(db)
  await db.exec(read('supabase/migrations/20261012024808_match_cancellation.sql'))
  await db.exec(read('supabase/migrations/20261012033832_match_restoration_audit.sql'))
  await db.exec(extractFunction('supabase_match_fees_migration.sql', 'sync_match_fee_items_after_leave_change'))
  await db.exec(`
    alter table leave_requests add column if not exists id uuid default gen_random_uuid();
    alter table leave_requests add column if not exists reason text;
    create trigger sync_match_fee_items_after_leave_change after insert or delete or update on leave_requests
      for each row execute function sync_match_fee_items_after_leave_change();
    create table fee_update_log(n bigserial primary key, item_id uuid);
    create function log_fee_update() returns trigger language plpgsql as $$
      begin insert into public.fee_update_log(item_id) values (new.id); return new; end $$;
    create trigger zz_log_fee_update after update on match_fee_items for each row execute function log_fee_update();
  `)
  if (migration) await db.exec(migration)
  return db
}

// Every observable fee field except timestamps' exact values.
const snapshot = async db => (await db.query(`select match_id, member_id, member_name_snapshot, match_name_snapshot,
    tournament_name_snapshot, match_date_snapshot::text, match_time_snapshot, category_group_snapshot, fee_month,
    amount, payment_status, payment_submission_id is not null as has_submission, is_exempt,
    cancelled_at is not null as cancelled, cancelled_reason
  from match_fee_items order by match_id, member_id`)).rows
const openState = async db => (await db.query(`select id, match_fee_payment_opened_at is not null as opened,
  match_fee_payment_signature from matches order by id`)).rows
const updates = async db => Number((await db.query('select count(*) c from fee_update_log')).rows[0].c)

const steps = [
  ['open payments for match 42', db => db.query("select set_config('request.jwt.claim.sub',$1,false); ", [id(5)])
    .then(() => db.query('select * from set_match_fee_payment_open_state($1,true)', [id(42)]))],
  ['same-value match update', db => db.exec(`update matches set players = players, match_name = match_name,
    match_fee_amount = match_fee_amount, absent_players = absent_players where id = '${id(41)}'`)],
  ['unwatched note-only update', db => db.exec(`update matches set note = '集合 08:00' where id = '${id(41)}'`)],
  ['rename match', db => db.exec(`update matches set match_name = '測試盃（改）' where id = '${id(41)}'`)],
  ['change amount', db => db.exec(`update matches set match_fee_amount = 600 where id = '${id(41)}'`)],
  ['full-day leave for 弟', db => db.exec(`insert into leave_requests(id, user_id, start_date, end_date, leave_time_segment)
    values ('${id(91)}', '${id(12)}', '2026-09-27', '2026-09-27', 'full_day')`)],
  ['leave reason-only update', db => db.exec(`update leave_requests set reason = '感冒' where id = '${id(91)}'`)],
  ['leave moved to an unrelated day', db => db.exec(`update leave_requests set start_date = '2026-09-28', end_date = '2026-09-28'
    where id = '${id(91)}'`)],
  ['leave for a non-player on match 42 day', db => db.exec(`insert into leave_requests(id, user_id, start_date, end_date, leave_time_segment)
    values ('${id(92)}', '${id(12)}', '2026-09-28', '2026-09-28', 'morning')`)],
  ['delete leaves', db => db.exec(`delete from leave_requests`)],
  ['exempt 弟 on match 41', async db => {
    const row = (await db.query(`select id, updated_at from match_fee_items where match_id = $1 and member_id = $2`, [id(41), id(12)])).rows[0]
    await db.query('select set_match_fee_item_exemption($1,true,$2)', [row.id, row.updated_at])
  }],
  ['rename with exempt row', db => db.exec(`update matches set tournament_name = '秋季盃' where id = '${id(41)}'`)],
  ['兄 submits payment for match 41', async db => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(5)])
    await db.query('select * from set_match_fee_payment_open_state($1,true)', [id(41)])
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)])
    const item = (await db.query(`select id from match_fee_items where match_id = $1 and member_id = $2`, [id(41), id(11)])).rows[0]
    await db.query("select * from create_match_payment_submission($1,'現金')", [[item.id]])
  }],
  ['change amount with a pending submission', db => db.exec(`update matches set match_fee_amount = 700 where id = '${id(41)}'`)],
  ['remove 弟 from roster', db => db.exec(`update matches set players = '兄' where id = '${id(41)}'`)],
  ['restore roster', db => db.exec(`update matches set players = '兄,弟' where id = '${id(41)}'`)],
  ['add a match', db => db.exec(`insert into matches(id, players, match_name, match_date, match_time, match_fee_amount)
    values ('${id(44)}', '兄,弟', '新賽事', '2026-10-04', '09:00 - 12:00', 400)`)],
  ['same-value insert-free resync', db => db.query('select sync_match_fee_items_for_match($1)', [id(44)])],
]

for (const [variant, migration] of variants) {
  const baseline = await createDatabase(null)
  const guarded = await createDatabase(migration)
  try {
    const definition = (await guarded.query(`select pg_get_functiondef('public.sync_match_fee_items_for_match(uuid)'::regprocedure) d`)).rows[0].d
    check(definition.includes('-- match-fee-sync-noop-guard') && definition.includes('-- match-cancellation-billing-lock-order'), true,
      `${variant}: guard is added to the live definition, cancellation lock order kept`)
    const acl = sql => guarded.query(`select proacl::text, prosecdef, proconfig from pg_proc where oid = '${sql}'::regprocedure`)
    const baseAcl = sql => baseline.query(`select proacl::text, prosecdef, proconfig from pg_proc where oid = '${sql}'::regprocedure`)
    for (const fn of ['public.sync_match_fee_items_for_match(uuid)', 'public.sync_match_fee_items_after_match_change()',
      'public.sync_match_fee_items_after_leave_change()']) {
      check((await acl(fn)).rows, (await baseAcl(fn)).rows, `${variant}: ${fn} keeps ACL, security and search_path`)
    }
    check(await snapshot(guarded), await snapshot(baseline), `${variant}: identical starting fees`)

    const counts = []
    for (const [label, step] of steps) {
      const beforeBaseline = await updates(baseline)
      const beforeGuarded = await updates(guarded)
      const versionsBefore = (await guarded.query('select id, updated_at::text v from match_fee_items order by id')).rows
      await step(baseline)
      await step(guarded)
      check(await snapshot(guarded), await snapshot(baseline), `${variant}: ${label} — fee rows identical`)
      check(await openState(guarded), await openState(baseline), `${variant}: ${label} — payment open state identical`)
      const baselineWrites = await updates(baseline) - beforeBaseline
      const guardedWrites = await updates(guarded) - beforeGuarded
      assert.ok(guardedWrites <= baselineWrites, `${variant}: ${label} — guard never writes more`); checks++
      counts.push([label, baselineWrites, guardedWrites])
      if (['same-value match update', 'unwatched note-only update', 'leave reason-only update',
        'leave for a non-player on match 42 day', 'same-value insert-free resync'].includes(label)) {
        check(guardedWrites, 0, `${variant}: ${label} — no fee row is rewritten`)
        check((await guarded.query('select id, updated_at::text v from match_fee_items order by id')).rows, versionsBefore,
          `${variant}: ${label} — row versions stay stable for exemption concurrency checks`)
      }
    }
    const total = counts.reduce((sum, [, b, g]) => [sum[0] + b, sum[1] + g], [0, 0])
    assert.ok(total[1] < total[0], `${variant}: fewer fee row writes overall`); checks++

    // Rerun is a no-op; an unexpected definition aborts without changes.
    await guarded.exec(migration)
    check((await guarded.query(`select pg_get_functiondef('public.sync_match_fee_items_for_match(uuid)'::regprocedure) d`)).rows[0].d,
      definition, `${variant}: rerunning the migration leaves the definition unchanged`)
    await baseline.exec(`do $$ begin execute replace(pg_get_functiondef('public.sync_match_fee_items_for_match(uuid)'::regprocedure),
      'match_fee_items.payment_submission_id is null;', 'match_fee_items.payment_submission_id is null and true;'); end $$`)
    const triggerBefore = (await baseline.query(`select md5(prosrc) h from pg_proc where oid = 'public.sync_match_fee_items_after_match_change()'::regprocedure`)).rows
    await assert.rejects(baseline.exec(migration), /Unexpected sync_match_fee_items_for_match definition/); checks++
    await baseline.exec('rollback')
    check((await baseline.query(`select md5(prosrc) h from pg_proc where oid = 'public.sync_match_fee_items_after_match_change()'::regprocedure`)).rows,
      triggerBefore, `${variant}: failed migration rolls back the trigger replacements`)
    console.log(`${variant}: fee row writes baseline ${total[0]} → guarded ${total[1]}`)
  } finally {
    await baseline.close()
    await guarded.close()
  }
}
console.log(`match fee sync no-op guard SQL checks passed: ${checks}`)
