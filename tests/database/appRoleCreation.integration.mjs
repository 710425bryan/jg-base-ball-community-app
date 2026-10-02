// Runs only isolated PostgreSQL; never opens a remote Supabase connection.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++ }
const query = async (sql, parameters = []) => (await db.query(sql, parameters)).rows
const asUser = async (user, role = 'authenticated') => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user])
  await db.exec(`set role ${role}`)
}
const readSource = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const extractFunction = (path, name) => {
  const definition = readSource(path).match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'
  ))?.[0]
  assert.ok(definition, `missing real function ${name}`)
  return definition
}
const createRole = (key, name, source = null) => query(
  'select * from public.create_app_role($1, $2, $3)', [key, name, source]
)
const permissions = key => query(
  'select feature, action from public.app_role_permissions where role_key = $1 order by feature, action', [key]
)
const reject = async (operation, code, message) => {
  await assert.rejects(operation, error => error.code === code && (!message || error.message.includes(message)))
  checks++
}
const noRole = async key => {
  check((await query('select count(*)::int as n from public.app_roles where role_key = $1', [key]))[0].n === 0,
    `failed creation leaves no role ${key}`)
  check((await permissions(key)).length === 0, `failed creation leaves no permissions ${key}`)
}

try {
  // Columns, defaults, constraints and ADMIN-only write RLS mirror the existing
  // role tables inspected read-only on 2026-10-02. Data is entirely synthetic.
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
    create policy "Enable read access for all authenticated users" on public.app_roles
      for select to authenticated using (true);
    create policy "Enable all access for ADMIN" on public.app_roles
      for all to authenticated using (exists (
        select 1 from public.profiles where id = auth.uid() and role = 'ADMIN'
      ));
    create policy "Enable read access for all authenticated users" on public.app_role_permissions
      for select to authenticated using (true);
    create policy "Enable all access for ADMIN" on public.app_role_permissions
      for all to authenticated using (exists (
        select 1 from public.profiles where id = auth.uid() and role = 'ADMIN'
      ));
    insert into public.profiles(id, role) values
      ('${id(1)}', 'ADMIN'), ('${id(2)}', 'MANAGER'), ('${id(3)}', 'PARENT'),
      ('${id(4)}', 'ADMIN'), ('${id(5)}', 'ADMIN'), ('${id(6)}', 'ADMIN');
    update public.profiles set is_active = false where id = '${id(4)}';
    update public.profiles set access_start = now() + interval '1 day' where id = '${id(5)}';
    update public.profiles set access_end = now() - interval '1 day' where id = '${id(6)}';
    insert into public.app_roles(role_key, role_name, is_system, weight, created_at) values
      ('ADMIN', '管理員', true, 0, '2020-01-01'),
      ('MANAGER', '經理', true, 1, '2020-01-01'),
      ('CUSTOM_SOURCE', '自訂來源', false, 2, '2020-01-01'),
      ('EMPTY_SOURCE', '無權限來源', false, 3, '2020-01-01');
    insert into public.app_role_permissions(role_key, feature, action, created_at) values
      ('ADMIN', 'players', 'VIEW', '2020-01-01'),
      ('MANAGER', 'players', 'VIEW', '2020-01-01'),
      ('MANAGER', 'players', 'EDIT', '2020-01-01'),
      ('MANAGER', 'users', 'EDIT', '2020-01-01'),
      ('MANAGER', 'matches', 'HEALTH_ALERT', '2020-01-01'),
      ('CUSTOM_SOURCE', 'vendors', 'VIEW', '2020-01-01');
  `)
  await db.exec(extractFunction('supabase_profile_access_control_migration.sql', 'current_profile_role'))
  await db.exec(extractFunction('supabase_access_control_rls_migration.sql', 'has_app_permission'))
  await db.exec(readSource('supabase/migrations/20261002151942_create_app_role_with_permission_copy.sql'))

  const functionConfig = (await query(`
    select prosecdef, proconfig,
      has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated,
      has_function_privilege('anon', oid, 'EXECUTE') as anon,
      has_function_privilege('service_role', oid, 'EXECUTE') as service_role
    from pg_proc where oid = 'public.create_app_role(text,text,text)'::regprocedure
  `))[0]
  check(!functionConfig.prosecdef, 'RPC uses caller privileges and cannot bypass existing RLS')
  check(functionConfig.proconfig.includes('search_path=""'), 'RPC fixes the search path to empty')
  check(functionConfig.authenticated && !functionConfig.anon && !functionConfig.service_role,
    'only authenticated has execute privilege')

  for (const [user, label] of [[2, 'users:EDIT manager'], [3, 'parent'], [4, 'inactive ADMIN'],
    [5, 'future ADMIN'], [6, 'expired ADMIN'], [7, 'missing profile']]) {
    await asUser(id(user))
    await reject(() => createRole('UNAUTHORIZED', '不可建立', 'MANAGER'), '42501', '有效管理員')
    await noRole('UNAUTHORIZED')
    check((await query('select public.current_profile_role() as role'))[0].role !== 'ADMIN', label)
  }
  await asUser('')
  await reject(() => createRole('NO_SESSION', '無登入'), '42501')
  await noRole('NO_SESSION')
  await asUser(id(1), 'anon')
  await reject(() => createRole('ANON_ATTEMPT', '匿名'), '42501', 'permission denied')
  await asUser('', 'service_role')
  await reject(() => createRole('SERVICE_ATTEMPT', '服務'), '42501', 'permission denied')

  await asUser(id(1))
  const blankRole = (await query("select * from public.create_app_role('BLANK_ROLE', '空白角色')"))[0]
  check(blankRole.role_key === 'BLANK_ROLE' && blankRole.role_name === '空白角色',
    'valid ADMIN can create a role with the default no-copy argument')
  check(blankRole.is_system === false && blankRole.weight === 99, 'new role keeps custom flag and table weight default')
  check((await permissions('BLANK_ROLE')).length === 0, 'no-copy starts with no saved permissions')
  const trimmedRole = (await createRole(' TRIMMED_ROLE ', ' 修剪角色 ', '   '))[0]
  check(trimmedRole.role_key === 'TRIMMED_ROLE' && trimmedRole.role_name === '修剪角色', 'role values trim surrounding spaces')
  check((await permissions('TRIMMED_ROLE')).length === 0, 'blank source means no copy')

  for (const key of [null, '', '  ', 'lowercase', 'ROLE1', 'BAD-ROLE']) {
    await reject(() => createRole(key, '錯誤識別碼'), '22023', '角色識別碼')
  }
  for (const name of [null, '', '  ']) {
    await reject(() => createRole('INVALID_NAME', name), '22023', '顯示名稱')
    await noRole('INVALID_NAME')
  }
  await reject(() => createRole('MISSING_SOURCE', '不存在來源', 'DELETED_ROLE'), '22023', '來源角色不存在')
  await noRole('MISSING_SOURCE')
  await reject(() => createRole('ADMIN_COPY', '管理員副本', ' ADMIN '), '22023', '最高權限無法複製')
  await noRole('ADMIN_COPY')

  const sourcePermissions = await permissions('MANAGER')
  const sourceRows = await query("select id, created_at from public.app_role_permissions where role_key = 'MANAGER'")
  const copiedRole = (await createRole('MANAGER_COPY', '經理副本', ' MANAGER '))[0]
  assert.deepEqual(await permissions('MANAGER_COPY'), sourcePermissions); checks++
  check(copiedRole.is_system === false && copiedRole.weight === 99,
    'copying a system source does not copy its system flag or weight')
  check(new Date(copiedRole.created_at).getFullYear() !== 2020, 'role creation time is new')
  const copiedRows = await query("select id, created_at from public.app_role_permissions where role_key = 'MANAGER_COPY'")
  check(copiedRows.every(row => !sourceRows.some(source => source.id === row.id)), 'permissions have new unique IDs')
  check(copiedRows.every(row => new Date(row.created_at).getFullYear() !== 2020), 'permissions have new creation times')
  assert.deepEqual(await permissions('MANAGER'), sourcePermissions); checks++
  await createRole('CUSTOM_COPY', '自訂角色副本', 'CUSTOM_SOURCE')
  assert.deepEqual(await permissions('CUSTOM_COPY'), await permissions('CUSTOM_SOURCE')); checks++
  await createRole('EMPTY_COPY', '無權限副本', 'EMPTY_SOURCE')
  check((await permissions('EMPTY_COPY')).length === 0, 'a source with no permissions still creates successfully')

  await reject(() => createRole('MANAGER_COPY', '重複副本', 'CUSTOM_SOURCE'), '23505')
  assert.deepEqual(await permissions('MANAGER_COPY'), sourcePermissions); checks++
  check((await query("select role_name from public.app_roles where role_key = 'MANAGER_COPY'"))[0].role_name === '經理副本',
    'duplicate creation cannot overwrite the existing role')

  // Simulate an INSERT failure after role creation, proving full rollback.
  await db.exec(`reset role;
    create function public.reject_test_role_permission() returns trigger language plpgsql as $$
    begin
      if new.role_key = 'BROKEN_COPY' and new.feature = 'users' then
        raise exception 'simulated copy failure' using errcode = '23514';
      end if;
      return new;
    end;
    $$;
    create trigger reject_test_role_permission before insert on public.app_role_permissions
      for each row execute function public.reject_test_role_permission();
    create policy copy_permission_insert_guard on public.app_role_permissions as restrictive
      for insert to authenticated with check (role_key <> 'RLS_DENIED_COPY');
  `)
  await asUser(id(1))
  await reject(() => createRole('BROKEN_COPY', '失敗副本', 'MANAGER'), '23514', 'simulated copy failure')
  await noRole('BROKEN_COPY')
  await reject(() => createRole('RLS_DENIED_COPY', 'RLS 拒絕副本', 'MANAGER'), '42501', 'row-level security')
  await noRole('RLS_DENIED_COPY')
  assert.deepEqual(await permissions('MANAGER'), sourcePermissions); checks++

  await db.exec("delete from public.app_role_permissions where role_key = 'MANAGER' and feature = 'players'")
  assert.deepEqual(await permissions('MANAGER_COPY'), sourcePermissions); checks++
  await db.exec("delete from public.app_role_permissions where role_key = 'CUSTOM_COPY'")
  check((await permissions('CUSTOM_SOURCE')).length === 1, 'target permission edits do not change source permissions')
  await db.exec("delete from public.app_roles where role_key = 'CUSTOM_SOURCE'")
  check((await query("select count(*)::int as n from public.app_roles where role_key = 'CUSTOM_COPY'"))[0].n === 1,
    'deleting the source does not delete the target role')
  await db.exec(`reset role; insert into public.profiles(id, role) values ('${id(8)}', 'MANAGER_COPY')`)
  await asUser(id(8))
  check((await query("select public.has_app_permission('players', 'EDIT') as allowed"))[0].allowed,
    'copied saved permission grants the target role the same normal feature action')
  check(!(await query("select public.has_app_permission('unknown_future_feature', 'EDIT') as allowed"))[0].allowed,
    'copying permissions never creates an ADMIN bypass')
  await reject(() => createRole('COPY_PRIVILEGE_ESCALATION', '不能管理角色'), '42501')
  await noRole('COPY_PRIVILEGE_ESCALATION')

  console.log(`App role creation SQL: ${checks} checks passed`)
} catch (error) {
  console.error(error.message, error.internalQuery || '')
  process.exitCode = 1
} finally {
  await db.close()
}
