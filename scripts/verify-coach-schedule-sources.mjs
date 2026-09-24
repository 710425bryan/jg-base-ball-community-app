// Isolated PostgreSQL regression; never connects to a remote database.
// node scripts/verify-coach-schedule-sources.mjs <pglite-dir>/dist/index.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '@electric-sql/pglite')
const db = new PGlite()
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20260924043936_coach_schedule_program_source_integrity.sql')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const query = async sql => (await db.query(sql)).rows
let checks = 0
const check = (condition, message) => { assert.ok(condition, message); checks++ }
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.has_app_permission(text, text) returns boolean language sql stable as
      $$ select coalesce(current_setting('test.permission', true), '') = 'ADMIN' $$;
    create table profiles(id uuid primary key, name text, nickname text, email text, role text,
      avatar_url text, is_active boolean default true, access_start timestamptz, access_end timestamptz);
    create table app_role_permissions(role_key text, feature text, action text, unique(role_key, feature, action));
    create table training_program_settings(program_key text primary key, label text);
    create table training_location_sessions(id uuid primary key, program_key text, training_date date,
      title text, start_time text, end_time text, status text default 'published', note text);
    create table training_location_session_venues(id uuid primary key, session_id uuid references training_location_sessions(id) on delete cascade,
      training_date date, title text, start_time text, end_time text, venue_name text, venue_maps_url text, note text);
    create table matches(id uuid primary key, match_level text, match_date date, match_time text,
      match_name text, tournament_name text, opponent text, location text, coaches text, note text);
    create function get_training_month_dates(date) returns jsonb language sql as
      $$ select '{"training_dates":["2026-09-25","2026-09-26"]}'::jsonb $$;
    insert into profiles(id,name,role) values ('${id(1)}','Coach A','COACH'),('${id(2)}','Coach B','COACH'),('${id(3)}','Parent','PARENT');
    insert into training_program_settings values ('junior_high_school_team','國中部'),('chunggang_school_team','中港總部');
    insert into training_location_sessions values
      ('${id(10)}','junior_high_school_team','2026-09-25','訓練課程','09:00','12:00','published',null),
      ('${id(11)}','chunggang_school_team','2026-09-25','訓練課程','09:00','12:30','published',null);
    insert into training_location_session_venues(id,session_id,venue_name) values
      ('${id(20)}','${id(10)}','中港國小'),('${id(21)}','${id(11)}','中港國小'),
      ('${id(22)}','${id(10)}','輔大棒球場地');
  `)
  await db.exec(read('supabase_coach_schedules_migration.sql'))
  await db.exec(read('supabase_coach_schedules_training_location_sync_hotfix.sql'))
  await db.exec(read('supabase_zzz_coach_schedule_match_source_integrity_migration.sql'))
  await db.exec(`
    select set_config('request.jwt.claim.sub','${id(1)}',false),set_config('test.permission','ADMIN',false);
    insert into coach_schedule_events(id,source_type,source_id,source_venue_id,schedule_date,start_time,end_time,title,location,note) values
      ('${id(30)}','training_location','${id(10)}','${id(99)}','2026-09-25','09:00','12:00','訓練課程','輔大棒球場地','保留備註'),
      ('${id(31)}','training_location','${id(98)}','${id(97)}','2026-07-04','09:00','12:30','舊課程','中港國小','歷史備註');
    insert into coach_schedule_assignments(event_id,coach_profile_id) values ('${id(30)}','${id(1)}'),('${id(31)}','${id(2)}');
  `)
  await db.exec(migration)
  check((await query(`select source_venue_id from coach_schedule_events where id='${id(30)}'`))[0].source_venue_id === id(22), 'uniquely rebind replacement venue')
  check((await query(`select source_type,note from coach_schedule_events where id='${id(31)}'`))[0].source_type === 'manual', 'retain unmatched history as manual')
  check((await query('select * from coach_schedule_assignments')).length === 2, 'repair preserves assignments')
  check((await query(`select note from coach_schedule_events where id='${id(30)}'`))[0].note === '保留備註', 'repair preserves schedule note')
  await db.exec(migration)
  check((await query('select * from coach_schedule_assignments')).length === 2, 'migration rerun preserves assignments')
  let payload = (await query("select list_coach_schedule_admin_month('2026-09-01') as payload"))[0].payload
  check(payload.events.filter(e => e.location === '中港國小' && e.schedule_date === '2026-09-25').length === 2, 'same-day programs remain separate')
  check(payload.events.filter(e => e.location === '輔大棒球場地').length === 1, 'repaired saved event merges with candidate')
  check(payload.events.find(e => e.id === id(30)).program_label === '國中部', 'admin RPC labels saved event')
  check(payload.events.find(e => e.source_venue_id === id(21)).program_label === '中港總部', 'admin RPC labels unsaved candidate')
  check(payload.events.find(e => e.source_type === 'training_date').program_label === '中港總部', 'generic training date has default program')
  await db.exec(`update training_program_settings set label='國中訓練' where program_key='junior_high_school_team'`)
  payload = (await query("select list_coach_schedule_dashboard('2026-09-01') as payload"))[0].payload
  check(payload.events[0].program_label === '國中訓練', 'dashboard uses current program name')
  await db.exec(`update training_location_session_venues set training_date='2026-09-24',start_time='10:00',end_time='13:00',title='改課',venue_name='新場地' where id='${id(22)}'`)
  let event = (await query(`select * from coach_schedule_events where id='${id(30)}'`))[0]
  check(event.title === '改課' && event.start_time === '10:00' && event.location === '新場地', 'venue update syncs existing schedule')
  check(event.note === '保留備註', 'venue update keeps schedule note')
  await db.exec(`update coach_schedule_events set title='舊瀏覽器',start_time='09:00' where id='${id(30)}'`)
  event = (await query(`select * from coach_schedule_events where id='${id(30)}'`))[0]
  check(event.title === '改課' && event.start_time === '10:00', 'stale browser cannot overwrite source snapshot')
  await assert.rejects(db.exec(`insert into coach_schedule_events(source_type,source_id,source_venue_id,schedule_date,title) values ('training_location','${id(10)}','${id(21)}','2026-09-25','錯配')`), /原場地配置已刪除或變更/); checks++
  await assert.rejects(db.exec(`insert into coach_schedule_events(source_type,schedule_date,title) values ('training_location','2026-09-25','缺少來源')`), /原場地配置已刪除或變更/); checks++
  await db.exec(`select set_config('test.permission','',false)`)
  payload = (await query("select list_coach_schedule_dashboard('2026-09-01') as payload"))[0].payload
  check(payload.scope === 'own' && payload.events.length === 1 && payload.events[0].assignments.length === 1, 'coach scope remains own assignments')
  await assert.rejects(db.query("select list_coach_schedule_admin_month('2026-09-01')"), /permission required/); checks++
  await db.exec(`select set_config('request.jwt.claim.sub','${id(3)}',false)`)
  payload = (await query("select list_coach_schedule_dashboard('2026-09-01') as payload"))[0].payload
  check(payload.scope === 'none' && payload.events.length === 0, 'ordinary user gets no schedules')
  await db.exec(`select set_config('request.jwt.claim.sub','',false)`)
  await assert.rejects(db.query("select list_coach_schedule_dashboard('2026-09-01')"), /Not authenticated/); checks++
  check(!(await query("select has_function_privilege('anon','public.list_coach_schedule_admin_month(date)','execute') as allowed"))[0].allowed, 'anonymous admin RPC denied')
  check(!(await query("select has_function_privilege('authenticated','private.validate_coach_schedule_training_location_source()','execute') as allowed"))[0].allowed, 'private trigger not callable by users')
  await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',false),set_config('test.permission','ADMIN',false)`)
  await db.exec(`delete from training_location_session_venues where id='${id(22)}'`)
  check((await query(`select * from coach_schedule_events where id='${id(30)}'`)).length === 0, 'venue delete removes source schedule')
  check((await query(`select * from coach_schedule_assignments where event_id='${id(30)}'`)).length === 0, 'venue delete cascades assignments')
  await assert.rejects(db.query(`select save_coach_schedule_event('{"source_type":"training_location","source_id":"${id(10)}","source_venue_id":"${id(22)}","schedule_date":"2026-09-25","title":"舊畫面"}'::jsonb)`), /原場地配置已刪除或變更/); checks++
  const saved = (await query(`select save_coach_schedule_event('{"source_type":"training_location","source_id":"${id(10)}","source_venue_id":"${id(20)}","schedule_date":"2026-09-25","title":"正常排班"}'::jsonb,array['${id(1)}']::uuid[]) as id`))[0].id
  await db.exec(`delete from training_location_sessions where id='${id(10)}'`)
  check((await query(`select * from coach_schedule_events where id='${saved}'`)).length === 0, 'session delete removes schedules')
  check((await query(`select * from coach_schedule_assignments where event_id='${saved}'`)).length === 0, 'session delete removes assignments')
  check((await query(`select * from coach_schedule_events where id='${id(31)}'`)).length === 1, 'manual history survives source deletes')
  check((await query(`select * from training_location_session_venues where id='${id(21)}'`)).length === 1, 'other program is untouched')
  console.log(`PASS: ${checks} coach schedule SQL checks`)
} finally {
  await db.close()
}
