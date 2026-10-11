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
const updateName = (key, name) => query('select * from public.update_app_role_name($1, $2)', [key, name])
const roleRows = () => query('select * from public.app_roles order by role_key')
const otherRoleColumns = () => query('select role_key, weight, is_system, created_at from public.app_roles order by role_key')
const permissionRows = () => query('select * from public.app_role_permissions order by role_key, feature, action')
const profileRows = () => query('select * from public.profiles order by id')
const reject = async (operation, code, message) => {
  await assert.rejects(operation, error => error.code === code && (!message || error.message.includes(message)))
  checks++
}

try {
  // Reuse the existing role weights test's role schema and ADMIN-only RLS.
  // All profiles, permissions and names in this fixture are synthetic.
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
      ('${id(4)}', 'ADMIN'), ('${id(5)}', 'ADMIN'), ('${id(6)}', 'ADMIN'),
      ('${id(8)}', 'CUSTOM_ROLE');
    update public.profiles set is_active = false where id = '${id(4)}';
    update public.profiles set access_start = now() + interval '1 day' where id = '${id(5)}';
    update public.profiles set access_end = now() - interval '1 day' where id = '${id(6)}';
    insert into public.app_roles(role_key, role_name, is_system, weight, created_at) values
      ('ADMIN', '系統管理員', true, 1, '2020-01-01'),
      ('MANAGER', '管理員', true, 9, '2020-01-01'),
      ('FINANCE', '財務', true, 20, '2020-01-01'),
      ('COACH', '教練', true, 16, '2020-01-01'),
      ('MEMBER', '一般成員', true, 99, '2020-01-01'),
      ('SCHEDULINGCOACH', '排班教練', false, 15, '2020-01-01'),
      ('CUSTOM_ROLE', '自訂角色', false, 42, '2020-01-01');
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
  await db.exec(readSource('supabase/migrations/20261002170401_app_role_display_weights.sql'))
  const existingFunctions = await query(`
    select oid::regprocedure::text as signature, pg_get_functiondef(oid) as definition
    from pg_proc where oid in (
      'public.create_app_role(text,text,text)'::regprocedure,
      'public.update_app_role_weight(text,integer)'::regprocedure
    ) order by signature
  `)
  const originalRoles = await roleRows()
  const originalOtherColumns = await otherRoleColumns()
  const originalPermissions = await permissionRows()
  const originalProfiles = await profileRows()
  await db.exec(readSource('supabase/migrations/20261011150448_app_role_display_names.sql'))

  equal(await roleRows(), originalRoles, 'migration does not rename or otherwise modify any existing role')
  equal(await permissionRows(), originalPermissions, 'migration preserves every saved permission')
  equal(await profileRows(), originalProfiles, 'migration preserves every account and its role assignment')
  equal(await query(`
    select oid::regprocedure::text as signature, pg_get_functiondef(oid) as definition
    from pg_proc where oid in (
      'public.create_app_role(text,text,text)'::regprocedure,
      'public.update_app_role_weight(text,integer)'::regprocedure
    ) order by signature
  `), existingFunctions, 'migration preserves both existing role management RPCs')
  const config = (await query(`
    select prosecdef, proconfig,
      has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated,
      has_function_privilege('anon', oid, 'EXECUTE') as anon,
      has_function_privilege('service_role', oid, 'EXECUTE') as service_role
    from pg_proc where oid = 'public.update_app_role_name(text,text)'::regprocedure
  `))[0]
  check(!config.prosecdef && config.proconfig.includes('search_path=""'), 'name RPC is security invoker with an empty search path')
  check(config.authenticated && !config.anon && !config.service_role, 'only authenticated receives EXECUTE')

  for (const user of [id(2), id(3), id(4), id(5), id(6), id(7), '']) {
    await asUser(user)
    await reject(() => updateName('ADMIN', '改名'), '42501', '有效管理員')
    equal(await roleRows(), originalRoles, 'unauthorized update preserves every role')
  }
  await asUser(id(1), 'anon')
  await reject(() => updateName('ADMIN', '改名'), '42501', 'permission denied')
  await asUser('', 'service_role')
  await reject(() => updateName('ADMIN', '改名'), '42501', 'permission denied')

  await asUser(id(1))
  for (const name of [null, '', '   ', '\t\n']) {
    await reject(() => updateName('ADMIN', name), '22023', '請輸入')
  }
  for (const key of [null, '', '   ']) {
    await reject(() => updateName(key, '角色新名稱'), '22023', '請指定')
  }
  for (const key of ['DELETED_ROLE', 'admin']) {
    await reject(() => updateName(key, '角色新名稱'), '22023', '找不到角色')
  }
  for (const name of ['中'.repeat(101), '⚾'.repeat(101), '😀'.repeat(101)]) {
    await reject(() => updateName('ADMIN', name), '22023', '100 字')
  }
  equal(await roleRows(), originalRoles, 'invalid names or identifiers never update any row')

  const admin = (await updateName(' ADMIN ', '  平台維護者  '))[0]
  equal(admin, { ...originalRoles.find(row => row.role_key === 'ADMIN'), role_name: '平台維護者' },
    'ADMIN can be renamed, surrounding spaces are trimmed, and all other metadata is retained')
  check((await query("select public.current_profile_role() as role"))[0].role === 'ADMIN',
    'renaming ADMIN does not change its account role identifier')
  check((await query("select public.has_app_permission('new_feature', 'EDIT') as allowed"))[0].allowed,
    'ADMIN retains its permission bypass after its display name changes')
  check((await updateName('COACH', '帶隊教練'))[0].role_name === '帶隊教練', 'a system role can be renamed')
  check((await updateName('CUSTOM_ROLE', '自訂顯示名称'))[0].role_name === '自訂顯示名称', 'a custom role can be renamed')
  for (const name of ['中'.repeat(100), '😀'.repeat(100)]) {
    check((await updateName('CUSTOM_ROLE', name))[0].role_name === name,
      'a 100-codepoint display name is accepted without truncating astral characters')
  }
  check((await updateName('CUSTOM_ROLE', '帶隊教練'))[0].role_name === '帶隊教練',
    'duplicate display names are accepted because role identifiers remain distinct')
  check((await updateName('CUSTOM_ROLE', '帶隊教練'))[0].role_name === '帶隊教練', 're-saving the same display name succeeds')
  await updateName('MANAGER', 'ADMIN')
  equal(await otherRoleColumns(), originalOtherColumns, 'all name edits preserve role keys, weights, system flags and timestamps')
  equal(await permissionRows(), originalPermissions, 'all name edits preserve the complete saved permission set')
  equal(await profileRows(), originalProfiles, 'all name edits preserve every account role assignment')

  await asUser(id(2))
  check((await query("select public.current_profile_role() as role"))[0].role === 'MANAGER',
    'an ADMIN display name never changes a manager account role')
  check(!(await query("select public.has_app_permission('new_feature', 'EDIT') as allowed"))[0].allowed,
    'renaming a role to ADMIN never grants the ADMIN bypass')
  check((await query("select public.has_app_permission('players', 'VIEW') as allowed"))[0].allowed,
    'renamed roles retain their own saved permissions')
  await reject(() => updateName('ADMIN', '再次改名'), '42501', '有效管理員')
  await asUser(id(8))
  check((await query("select public.has_app_permission('vendors', 'VIEW') as allowed"))[0].allowed,
    'a custom role with a duplicate name retains only its own permissions')
  check(!(await query("select public.has_app_permission('coach_schedules', 'VIEW') as allowed"))[0].allowed,
    'a display name does not import permissions from another role')

  await db.exec(`reset role;
    create function public.reject_test_role_name() returns trigger language plpgsql as $$
    begin
      if new.role_name = '觸發失敗' then
        raise exception 'simulated update failure' using errcode = '23514';
      end if;
      return new;
    end;
    $$;
    create trigger reject_test_role_name before update on public.app_roles
      for each row execute function public.reject_test_role_name();
    create policy role_name_guard on public.app_roles as restrictive for update to authenticated
      using (role_key <> 'SCHEDULINGCOACH') with check (role_name <> 'RLS拒絕');
  `)
  await asUser(id(1))
  const beforeDatabaseFailure = await roleRows()
  await reject(() => updateName('FINANCE', '觸發失敗'), '23514', 'simulated update failure')
  equal(await roleRows(), beforeDatabaseFailure, 'a database error rolls back the entire role update')
  await reject(() => updateName('FINANCE', 'RLS拒絕'), '42501', 'row-level security')
  equal(await roleRows(), beforeDatabaseFailure, 'security invoker preserves RLS WITH CHECK restrictions')
  await reject(() => updateName('SCHEDULINGCOACH', '禁止更新'), '22023', '找不到角色')
  equal(await roleRows(), beforeDatabaseFailure, 'security invoker preserves RLS USING restrictions')
  equal(await permissionRows(), originalPermissions, 'rejected database writes preserve every permission')
  equal(await profileRows(), originalProfiles, 'rejected database writes preserve every account')

  console.log(`App role names SQL: ${checks} checks passed`)
} catch (error) {
  console.error(error.message, error.internalQuery || '')
  process.exitCode = 1
} finally {
  await db.close()
}
