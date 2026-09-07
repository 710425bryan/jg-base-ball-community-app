// Isolated PostgreSQL (PGlite) integration test. Never connects to a project database.
// npm install --prefix /tmp/jg-payment-db-test --no-audit --no-fund @electric-sql/pglite@0.5.8
// PGLITE_MODULE_PATH=/tmp/jg-payment-db-test/node_modules/@electric-sql/pglite/dist/index.js node tests/database/pendingPayments.integration.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite')
const db = new PGlite()
const uuid = (number) => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`
const user = uuid(1), other = uuid(2), member = uuid(11), sibling = uuid(12)
const id = uuid(100), version = '2026-09-07T00:00:00.000001Z'
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0]
const execute = (sql, values = []) => db.query(sql, values)
let assertions = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); assertions++ }
const fails = async (action, pattern) => { await assert.rejects(action, pattern); assertions++ }

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, role text default 'PARENT', is_active boolean default true, access_start timestamptz, access_end timestamptz, linked_team_member_ids uuid[]);
  create table public.team_members (id uuid primary key, name text, test_balance integer);
  create function public.current_profile_role() returns text language sql stable security definer set search_path = '' as $$
    select role from public.profiles where id = auth.uid() and is_active and (access_start is null or access_start <= now()) and (access_end is null or access_end >= now())
  $$;
  create function public.get_player_balance_unchecked(p_member_id uuid) returns integer language sql as $$ select test_balance from public.team_members where id = p_member_id $$;
  create table public.profile_payment_submissions (
    id uuid primary key, profile_id uuid, member_id uuid, billing_mode text, period_key text,
    amount integer, expected_amount integer, balance_amount integer, reported_external_amount integer,
    payment_method text, account_last_5 text, remittance_date date, note text,
    amount_mismatch_reason text, status text, reviewed_at timestamptz, reviewed_by uuid, updated_at timestamptz
  );
  create table public.profile_payment_submission_items (
    id uuid primary key, submission_id uuid references public.profile_payment_submissions on delete cascade,
    member_id uuid, period_key text, amount integer, expected_amount integer, balance_amount integer,
    reported_external_amount integer, updated_at timestamptz
  );
  create table public.equipment_payment_submissions (
    id uuid primary key, profile_id uuid, member_id uuid, amount integer, balance_amount integer,
    payment_method text, account_last_5 text, remittance_date date, note text, status text,
    reviewed_at timestamptz, reviewed_by uuid, updated_at timestamptz
  );
  create table public.match_payment_submissions (like public.equipment_payment_submissions including all);
  create table public.equipments (id uuid primary key, name text);
  create table public.equipment_transactions (
    id uuid primary key, equipment_id uuid references public.equipments, size text, quantity integer,
    payment_submission_id uuid references public.equipment_payment_submissions on delete set null,
    payment_status text, updated_at timestamptz, fulfillment text default 'picked_up'
  );
  create table public.match_fee_items (
    id uuid primary key, match_name text, match_date date,
    payment_submission_id uuid references public.match_payment_submissions on delete set null,
    payment_status text, updated_at timestamptz, amount integer default 500
  );
  create table public.equipment_payment_submission_items (
    submission_id uuid references public.equipment_payment_submissions on delete cascade,
    transaction_id uuid references public.equipment_transactions, primary key (submission_id, transaction_id)
  );
  create table public.match_payment_submission_items (
    submission_id uuid references public.match_payment_submissions on delete cascade,
    match_fee_item_id uuid references public.match_fee_items, primary key (submission_id, match_fee_item_id)
  );
  create table public.player_balance_transactions (
    related_profile_payment_submission_id uuid references public.profile_payment_submissions on delete set null,
    related_equipment_payment_submission_id uuid references public.equipment_payment_submissions on delete set null,
    related_match_payment_submission_id uuid references public.match_payment_submissions on delete set null
  );
  -- RLS stays closed to clients: the only available writes are the authorized RPCs.
  alter table public.profile_payment_submissions enable row level security;
  alter table public.equipment_payment_submissions enable row level security;
  alter table public.match_payment_submissions enable row level security;
  insert into public.profiles (id, linked_team_member_ids) values ('${user}', array['${member}','${sibling}']::uuid[]), ('${other}', array['${member}']::uuid[]);
  insert into public.team_members values ('${member}', '小明', 600), ('${sibling}', '小華', 400);
  insert into public.equipments values ('${uuid(20)}', '球衣');
`)
await db.exec(readFileSync(new URL('../../supabase_pending_payment_submission_self_service_migration.sql', import.meta.url), 'utf8'))
const login = async (value) => execute("select set_config('request.jwt.claim.sub', $1, false)", [value])
const list = () => scalar('select public.list_my_pending_payment_submissions($1)', [member])
const mutate = (kind, changes, remove = false, updatedAt = version) => execute('select public.mutate_my_pending_payment_submission($1,$2,$3,$4,$5)', [kind,id,updatedAt,changes,remove])
const changes = (balance = 200, actual = 800, itemId = id) => ({
  payment_method: '銀行轉帳', account_last_5: '12345', remittance_date: '2026-09-06', note: '更正', amount_mismatch_reason: null,
  items: [{ id: itemId, balance_amount: balance, reported_external_amount: actual }]
})
const reset = async () => {
  await db.exec('reset role; truncate player_balance_transactions, profile_payment_submissions, equipment_payment_submissions, match_payment_submissions cascade; update profiles set is_active = true, access_start = null, access_end = null;')
  await login(user)
}
const seed = async (kind, amount = 1000, status = 'pending_review') => {
  const table = { membership: 'profile_payment_submissions', equipment: 'equipment_payment_submissions', match: 'match_payment_submissions' }[kind]
  await execute(`insert into public.${table} (id,profile_id,member_id,amount,balance_amount,payment_method,account_last_5,remittance_date,status,updated_at) values ($1,$2,$3,$4,0,'銀行轉帳','00000','2026-09-01',$5,$6)`, [id,user,member,amount,status,version])
  if (kind === 'membership') await execute("update public.profile_payment_submissions set billing_mode='monthly', period_key='2026-08', expected_amount=$1, reported_external_amount=$1", [amount])
  else if (kind === 'equipment') {
    await execute("insert into public.equipment_transactions (id,equipment_id,size,quantity,payment_submission_id,payment_status) values ($1,$2,'L',2,$3,'pending_review') on conflict (id) do update set payment_submission_id=excluded.payment_submission_id, payment_status=excluded.payment_status", [uuid(21),uuid(20),id])
    await execute('insert into public.equipment_payment_submission_items values ($1,$2)', [id,uuid(21)])
  } else {
    await execute("insert into public.match_fee_items (id,match_name,match_date,payment_submission_id,payment_status) values ($1,'測試比賽','2026-09-01',$2,'pending_review') on conflict (id) do update set payment_submission_id=excluded.payment_submission_id, payment_status=excluded.payment_status", [uuid(31),id])
    await execute('insert into public.match_payment_submission_items values ($1,$2)', [id,uuid(31)])
  }
  return table
}

