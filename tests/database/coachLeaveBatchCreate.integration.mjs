// Isolated PostgreSQL regression; no network, production users, or remote SQL.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const read = path => readFileSync(new URL(`../../${path}`,import.meta.url),'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const rows = async (sql,args=[]) => (await db.query(sql,args)).rows
const one = async (sql,args=[]) => (await rows(sql,args))[0]
const user = async n => db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : ''])
let checks=0
const check = (value,message) => { assert.ok(value,message); checks++ }
const rejects = async (promise,pattern) => { await assert.rejects(promise,pattern); checks++ }
const batch = async (records,batchId,manage=false) => (await one('select public.create_coach_leave_requests($1::jsonb,$2,$3::uuid) as ids',[JSON.stringify(records),manage,batchId])).ids
const dates = async (month=null,manage=false) => (await one('select public.list_coach_leave_training_dates($1::date,$2) as p',[month,manage])).p
const event = async eventId => one('select e.*,e.updated_at::text as updated_at from coach_schedule_events e where id=$1::uuid',[eventId])
const leave = async leaveId => one('select l.*,l.updated_at::text as updated_at from coach_leave_requests l where id=$1::uuid',[leaveId])
const saveEvent = async (record,coaches) => (await one('select save_coach_schedule_event($1::jsonb,$2::uuid[]) as id',[JSON.stringify(record),coaches])).id
const counts = async () => one(`select
  (select count(*)::integer from coach_leave_requests) as leaves,
  (select count(*)::integer from private.coach_leave_audit) as audit,
  (select count(*)::integer from private.coach_schedule_assignment_changes) as changes,
  (select count(*)::integer from private.coach_leave_create_batches) as batches,
  (select count(*)::integer from push_dispatch_events) as notifications`)
