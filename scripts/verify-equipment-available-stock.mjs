// Isolated PostgreSQL regression; no connection to production.
// npm install --prefix <temp-dir> --no-save @electric-sql/pglite@0.3.14
// node scripts/verify-equipment-available-stock.mjs <temp-dir>/node_modules/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '@electric-sql/pglite')
const db = new PGlite()
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const actor = '00000000-0000-0000-0000-000000000001'
let checks = 0
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.has_app_permission(text, text) returns boolean language sql stable as
      $$ select current_setting('test.permission', true) in ('ADMIN', $2) $$;
    create table public.profiles(id uuid primary key, nickname text, name text);
    insert into public.profiles values ('${actor}', '庫存管理員', '管理員');
    create table public.team_members(id uuid primary key);
    ${read('supabase_equipment_management_migration.sql').match(/create table if not exists public\.equipment \([\s\S]+?\n\);/)[0]}
    alter table public.equipment add column image_urls jsonb default '[]', add column is_custom_order boolean default false,
      add column requires_jersey_number boolean default false, add column jersey_number_min integer default 0,
      add column jersey_number_max integer default 99, add column jersey_number_options jsonb default '[]';
    create table public.equipment_transactions(id uuid primary key default gen_random_uuid(), equipment_id uuid references public.equipment,
      size text, quantity integer, transaction_type text, payment_status text default 'paid');
    create table public.equipment_purchase_requests(id uuid primary key default gen_random_uuid(), status text);
    create table public.equipment_purchase_request_items(id uuid primary key default gen_random_uuid(), request_id uuid references public.equipment_purchase_requests,
      equipment_id uuid references public.equipment, size text, quantity integer, equipment_transaction_id uuid);
    ${read('supabase_equipment_inventory_adjustments_migration.sql').match(/create table if not exists public\.equipment_inventory_adjustments \([\s\S]+?\n\);/)[0]}
    grant usage on schema public, auth to authenticated;
  `)
  await db.exec(read('supabase_zzzzzz_equipment_inventory_snapshot_rpc_migration.sql'))
  await db.exec(read('supabase_zzzzzzzzzzzzzzz_equipment_stock_out_adjustment_migration.sql'))
  await db.exec(read('supabase/migrations/20260924014519_equipment_available_stock.sql'))
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('test.permission', 'ADMIN', false)", [actor])
  const details = { name: '帽子', category: '服飾類', purchase_price: 400 }
  const stock = (available_quantity, sizes = []) => ({ available_quantity, sizes })
  const row = async id => (await db.query('select *, updated_at::text as revision from public.equipment where id=$1', [id])).rows[0]
  const save = async (id, target, reason = '盤點核對', expected, metadata = details) => {
    const revision = expected === undefined && id ? (await row(id)).revision : expected
    await db.exec('set role authenticated')
    try {
      return (await db.query('select public.save_equipment_available_stock($1,$2,$3,$4,$5) as id', [id, metadata, target, revision || null, reason])).rows[0].id
    } finally { await db.exec('reset role') }
  }
  const reject = async (fn, match) => { await assert.rejects(fn, match); checks++ }
  const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }

  const hat = await save(null, stock(999, [{ size: 'S（54cm）', quantity: 1 }, { size: 'M', quantity: 8 }]))
  eq((await row(hat)).total_quantity, 9) // Always derives the aggregate from sizes.
  await db.query("insert into public.equipment_transactions(equipment_id,size,quantity,transaction_type) values ($1,'S（54cm）',1,'receive'),($1,'M',2,'purchase')", [hat])
  const request = (await db.query("insert into public.equipment_purchase_requests(status) values ('approved') returning id")).rows[0].id
  await db.query("insert into public.equipment_purchase_request_items(request_id,equipment_id,size,quantity) values ($1,$2,'M',2)", [request, hat])
  const beforeTransactions = (await db.query('select * from public.equipment_transactions order by id')).rows
  await save(hat, stock(3, [{ size: 'S（54cm）', quantity: 0 }, { size: 'M', quantity: 3 }]))
  eq((await row(hat)).sizes_stock, [{ size: 'S（54cm）', quantity: 1 }, { size: 'M', quantity: 7 }])
  eq((await row(hat)).total_quantity, 8)
  eq((await db.query('select * from public.equipment_transactions order by id')).rows, beforeTransactions)
  const ledger = (await db.query("select * from public.equipment_inventory_adjustments where equipment_id=$1 and adjustment_type='stock_set' order by created_at desc limit 1", [hat])).rows[0]
  eq([ledger.available_quantity_before, ledger.available_quantity_after, ledger.created_by, ledger.handled_by], [4, 3, actor, '庫存管理員'])

  const linkedRevision = (await row(hat)).revision
  await db.query("update public.equipment_purchase_request_items set equipment_transaction_id=(select id from public.equipment_transactions where equipment_id=$1 and size='M') where request_id=$2", [hat, request])
  await reject(() => save(hat, null, null, linkedRevision), /已變更/)
  await save(hat, stock(3, [{size:'S（54cm）',quantity:0},{size:'M',quantity:3}]))
  eq((await row(hat)).total_quantity, 6) // Linked purchase is counted once, never reserved again.

  const oldRevision = (await row(hat)).revision
  await db.query("update public.equipment_purchase_requests set status='cancelled' where id=$1", [request])
  await reject(() => save(hat, stock(0), '盤點', oldRevision), /已變更/)
  const quantityRevision = (await row(hat)).revision
  await db.query("update public.equipment_transactions set quantity=3 where equipment_id=$1 and size='M'", [hat])
  await reject(() => save(hat, stock(0), '盤點', quantityRevision), /已變更/)
  const insertRevision = (await row(hat)).revision
  const tx = (await db.query("insert into public.equipment_transactions(equipment_id,size,quantity,transaction_type) values ($1,'M',1,'borrow') returning id", [hat])).rows[0].id
  await reject(() => save(hat, null, null, insertRevision), /已變更/)
  const deleteRevision = (await row(hat)).revision
  await db.query('delete from public.equipment_transactions where id=$1', [tx])
  await reject(() => save(hat, null, null, deleteRevision), /已變更/)

  await reject(() => save(hat, stock(0, [{ size: 'S(54cm)', quantity: 0 }, { size: 'M', quantity: 0 }])), /尺寸無法對應/)
  await reject(() => save(hat, stock(0)), /保留尺寸/)
  const beforeInvalid = await row(hat)
  for (const bad of [stock(-1), stock(1.5), stock(1, [{size:'M',quantity:-1}]), stock(1, [{size:'M',quantity:1.2}]), stock(0, [{size:'M',quantity:0},{size:'M',quantity:0}])]) {
    await reject(() => save(hat, bad, '錯誤測試', undefined, { ...details, name: '不可寫入' }), /可用庫存|尺寸名稱不可重複/)
    eq(await row(hat), beforeInvalid)
  }
  await reject(() => save(hat, stock(1, [{size:'S（54cm）',quantity:0},{size:'M',quantity:1}]), ''), /調整原因/)

  // Repair inconsistent legacy data only after explicit available quantities are supplied.
  await db.query("update public.equipment set total_quantity=0, sizes_stock='[{\"size\":\"S（54cm）\",\"quantity\":0},{\"size\":\"M\",\"quantity\":0}]' where id=$1", [hat])
  await save(hat, stock(0, [{size:'S（54cm）',quantity:0},{size:'M',quantity:0}]))
  eq((await row(hat)).total_quantity, 4)
  eq((await row(hat)).sizes_stock[0].quantity, 1)
  const ledgerCount = async () => Number((await db.query('select count(*) as n from public.equipment_inventory_adjustments')).rows[0].n)
  const count = await ledgerCount()
  await save(hat, stock(0, [{size:'M',quantity:0},{size:'S（54cm）',quantity:0}]), '')
  eq(await ledgerCount(), count) // Reordering preserves quantities without a false stock change.
  await save(hat, null, null, undefined, {...details, name:'帽子照片與文字編輯'})
  eq((await row(hat)).total_quantity, 4)
  eq(await ledgerCount(), count)

  const bat = await save(null, stock(4))
  await db.query("insert into public.equipment_transactions(equipment_id,quantity,transaction_type) values ($1,2,'borrow'),($1,1,'return')", [bat])
  await save(bat, stock(0))
  eq((await row(bat)).total_quantity, 1)
  await db.query("select public.create_equipment_inventory_adjustment($1,current_date,null,'管理員',null,3,null)", [bat])
  eq((await row(bat)).total_quantity, 4)
  await db.query("select public.create_equipment_inventory_adjustment($1,current_date,null,'管理員',null,-2,'報廢')", [bat])
  eq((await row(bat)).total_quantity, 2)
  await reject(() => save(bat, stock(0, [{size:'新尺寸',quantity:0}])), /尺寸無法對應/)

  await db.exec("select set_config('test.permission','VIEW',false)")
  await reject(() => save(bat, stock(2)), /沒有儲存裝備/)
  await reject(() => save(null, stock(2)), /沒有儲存裝備/)
  await db.exec("select set_config('test.permission','CREATE',false)")
  await save(null, stock(2)); checks++
  await reject(() => save(bat, stock(2)), /沒有儲存裝備/)
  await db.exec("select set_config('test.permission','EDIT',false)")
  await save(bat, stock(2)); checks++
  await reject(() => save(null, stock(2)), /沒有儲存裝備/)
  await db.exec("select set_config('test.permission','ADMIN',false); select set_config('request.jwt.claim.sub','',false)")
  await reject(() => save(bat, stock(2)), /沒有儲存裝備/)
  console.log(`Equipment availability PostgreSQL regression: ${checks} checks passed.`)
} finally { await db.close() }
