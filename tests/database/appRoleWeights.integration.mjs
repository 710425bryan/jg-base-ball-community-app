// Runs only isolated PostgreSQL; never opens a remote Supabase connection.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++ }
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++ }
const query = async (sql, parameters = []) => (await db.query(sql, parameters)).rows
const readSource = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const extractFunction = (path, name) => {
  const definition = readSource(path).match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'
  ))?.[0]
  assert.ok(definition, `missing real function ${name}`)
  return definition
}
const asUser = async (user, role = 'authenticated') => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user])
  await db.exec(`set role ${role}`)
}
const updateWeight = (key, weight) => query('select * from public.update_app_role_weight($1, $2)', [key, weight])
const roleRows = () => query('select * from public.app_roles order by role_key')
const nonWeightRows = () => query('select role_key, role_name, is_system, created_at from public.app_roles order by role_key')
const permissionRows = () => query('select * from public.app_role_permissions order by role_key, feature, action')
const reject = async (operation, code, message) => {
  await assert.rejects(operation, error => error.code === code && (!message || error.message.includes(message)))
  checks++
}

try {
  // The baseline role keys, weights, columns and ADMIN-only RLS were inspected
  // read-only on 2026-10-03; user IDs and permission data are synthetic.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (
      id uuid primary key, role text, is_active boolean not null default true,
      access_start timestamptz, access_end timestamptz
    );
    create table public.app_roles (
      role_key text primary key, role_name text not null, is_system boolean default false,
      weight integer default 99, created_at timestamptz default timezone('utc', now())
    );
    create table public.app_role_permissions (
      id uuid primary key default gen_random_uuid(),
      role_key text references public.app_roles(role_key) on delete cascade,
      feature text not null, action text not null,
      created_at timestamptz default timezone('utc', now()), unique(role_key, feature, action)
    );
    grant select on public.profiles to authenticated;
    grant select, insert, update, delete on public.app_roles, public.app_role_permissions to authenticated;
    alter table public.app_roles enable row level security;
    alter table public.app_role_permissions enable row level security;
    create policy role_read on public.app_roles for select to authenticated using (true);
    create policy role_admin on public.app_roles for all to authenticated using (exists (
      select 1 from public.profiles where id = auth.uid() and role = 'ADMIN'
    ));
    create policy permission_read on public.app_role_permissions for select to authenticated using (true);
    create policy permission_admin on public.app_role_permissions for all to authenticated using (exists (
      select 1 from public.profiles where id = auth.uid() and role = 'ADMIN'
    ));
    insert into public.profiles(id, role) values
      ('${id(1)}', 'ADMIN'), ('${id(2)}', 'MANAGER'), ('${id(3)}', 'MEMBER'),
      ('${id(4)}', 'ADMIN'), ('${id(5)}', 'ADMIN'), ('${id(6)}', 'ADMIN');
    update public.profiles set is_active = false where id = '${id(4)}';
    update public.profiles set access_start = now() + interval '1 day' where id = '${id(5)}';
    update public.profiles set access_end = now() - interval '1 day' where id = '${id(6)}';
    insert into public.app_roles(role_key, role_name, is_system, weight, created_at) values
      ('ADMIN', '系統管理員', true, 1, '2020-01-01'),
      ('MANAGER', '管理員', true, 2, '2020-01-01'),
      ('FINANCE', '財務', true, 3, '2020-01-01'),
      ('HEAD_COACH', '總教練', true, 4, '2020-01-01'),
      ('COACH', '教練', true, 5, '2020-01-01'),
      ('COMMITTEE', '委員', true, 6, '2020-01-01'),
      ('MEMBER', '一般成員', true, 7, '2020-01-01'),
      ('SCHEDULINGCOACH', '排班教練', false, 99, '2020-01-01'),
      ('CUSTOM_ROLE', '自訂角色', false, 42, '2020-01-01'),
      ('OTHER_SCHEDULER', '排班教練', false, 55, '2020-01-01'),
      ('WEIGHTLESS', '舊空值角色', false, null, '2020-01-01');
    insert into public.app_role_permissions(role_key, feature, action, created_at) values
      ('ADMIN', 'players', 'VIEW', '2020-01-01'),
      ('MANAGER', 'players', 'VIEW', '2020-01-01'),
      ('MANAGER', 'users', 'EDIT', '2020-01-01'),
      ('MANAGER', 'matches', 'HEALTH_ALERT', '2020-01-01'),
      ('CUSTOM_ROLE', 'vendors', 'VIEW', '2020-01-01'),
      ('SCHEDULINGCOACH', 'coach_schedules', 'VIEW', '2020-01-01');
  `)
  await db.exec(extractFunction('supabase_profile_access_control_migration.sql', 'current_profile_role'))
  await db.exec(extractFunction('supabase_access_control_rls_migration.sql', 'has_app_permission'))
  await db.exec(readSource('supabase/migrations/20261002151942_create_app_role_with_permission_copy.sql'))
  const existingCreateFunction = (await query("select pg_get_functiondef('public.create_app_role(text,text,text)'::regprocedure) as definition"))[0].definition
  const originalNonWeight = await nonWeightRows()
  const originalPermissions = await permissionRows()
  await db.exec(readSource('supabase/migrations/20261002170401_app_role_display_weights.sql'))

  equal(await query('select role_key, weight from public.app_roles order by weight nulls last, role_key'), [
    { role_key: 'ADMIN', weight: 1 }, { role_key: 'MANAGER', weight: 9 },
    { role_key: 'HEAD_COACH', weight: 10 }, { role_key: 'SCHEDULINGCOACH', weight: 15 },
    { role_key: 'COACH', weight: 16 }, { role_key: 'FINANCE', weight: 20 },
    { role_key: 'COMMITTEE', weight: 21 }, { role_key: 'CUSTOM_ROLE', weight: 42 },
    { role_key: 'OTHER_SCHEDULER', weight: 55 }, { role_key: 'MEMBER', weight: 99 },
    { role_key: 'WEIGHTLESS', weight: null }
  ], 'migration sets exactly the eight defaults and keeps all other role weights')
  equal(await nonWeightRows(), originalNonWeight, 'defaults preserve every non-weight role column')
  equal(await permissionRows(), originalPermissions, 'defaults preserve every saved permission')
  equal((await query("select pg_get_functiondef('public.create_app_role(text,text,text)'::regprocedure) as definition"))[0].definition,
    existingCreateFunction, 'weight migration does not replace the original role creation RPC')
  const config = (await query(`
    select prosecdef, proconfig,
      has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated,
      has_function_privilege('anon', oid, 'EXECUTE') as anon,
      has_function_privilege('service_role', oid, 'EXECUTE') as service_role
    from pg_proc where oid = 'public.update_app_role_weight(text,integer)'::regprocedure
  `))[0]
  check(!config.prosecdef && config.proconfig.includes('search_path=""'), 'weight RPC is security invoker with a fixed empty path')
  check(config.authenticated && !config.anon && !config.service_role, 'only authenticated receives EXECUTE')

  const beforeRejects = await roleRows()
  for (const user of [id(2), id(3), id(4), id(5), id(6), id(7), '']) {
    await asUser(user)
    await reject(() => updateWeight('ADMIN', 88), '42501', '有效管理員')
    equal(await roleRows(), beforeRejects, 'unauthorized update preserves every role')
    equal(await permissionRows(), originalPermissions, 'unauthorized update preserves every permission')
  }
  await asUser(id(1), 'anon')
  await reject(() => updateWeight('ADMIN', 88), '42501', 'permission denied')
  await asUser('', 'service_role')
  await reject(() => updateWeight('ADMIN', 88), '42501', 'permission denied')

  await asUser(id(1))
  for (const weight of [null, 0, -1, -2147483648]) {
    await reject(() => updateWeight('ADMIN', weight), '22023', '正整數')
    equal(await roleRows(), beforeRejects, 'invalid weight preserves all roles')
  }
  await reject(() => updateWeight('ADMIN', 1.5), '22P02')
  await reject(() => updateWeight('ADMIN', 2147483648), '22003')
  for (const key of [null, '', '   ']) {
    await reject(() => updateWeight(key, 5), '22023', '指定')
    equal(await roleRows(), beforeRejects, 'invalid role key preserves all roles')
  }
  await reject(() => updateWeight('DELETED_ROLE', 5), '22023', '找不到角色')
  equal(await roleRows(), beforeRejects, 'unknown role does not write any row')

  const admin = (await updateWeight(' ADMIN ', 200))[0]
  check(admin.role_key === 'ADMIN' && admin.weight === 200, 'ADMIN ordering is editable and role key is trimmed')
  equal(await nonWeightRows(), originalNonWeight, 'editing ADMIN weight preserves all other role metadata')
  equal(await permissionRows(), originalPermissions, 'editing ADMIN weight never changes permissions')
  check((await query("select public.has_app_permission('new_feature', 'EDIT') as allowed"))[0].allowed,
    'ADMIN remains authorized after its display weight changes')
  check((await updateWeight('CUSTOM_ROLE', 1))[0].weight === 1, 'a custom role can move before system roles')
  check((await updateWeight('CUSTOM_ROLE', 2147483647))[0].weight === 2147483647, 'any positive SQL integer up to the type limit is valid')
  check((await updateWeight('CUSTOM_ROLE', 9))[0].weight === 9, 'a custom role may share a weight with another role')
  check((await updateWeight('CUSTOM_ROLE', 9))[0].weight === 9, 're-saving the same weight succeeds')
  check((await updateWeight('WEIGHTLESS', 35))[0].weight === 35, 'a legacy null weight can be corrected')
  equal(await nonWeightRows(), originalNonWeight, 'all manual weight changes preserve all other columns')
  equal(await permissionRows(), originalPermissions, 'all manual weight changes preserve saved permission rows')

  // A database failure or stricter existing RLS must not cause partial updates.
  await db.exec(`reset role;
    create function public.reject_test_role_weight() returns trigger language plpgsql as $$
    begin
      if new.role_key = 'FINANCE' and new.weight = 777 then
        raise exception 'simulated update failure' using errcode = '23514';
      end if;
      return new;
    end;
    $$;
    create trigger reject_test_role_weight before update on public.app_roles
      for each row execute function public.reject_test_role_weight();
    create policy role_weight_guard on public.app_roles as restrictive for update to authenticated
      using (true) with check (weight <> 778);
  `)
  await asUser(id(1))
  const beforeDatabaseFailure = await roleRows()
  await reject(() => updateWeight('FINANCE', 777), '23514', 'simulated update failure')
  equal(await roleRows(), beforeDatabaseFailure, 'database failure preserves every role')
  await reject(() => updateWeight('FINANCE', 778), '42501', 'row-level security')
  equal(await roleRows(), beforeDatabaseFailure, 'security invoker respects RLS and rolls back rejected updates')
  equal(await permissionRows(), originalPermissions, 'database failures preserve every saved permission')

  await updateWeight('MANAGER', 1)
  await asUser(id(2))
  check(!(await query("select public.has_app_permission('new_feature', 'EDIT') as allowed"))[0].allowed,
    'a low display weight never grants ADMIN bypass')
  await reject(() => updateWeight('ADMIN', 1), '42501')

  // Both migrations work together: future custom roles still use the table's
  // weight default and permission copies do not inherit the source weight.
  await asUser(id(1))
  const copied = (await query("select * from public.create_app_role('NEW_COPY', '新增副本', 'MANAGER')"))[0]
  check(copied.weight === 99 && copied.is_system === false, 'created role keeps default 99 after weight migration')
  equal(await query("select feature, action from public.app_role_permissions where role_key='NEW_COPY' order by feature, action"),
    await query("select feature, action from public.app_role_permissions where role_key='MANAGER' order by feature, action"),
    'existing role creation still copies the complete saved permission set')
  check((await updateWeight('NEW_COPY', 12))[0].weight === 12, 'a newly created role can immediately receive a manual weight')
  await reject(() => query("select * from public.create_app_role('ADMIN_COPY', '管理員副本', 'ADMIN')"), '22023', '最高權限')
  check((await query("select count(*)::int as n from public.app_roles where role_key = 'ADMIN_COPY'"))[0].n === 0,
    'original creation rollback and ADMIN copy rule remain intact')
  equal((await permissionRows()).filter(row => row.role_key !== 'NEW_COPY'), originalPermissions,
    'combined create and weight changes never modify pre-existing permissions')

  console.log(`App role weights SQL: ${checks} checks passed`)
} catch (error) {
  console.error(error.message, error.internalQuery || '')
  process.exitCode = 1
} finally {
  await db.close()
}
