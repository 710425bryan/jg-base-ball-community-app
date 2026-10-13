// Isolated PostgreSQL regression; never connects to Supabase or uses customer data.
// Run: node tests/database/playerSoftDeletion.integration.mjs
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { read, id, extractFunction } from './quarterlyPaymentOwnership.fixture.mjs'

const db = new PGlite()
let assertions = 0
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++ }
const rows = async (sql, args = []) => (await db.query(sql, args)).rows
const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0]
const equipmentMigration = 'supabase_equipment_management_migration.sql'
const accessMigration = 'supabase_access_control_rls_migration.sql'
const hardenedRosterMigration = 'supabase_zzzzzzzzzzzzzzzzzzzzzzzzz_team_members_safe_security_hardening_migration.sql'
const softDeletionMigration = 'supabase/migrations/20261013005735_team_member_soft_deletion.sql'

// Execute the actual FK/check/default definitions, not copies of their behavior.
const table = (file, name) => {
  const statement = read(file).match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`, 'i'))?.[0]
  assert.ok(statement, `Missing authoritative table ${name} in ${file}`)
  return statement
}
const policy = (file, name) => {
  const statement = read(file).match(new RegExp(`create policy "${name}"[\\s\\S]*?;`, 'i'))?.[0]
  assert.ok(statement, `Missing authoritative policy ${name} in ${file}`)
  return statement
}
const retainedTables = [
  'profiles', 'equipment', 'equipment_inventory_adjustments',
  'equipment_payment_submissions', 'equipment_transactions', 'equipment_purchase_requests',
  'equipment_purchase_request_items', 'equipment_payment_submission_items',
  'fee_settings', 'monthly_fees', 'quarterly_fees', 'profile_payment_submissions', 'profile_payment_submission_items',
  'match_payment_submissions', 'match_fee_items', 'match_payment_submission_items',
  'player_balance_transactions',
]
const snapshot = async () => {
  await db.exec('reset role')
  return Object.fromEntries(await Promise.all(retainedTables.map(async name => [name,
    await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) from public.${name} t`),
  ])))
}
const memberWithoutStatus = async () => {
  await db.exec('reset role')
  return scalar("select to_jsonb(t) - 'status' - 'updated_at' - 'deleted_at' - 'deleted_by' - 'deleted_previous_status' from team_members t where id=$1", [id(10)])
}
const login = async profile => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id(profile)])
  await db.exec('set role authenticated')
}
const softDelete = async member => scalar('select soft_delete_team_member($1)', [id(member)])
const denied = async (action, label) => {
  await assert.rejects(action, error => error.code === '42501', label)
  assertions++
}

