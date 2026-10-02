// Isolated PostgreSQL integration regression. No network or production access.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '@electric-sql/pglite')
const db = new PGlite()
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const rows = async (sql,args=[]) => (await db.query(sql,args)).rows
const one = async (sql,args=[]) => (await rows(sql,args))[0]
let checks=0
const check = (value,message) => { assert.ok(value,message); checks++ }
const rejects = async (promise,pattern) => { await assert.rejects(promise,pattern); checks++ }
const user = async n => db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : ''])
const saveEvent = async (event,coaches=[]) => (await one('select public.save_coach_schedule_event($1::jsonb,$2::uuid[]) as id',[JSON.stringify(event),coaches])).id
const saveLeave = async (leave,manage=false,requestId=null) => (await one('select public.save_coach_leave_request($1::jsonb,$2,$3::uuid) as id',[JSON.stringify(leave),manage,requestId])).id
const leaves = async (manage=false,month=null,status='all',coach=null) => (await one('select public.list_coach_leave_requests($1::date,$2,$3::uuid,$4) as p',[month,status,coach,manage])).p
// PGlite decodes timestamptz to JS Date; keep the full database revision precision.
const event = async eventId => one('select e.*,e.updated_at::text as updated_at from public.coach_schedule_events e where id=$1::uuid',[eventId])
const leave = async leaveId => one('select l.*,l.updated_at::text as updated_at from public.coach_leave_requests l where id=$1::uuid',[leaveId])
const cancel = async (leaveId,revision,manage=false) => db.query('select public.cancel_coach_leave_request($1::uuid,$2::timestamptz,$3)',[leaveId,revision,manage])
const preview = async month => (await one('select public.preview_coach_schedule_auto_fill($1::date) as p',[month])).p
const confirm = async (month,p,keys) => (await one('select public.confirm_coach_schedule_auto_fill($1::date,$2,$3::text[]) as ids',[month,p.fingerprint,keys])).ids
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table profiles(id uuid primary key,name text,nickname text,email text,role text,avatar_url text,is_active boolean default true,access_start timestamptz,access_end timestamptz);
    create table app_role_permissions(role_key text,feature text,action text,unique(role_key,feature,action));
    create function public.has_app_permission(p_feature text,p_action text) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_active,true)
        and (p.access_start is null or p.access_start<=now()) and (p.access_end is null or p.access_end>=now())
        and (p.role='ADMIN' or exists(select 1 from public.app_role_permissions a where a.role_key=p.role and a.feature=p_feature and a.action=p_action)));
    $$;
    create table training_program_settings(program_key text primary key,label text);
    create table training_venues(id uuid primary key,name text);
    create table training_location_sessions(id uuid primary key,program_key text,training_date date,title text,start_time text,end_time text,status text default 'published',note text);
    create table training_location_session_venues(id uuid primary key,session_id uuid references training_location_sessions(id) on delete cascade,venue_id uuid,
      training_date date,title text,start_time text,end_time text,venue_name text,venue_maps_url text,note text);
    create table matches(id uuid primary key,match_level text,match_date date,match_time text,match_name text,tournament_name text,opponent text,location text,coaches text,note text);
    create table fixture_dates(d date);
    create function public.get_training_month_dates(p_month date) returns jsonb language sql as $$ select jsonb_build_object('training_dates',coalesce(jsonb_agg(d order by d),'[]')) from fixture_dates where date_trunc('month',d)=date_trunc('month',p_month) $$;
    create table public.push_dispatch_events(id uuid primary key default gen_random_uuid(),event_key text unique,feature text,action text,title text,body text,url text,created_at timestamptz default now(),dispatch_mode text,dispatch_status text);
    insert into profiles(id,name,role,is_active) values
      ('${id(1)}','管理員','ADMIN',true),('${id(2)}','教練甲','COACH',true),('${id(3)}','教練乙','HEAD_COACH',true),
      ('${id(4)}','排班經理','MANAGER',true),('${id(5)}','停用教練','COACH',false),('${id(6)}','舊值教練',' 教練 ',true),('${id(7)}','家長','PARENT',true);
    insert into app_role_permissions select 'MANAGER',f,a from (values('coach_schedules'),('coach_leave_requests')) ff(f) cross join (values('VIEW'),('CREATE'),('EDIT'),('DELETE')) aa(a);
    insert into training_program_settings values ('chunggang_school_team','中港總部'),('junior_high_school_team','國中部');
    insert into training_venues values ('${id(80)}','學校'),('${id(81)}','外場');
  `)
  check(!(await one("select exists(select 1 from pg_attribute where attrelid='public.push_dispatch_events'::regclass and attname='coach_leave_payload' and not attisdropped) as ready")).ready,'baseline does not prebuild the coach leave payload column')
  for(const path of ['supabase_coach_schedules_migration.sql','supabase_coach_schedules_schedulable_coaches_hotfix.sql',
    'supabase_coach_schedules_training_location_sync_hotfix.sql','supabase_zzz_coach_schedule_match_source_integrity_migration.sql',
    'supabase/migrations/20260924043936_coach_schedule_program_source_integrity.sql',
    'supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql',
    'supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql']) await db.exec(read(path))
  check((await one("select exists(select 1 from pg_attribute where attrelid='public.push_dispatch_events'::regclass and attname='coach_leave_payload' and atttypid='jsonb'::regtype and not attisdropped) as ready")).ready,'the actual core migration creates the required JSON payload column')
  const dateInfo=await one("select ((now() at time zone 'Asia/Taipei')::date+10)::text as day,((now() at time zone 'Asia/Taipei')::date+11)::text as next_day,((now() at time zone 'Asia/Taipei')::date-1)::text as yesterday,date_trunc('month',(now() at time zone 'Asia/Taipei')::date+10)::date::text as month")
  const {day,next_day:nextDay,yesterday,month}=dateInfo
  await user(1)
  const base={source_type:'manual',schedule_date:day,start_time:'09:00',end_time:'13:00',title:'上午課'}
  const morning=await saveEvent(base,[id(2)])
  const afternoon=await saveEvent({...base,start_time:'13:00',end_time:'15:00',title:'下午課'},[id(2)])
  check(morning!==afternoon,'adjacent half-open bookings are allowed')
  await rejects(saveEvent({...base,start_time:'12:00',end_time:'14:00'},[id(2)]),/同時段/)
  await rejects(saveEvent({...base,start_time:null,end_time:null},[id(2)]),/同時段/)
  await rejects(saveEvent(base,[id(5)]),/停用/)
  await saveEvent({...base,schedule_date:nextDay},[id(6)])
  check((await one('select public.list_schedulable_coaches() as p')).p.some(c=>c.id===id(6)),'legacy coach role candidate also saves successfully')
  const oldEvent=await event(morning)
  await saveEvent({...oldEvent,note:'已更新'},[id(2)])
  await rejects(saveEvent({...oldEvent,note:'舊版本'},[id(2)]),/其他操作更新/)
  await rejects(saveEvent({...oldEvent,updated_at:null},[id(2)]),/其他操作更新/)

  await user(2)
  await rejects(leaves(true),/permission required/)
  await rejects(leaves(false,null,'all',id(3)),/只能查看本人/)
  await rejects(saveLeave({coach_profile_id:id(3),start_date:day,end_date:day,time_segment:'full_day'}),/只能建立本人/)
  await rejects(saveLeave({start_date:yesterday,end_date:yesterday}),/今天起/)
  await rejects(saveLeave({start_date:day,end_date:nextDay,time_segment:'morning'}),/多日/)
  const request=id(900)
  const ownLeave=await saveLeave({start_date:day,end_date:day,time_segment:'morning',reason:'private secret'},false,request)
  check(await saveLeave({start_date:day,end_date:day,time_segment:'morning',reason:'private secret'},false,request)===ownLeave,'create retries return one leave UUID')
  await rejects(saveLeave({start_date:day,end_date:day,time_segment:'afternoon'},false,request),/識別碼/)
  await rejects(saveLeave({start_date:day,end_date:day,time_segment:'full_day'}),/重疊/)
  check((await leaves()).leaves.length===1 && (await leaves()).coaches.length===0,'own list reveals only own leave and no profile list')
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[morning])),'morning leave removes morning assignment')
  check(Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[afternoon])),'morning leave leaves exactly-13:00 afternoon assignment intact')
  check((await event(morning)).updated_at!==oldEvent.updated_at,'leave removal invalidates open schedule revisions')
  check((await rows('select * from private.coach_schedule_assignment_changes')).length===1,'removed assignment is audited exactly once')
  check((await rows('select * from push_dispatch_events')).length===1,'leave retry enqueues exactly one notification')
  const notification=await one('select * from push_dispatch_events')
  check(!JSON.stringify(notification).includes('private secret') && notification.url.includes('highlight_leave_id='),'outbox omits reason and uses highlight deep link')
  check(notification.body.includes(day) && notification.body.includes('上午') && notification.body.includes('已新增請假'),'created notification includes date, segment and operation')
  check(notification.coach_leave_payload.operation==='created' && notification.coach_leave_payload.revision===1,'outbox carries operation and stable revision')
  await user(3)
  check((await leaves()).leaves.length===0,'unrelated coach cannot list other leave reasons')
  await rejects(cancel(ownLeave,(await leave(ownLeave)).updated_at),/只能處理本人/)
  await rejects(saveLeave({...await leave(ownLeave),reason:'forbidden'},null),/只能處理本人/)
  await rejects(cancel(ownLeave,(await leave(ownLeave)).updated_at,null),/只能處理本人/)
  await user(4)
  const management=await leaves(true)
  check(management.leaves[0].reason==='private secret' && management.coaches.some(c=>c.id===id(2)),'manager feature permits reasons and schedulable profiles')
  const sched=(await one('select list_coach_schedule_admin_month($1::date) as p',[month])).p
  const publicChange=sched.events.find(e=>e.id===morning)
  check(publicChange.assignment_changes[0].coach_profile_id===id(2) && !JSON.stringify(sched).includes('private secret'),'schedule changes expose no private reason')
  await rejects(saveEvent(await event(morning),[id(2)]),/已請假/)
  await rejects(saveEvent({...await event(morning),status:'   '},[id(2)]),/已請假/)
  const l=await leave(ownLeave)
  await rejects(saveLeave({...l,updated_at:'2000-01-01T00:00:00Z'},true),/已更新/)
  await cancel(ownLeave,l.updated_at,true)
  await cancel(ownLeave,l.updated_at,true)
  check((await rows('select * from push_dispatch_events')).length===2,'cancel retry is idempotent')
  const cancelEvent=await one("select * from push_dispatch_events where coach_leave_payload->>'operation'='cancelled'")
  check(cancelEvent.body.includes(day) && cancelEvent.body.includes('上午') && cancelEvent.body.includes('已取消請假，可重新安排排班') && !cancelEvent.body.includes('private secret'),'cancellation explicitly permits reassignment without private reason')
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[morning])),'cancel never restores removed assignments')
  await saveEvent(await event(morning),[id(2)])
  const afternoonLeave=await saveLeave({coach_profile_id:id(2),start_date:day,end_date:day,time_segment:'afternoon'},true)
  check(Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[morning])),'afternoon leave does not remove event ending at 13:00')
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[afternoon])),'afternoon leave removes event beginning at 13:00')
  await cancel(afternoonLeave,(await leave(afternoonLeave)).updated_at,true)

  // Source reconciliation preserves shared identity; extending a slot into leave removes its coach.
  await db.query(`insert into training_location_sessions(id,program_key,training_date,title,start_time,end_time) values($1,'chunggang_school_team',$3,'場地課','09:00','12:00'),($2,'junior_high_school_team',$3,'場地課','09:00','12:30')`,[id(10),id(11),nextDay])
  await db.exec(`insert into training_location_session_venues(id,session_id,venue_id,venue_name) values('${id(20)}','${id(10)}','${id(80)}','學校'),('${id(21)}','${id(11)}','${id(80)}','學校')`)
  const source={source_type:'training_location',source_id:id(10),source_venue_id:id(20),schedule_date:nextDay,title:'舊快照'}
  const shared=await saveEvent(source,[id(3)])
  await saveLeave({coach_profile_id:id(3),start_date:nextDay,end_date:nextDay,time_segment:'afternoon'},true)
  check(Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[shared])),'non-overlapping source assignment remains')
  await db.exec(`update training_location_session_venues set end_time='14:00' where id='${id(21)}'`)
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[shared])),'source extension rechecks leave after shared-slot reconciliation')
  check((await event(shared)).training_source_venue_ids.length===2,'leave changes preserve all shared source links')
  await db.exec(`delete from training_location_session_venues where id='${id(20)}'`)
  check((await event(shared)).source_venue_id===id(21),'source deletion still reanchors shared slot')

  // Exact rule matching and atomic preview/confirm; use a fresh training date next month.
  const future=await one("select (date_trunc('month',now() at time zone 'Asia/Taipei')+interval '1 month'+interval '7 days')::date::text as day,extract(dow from date_trunc('month',now() at time zone 'Asia/Taipei')+interval '1 month'+interval '7 days')::integer as weekday")
  const futureDay=future.day
  const futureMonth=futureDay.slice(0,7)+'-01'
  await db.query('insert into fixture_dates values($1::date)',[futureDay])
  const template={name:'週末固定班',is_active:true,weekday:future.weekday,source_type:'training_date',venue_id:null,start_time:'09:00',title:'週六訓練',coach_profile_ids:[id(2),id(3)]}
  const saveTemplate=async value=>(await one('select save_coach_schedule_template($1::jsonb) as id',[JSON.stringify(value)])).id
  const templateId=await saveTemplate(template)
  await rejects(saveTemplate({...template,name:'重複'}),/已有啟用範本/)
  const disabledId=await saveTemplate({...template,name:'停用備用',is_active:false})
  check(Boolean(disabledId),'disabled matching templates may coexist')
  let p=await preview(futureMonth)
  check(p.rows.length===1 && p.rows[0].proposed_coach_profile_ids.length===2,'preview matches exact generic training rule')
  await saveLeave({coach_profile_id:id(2),start_date:futureDay,end_date:futureDay,time_segment:'morning',reason:'another secret'},true)
  await rejects(confirm(futureMonth,p,[p.rows[0].event_key]),/重新產生預覽/)
  p=await preview(futureMonth)
  check(p.rows[0].proposed_coach_profile_ids.length===1 && p.rows[0].vacancy_count===1 && p.rows[0].excluded_coaches[0].reason==='教練已請假','preview excludes leave and reports vacancy')
  check(!JSON.stringify(p).includes('another secret'),'preview never reveals leave reason')
  const saved=await confirm(futureMonth,p,[p.rows[0].event_key])
  check(saved.length===1,'confirm persists proposed available roster')
  check(JSON.stringify(await confirm(futureMonth,p,[p.rows[0].event_key]))===JSON.stringify(saved),'same confirmation retry returns existing IDs')
  check((await preview(futureMonth)).rows.length===0,'autofill never overwrites already assigned event')
  await rejects(saveEvent({source_type:'training_date',schedule_date:futureDay,start_time:'09:00',end_time:'12:30',title:'週六訓練'},[id(2)]),/已有教練排班/)
  const t=(await one('select list_coach_schedule_templates() as p')).p.find(item=>item.id===templateId)
  await saveTemplate({...t,name:'重新命名'})
  await rejects(saveTemplate({...t,name:'過期更新'}),/已更新/)
  await rejects(db.query('select delete_coach_schedule_template($1::uuid,$2::timestamptz)',[templateId,t.updated_at]),/已更新/)

  // Incomplete times use full-day collision checks; within-batch bookings reserve one coach only.
  await db.query(`insert into training_location_sessions(id,program_key,training_date,title,start_time,end_time) values($1,'chunggang_school_team',$3,'雙場課','09:00','12:00'),($2,'chunggang_school_team',$3,'未知時間','10:00','09:00')`,[id(30),id(31),futureDay])
  await db.exec(`insert into training_location_session_venues(id,session_id,venue_id,venue_name) values('${id(40)}','${id(30)}','${id(80)}','學校'),('${id(41)}','${id(30)}','${id(81)}','外場'),('${id(42)}','${id(31)}','${id(80)}','學校')`)
  for(const venue of [id(80),id(81)]) await saveTemplate({...template,name:venue,source_type:'training_location',venue_id:venue,title:'雙場課',coach_profile_ids:[id(6)]})
  await saveTemplate({...template,name:'未知時間',source_type:'training_location',venue_id:id(80),title:'未知時間',start_time:'10:00',coach_profile_ids:[id(6)]})
  p=await preview(futureMonth)
  check(p.rows.filter(r=>r.event.title==='雙場課' && r.proposed_coach_profile_ids.length===1).length===1,'preview reserves each coach once across overlapping proposed slots')
  check(p.rows.find(r=>r.event.title==='未知時間').time_incomplete,'inverted source times are incomplete')
  const empty=p.rows.find(r=>r.proposed_coach_profile_ids.length===0)
  await rejects(confirm(futureMonth,p,[empty.event_key]),/無可用教練/)
  const good=p.rows.find(r=>r.proposed_coach_profile_ids.length>0)
  await db.exec(`update training_location_session_venues set title='來源改名' where id='${id(40)}'`)
  await rejects(confirm(futureMonth,p,[good.event_key]),/重新產生預覽/)

  // A matching slot with a missing/inverted end can still be assigned when no full-day conflict exists.
  const incompleteDay=(await one("select ($1::date+2)::text as day,extract(dow from $1::date+2)::integer as weekday",[futureDay]))
  await db.query(`insert into training_location_sessions(id,program_key,training_date,title,start_time,end_time) values($1,'chunggang_school_team',$2,'待確認時間','09:00','08:00')`,[id(70),incompleteDay.day])
  await db.exec(`insert into training_location_session_venues(id,session_id,venue_id,venue_name) values('${id(71)}','${id(70)}','${id(80)}','學校')`)
  await saveTemplate({...template,name:'保守全日檢查',weekday:incompleteDay.weekday,source_type:'training_location',venue_id:id(80),title:'待確認時間',coach_profile_ids:[id(6)]})
  p=await preview(futureMonth)
  const incompleteRow=p.rows.find(r=>r.event.source_venue_id===id(71))
  check(incompleteRow.time_incomplete && incompleteRow.proposed_coach_profile_ids[0]===id(6),'incomplete slot proposes an otherwise available coach with clear flag')
  const incompleteSaved=await confirm(futureMonth,p,[incompleteRow.event_key])
  check(incompleteSaved.length===1,'incomplete slot confirms after conservative full-day collision check')
  await rejects(saveEvent({...base,schedule_date:incompleteDay.day,start_time:'16:00',end_time:'17:00'},[id(6)]),/同時段/)

  // Match mutations lock before rows, and all source types retain revision/source guards.
  check((await one("select count(*)::integer as n from pg_trigger where tgrelid='public.matches'::regclass and tgname='coach_training_slots_lock' and (tgtype & 1)=0 and (tgtype & 2)=2")).n===1,'matches acquire shared advisory lock in a BEFORE statement trigger')
  const matchDay=(await one("select ($1::date+5)::text as day",[futureDay])).day
  await db.query("insert into matches(id,match_level,match_date,match_time,match_name) values($1,'友誼賽',$3,'下午1.30 - 下午3.00','同名賽事'),($2,'友誼賽',$3,'下午1.30 - 下午3.00','同名賽事')",[id(200),id(201),matchDay])
  const matchA=await saveEvent({source_type:'match',source_id:id(200),schedule_date:matchDay,title:'stale title'},[id(2)])
  const matchB=await saveEvent({source_type:'match',source_id:id(201),schedule_date:matchDay,title:'stale title'},[id(3)])
  check(matchA!==matchB && (await event(matchA)).start_time==='13:30','match UUID identity and canonical Chinese time parsing survive wrapper')
  const matchOld=await event(matchA)
  await saveEvent({...matchOld,note:'new'},[id(2)])
  await rejects(saveEvent({...matchOld,note:'stale'},[id(2)]),/其他操作更新/)
  const oldGeneric=await event(saved[0])
  await saveEvent({...oldGeneric,note:'new'},[id(3)])
  await rejects(saveEvent({...oldGeneric,note:'stale'},[id(3)]),/其他操作更新/)
  await db.query("update matches set match_level='特訓課' where id=$1",[id(200)])
  check((await event(matchA)).source_type==='training_class','match-level source reconciliation remains intact')
  await db.query('delete from matches where id=$1',[id(200)])
  check(!(await event(matchA)) && Boolean(await event(matchB)),'match source delete still removes only the UUID-linked event')
  await rejects(saveEvent({source_type:'match',source_id:id(200),schedule_date:matchDay,title:'deleted'},[id(2)]),/來源已刪除/)

  // Editing a range never restores removed assignments; unknown event times count as full-day overlap.
  const laterInfo=await one("select ($1::date+3)::text as first,($1::date+4)::text as last",[futureDay])
  const rangeFirst=laterInfo.first,rangeLast=laterInfo.last
  const rangeEvent=await saveEvent({...base,schedule_date:rangeLast,title:'範圍課'},[id(6)])
  const rangeLeave=await saveLeave({coach_profile_id:id(6),start_date:rangeFirst,end_date:rangeLast,time_segment:'full_day',reason:'old'},true)
  const rangeSaved=await leave(rangeLeave)
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[rangeEvent])),'multi-day leave removes overlapping end-day assignment')
  await saveLeave({...rangeSaved,end_date:rangeFirst,reason:'new'},true)
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[rangeEvent])),'reducing leave range never restores removed assignment')
  const rangeNew=await leave(rangeLeave)
  const updatedEvent=await one("select * from push_dispatch_events where coach_leave_payload->>'leave_id'=$1 and coach_leave_payload->>'operation'='updated'",[rangeLeave])
  check(updatedEvent.body.includes(rangeFirst) && updatedEvent.body.includes('全日') && updatedEvent.body.includes('已修改請假') && !updatedEvent.body.includes('new'),'updated notification includes dates, segment and operation without reason')
  check(rangeNew.revision===2 && rangeNew.updated_at!==rangeSaved.updated_at,'edit advances leave revision and timestamp')
  check((await rows('select * from private.coach_leave_audit where leave_id=$1::uuid',[rangeLeave])).length===2,'creation and edit retain before/after leave audit')
  check((await rows("select * from push_dispatch_events where coach_leave_payload->>'leave_id'=$1",[rangeLeave])).length===2,'each committed leave revision enqueues once')
  await saveEvent(await event(rangeEvent),[id(6)])
  const unknown=await saveEvent({...base,schedule_date:rangeFirst,title:'時間未定',start_time:null,end_time:null},[id(3)])
  await saveLeave({coach_profile_id:id(3),start_date:rangeFirst,end_date:rangeFirst,time_segment:'morning'},true)
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[unknown])),'unknown event range conservatively overlaps half-day leave')
  check((await one("select private.coach_time_minutes('120:30') as t")).t===null,'time parser never matches inside an invalid three-digit hour')
  check((await one("select private.coach_time_minutes('下午1.30 - 下午3.00') as s,private.coach_time_minutes('下午1.30 - 下午3.00',2) as e")).s===810,'time parser understands Chinese afternoon marker')
  await user(6)
  await rejects(leaves(),/permission required/)
  check((await one('select list_coach_schedule_dashboard($1::date) as p',[futureMonth])).p.scope==='own','legacy coach label receives own dashboard scope consistently')
  await user(4)
  // Saved empty rosters are edited, and confirmation retries retain the original action requirements.
  const editableInfo=await one("select ($1::date+7)::text as day,extract(dow from $1::date+7)::integer as weekday",[futureDay])
  await db.query('insert into fixture_dates values($1::date)',[editableInfo.day])
  const blank=await saveEvent({source_type:'training_date',schedule_date:editableInfo.day,start_time:'09:00',end_time:'12:30',title:'週六訓練'},[])
  await saveTemplate({...template,name:'空班補齊',weekday:editableInfo.weekday,coach_profile_ids:[id(6)]}).catch(error=>{ if(!error.message.includes('已有啟用範本')) throw error })
  const existingTemplate=(await one('select list_coach_schedule_templates() as p')).p.find(t=>t.id===templateId)
  await saveTemplate({...existingTemplate,coach_profile_ids:[id(6)]})
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_schedules' and action='CREATE'")
  p=await preview(futureMonth)
  const editableRow=p.rows.find(r=>r.event.id===blank)
  check(Boolean(editableRow),'existing saved empty roster remains eligible for autofill')
  const editedIds=await confirm(futureMonth,p,[editableRow.event_key])
  check(editedIds[0]===blank,'EDIT-only manager fills existing empty roster')
  check((await confirm(futureMonth,p,[editableRow.event_key]))[0]===blank,'EDIT-only retry requires EDIT rather than unrelated CREATE')
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_schedules' and action='EDIT'")
  await rejects(confirm(futureMonth,p,[editableRow.event_key]),/permission required/)
  await db.exec("insert into app_role_permissions values('MANAGER','coach_schedules','CREATE'),('MANAGER','coach_schedules','EDIT')")

  // Ongoing multi-day leave retains today's/future editable portion; only fully ended leave is historical.
  const ongoingInfo=await one("select (now() at time zone 'Asia/Taipei')::date::text as today,((now() at time zone 'Asia/Taipei')::date+2)::text as ending")
  const todayEvent=await saveEvent({...base,schedule_date:ongoingInfo.today,title:'今日課'},[id(6)])
  await db.query("insert into coach_leave_requests(id,coach_profile_id,start_date,end_date,time_segment,reason,created_by,updated_by) values($1,$2,$3,$4,'full_day','legacy secret',$5,$5)",[id(950),id(6),yesterday,ongoingInfo.ending,id(1)])
  const ongoing=await leave(id(950))
  await saveLeave({...ongoing,start_date:ongoingInfo.today,end_date:ongoingInfo.today,reason:'ongoing edit'},true)
  check((await leave(id(950))).start_date.toISOString().slice(0,10)===ongoingInfo.today,'ongoing leave may be edited into today/future range')
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[todayEvent])),'editing ongoing leave removes today assignment')
  await cancel(id(950),(await leave(id(950))).updated_at,true)
  check((await leave(id(950))).status==='cancelled','ongoing-origin leave may be cancelled')
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1::uuid',[todayEvent])),'ongoing cancellation never restores removed assignments')
  await db.query("insert into coach_leave_requests(id,coach_profile_id,start_date,end_date,time_segment,created_by,updated_by) values($1,$3,$4,$5,'full_day',$6,$6),($2,$3,$4,$4,'full_day',$6,$6)",[id(951),id(952),id(6),yesterday,ongoingInfo.ending,id(1)])
  await cancel(id(951),(await leave(id(951))).updated_at,true)
  check((await leave(id(951))).status==='cancelled','a still-active past-starting leave can be cancelled directly')
  await rejects(cancel(id(952),(await leave(id(952))).updated_at,true),/歷史假單/)
  await rejects(saveLeave({...await leave(id(952)),start_date:ongoingInfo.today,end_date:ongoingInfo.today},true),/歷史/)

  // Real role grants, active sessions, RLS/revokes, anonymous and private API boundaries.
  await user(7)
  await rejects(leaves(),/permission required/)
  await rejects(preview(futureMonth),/permission required/)
  await user(5)
  await rejects(leaves(),/帳號已停用/)
  await user(2)
  await db.exec(`update profiles set access_end=now()-interval '1 minute' where id='${id(2)}'`)
  await rejects(leaves(),/帳號已停用/)
  await db.exec(`update profiles set access_end=null where id='${id(2)}'`)
  await user(1)
  await db.exec('set role authenticated')
  await rejects(db.query("insert into coach_schedule_events(source_type,schedule_date,title) values('manual',$1::date,'繞過')",[futureDay]),/permission denied/)
  await rejects(db.query('select * from coach_leave_requests'),/permission denied/)
  check((await leaves(true)).leaves.length>0,'authenticated manager invokes privileged RPC while raw table denied')
  await db.exec('reset role')
  await user(null)
  await rejects(leaves(),/登入狀態/)
  for(const fn of ['public.save_coach_leave_request(jsonb,boolean,uuid)','public.preview_coach_schedule_auto_fill(date)','private.save_coach_schedule_event_base(jsonb,uuid[])']) check(!(await one('select has_function_privilege(\'anon\',$1,\'execute\') as ok',[fn])).ok,'anonymous function denied '+fn)
  for(const table of ['private.coach_leave_audit','private.coach_schedule_assignment_changes','private.coach_schedule_auto_fill_receipts']) check(!(await one('select has_table_privilege(\'authenticated\',$1,\'select\') as ok',[table])).ok,'private audit denied '+table)

  // Execute both real migrations in one database. Only the shared notification
  // baseline is a fixture; coach_leave_payload and events must come from core.
  const coreChecks=checks
  await db.exec(`
    alter table public.push_dispatch_events
      add column locked_at timestamptz, add column completed_at timestamptz,
      add column updated_at timestamptz default now(), add column last_error text,
      add column target_count integer default 0, add column sent_count integer default 0,
      add column expired_count integer default 0, add column failed_count integer default 0,
      add column provider_counts jsonb default '{}';
    create table public.web_push_subscriptions(id uuid primary key,user_id uuid,
      endpoint text,subscription jsonb,enabled boolean);
    create table public.push_dispatch_deliveries(id uuid primary key default gen_random_uuid(),
      event_id uuid references public.push_dispatch_events,subscription_id uuid,user_id uuid,
      endpoint text,subscription jsonb,provider text,status text default 'pending',
      attempt_count integer default 0,next_attempt_at timestamptz default now(),locked_at timestamptz,
      sent_at timestamptz,last_error text,created_at timestamptz default now(),updated_at timestamptz default now(),
      unique(event_id,subscription_id));
    create function public.current_profile_role() returns text language sql stable security definer set search_path='' as $$
      select role from public.profiles where id=auth.uid() and coalesce(is_active,true)
        and (access_start is null or access_start<=now()) and (access_end is null or access_end>=now())
    $$;
    create function public.get_notification_feed(integer default 10,boolean default false)
      returns table(id text,source text,title text,body text,created_at timestamptz,link text,highlight_member_id uuid)
      language sql as $$ select 'legacy_feed','training_location','既有場地通知','原有內容',
        now()-interval '1 day','/training-locations',null::uuid $$;
    insert into app_role_permissions values('COACH','coach_schedules','VIEW'),('PARENT','coach_schedules','VIEW')
      on conflict do nothing;
    insert into public.web_push_subscriptions values
      ('${id(301)}','${id(1)}','https://push.example/admin','{}',true),
      ('${id(302)}','${id(2)}','https://push.example/coach','{}',true),
      ('${id(303)}','${id(3)}','https://push.example/own-only-head','{}',true),
      ('${id(304)}','${id(4)}','https://push.example/manager','{}',true),
      ('${id(307)}','${id(7)}','https://push.example/parent','{}',true);
  `)
  await db.exec(read('supabase/migrations/20261002150855_coach_leave_notification_outbox.sql').split('-- Cron deployment:')[0]+'commit;')
  check((await one("select to_regprocedure('public.get_coach_leave_notification_delivery(uuid,integer)') is not null as ready")).ready,'notification migration installs against the actual completed core schema')
  const chainDay=(await one('select ($1::date+20)::text as day',[futureDay])).day
  await user(2)
  await db.exec('set role authenticated')
  const chainLeave=await saveLeave({start_date:chainDay,end_date:chainDay,time_segment:'afternoon',reason:'chain private secret'},false,id(980))
  await db.exec('reset role')
  const chainEvent=await one('select * from push_dispatch_events where event_key=$1',[`coach_leave:${chainLeave}:1:created`])
  check(chainEvent.coach_leave_payload.leave_id===chainLeave && chainEvent.coach_leave_payload.start_date===chainDay && chainEvent.dispatch_status==='pending','real authenticated leave save enqueues the payload expected by the worker')
  check((await leave(chainLeave)).reason==='chain private secret' && !JSON.stringify(chainEvent).includes('chain private secret'),'private reason is retained only in the leave record')
  check(chainEvent.body.includes(chainDay) && chainEvent.body.includes('下午') && chainEvent.body.includes('已新增請假'),'real chain event carries dates, segment and operation')
  const asRole=async (profile,role='authenticated') => {
    await db.exec('reset role'); await user(profile); await db.exec(`set role ${role}`)
  }
  await asRole(4)
  const managerFeed=await rows('select * from public.get_notification_feed(50,false)')
  check(managerFeed.some(row=>row.id==='legacy_feed'),'the actual notification migration preserves the existing targeted feed')
  check(managerFeed.some(row=>row.id===chainEvent.event_key && row.link===`/coach-leave-requests?highlight_leave_id=${chainLeave}`),'real enqueue event appears in the manager feed with its leave deep link')
  check(!JSON.stringify(managerFeed).includes('chain private secret') && !JSON.stringify(managerFeed).includes('private secret'),'feed does not expose reasons from actual core events')
  await asRole(2)
  const coachFeed=await rows('select * from public.get_notification_feed(50,false)')
  check(coachFeed.some(row=>row.id===chainEvent.event_key && row.link===`/coach-schedules?month=${chainDay.slice(0,7)}`),'schedule-view coach sees the actual event with a month deep link')
  await asRole(7)
  check(!(await rows('select * from public.get_notification_feed(50,false)')).some(row=>row.source==='coach_leave'),'a parent with schedule VIEW receives no coach leave events')
  await asRole(null,'service_role')
  const claimedEvents=await rows('select * from public.claim_coach_leave_notification_outbox_events(25)')
  check(claimedEvents.some(row=>row.id===notification.id) && claimedEvents.some(row=>row.id===chainEvent.id),'worker recognizes actual enqueue events created before and after its migration')
  check(!JSON.stringify(claimedEvents).includes('private secret'),'worker claims never expose private leave reasons')
  check((await one('select public.initialize_coach_leave_notification_deliveries($1::uuid) as n',[chainEvent.id])).n===3,'actual event targets admin, manager and schedule-view coach subscriptions')
  const claimedDeliveries=await rows('select * from public.claim_coach_leave_notification_deliveries(100)')
  check(claimedDeliveries.length===3 && claimedDeliveries.every(row=>row.event_id===chainEvent.id),'actual event creates exactly one worker delivery per eligible subscription')
  const coachDelivery=claimedDeliveries.find(row=>row.user_id===id(2))
  const managerDelivery=claimedDeliveries.find(row=>row.user_id===id(4))
  const getDelivery=async delivery => one('select * from public.get_coach_leave_notification_delivery($1::uuid,$2)',[delivery.id,delivery.attempt_count])
  check((await getDelivery(coachDelivery)).url===`/coach-schedules?month=${chainDay.slice(0,7)}`,'delivery refresh derives the coach month URL from the actual core payload')
  const refreshedManager=await getDelivery(managerDelivery)
  check(refreshedManager.url===`/coach-leave-requests?highlight_leave_id=${chainLeave}` && !JSON.stringify(refreshedManager).includes('chain private secret'),'delivery refresh derives the manager leave URL without its private reason')
  await db.exec('reset role')
  console.log(`PASS: ${checks} coach leave and template SQL checks (${checks-coreChecks} real core-to-notification chain checks)`)
} catch(error) { console.error(error.message, error.where || '', error.position, error.query?.slice(Math.max(0,Number(error.position)-200),Number(error.position)+150)); process.exitCode=1 } finally { await db.close() }
