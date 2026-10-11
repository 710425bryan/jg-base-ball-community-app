// Isolated PostgreSQL regression; never uses real profiles or auth sessions.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++ }
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const one = async (sql, args = []) => (await query(sql,args))[0]
const id = number => `00000000-0000-0000-0000-${String(number).padStart(12,'0')}`
const asUser = async (userId, role = 'authenticated') => {
  await db.exec('reset role')
  await query("select set_config('request.jwt.claim.sub',$1,false)",[userId])
  await db.exec(`set role ${role}`)
}
const touch = () => query('select public.touch_profile_last_seen()')
const reject = async (operation, code) => {
  await assert.rejects(operation, error => error.code === code)
  checks++
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table public.profiles(id uuid primary key,role text,last_seen_at timestamptz);
    alter table public.profiles enable row level security;
    create table public.write_audit(id uuid);
    create function public.audit_touch() returns trigger language plpgsql as $$
    begin insert into public.write_audit values(new.id); return new; end;
    $$;
    create trigger audit_touch after update on public.profiles
      for each row execute function public.audit_touch();
    insert into public.profiles values
      ('${id(1)}','PARENT',null),('${id(2)}','ADMIN',now()-interval '1 day');
  `)
  await db.exec(readFileSync(new URL(
    '../../supabase/migrations/20261011161534_profile_last_seen_write_throttle.sql',import.meta.url
  ),'utf8'))
  const config = await one(`select prosecdef,proconfig,
    has_function_privilege('anon',oid,'EXECUTE') as anon,
    has_function_privilege('authenticated',oid,'EXECUTE') as authenticated,
    has_function_privilege('service_role',oid,'EXECUTE') as service_role
    from pg_proc where oid='public.touch_profile_last_seen()'::regprocedure`)
  check(config.prosecdef && config.proconfig.includes('search_path=""'),
    'existing definer behavior uses a fixed empty search path')
  check(!config.anon && config.authenticated && config.service_role,'live execute ACL is preserved')

  await asUser(id(1))
  await reject(() => query(`update public.profiles set last_seen_at=now() where id='${id(2)}'`),'42501')
  await touch()
  await touch()
  await touch()
  await db.exec('reset role')
  check((await one('select count(*)::int as n from public.write_audit')).n === 1,
    'repeated calls within five minutes produce exactly one physical update')
  check((await one(`select last_seen_at is not null as seen,role from public.profiles where id='${id(1)}'`)).seen,
    'a null last_seen timestamp is set')
  check((await one(`select last_seen_at < now()-interval '23 hours' as untouched from public.profiles where id='${id(2)}'`)).untouched,
    'another profile is not changed')
  check((await one(`select role from public.profiles where id='${id(1)}'`)).role === 'PARENT',
    'role and identity fields are untouched')

  await db.exec(`update public.profiles set last_seen_at=now()-interval '6 minutes' where id='${id(1)}';
    truncate public.write_audit;`)
  await asUser(id(1))
  await touch()
  await db.exec('reset role')
  check((await one('select count(*)::int as n from public.write_audit')).n === 1,
    'an expired interval permits the next update')

  await db.exec(`update public.profiles set last_seen_at=now()+interval '1 day' where id='${id(1)}';
    truncate public.write_audit;`)
  await asUser(id(1))
  await touch()
  await db.exec('reset role')
  check((await one('select count(*)::int as n from public.write_audit')).n === 0,
    'future timestamps are not moved backwards')

  await asUser(id(999))
  await touch()
  await db.exec('reset role')
  check((await one('select count(*)::int as n from public.profiles')).n === 2,
    'a missing profile does not get inserted')
  await asUser('')
  await reject(touch,'P0001')
  await asUser(id(1),'anon')
  await reject(touch,'42501')
  await asUser('','service_role')
  await reject(touch,'P0001')
  console.log(`PASS: ${checks} profile last-seen throttle PostgreSQL checks`)
} finally {
  await db.close()
}
