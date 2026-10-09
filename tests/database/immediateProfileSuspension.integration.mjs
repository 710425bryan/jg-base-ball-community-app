// Isolated PostgreSQL checks: no remote accounts, sessions or mail are used.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migration = readFileSync(new URL('../../supabase/migrations/20261009134852_immediate_profile_suspension.sql', import.meta.url), 'utf8')
const existing = readFileSync(new URL('../../supabase_profile_access_control_migration.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let checks = 0
const check = (condition, message) => { assert.ok(condition, message); checks++ }
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create table public.profiles (
      id uuid primary key, email text, role text, is_active boolean not null default true,
      access_start timestamptz, access_end timestamptz
    );
    alter table public.profiles enable row level security;
    grant select on public.profiles to authenticated;
    create policy profiles_select_self_or_users_view on public.profiles for select to authenticated
      using (id=auth.uid());
    create publication supabase_realtime;
    insert into public.profiles (id,email,role) values
      ('${id(1)}','active@example.test','PARENT'),('${id(2)}','disabled@example.test','ADMIN');
    update public.profiles set is_active=false where id='${id(2)}';
  `)
  for (const name of ['current_profile_role', 'can_request_magic_link']) {
    const match = existing.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'))
    assert.ok(match, `Existing ${name} definition must be found`)
    await db.exec(match[0])
  }
  const policyBefore = await one("select qual, roles from pg_policies where tablename='profiles'")
  await db.exec(migration)
  await db.exec(migration)
  check((await one("select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and tablename='profiles'")).n === 1,
    'profiles is published exactly once, including repeat application')
  assert.deepEqual(await one("select qual, roles from pg_policies where tablename='profiles'"), policyBefore); checks++
  check(!(await one("select has_table_privilege('anon','profiles','select') allowed")).allowed, 'anon cannot read profiles')
  for (const [email, expected] of [['active@example.test',true],['  ACTIVE@EXAMPLE.TEST  ',true],['disabled@example.test',false],['unknown@example.test',false],['',false]]) {
    check((await one('select public.can_request_magic_link($1) allowed',[email])).allowed === expected, `preflight ${email}`)
  }
  await db.exec(`select set_config('request.jwt.claim.sub','${id(2)}',false); set role authenticated;`)
  check((await one('select count(*)::int n from profiles')).n === 1, 'suspended user can receive only their own profile row')
  check((await one('select public.current_profile_role() role')).role === null, 'suspended ADMIN loses feature permissions')
  await assert.rejects(() => db.exec('update profiles set is_active=true'), /permission denied/); checks++
  await db.exec(`reset role; update profiles set is_active=true, access_start=now()+interval '1 day' where id='${id(2)}';`)
  check(!(await one("select can_request_magic_link('disabled@example.test') allowed")).allowed, 'future access window cannot send')
  await db.exec(`update profiles set access_start=null, access_end=now()-interval '1 day' where id='${id(2)}';`)
  check(!(await one("select can_request_magic_link('disabled@example.test') allowed")).allowed, 'expired window cannot send')
  await db.exec(`update profiles set access_end=null where id='${id(2)}';`)
  check((await one("select can_request_magic_link('disabled@example.test') allowed")).allowed, 'reactivation permits a new login request')
  console.log(`PASS: ${checks} immediate suspension PostgreSQL checks`)
} finally { await db.close() }
