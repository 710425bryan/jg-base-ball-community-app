// Isolated PostgreSQL smoke test; never connects to a deployed database.
// npm install --prefix <temporary-directory> --no-save @electric-sql/pglite@0.3.14
// node scripts/verify-equipment-order.mjs <temporary-directory>/node_modules/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '@electric-sql/pglite')
const db = new PGlite()
const a = '00000000-0000-0000-0000-000000000001'
const b = '00000000-0000-0000-0000-000000000002'
const c = '00000000-0000-0000-0000-000000000003'
const unknown = '00000000-0000-0000-0000-000000000004'
let checks = 0

try {
  // Only auth helpers and unrelated catalog fields are fixtures; the actual migration runs below.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.current_profile_role() returns text language sql stable as
      $$ select nullif(current_setting('test.profile_role', true), '') $$;
    create function public.has_app_permission(text, text) returns boolean language sql stable as
      $$ select public.current_profile_role() = 'ADMIN'
        or (public.current_profile_role() = 'EDITOR' and $1 = 'equipment' and $2 = 'EDIT') $$;
    create table public.equipment(id uuid primary key, created_at timestamptz not null, total_quantity integer, purchase_price integer);
    insert into public.equipment values ('${a}', '2026-09-01', 10, 300), ('${b}', '2026-09-02', 20, 500);
    grant usage on schema public, auth to authenticated;
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/20260916010833_equipment_display_order.sql', import.meta.url), 'utf8'))
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('test.profile_role', 'EDITOR', false)", [a])
  await db.exec('set role authenticated')

  const save = (ids, expected) => db.query('select public.reorder_equipment($1::uuid[], $2::uuid[])', [ids, expected])
  const order = async () => (await db.query('select equipment_id from public.equipment_display_order order by position')).rows.map(row => row.equipment_id)
  const rejects = async (ids, expected, code) => {
    await assert.rejects(save(ids, expected), error => error.code === code)
    checks++
  }
  await save([a, b], [b, a])
  assert.deepEqual(await order(), [a, b]); checks++
  for (const invalid of [[a, a], [a], [a, unknown], [a, null], [], null]) {
    await rejects(invalid, [a, b], '22023')
    assert.deepEqual(await order(), [a, b])
  }
  await rejects([b, a], [b, a], '40001')
  await db.exec("select set_config('test.profile_role', 'PARENT', false)")
  assert.deepEqual(await order(), [a, b]); checks++
  await rejects([b, a], [a, b], '42501')
  await assert.rejects(db.exec('update public.equipment_display_order set position = 1'), error => error.code === '42501'); checks++
  await db.exec("select set_config('test.profile_role', '', false)")
  assert.deepEqual(await order(), []); checks++
  await rejects([b, a], [a, b], '42501')
  await db.exec("select set_config('test.profile_role', 'ADMIN', false); select set_config('request.jwt.claim.sub', '', false)")
  await rejects([b, a], [a, b], '42501')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [a])
  await save([b, a], [a, b]); checks++
  await db.exec('reset role')
  await db.query('insert into public.equipment values ($1, now(), 5, 100)', [c])
  await db.exec('set role authenticated')
  await rejects([a, b], [b, a], '40001')
  await save([a, c, b], [b, a, c])
  assert.deepEqual(await order(), [a, c, b]); checks++
  await db.exec('reset role')
  await db.query('delete from public.equipment where id = $1', [c])
  assert.deepEqual(await order(), [a, b]); checks++
  assert.deepEqual((await db.query('select total_quantity, purchase_price from public.equipment order by id')).rows,
    [{ total_quantity: 10, purchase_price: 300 }, { total_quantity: 20, purchase_price: 500 }]); checks++
  assert.equal((await db.query("select has_function_privilege('anon', 'public.reorder_equipment(uuid[],uuid[])', 'execute') as allowed")).rows[0].allowed, false); checks++
  console.log(`Equipment order PostgreSQL smoke checks passed: ${checks}`)
} finally {
  await db.close()
}