for (const kind of ['membership','equipment','match']) {
  await reset()
  const table = await seed(kind)
  check((await list()).length, 1)
  // Even an account linked to the same player cannot touch another account's report.
  await login(other)
  check(await list(), [])
  await fails(() => mutate(kind, changes()), /付款回報已變更/)
  await fails(() => mutate(kind, null, true), /付款回報已變更/)
  await login(user)
  await execute('update public.profiles set is_active=false where id=$1', [user])
  await fails(() => mutate(kind, changes()), /登入狀態已失效/)
  await execute('update public.profiles set is_active=true, access_end=now()-interval \'1 day\' where id=$1', [user])
  await fails(() => list(), /登入狀態已失效/)
  await execute('update public.profiles set access_end=null where id=$1', [user])
  await fails(() => mutate(kind, changes(1001,0)), /不可超過/)
  await fails(() => mutate(kind, changes(700,300)), /可用餘額不足/)
  await fails(() => mutate(kind, {...changes(), account_last_5:'123'}), /後五碼/)
  await fails(() => mutate(kind, {...changes(), items: []}), /品項已變更/)
  await fails(() => mutate(kind, changes(0,1000,uuid(999))), /品項已變更/)
  await fails(() => mutate(kind, changes(-1,1001)), /非負整數/)
  await fails(() => mutate(kind, changes(0.5,999)), /非負整數/)
  await fails(() => mutate(kind, changes(0,900)), kind === 'membership' ? /異常原因/ : /實付金額必須/)
  await db.exec('set role authenticated')
  await mutate(kind, {...changes(), expected_amount: 1, amount: 1, member_id: sibling, status:'approved'})
  await db.exec('reset role')
  check(await scalar(`select amount from public.${table} where id=$1`, [id]), 1000)
  check(await scalar(`select balance_amount from public.${table} where id=$1`, [id]), 200)
  check(await scalar(`select status from public.${table} where id=$1`, [id]), 'pending_review')
  check(await scalar('select count(*)::int from player_balance_transactions'), 0)
  await fails(() => mutate(kind, changes()), /付款回報已變更/)
  await fails(() => mutate(kind, null,true), /付款回報已變更/)
  const latest = (await list())[0]
  await mutate(kind, null,true,latest.updated_at)
  check(await scalar(`select count(*)::int from public.${table}`), 0)
  if (kind === 'equipment') {
    check((await execute('select payment_status,payment_submission_id,fulfillment from equipment_transactions')).rows[0], {payment_status:'unpaid',payment_submission_id:null,fulfillment:'picked_up'})
    check(await scalar('select count(*)::int from equipment_payment_submission_items'),0)
  }
  if (kind === 'match') {
    check((await execute('select payment_status,payment_submission_id,amount from match_fee_items')).rows[0], {payment_status:'unpaid',payment_submission_id:null,amount:500})
    check(await scalar('select count(*)::int from match_payment_submission_items'),0)
  }
  for (const status of ['approved','rejected']) {
    await reset(); await seed(kind,1000,status)
    check(await list(), [])
    await fails(() => mutate(kind, changes()), /付款回報已變更/)
    await fails(() => mutate(kind, null,true), /付款回報已變更/)
  }
  // Review wins after the editor loads; even a caller retaining the old version is rejected.
  await reset(); await seed(kind)
  await execute(`update public.${table} set status='approved', reviewed_at=now()`)
  await fails(() => mutate(kind,changes()), /付款回報已變更/)
  await fails(() => mutate(kind,null,true), /付款回報已變更/)
  if (kind !== 'membership') {
    await reset(); await seed(kind)
    const chargeTable = kind === 'equipment' ? 'equipment_transactions' : 'match_fee_items'
    await execute(`update public.${chargeTable} set payment_status='paid'`)
    await fails(() => mutate(kind,changes()), /付款狀態已變更/)
    await fails(() => mutate(kind,null,true), /付款狀態已變更/)
    check(await scalar(`select count(*)::int from public.${table}`),1)
  }
}