try {
  // Minimal surrounding catalog. Auth.uid follows the project's isolated SQL
  // fixtures; all permission decisions below use the real repository helpers.
  // Only columns needed by RLS, preserved player flags and history are included.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table profiles (
      id uuid primary key, role text, linked_team_member_ids uuid[] default '{}',
      is_active boolean default true, access_start timestamptz, access_end timestamptz
    );
    create table app_role_permissions (role_key text, feature text, action text);
    create table team_members (
      id uuid primary key, name text, role text, status text default '在隊',
      is_inactive_or_graduated boolean default false, fee_billing_mode text default 'role_default',
      is_primary_payer boolean default false, is_half_price boolean default false,
      sibling_ids uuid[] default '{}', match_fee_enabled boolean default true,
      match_fee_start_date date, created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table matches (id uuid primary key);
    create view team_members_safe with (security_invoker=true) as
      select id, name, role, status, is_inactive_or_graduated from team_members;
    grant select on team_members_safe to authenticated, service_role;
    grant select on profiles to authenticated;
    grant select (id, name, role, status, is_inactive_or_graduated) on team_members to authenticated;
    grant insert, update, delete on team_members to authenticated;
    alter table team_members enable row level security;
  `)
  for (const name of ['has_app_permission', 'has_any_app_permission']) {
    await db.exec(extractFunction(accessMigration, name))
  }
  await db.exec(extractFunction('supabase_profile_access_control_migration.sql', 'current_profile_role'))
  await db.exec(policy(hardenedRosterMigration, 'team_members_select_permitted_features'))
  for (const name of ['team_members_insert_players_create', 'team_members_update_players_edit', 'team_members_delete_players_delete']) {
    await db.exec(policy('supabase_access_control_policy_cleanup_migration.sql', name))
  }
  await db.exec(extractFunction('supabase_team_members_cache_meta_migration.sql', 'set_team_members_updated_at'))
  await db.exec(`create trigger set_team_members_updated_at before update on team_members
    for each row execute function set_team_members_updated_at()`)

  for (const name of ['equipment', 'equipment_payment_submissions', 'equipment_transactions',
    'equipment_purchase_requests', 'equipment_purchase_request_items', 'equipment_payment_submission_items']) {
    await db.exec(table(equipmentMigration, name))
  }
  const transactionRequestFk = read(equipmentMigration).match(/do \$\$[\s\S]*?end;\n\$\$;/i)?.[0]
  assert.ok(transactionRequestFk, 'Missing equipment transaction/request circular FK')
  await db.exec(transactionRequestFk)
  await db.exec(table('supabase_equipment_inventory_adjustments_migration.sql', 'equipment_inventory_adjustments'))
  for (const name of ['fee_settings', 'monthly_fees', 'quarterly_fees']) {
    await db.exec(table('supabase_fees_migration.sql', name))
  }
  await db.exec(table('supabase_profile_payment_submissions_migration.sql', 'profile_payment_submissions'))
  await db.exec(table('supabase_zzzzzz_multi_player_quarterly_payment_submissions_migration.sql', 'profile_payment_submission_items'))
  await db.exec(table('supabase_player_balance_transactions_migration.sql', 'player_balance_transactions'))
  for (const name of ['match_payment_submissions', 'match_fee_items', 'match_payment_submission_items']) {
    await db.exec(table('supabase_match_fees_migration.sql', name))
  }
  // Apply the real additive balance/refund DDL without loading unrelated RPCs.
  const balanceDdl = read('supabase_player_balance_transactions_migration.sql')
    .split('alter table public.profile_payment_submissions')[1].split('create ')[0]
  assert.ok(balanceDdl.includes('balance_amount'), 'Missing balance/snapshot columns')
  await db.exec(`alter table public.profile_payment_submissions${balanceDdl}`)
  const refundDdl = read('supabase_zzzzzzzzzzz_equipment_payment_refund_migration.sql')
    .split('create or replace function')[0].replace(/^begin;\s*/i, '')
  await db.exec(refundDdl)
  await db.exec(read('supabase_quarterly_fees_migration.sql'))

  await db.exec(`
    insert into profiles(id,role,linked_team_member_ids) values
      ('${id(1)}','PARENT',array['${id(10)}'::uuid]),
      ('${id(2)}','VIEWER','{}'), ('${id(3)}','DELETER','{}'),
      ('${id(4)}','EDITOR','{}'), ('${id(5)}','ADMIN','{}'),
      ('${id(6)}','DELETER','{}'), ('${id(7)}','DELETER','{}'), ('${id(8)}','DELETE_ONLY','{}');
    update profiles set is_active=false where id='${id(6)}';
    update profiles set access_end=now()-interval '1 day' where id='${id(7)}';
    insert into app_role_permissions values
      ('VIEWER','players','VIEW'), ('DELETER','players','VIEW'), ('DELETER','players','DELETE'),
      ('EDITOR','players','VIEW'), ('EDITOR','players','EDIT'), ('DELETE_ONLY','players','DELETE');
    insert into team_members(id,name,role,is_primary_payer,sibling_ids) values
      ('${id(10)}','測試球員','球員',true,array['${id(11)}'::uuid]),
      ('${id(11)}','測試手足','球員',false,array['${id(10)}'::uuid]);
    insert into team_members(id,name,role,status) values ('${id(12)}','一般退隊球員','球員','退隊');
    insert into equipment(id,name,total_quantity,sizes_stock) values
      ('${id(20)}','測試球帽',30,'[{"size":"M","quantity":30}]');
    insert into equipment_inventory_adjustments(equipment_id,member_id,quantity_delta,total_quantity_after)
      values ('${id(20)}','${id(10)}',30,30);
    insert into fee_settings(member_id,per_session_fee) values ('${id(10)}',500);
  `)
  const paymentStates = ['pending_review', 'approved', 'rejected', 'refunded']
  const transactionStates = ['pending_review', 'paid', 'cancelled', 'refunded']
  const requestStates = ['approved', 'picked_up', 'rejected', 'cancelled']
  for (let i = 0; i < paymentStates.length; i++) {
    await db.query(`insert into equipment_payment_submissions
      (id,profile_id,member_id,amount,balance_amount,payment_method,status)
      values ($1,$2,$3,500,100,'現金',$4)`, [id(30+i), id(1), id(10), paymentStates[i]])
    await db.query(`insert into equipment_purchase_requests(id,member_id,requester_user_id,status)
      values ($1,$2,$3,$4)`, [id(40+i), id(10), id(1), requestStates[i]])
    await db.query(`insert into equipment_purchase_request_items
      (id,request_id,equipment_id,quantity,equipment_name_snapshot,unit_price_snapshot)
      values ($1,$2,$3,1,'測試球帽',500)`, [id(50+i), id(40+i), id(20)])
    await db.query(`insert into equipment_transactions
      (id,equipment_id,transaction_type,member_id,quantity,unit_price,request_item_id,payment_status,payment_submission_id)
      values ($1,$2,'purchase',$3,1,500,$4,$5,$6)`, [id(60+i), id(20), id(10), id(50+i), transactionStates[i], id(30+i)])
    await db.query('update equipment_purchase_request_items set equipment_transaction_id=$1 where id=$2', [id(60+i),id(50+i)])
    await db.query('insert into equipment_payment_submission_items(submission_id,transaction_id) values ($1,$2)', [id(30+i),id(60+i)])
  }
  for (const [i, state] of ['unpaid', 'pending_review', 'paid'].entries()) {
    await db.query(`insert into monthly_fees(member_id,year_month,payable_amount,status)
      values ($1,$2,2000,$3)`, [id(10), `2026-0${i+1}`, state])
    await db.query(`insert into quarterly_fees(member_id,member_ids,year_quarter,amount,payment_items,status)
      values ($1,$2,$3,10500,'[{"name":"季費","amount":10500}]',$4)`, [id(10), [id(10),id(11)], `2026-Q${i+1}`, state])
    const submissionStatus = ['rejected', 'pending_review', 'approved'][i]
    await db.query(`insert into profile_payment_submissions
      (id,profile_id,member_id,billing_mode,period_key,amount,payment_method,remittance_date,status)
      values ($1,$2,$3,'monthly',$4,2000,'現金','2026-10-01',$5)`, [id(70+i),id(1),id(10),`2026-0${i+1}`,submissionStatus])
    await db.query(`insert into profile_payment_submissions
      (id,profile_id,member_id,billing_mode,period_key,amount,payment_method,remittance_date,status)
      values ($1,$2,$3,'quarterly',$4,10500,'現金','2026-10-01',$5)`, [id(73+i),id(1),id(10),`2026-Q${i+1}`,submissionStatus])
    await db.query(`insert into profile_payment_submission_items(submission_id,member_id,period_key,amount)
      values ($1,$2,$4,5500),($1,$3,$4,5000)`, [id(73+i),id(10),id(11),`2026-Q${i+1}`])
    await db.query(`insert into match_payment_submissions
      (id,profile_id,member_id,amount,payment_method,status) values ($1,$2,$3,500,'現金',$4)`, [id(80+i),id(1),id(10),submissionStatus])
    await db.query(`insert into match_fee_items
      (id,member_id,member_name_snapshot,match_name_snapshot,match_date_snapshot,fee_month,amount,payment_status,payment_submission_id)
      values ($1,$2,'測試球員','測試比賽','2026-10-01','2026-10',500,$3,$4)`, [id(90+i),id(10),state,id(80+i)])
    await db.query('insert into match_payment_submission_items values ($1,$2,now())', [id(80+i),id(90+i)])
  }
  await db.exec(`
    insert into player_balance_transactions(member_id,delta,source,related_equipment_payment_submission_id) values
      ('${id(10)}',1000,'manual_adjustment',null),
      ('${id(10)}',-100,'payment_deduction','${id(31)}'),
      ('${id(10)}',100,'refund','${id(33)}');
  `)
  const before = await snapshot()
  const playerBefore = await memberWithoutStatus()
  await login(5)
  await assert.rejects(() => db.query('delete from team_members where id=$1', [id(10)]), error =>
    error.code === '23503' && error.message.includes('equipment_payment_submissions_member_id_fkey'))
  assertions++
  check(await snapshot(), before, 'failed hard DELETE rolls back every history/stock change')
  check(await memberWithoutStatus(), playerBefore, 'failed hard DELETE retains the player')

  // The implementation under test is the complete migration, including the
  // definer RPC, raw-DML guard and invoker-view extension, with no SQL rewriting.
  await db.exec(read(softDeletionMigration))
  check(await snapshot(), before, 'migration itself does not rewrite financial history or stock')
  check(await scalar("select reloptions from pg_class where oid='team_members_safe'::regclass"), ['security_invoker=true'], 'safe view remains invoker scoped')
  check(await scalar("select prosecdef from pg_proc where oid='private.guard_team_member_soft_deletion()'::regprocedure"), false, 'raw-DML guard retains caller identity')
  check(await scalar("select proconfig from pg_proc where oid='soft_delete_team_member(uuid)'::regprocedure"), ['search_path=""'], 'deletion RPC uses an empty search path')
  await db.exec('set role anon')
  await denied(() => softDelete(10), 'anonymous clients cannot execute deletion RPC')

  for (const [profile, label] of [[1,'linked parent'],[2,'VIEW-only'],[4,'VIEW + EDIT without DELETE'],[6,'inactive DELETE account'],[7,'expired DELETE account']]) {
    await login(profile)
    await denied(() => softDelete(10), `${label} cannot soft-delete through RPC`)
    await db.exec('reset role')
    check(await scalar('select deleted_at from team_members where id=$1', [id(10)]), null, `${label} changes no deletion marker`)
  }
  await login(5)
  await denied(() => db.query('delete from team_members where id=$1', [id(10)]), 'raw DELETE now fails before FK/cascade for authenticated ADMIN')
  await denied(() => db.query("insert into team_members(id,name,role,deleted_at) values ($1,'偽造','球員',now())", [id(99)]), 'raw INSERT cannot forge deletion metadata')
  await login(4)
  for (const patch of ['deleted_at=now()', `deleted_by='${id(4)}'`, "deleted_previous_status='在隊'"]) {
    await denied(() => db.query(`update team_members set ${patch} where id=$1`, [id(10)]), 'an editor cannot forge deletion markers through UPDATE')
  }
  check(await snapshot(), before, 'denied writes preserve all records')
  await login(8)
  check(await softDelete(10), id(10), 'DELETE-only role can use RPC without SELECT or EDIT permission')
  await db.exec('reset role')
  const audit = await rows('select id, status, deleted_at, deleted_by, deleted_previous_status, is_inactive_or_graduated from team_members where id=$1', [id(10)])
  check(audit[0].id, id(10), 'soft deletion keeps the original member ID')
  check(audit[0].status, '退隊', 'existing business eligibility excludes the deleted member')
  check(Boolean(audit[0].deleted_at), true, 'soft deletion records its timestamp')
  check(audit[0].deleted_by, id(8), 'soft deletion records the caller')
  check(audit[0].deleted_previous_status, '在隊', 'audit retains the pre-deletion status')
  check(audit[0].is_inactive_or_graduated, false, 'soft deletion does not change the graduation/inactive flag')
  check(await snapshot(), before, 'all payment states, requests, stock, fees, balances and profile bindings survive soft deletion')
  check(await memberWithoutStatus(), playerBefore, 'soft deletion preserves sibling links and billing flags')

  await login(4)
  for (const status of [null, '在隊', '退隊']) {
    const where = status ? ' and status=$2' : ''
    const args = status ? [id(10), status] : [id(10)]
    check(await scalar(`select count(*)::int from team_members_safe where id=$1 and deleted_at is null${where}`, args), 0, `${status || 'all'} roster excludes soft-deleted member`)
  }
  check(await scalar('select name from team_members_safe where id=$1', [id(10)]), '測試球員', 'authorized historical lookups retain the member label')
  check(await scalar("select count(*)::int from team_members_safe where id=$1 and status='退隊' and deleted_at is null", [id(12)]), 1, 'ordinary retired members remain visible in the retired roster')
  await denied(() => db.query("update team_members set status='在隊' where id=$1", [id(10)]), 'an old edit form cannot resurrect a deleted member')
  await denied(() => db.query('update team_members set deleted_at=null,deleted_by=null where id=$1', [id(10)]), 'raw UPDATE cannot clear deletion audit')
  await denied(() => db.query("update team_members set name='同步改名' where id=$1", [id(10)]), 'stale synchronization cannot overwrite deleted history')
  await login(3)
  check(await softDelete(10), id(10), 'repeat deletion succeeds idempotently')
  await db.exec('reset role')
  check(await rows('select id, status, deleted_at, deleted_by, deleted_previous_status, is_inactive_or_graduated from team_members where id=$1', [id(10)]), audit, 'retry by another operator preserves the first audit')
  check(await snapshot(), before, 'idempotent retry preserves all history')

  // The RPC participates in the caller transaction; a later failure/rollback
  // must not leave a partially deleted member or a changed historical record.
  await login(3)
  await db.exec('begin')
  check(await softDelete(11), id(11), 'RPC can execute inside a caller transaction')
  check(await scalar('select deleted_at is not null from team_members where id=$1', [id(11)]), true, 'transaction sees its deletion before rollback')
  await db.exec('rollback')
  check(await scalar('select deleted_at from team_members where id=$1', [id(11)]), null, 'transaction rollback removes the deletion marker')
  check(await scalar('select status from team_members where id=$1', [id(11)]), '在隊', 'transaction rollback restores the original status')
  check(await snapshot(), before, 'transaction rollback preserves all financial history and relationships')
  await login(3)
  await assert.rejects(() => softDelete(999), error => error.code === 'P0002')
  assertions++
  check(await softDelete(12), id(12), 'an already retired member can be independently soft-deleted')
  await db.exec('reset role')
  check(await scalar('select deleted_previous_status from team_members where id=$1', [id(12)]), '退隊', 'retired deletion preserves the actual prior status')
  check(await snapshot(), before, 'deleting an ordinary retired member also preserves all history')
  console.log(`Player soft deletion PostgreSQL integration: ${assertions} assertions passed`)
} finally {
  await db.close()
}
