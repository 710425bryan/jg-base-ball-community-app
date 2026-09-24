// Isolated PostgreSQL regression; never connects to a remote database.
// node scripts/verify-coach-schedule-shared-slots.mjs <pglite-dir>/dist/index.js
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
      venue_id uuid, training_date date, title text, start_time text, end_time text, venue_name text, venue_maps_url text, note text);
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
  await db.exec(migration)
  await db.exec(`
    select set_config('request.jwt.claim.sub','${id(1)}',false),set_config('test.permission','ADMIN',false);
    update training_location_session_venues set venue_id='${id(80)}' where id in ('${id(20)}','${id(21)}');
    update training_location_session_venues set venue_id='${id(81)}' where id='${id(22)}';
    insert into training_location_session_venues(id,session_id,venue_id,venue_name)
      values ('${id(23)}','${id(11)}','${id(81)}','輔大棒球場地');
    insert into coach_schedule_events(id,source_type,source_id,source_venue_id,schedule_date,title,note) values
      ('${id(30)}','training_location','${id(10)}','${id(20)}','2026-09-25','訓練課程','中港排班備註'),
      ('${id(31)}','training_location','${id(10)}','${id(22)}','2026-09-25','訓練課程','國中備註'),
      ('${id(32)}','training_location','${id(11)}','${id(23)}','2026-09-25','訓練課程','總部備註');
    insert into coach_schedule_assignments(id,event_id,coach_profile_id,note) values
      ('${id(40)}','${id(30)}','${id(1)}','中港指派'),
      ('${id(41)}','${id(31)}','${id(1)}','A'),
      ('${id(42)}','${id(32)}','${id(2)}','B'),
      ('${id(43)}','${id(32)}','${id(1)}','C');
  `)
  await db.exec(read('supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql'))
  const event = async eventId => (await query(`select * from coach_schedule_events where id='${eventId}'`))[0]
  const admin = async () => (await query("select list_coach_schedule_admin_month('2026-09-01') as p"))[0].p
  const save = async (venue, session, coaches, extra = {}) => (await db.query(
    'select save_coach_schedule_event($1::jsonb,$2::uuid[]) as id',
    [JSON.stringify({ source_type: 'training_location', source_id: session, source_venue_id: venue,
      schedule_date: '2026-09-25', title: 'stale snapshot', ...extra }), coaches])).rows[0].id
  let payload = await admin()
  check(payload.events.filter(e => e.source_type === 'training_location').length === 2, 'one lesson per physical venue across programs')
  let school = payload.events.find(e => e.location === '中港國小')
  check(school.id === id(30) && school.end_time === '12:30' && school.coach_profile_ids.length === 1, 'keeps school event/coach and latest end time')
  check(school.program_label === '合班｜中港總部、國中部', 'all participating programs are labeled')
  check((await event(id(30))).training_source_venue_ids.length === 2, 'tracks every source for reanchoring')
  check((await event(id(31))).note.includes('總部備註') && (await event(id(31))).note.includes('國中備註'), 'saved event notes union')
  check((await query(`select * from coach_schedule_assignments where event_id='${id(31)}'`)).length === 2, 'duplicate event coach sets union')
  check((await query(`select note from coach_schedule_assignments where id='${id(41)}'`))[0].note === 'A\nC', 'same coach notes retained once')
  check((await query(`select event_id from coach_schedule_assignments where id='${id(42)}'`))[0].event_id === id(31), 'unique assignment ID preserved during move')
  check((await query('select * from private.coach_schedule_merge_audit')).length === 2, 'audit stores both original saved records')
  await db.exec('select private.reconcile_coach_training_slots()')
  check((await query('select * from private.coach_schedule_merge_audit')).length === 2, 'reconcile idempotent')
  check(await save(id(20),id(10),[id(1)],{note:'中港排班備註'}) === id(30), 'retry via junior source resolves existing event')
  check(await save(id(21),id(11),[id(1)],{note:'中港排班備註'}) === id(30), 'retry via primary source resolves same event')
  await assert.rejects(save(id(21),id(11),[id(2)]), /已有教練排班/); checks++
  await assert.rejects(save(id(23),id(11),[id(2)],{id:id(32)}), /已合併或刪除/); checks++
  await assert.rejects(db.exec(`insert into coach_schedule_events(source_type,source_id,source_venue_id,schedule_date,title)
    values ('training_location','${id(10)}','${id(20)}','2026-09-25','duplicate')`), /coach_schedule_training_slot_unique/); checks++
  await assert.rejects(save(id(21),id(10),[id(1)]), /原場地配置/); checks++
  // A source moves out: coaches remain on the original physical lesson, not copied to both.
  const staleTime = school.updated_at
  await db.exec(`update training_location_session_venues set start_time='10:00' where id='${id(21)}'`)
  payload = await admin()
  check(payload.events.filter(e => e.location === '中港國小' && e.source_type === 'training_location').length === 2, 'different start times are separate lessons')
  check((await event(id(30))).source_venue_id === id(20), 'split follows unchanged physical lesson even when primary anchor moved')
  check(payload.events.find(e => e.source_venue_id === id(21)).coach_profile_ids.length === 0, 'split does not clone coaches')
  await assert.rejects(save(id(20),id(10),[id(1)],{id:id(30),updated_at:staleTime}), /其他操作更新/); checks++
  const current = await event(id(30))
  check(await save(id(20),id(10),[id(1)],{id:id(30),updated_at:current.updated_at,note:'updated'}) === id(30), 'fresh edit succeeds')
  await db.exec(`update training_location_session_venues set start_time='9:00:00' where id='${id(21)}'`)
  check((await admin()).events.filter(e => e.location === '中港國小' && e.source_type === 'training_location').length === 1, 'normalized start times rejoin')
  await db.exec(`update training_location_session_venues set end_time='13:00' where id='${id(20)}'`)
  check((await event(id(30))).end_time === '13:00', 'non-anchor end change syncs max end')
  await db.exec(`update training_program_settings set label='國中訓練' where program_key='junior_high_school_team'`)
  check((await admin()).events.find(e => e.id === id(30)).program_label.includes('國中訓練'), 'program renaming reflected without touching schedules')
  // Exact boundary checks: course/date/place/unknown venue must not collapse unrelated lessons.
  for (const [field,value] of [['title',"'守備專項'"],['training_date',"'2026-09-26'"],['venue_id',`'${id(82)}'`],['venue_id','null']]) {
    await db.exec(`begin; update training_location_session_venues set ${field}=${value} where id='${id(21)}'`)
    check((await admin()).events.filter(e => e.source_type === 'training_location').length === 3, `${field} boundary separates lessons`)
    await db.exec('rollback')
  }
  await db.exec(`begin; update training_location_sessions set status='archived' where id='${id(11)}'`)
  check((await event(id(30))).source_venue_id === id(20), 'archived source no longer anchors active shared lesson')
  await db.exec('rollback')
  // Removing one program must retain the shared event and assignments, including session cascades.
  await db.exec(`delete from training_location_sessions where id='${id(11)}'`)
  check((await event(id(30))).source_venue_id === id(20), 'canonical session delete reanchors to remaining program')
  check((await query('select * from coach_schedule_assignments')).length === 3, 'partial source deletion preserves all coaches')
  await assert.rejects(save(id(21),id(11),[id(1)]), /原場地配置/); checks++
  await db.exec(`insert into training_location_session_venues(id,session_id,venue_id,venue_name,end_time)
    values ('${id(24)}','${id(10)}','${id(80)}','中港國小','14:00')`)
  check((await event(id(30))).end_time === '14:00', 'new source joins saved lesson automatically')
  await db.exec(`delete from training_location_session_venues where id='${id(24)}'`)
  check((await event(id(30))).end_time === '13:00', 'non-canonical delete preserves lesson and recomputes end')
  // Permissions are unchanged; ordinary coach sees only their own assignments.
  await db.exec(`select set_config('test.permission','',false)`)
  let dashboard = (await query("select list_coach_schedule_dashboard('2026-09-01') as p"))[0].p
  check(dashboard.scope === 'own' && dashboard.events.every(e => e.assignments.length === 1), 'shared dashboard retains own-coach visibility')
  await assert.rejects(admin(), /permission required/); checks++
  await assert.rejects(save(id(20),id(10),[id(1)],{id:id(30)}), /permission required/); checks++
  await db.exec(`select set_config('request.jwt.claim.sub','${id(3)}',false)`)
  dashboard = (await query("select list_coach_schedule_dashboard('2026-09-01') as p"))[0].p
  check(dashboard.events.length === 0, 'ordinary member cannot see coach assignments')
  await db.exec(`select set_config('request.jwt.claim.sub','',false)`)
  await assert.rejects(admin(), /Not authenticated/); checks++
  for (const name of ['private.reconcile_coach_training_slots()', 'private.sync_coach_training_slots()', 'public.save_coach_schedule_event(jsonb,uuid[])']) {
    check(!(await query(`select has_function_privilege('anon','${name}','execute') as allowed`))[0].allowed, `anonymous denied ${name}`)
  }
  check(!(await query("select has_table_privilege('authenticated','private.coach_schedule_merge_audit','select') as allowed"))[0].allowed, 'audit is private')
  await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',false),set_config('test.permission','ADMIN',false)`)
  await db.exec(`delete from training_location_session_venues where id='${id(20)}'`)
  check(!(await event(id(30))), 'last source deletion removes saved lesson')
  check((await query(`select * from coach_schedule_assignments where event_id='${id(30)}'`)).length === 0, 'last source cascades assignments')
  check((await query("select * from private.coach_schedule_merge_audit where reason='last_source_deleted'")).length === 1, 'last-source cleanup audited')
  await db.exec(`
    insert into matches(id,match_level,match_date,match_name,location) values
      ('${id(100)}','友誼賽','2026-09-25','訓練課程','中港國小'),
      ('${id(101)}','友誼賽','2026-09-25','訓練課程','中港國小');
    insert into coach_schedule_events(source_type,source_id,schedule_date,title) values
      ('match','${id(100)}','2026-09-25','訓練課程'),('match','${id(101)}','2026-09-25','訓練課程'),
      ('manual',null,'2026-09-25','訓練課程'),('manual',null,'2026-09-25','訓練課程');
    select private.reconcile_coach_training_slots();
  `)
  check((await query("select id from coach_schedule_events where source_type='match'")).length === 2, 'matches retain independent UUID identity')
  check((await query("select id from coach_schedule_events where source_type='manual'")).length === 2, 'manual schedules are never merged')
  await db.exec(`delete from matches where id='${id(100)}'`)
  check((await query("select id from coach_schedule_events where source_type='match'")).length === 1, 'match source cleanup still works')
  // Concurrent source swaps within one statement are checked only after all keys settle.
  await db.exec(`insert into training_location_session_venues(id,session_id,venue_id,venue_name,start_time)
    values ('${id(25)}','${id(10)}','${id(81)}','輔大棒球場地','10:00')`)
  const second = await save(id(25),id(10),[id(2)])
  await db.exec(`update training_location_session_venues set start_time=case when id='${id(22)}' then '10:00' else '09:00' end
    where id in ('${id(22)}','${id(25)}')`)
  check((await event(id(31))).start_time === '10:00' && (await event(second)).start_time === '09:00', 'atomic source swaps preserve both event identities')
  await db.exec(`update training_location_session_venues set start_time='09:00' where id='${id(22)}'`)
  check((await query("select id from coach_schedule_events where source_type='training_location'")).length === 1, 'joining two saved slots merges them')
  check((await query(`select * from coach_schedule_assignments where event_id='${id(31)}'`)).length === 2, 'joining slots deduplicates overlapping coaches')
  console.log(`PASS: ${checks} shared training slot SQL checks`)
} finally {
  await db.close()
}