// Grouped quarter: per-member values, frozen normal/discount amounts, atomic validation.
await reset(); await seed('membership',1500)
await execute("update profile_payment_submissions set billing_mode='quarterly', period_key='2026-Q3'")
await execute("insert into profile_payment_submission_items (id,submission_id,member_id,period_key,amount,expected_amount,balance_amount,reported_external_amount) values ($1,$2,$3,'2026-Q3',1000,1000,0,1000),($4,$2,$5,'2026-Q3',500,500,0,500)", [uuid(101),id,member,uuid(102),sibling])
const group = {...changes(), items:[{id:uuid(101),balance_amount:200,reported_external_amount:800},{id:uuid(102),balance_amount:100,reported_external_amount:400}]}
check((await list())[0].items.length,2)
await fails(() => mutate('membership',{...group,items:[group.items[0],{...group.items[1],reported_external_amount:300}]}), /異常原因/)
check(await scalar('select sum(balance_amount)::int from profile_payment_submission_items'),0)
await fails(() => mutate('membership',{...group,items:[group.items[0],group.items[0]]}), /品項已變更/)
await execute('update profiles set linked_team_member_ids=array[$1]::uuid[] where id=$2',[member,user])
await fails(() => mutate('membership',group), /關聯成員/)
await execute('update profiles set linked_team_member_ids=array[$1,$2]::uuid[] where id=$3',[member,sibling,user])
await mutate('membership',group)
check((await execute('select amount,expected_amount,balance_amount,reported_external_amount from profile_payment_submission_items order by id')).rows,
  [{amount:1000,expected_amount:1000,balance_amount:200,reported_external_amount:800},{amount:500,expected_amount:500,balance_amount:100,reported_external_amount:400}])
check(await scalar('select balance_amount from profile_payment_submissions'),300)
check(await scalar('select reported_external_amount from profile_payment_submissions'),1200)

// Mismatch is retained for admin reconciliation, without changing the principal.
await mutate('membership', null, true, (await list())[0].updated_at)
check(await scalar('select count(*)::int from profile_payment_submission_items'),0)
await reset(); await seed('membership')
await mutate('membership',{...changes(200,900),amount_mismatch_reason:'多匯 100 元'})
check(await scalar('select expected_amount from profile_payment_submissions'),1000)
check(await scalar('select reported_external_amount from profile_payment_submissions'),900)
// Balance-only and legacy records.
await reset(); await seed('membership',500)
await mutate('membership',changes(500,0))
check(await scalar('select payment_method from profile_payment_submissions'),'餘額扣款')
check(await scalar('select account_last_5 from profile_payment_submissions'),null)
await reset(); await seed('membership')
await execute('update profile_payment_submissions set expected_amount=null')
await fails(() => mutate('membership',changes()), /缺少應收快照/)
await mutate('membership',changes(0,1000))
check(await scalar('select expected_amount from profile_payment_submissions'),null)
// Any ledger reference prevents withdrawal; unauthorized clients cannot bypass the RPC.
await reset(); await seed('membership')
await execute('insert into player_balance_transactions (related_profile_payment_submission_id) values ($1)',[id])
await fails(() => mutate('membership',null,true), /已有入帳紀錄/)
await db.exec('set role authenticated')
await fails(() => execute("update public.profile_payment_submissions set status='approved'"), /permission denied/)
await db.exec('reset role; set role anon')
await fails(() => list(), /permission denied/)
await fails(() => mutate('membership',null,true), /permission denied/)
await db.exec('reset role')
check(await scalar("select bool_and(p.prosecdef and p.proconfig = array['search_path=\"\"']) from pg_proc p where p.proname in ('list_my_pending_payment_submissions','mutate_my_pending_payment_submission')"),true)
console.log(`PASS: ${assertions} PostgreSQL assertions (owner/access, all three payment kinds, versions/review protection, snapshot/balance protection, grouped quarters, rollback, withdrawal, grants).`)
await db.close()
