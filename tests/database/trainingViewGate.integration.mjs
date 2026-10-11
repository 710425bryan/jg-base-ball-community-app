// Isolated PostgreSQL only. No network or production data is used.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261011161249_training_view_permission_gate.sql')
const historical = read('supabase_training_points_migration.sql')
const definitions = read('tests/database/fixtures/trainingGateLiveFunctions.sql')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
let checks = 0
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++ }
const check = (a, label) => { assert.ok(a, label); checks++ }
const rejects = async (operation, pattern = /training:VIEW permission required/) => {
  await assert.rejects(operation, pattern); checks++
}

async function run(newline) {
  const db = new PGlite()
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows
  const one = async (sql, args = []) => (await rows(sql, args))[0]
  const asUser = async (number, role = 'authenticated') => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [number ? id(number) : ''])
    await db.exec(`set role ${role}`)
  }
  const members = () => rows('select * from public.list_my_training_members()')
  const source = newline === 'CRLF' ? definitions.replace(/\r?\n/g, '\r\n') : definitions
  const rawTables = ['training_session_settings','training_registrations','player_point_transactions','training_no_show_blocks']
  const snapshot = async () => {
    const values = []
    for (const table of [...rawTables, 'profiles', 'app_role_permissions', 'matches', 'attendance_events', 'attendance_records']) {
      values.push(await rows(`select to_jsonb(t) as data from public.${table} t order by to_jsonb(t)::text`))
    }
    return values
  }
  const deniedCalls = [
    'select * from public.list_my_training_members()',
    `select * from public.list_training_sessions('${id(101)}')`,
    `select public.create_training_registration('${id(201)}','${id(101)}',null)`,
    `select public.cancel_training_registration('${id(301)}')`,
    `select public.upsert_training_session_settings('${id(401)}',null,null,'open',10,1,false)`,
    "select public.create_training_match_with_settings('New',current_date)",
    `select * from public.list_training_admin_registrations('${id(201)}')`,
    `select public.review_training_registration('${id(301)}','selected',null)`,
    `select public.publish_training_selection('${id(201)}')`,
    `select * from public.grant_player_points(array['${id(101)}']::uuid[],1,'grant')`,
    `select * from public.list_player_point_transactions('${id(101)}')`,
    `select public.delete_player_point_transactions(array['${id(501)}']::uuid[])`,
    `select public.create_training_attendance_event('${id(201)}')`,
    'select public.get_training_registration_notification_diagnostics(5)',
    'select public.invoke_training_registration_notification_once(true,1,null)',
    'select * from public.process_training_session_automation(current_date)',
  ]
  try {
    await db.exec(read('tests/database/fixtures/trainingGateSetup.sql'))
    for (const name of ['current_profile_role', 'has_app_permission']) {
      await db.exec(source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$\\s*;`))[0])
    }
    // Reuse checked-in historical DDL/helpers/policies without replaying any
    // business functions, auto-grants from other features, or cron installation.
    await db.exec(historical.slice(historical.indexOf('create table'), historical.indexOf('drop policy if exists "team_members_select')))
    await db.exec(historical.slice(historical.indexOf('create or replace function public.is_profile_linked'), historical.indexOf('create or replace function public.list_my_training_members')))
    await db.exec('alter table public.training_session_settings add column auto_select_enabled boolean default false')
    await db.exec(source)
    await db.exec(`
      grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
      grant select on all tables in schema public to anon;
      grant execute on all functions in schema public to anon,authenticated,service_role;
      -- Test through a public definer wrapper as the deployed feed does, while
      -- executing the full real preserved feed implementation and target filter.
      create function public.test_feed() returns setof record language sql security definer as
        $$ select * from private.notification_feed_before_coach_leave(50,false) $$;
      insert into public.profiles(id,role,linked_team_member_ids) values
        ('${id(1)}','ADMIN',array['${id(101)}']::uuid[]),
        ('${id(2)}','DENIED',array['${id(101)}']::uuid[]),
        ('${id(3)}','VIEWER',array['${id(101)}']::uuid[]),
        ('${id(4)}','CRUD_ONLY',array['${id(101)}']::uuid[]),
        ('${id(5)}','MANAGER','{}'),
        ('${id(6)}','VIEWER',array['${id(101)}']::uuid[]),
        ('${id(7)}','VIEWER',array['${id(101)}']::uuid[]),
        ('${id(8)}','VIEWER',array['${id(101)}']::uuid[]),
        ('${id(9)}','VIEWER','{}'),
        ('${id(10)}','ATTENDANCE','{}');
      update public.profiles set is_active=false where id='${id(6)}';
      update public.profiles set access_start=now()+interval '1 day' where id='${id(7)}';
      update public.profiles set access_end=now()-interval '1 day' where id='${id(8)}';
      insert into public.app_role_permissions values
        ('VIEWER','training','VIEW'),('MANAGER','training','VIEW'),
        ('MANAGER','training','CREATE'),('MANAGER','training','EDIT'),('MANAGER','training','DELETE'),
        ('CRUD_ONLY','training','CREATE'),('CRUD_ONLY','training','EDIT'),('CRUD_ONLY','training','DELETE'),
        ('DENIED','TRAINING','VIEW'),('DENIED','attendance','EDIT'),('ATTENDANCE','attendance','EDIT');
      insert into public.team_members(id,name,role,team_group) values
        ('${id(101)}','Player A','球員','A'),('${id(102)}','Player B','球員','B');
      insert into public.matches(id,match_name,match_date,match_level) values
        ('${id(401)}','Future Training',current_date+10,'特訓課'),
        ('${id(402)}','Past Training',current_date-2,'特訓課');
      insert into public.training_session_settings(id,match_id,manual_status,point_cost,auto_select_enabled) values
        ('${id(201)}','${id(401)}','open',2,true),('${id(202)}','${id(402)}','open',2,false);
      insert into public.training_registrations(id,session_id,member_id,status,point_status) values
        ('${id(301)}','${id(201)}','${id(102)}','applied','none'),
        ('${id(302)}','${id(202)}','${id(101)}','selected','reserved');
      insert into public.player_point_transactions(id,member_id,delta) values
        ('${id(501)}','${id(101)}',20),('${id(502)}','${id(102)}',30);
      insert into public.training_no_show_blocks(member_id,source_session_id,status)
        values('${id(102)}','${id(202)}','waived');
      insert into public.attendance_events(id,training_session_id,title) values
        ('${id(601)}','${id(201)}','Training attendance'),('${id(602)}',null,'Normal attendance');
      insert into public.attendance_records(event_id,member_id,status) values
        ('${id(601)}','${id(101)}','出席');
      insert into public.push_dispatch_events(event_key,feature,action,title,target_user_id) values
        ('training-public','training','VIEW','public',null),
        ('training-me','training','VIEW','mine','${id(3)}'),
        ('training-other','training','VIEW','other','${id(2)}'),
        ('regular-match','matches','REMINDER','match',null);
    `)
    const before = await snapshot()
    const beforeFunctions = await rows(`select oid::regprocedure::text as signature, pg_get_function_result(oid) as result,
      prosecdef,provolatile,proconfig from pg_proc where pronamespace='public'::regnamespace order by signature`)
    // Unsupported drift fails atomically, before any permission or data changes.
    await db.exec("create or replace function public.list_my_training_members() returns table(member_id uuid,name text,role text,team_group text,point_balance integer,reserved_points integer,available_points integer,active_block_count integer) language plpgsql security definer as $$begin return; end$$")
    await rejects(db.exec(migration), /Unexpected training RPC definition/)
    await db.exec('rollback')
    equal((await one("select to_regprocedure('private.assert_training_view_permission()') as value")).value, null, 'failed migration rolls back helper')
    await db.exec(source)
    await db.exec(migration)
    equal(await snapshot(), before, 'migration preserves all role, point, registration and attendance data')
    equal(await rows(`select oid::regprocedure::text as signature, pg_get_function_result(oid) as result,
      prosecdef,provolatile,proconfig from pg_proc where pronamespace='public'::regnamespace order by signature`), beforeFunctions, 'all installed public signatures, return shapes and metadata retained')

    // The same exact 16 RPCs must reject linked/no-VIEW, CRUD-without-VIEW,
    // inactive, future access, expired access, and authenticated without a user.
    for (const user of [2,4,6,7,8,0]) {
      await asUser(user)
      for (const sql of deniedCalls) await rejects(db.query(sql))
      for (const table of rawTables) equal((await rows(`select * from public.${table}`)).length, 0, `RLS denies ${table} for ${user}`)
    }
    await asUser(2)
    await rejects(db.query(`select public.apply_training_attendance_result('${id(601)}','${id(101)}','出席')`))
    await db.query(`select public.apply_training_attendance_result('${id(602)}','${id(101)}','出席')`)
    checks++ // independent regular attendance still works without training VIEW
    for (const table of ['attendance_events','attendance_records']) equal((await rows(`select * from ${table}`)).length,0,'training-specific attendance policy requires VIEW')
    await asUser(4)
    await rejects(db.query(`insert into training_session_settings(match_id) values('${id(401)}')`), /row-level security/)
    await rejects(db.query(`insert into player_point_transactions(member_id,delta) values('${id(101)}',99)`), /row-level security/)
    equal((await rows(`update training_registrations set status='cancelled' returning id`)).length,0,'raw UPDATE denied without VIEW')
    equal((await rows('delete from training_session_settings returning id')).length,0,'raw DELETE denied without VIEW')

    await asUser(null,'anon')
    for (const sql of deniedCalls) await rejects(db.query(sql), /permission denied for function/)
    for (const sql of ['select get_training_registration_notification_config()', 'select has_due_training_registration_notifications()']) {
      await rejects(db.query(sql), /permission denied for function/)
    }
    for (const table of rawTables) equal((await rows(`select * from ${table}`)).length,0,'anonymous raw read denied')
    await asUser(3)
    for (const sql of [
      `select public.get_player_point_balance('${id(102)}')`,
      `select public.get_player_reserved_training_points('${id(102)}')`,
      `select public.get_player_available_training_points('${id(102)}')`,
      `select public.get_next_training_session_id('${id(202)}')`,
      'select get_training_registration_notification_config()',
      'select has_due_training_registration_notifications()',
    ]) await rejects(db.query(sql),/permission denied for function/)
    const own = await members()
    equal(own.map(x=>x.member_id),[id(101)],'VIEW reads linked members only')
    equal(own[0].available_points,18,'authorized RPC internal numeric calls retain real balances')
    equal((await rows(`select * from list_player_point_transactions(null)`)).map(x=>x.member_id),[id(101)],'point history remains linked only')
    await rejects(db.query(`select * from list_training_sessions('${id(102)}')`),/member not linked/)
    await rejects(db.query(`select * from list_player_point_transactions('${id(102)}')`),/member not linked/)
    await rejects(db.query(`select create_training_registration('${id(201)}','${id(102)}',null)`),/member not linked/)
    await rejects(db.query(`select cancel_training_registration('${id(301)}')`),/not cancellable/)
    const created = await one(`select * from create_training_registration('${id(201)}','${id(101)}',null)`)
    equal(created.status,'selected','VIEW + linked registration preserves auto-selection')
    equal(created.point_status,'reserved','VIEW + linked registration reserves points')
    const sessions = await rows(`select * from list_training_sessions('${id(101)}')`)
    check(sessions[0].auto_select_enabled !== undefined,'latest session return fields preserved')
    equal((await one('select * from cancel_training_registration($1)',[created.id])).status,'cancelled','VIEW + linked cancellation works')
    await rejects(db.query(`select * from list_training_admin_registrations('${id(201)}')`),/management permission required/)
    await rejects(db.query(`select * from grant_player_points(array['${id(101)}']::uuid[],1,null)`),/CREATE or EDIT permission required/)
    await asUser(9)
    equal(await members(),[],'VIEW without linked members does not get personal data')
    await rejects(db.query(`select create_training_registration('${id(201)}','${id(101)}',null)`),/member not linked/)
    await asUser(5)
    check((await rows(`select * from list_training_admin_registrations('${id(201)}')`)).length > 0,'VIEW+CRUD manager retains management')
    const granted = await rows(`select * from grant_player_points(array['${id(102)}']::uuid[],1,'test')`)
    equal(granted.length,1,'VIEW+CRUD can grant points')
    equal((await one('select delete_player_point_transactions($1::uuid[]) as count',[[granted[0].id]])).count,1,'VIEW+DELETE can remove eligible manual grant')
    await asUser(1)
    check((await rows(`select * from list_training_sessions(null)`)).length > 0,'active ADMIN bypass works without stored training rows')

    // Execute real feed through owner context, as public get_notification_feed
    // does. Ownership identity is still auth.uid(), not the function owner.
    const readFeedAs = async user => {
      await asUser(user)
      return rows('select * from public.test_feed() as f(id text,source text,title text,body text,created_at timestamptz,link text,highlight_member_id uuid)')
    }
    equal((await readFeedAs(2)).filter(x=>x.source==='training'),[],'linked targeted notification denied without VIEW')
    equal((await readFeedAs(3)).filter(x=>x.source==='training').map(x=>x.id).sort(),['training-me','training-public'],'VIEW feed retains target ownership')
    check((await readFeedAs(2)).some(x=>x.id),'non-training notification sources preserved')
    await db.exec('reset role')
    await db.exec("delete from app_role_permissions where role_key='VIEWER' and feature='training'")
    await asUser(3)
    await rejects(members())
    await rejects(db.query('select cancel_training_registration($1)',[created.id]))
    equal((await readFeedAs(3)).filter(x=>x.source==='training'),[],'VIEW revocation applies immediately to feed')

    // Server settlement still processes existing history after user VIEW removal.
    await asUser(null,'service_role')
    check((await one('select get_training_registration_notification_config() as data')).data.function_url,'server configuration remains available to service_role')
    equal(typeof (await one('select has_due_training_registration_notifications() as value')).value,'boolean','server due-work probe remains callable')
    equal((await one(`select get_player_point_balance('${id(101)}') as balance`)).balance,20,'server numeric helper remains executable')
    equal((await one('select * from process_training_session_automation(current_date)')).spent_count,1,'service-role automation still settles existing reserved registration')
    equal((await one(`select get_player_point_balance('${id(101)}') as balance`)).balance,18,'existing settlement arithmetic remains unchanged')
    equal((await one('select * from process_training_session_automation(current_date)')).spent_count,0,'settlement remains idempotent')
    await db.exec('reset role')
    equal((await one('select * from process_training_session_automation(current_date)')).spent_count,0,'owner cron context remains callable')
    for (const table of rawTables) equal((await one(`select count(*)::integer as n from pg_policies where tablename=$1 and policyname='training_view_required' and permissive='RESTRICTIVE'`,[table])).n,1,'restrictive gate is present')
    equal((await one("select has_function_privilege('anon','public.process_training_session_automation(date)','execute') as can")).can,false,'anonymous automation ACL revoked')
    console.log(`${newline}: training VIEW gate passed`)
  } finally { await db.close() }
}

try {
  for (const newline of ['LF','CRLF']) await run(newline)
  console.log(`training VIEW gate: ${checks} checks passed`)
} catch (error) {
  console.error(error.message, error.detail || '', error.where || '')
  process.exitCode = 1
}