const sameCounts = async (previous,message) => check(JSON.stringify(await counts())===JSON.stringify(previous),message)
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table profiles(id uuid primary key,name text,nickname text,email text,role text,avatar_url text,
      is_active boolean default true,access_start timestamptz,access_end timestamptz);
    create table app_role_permissions(role_key text,feature text,action text,unique(role_key,feature,action));
    create function public.has_app_permission(p_feature text,p_action text) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_active,true)
        and (p.access_start is null or p.access_start<=now()) and (p.access_end is null or p.access_end>=now())
        and (p.role='ADMIN' or exists(select 1 from public.app_role_permissions a
          where a.role_key=p.role and a.feature=p_feature and a.action=p_action)));
    $$;
    create table training_program_settings(program_key text primary key,label text,
      default_weekdays integer[] default array[6],is_active boolean default true,sort_order integer default 0);
    create table training_month_date_settings(id uuid primary key default gen_random_uuid(),month_start date,
      program_key text,training_dates date[] default '{}',note text,updated_at timestamptz default now(),unique(month_start,program_key));
    create table training_venues(id uuid primary key,name text);
    create table training_location_sessions(id uuid primary key,program_key text,training_date date,title text,
      start_time text,end_time text,status text default 'published',note text);
    create table training_location_session_venues(id uuid primary key,session_id uuid references training_location_sessions(id) on delete cascade,
      venue_id uuid,training_date date,title text,start_time text,end_time text,venue_name text,venue_maps_url text,note text);
    create table matches(id uuid primary key,match_level text,match_date date,match_time text,match_name text,
      tournament_name text,opponent text,location text,coaches text,note text);
    create table fixture_dates(d date);
    create function public.get_training_month_dates(p_month date) returns jsonb language sql as $$
      select jsonb_build_object('training_dates',coalesce(jsonb_agg(d order by d),'[]')) from fixture_dates
        where date_trunc('month',d)=date_trunc('month',p_month) $$;
    create table public.push_dispatch_events(id uuid primary key default gen_random_uuid(),event_key text unique,
      feature text,action text,title text,body text,url text,created_at timestamptz default now(),dispatch_mode text,dispatch_status text);
    insert into profiles(id,name,role,is_active) values
      ('${id(1)}','管理員','ADMIN',true),('${id(2)}','教練甲','COACH',true),('${id(3)}','教練乙','HEAD_COACH',true),
      ('${id(4)}','經理','MANAGER',true),('${id(5)}','停用教練','COACH',false),('${id(6)}','家長','PARENT',true),
      ('${id(7)}','舊角色教練',' 教練 ',true);
    insert into app_role_permissions select 'MANAGER',f,a from (values('coach_schedules'),('coach_leave_requests')) ff(f)
      cross join (values('VIEW'),('CREATE'),('EDIT'),('DELETE')) aa(a);
    insert into training_program_settings values ('chunggang_school_team','中港總部',array[6],true,0),
      ('junior_high_school_team','國中部',array[0],true,1),('inactive_program','停用項目',array[1],false,-1);
  `)
  for(const path of ['supabase_coach_schedules_migration.sql','supabase_coach_schedules_schedulable_coaches_hotfix.sql',
    'supabase_coach_schedules_training_location_sync_hotfix.sql','supabase_zzz_coach_schedule_match_source_integrity_migration.sql',
    'supabase/migrations/20260924043936_coach_schedule_program_source_integrity.sql',
    'supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql',
    'supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql']) await db.exec(read(path))
  // Install the real program-aware read functions without unrelated finance,
  // roster, notifications, or cron statements from the historical migration.
  const programSQL=read('supabase_zzzzzzzzzzzzzzzzzz_training_program_scope_migration.sql')
  for(const name of ['normalize_training_program_key','get_default_training_month_dates','get_training_month_dates']) {
    const block=programSQL.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0]
    assert.ok(block,`historical program function exists: ${name}`)
    await db.exec(block)
  }
  const coreHash=(await one("select md5(prosrc) as hash from pg_proc where oid='public.save_coach_leave_request(jsonb,boolean,uuid)'::regprocedure")).hash
  await db.exec(read('supabase/migrations/20261002155846_coach_leave_batch_create_and_training_dates.sql'))
  check((await one("select md5(prosrc) as hash from pg_proc where oid='public.save_coach_leave_request(jsonb,boolean,uuid)'::regprocedure")).hash===coreHash,'forward migration preserves the deployed single-save implementation')
  const info=await one("select (date_trunc('month',now() at time zone 'Asia/Taipei')+interval '2 months')::date::text as month,((now() at time zone 'Asia/Taipei')::date-1)::text as yesterday")
  const day = async n => (await one('select ($1::date+$2::integer)::text as day',[info.month,n])).day
  const d1=await day(1),d2=await day(2),d3=await day(3),d4=await day(4)
  const record = (date,segment='full_day',extra={}) => ({start_date:date,end_date:date,time_segment:segment,reason:'batch private secret',...extra})
  await user(1)
  const base={source_type:'manual',schedule_date:d1,start_time:'09:00',end_time:'13:00',title:'上午課'}
  const morning=await saveEvent(base,[id(2)])
  const afternoon=await saveEvent({...base,start_time:'13:00',end_time:'15:00',title:'下午課'},[id(2)])
  const nextEvent=await saveEvent({...base,schedule_date:d2},[id(2)])
  const thirdEvent=await saveEvent({...base,schedule_date:d3},[id(2)])
  await user(2)
  await db.exec('set role authenticated')
  const request=id(900),records=[record(d1,'morning'),record(d2)]
  const ids=await batch(records,request)
  await db.exec('reset role')
  check(ids.length===2 && ids[0]!==ids[1],'authenticated coach creates all requested single-day leaves')
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1',[morning])) && !(await one('select 1 from coach_schedule_assignments where event_id=$1',[nextEvent])),'each leave removes its actual overlapping assignments')
  check(Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1',[afternoon])),'morning batch preserves the 13:00 afternoon boundary')
  check(JSON.stringify(await counts())===JSON.stringify({leaves:2,audit:2,changes:2,batches:1,notifications:2}),'each successful record retains core audit, removal and notification behavior')
  const notifications=await rows('select * from push_dispatch_events')
  check(notifications.every(row=>row.dispatch_mode==='outbox' && row.dispatch_status==='pending' && row.coach_leave_payload.operation==='created'),'actual batch events use the deployed notification outbox contract')
  check(!JSON.stringify(notifications).includes('batch private secret'),'batch notification payload and body omit private reasons')
  const afterCreate=await counts()
  check(JSON.stringify(await batch([...records].reverse(),request))===JSON.stringify(ids),'same normalized batch returns original IDs regardless of input date order')
  check(JSON.stringify(await batch(records,request,null))===JSON.stringify(ids),'null management flag remains the same protected own mode on retry')
  check(JSON.stringify(await batch(records.map(item=>({...item,coach_profile_id:id(2),reason:' batch private secret '})),request))===JSON.stringify(ids),'retry normalization handles own coach and trimmed optional reason')
  await sameCounts(afterCreate,'successful batch retries create no new leave, removal, audit or notification')
  await rejects(batch([record(d1,'morning',{reason:'changed'}),record(d2)],request),/識別碼已使用/)
  await rejects(batch([record(d1,'morning'),record(d3)],request),/識別碼已使用/)

  // The first valid save would remove an assignment; the later overlap must
  // roll it and every audit/outbox/receipt write back in the same transaction.
  const afternoonBefore=await event(afternoon)
  await rejects(batch([record(d1,'afternoon'),record(d2)],id(901)),/重疊/)
  await sameCounts(afterCreate,'later overlap rejects the whole batch without partial writes')
  check(Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1',[afternoon])) && (await event(afternoon)).updated_at===afternoonBefore.updated_at,'failed batch restores earlier attempted removal and the exact schedule revision')
  await rejects(batch([record(d3),record(d3,'morning')],id(902)),/重疊/)
  check(Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1',[thirdEvent])),'intra-batch overlap rolls back its earlier attempted assignment removal')
  await rejects(batch([record(d3,'morning'),record(d4,'afternoon',{reason:'x'.repeat(501)})],id(903)),/500字/)
  await sameCounts(afterCreate,'later invalid reason rolls back all earlier batch effects')
  await rejects(batch([record(d3),record(d3)],id(904)),/重複日期/)
  await rejects(batch([record(d3),record(d3,'full_day',{reason:'different'})],id(905)),/重複日期/)
  await rejects(batch([],id(906)),/1至365/)
  await rejects(batch({},id(907)),/有效的請假資料清單/)
  await rejects(batch([null],id(908)),/有效物件/)
  await rejects(batch([record(d3)],null),/批次送出識別碼/)
  await rejects(batch([record(d3,'full_day',{id:ids[0]})],id(909)),/只允許新增/)
  await rejects(batch([record(d3,'full_day',{updated_at:'2026-01-01T00:00:00Z'})],id(910)),/只允許新增/)
  await rejects(batch([record(info.yesterday)],id(911)),/今天起/)
  await rejects(batch([record(d3,'morning',{end_date:d4})],id(912)),/多日請假/)
  await rejects(batch([record(d3,'night')],id(913)),/多日請假/)
  await rejects(batch([record(d3,'full_day',{coach_profile_id:id(3)})],id(914)),/只能建立本人/)
  await rejects(batch([record(d3,'full_day',{coach_profile_id:id(3)})],id(915),null),/只能建立本人/)
  await rejects(batch([record(d3)],id(916),true),/permission required/)
  await sameCounts(afterCreate,'validation and ownership failures leave no partial data')

  const twoHalves=await batch([record(d3,'morning'),record(d3,'afternoon')],id(917))
  check(twoHalves.length===2,'separate selected dates may include both non-overlapping morning and afternoon leaves')
  const rangeIds=await batch([record(await day(6),'full_day',{end_date:await day(8)})],id(918))
  check(rangeIds.length===1,'continuous full-day range remains one leave record')
  await db.exec("delete from app_role_permissions where role_key='COACH' and feature='my_coach_leave_requests' and action='CREATE'")
  await rejects(batch(records,request),/permission required/)
  await db.exec("insert into app_role_permissions values('COACH','my_coach_leave_requests','CREATE')")
  await db.exec(`update profiles set is_active=false where id='${id(2)}'`)
  await rejects(batch(records,request),/帳號已停用/)
  await db.exec(`update profiles set is_active=true,access_start=now()+interval '1 day' where id='${id(2)}'`)
  await rejects(batch(records,request),/帳號已停用/)
  await db.exec(`update profiles set access_start=null where id='${id(2)}'`)
  await db.query('select cancel_coach_leave_request($1::uuid,$2::timestamptz,false)',[ids[0],(await leave(ids[0])).updated_at])
  await user(1)
  await saveEvent(await event(morning),[id(2)])
  await user(2)
  const afterCancel=await counts()
  check(JSON.stringify(await batch(records,request))===JSON.stringify(ids) && (await leave(ids[0])).status==='cancelled','retry returns original IDs without recreating a later-cancelled leave')
  check(Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1',[morning])),'retry never removes a coach who was reassigned after cancellation')
  await sameCounts(afterCancel,'retry after cancellation emits no additional creation events or audits')

  await user(4)
  await rejects(batch([record(d4,'morning',{coach_profile_id:id(2)}),record(d4,'afternoon',{coach_profile_id:id(3)})],id(919),true),/只能選擇一位/)
  await rejects(batch([record(d4)],id(920),true),/不符合排班資格/)
  const managerRecords=[record(d4,'afternoon',{coach_profile_id:id(3)})]
  const managerIds=await batch(managerRecords,request,true)
  check(managerIds.length===1 && !ids.includes(managerIds[0]),'batch receipt is bound to its actor, even when clients reuse the same UUID')
  await db.exec(`update profiles set is_active=false where id='${id(3)}'`)
  await rejects(batch(managerRecords,request,true),/不符合排班資格/)
  await db.exec(`update profiles set is_active=true,access_end=now()-interval '1 minute' where id='${id(3)}'`)
  await rejects(batch(managerRecords,request,true),/不符合排班資格/)
  await db.exec(`update profiles set access_end=null where id='${id(3)}'; update profiles set access_end=now()-interval '1 minute' where id='${id(4)}'`)
  await rejects(batch(managerRecords,request,true),/帳號已停用/)
  await db.exec(`update profiles set access_end=null where id='${id(4)}'`)
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_leave_requests' and action='CREATE'")
  await rejects(batch(managerRecords,request,true),/permission required/)
  await db.exec("insert into app_role_permissions values('MANAGER','coach_leave_requests','CREATE')")
  await user(6)
  await rejects(batch([record(d4)],id(921)),/permission required/)
  await user(7)
  await rejects(batch([record(d4)],id(922)),/permission required/)
  await user(5)
  await rejects(batch([record(d4)],id(923)),/帳號已停用/)
  await user(null)
  await rejects(batch([record(d4)],id(924)),/登入狀態/)

  // Enforce a request-size bound, with no silently truncated fixed cycle.
  await user(3)
  const boundStart=await day(100)
  const many=await rows("select (d::date)::text as day from generate_series($1::date,$1::date+365,interval '1 day') d",[boundStart])
  const beforeBound=await counts()
  await rejects(batch(many.map(item=>record(item.day)),id(925)),/1至365/)
  await sameCounts(beforeBound,'366 records are rejected before any writes')
  const maxIds=await batch(many.slice(0,365).map(item=>record(item.day,'afternoon')),id(926))
  check(maxIds.length===365 && new Set(maxIds).size===365,'365 discrete half-day leaves succeed without truncation')

  // Read the actual program-specific month behavior, returning only labels and
  // dates, including explicit empty months and defaults for unconfigured ones.
  await db.query("insert into training_month_date_settings(month_start,program_key,training_dates,note) values($1,'chunggang_school_team',$2::date[],'private training note')",[info.month,[d3,d1,d1,await day(-1)]])
  await user(2)
  const trainingBefore=await one('select count(*)::integer as n from training_month_date_settings')
  const quick=await dates(info.month)
  check(quick.month_start===info.month && quick.programs.map(p=>p.program_key).join(',')==='chunggang_school_team,junior_high_school_team','quick dates return active programs in their configured order')
  check(JSON.stringify(quick.programs[0].training_dates)===JSON.stringify([d1,d3]),'program quick dates use actual saved dates, sorted and deduplicated within the requested month')
  check(quick.programs[1].training_dates.length>=4 && quick.programs[1].training_dates.every(d=>new Date(d+'T00:00:00Z').getUTCDay()===0),'unset program month uses its configured default weekday')
  check(Object.keys(quick).sort().join(',')==='month_start,programs' && quick.programs.every(p=>Object.keys(p).sort().join(',')==='program_key,program_label,training_dates'),'quick-date payload exposes only the agreed metadata')
  check(!JSON.stringify(quick).includes('private training note') && !JSON.stringify(quick).includes('inactive_program'),'date wrapper reveals neither training note nor inactive program')
  check(JSON.stringify(await dates(info.month,null))===JSON.stringify(quick),'null management flag in date selection preserves own VIEW and coach checks')
  check((await one('select count(*)::integer as n from training_month_date_settings')).n===trainingBefore.n,'date quick selection never materializes a default month')
  const emptyMonth=(await one("select ($1::date+interval '1 month')::date::text as month",[info.month])).month
  await db.query("insert into training_month_date_settings(month_start,program_key,training_dates,note) values($1,'chunggang_school_team','{}','secret empty month')",[emptyMonth])
  check((await dates(emptyMonth)).programs[0].training_dates.length===0,'an explicitly empty configured month never falls back to default dates')
  check((await dates()).month_start===(await one("select date_trunc('month',now() at time zone 'Asia/Taipei')::date::text as month")).month,'omitted month uses the Taiwan current month')
  await db.exec("delete from app_role_permissions where role_key='COACH' and feature='my_coach_leave_requests' and action='VIEW'")
  await rejects(dates(info.month),/permission required/)
  check(JSON.stringify(await batch(records,request))===JSON.stringify(ids),'batch creation retry requires CREATE independently of the date RPC VIEW permission')
  await db.exec("insert into app_role_permissions values('COACH','my_coach_leave_requests','VIEW')")
  await db.exec(`update profiles set access_end=now()-interval '1 minute' where id='${id(2)}'`)
  await rejects(dates(info.month),/帳號已停用/)
  await rejects(dates(info.month,null),/帳號已停用/)
  await db.exec(`update profiles set access_end=null where id='${id(2)}'`)
  await user(4)
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_leave_requests' and action<>'VIEW'")
  check((await dates(info.month,true)).programs.length===2,'manager VIEW alone authorizes program date quick selection')
  await rejects(batch(managerRecords,request,true),/permission required/)
  await rejects(dates(info.month),/permission required/)
  await rejects(dates(info.month,null),/permission required/)
  await user(1)
  await rejects(dates(info.month),/只能處理本人/)
  check((await dates(info.month,true)).programs.length===2,'active ADMIN management mode can read the safe date payload')
  await user(6)
  await rejects(dates(info.month),/permission required/)
  await rejects(dates(info.month,true),/permission required/)
  await user(7)
  await rejects(dates(info.month),/permission required/)
  await user(5)
  await rejects(dates(info.month),/帳號已停用/)
  await user(null)
  await rejects(dates(info.month),/登入狀態/)
  await user(2)
  await db.exec("update training_program_settings set is_active=false")
  check((await dates(info.month)).programs.length===0,'no active programs returns an empty safe list')
  await db.exec('set role authenticated')
  await rejects(db.query('select * from private.coach_leave_create_batches'),/permission denied/)
  await rejects(db.query(`insert into private.coach_leave_create_batches(actor_profile_id,batch_id,request_payload,leave_ids) values('${id(2)}','${id(930)}','{}','{}')`),/permission denied/)
  await db.exec('reset role')
  check((await one("select relrowsecurity as enabled from pg_class where oid='private.coach_leave_create_batches'::regclass")).enabled,'private receipt table enables RLS as defense in depth')
  for(const fn of ['public.create_coach_leave_requests(jsonb,boolean,uuid)','public.list_coach_leave_training_dates(date,boolean)']) {
    check(!(await one("select has_function_privilege('anon',$1,'execute') as ok",[fn])).ok,'anonymous execution denied '+fn)
    check((await one("select has_function_privilege('authenticated',$1,'execute') as ok",[fn])).ok,'authenticated execution granted '+fn)
  }
  console.log(`PASS: ${checks} coach leave batch and training date SQL checks`)
} catch(error) { console.error(error.message,error.where || '',error.internalQuery || ''); process.exitCode=1 } finally { await db.close() }
