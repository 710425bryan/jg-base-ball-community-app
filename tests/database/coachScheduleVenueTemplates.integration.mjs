// Isolated PostgreSQL integration using the actual deployed core and forward migration.
// No network or production data. Multi-connection locking still needs staging validation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const read = path => readFileSync(new URL(`../../${path}`,import.meta.url),'utf8')
const migration='supabase/migrations/20261002171951_coach_schedule_venue_templates.sql'
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const rows = async (sql,args=[]) => (await db.query(sql,args)).rows
const one = async (sql,args=[]) => (await rows(sql,args))[0]
const user = async n => db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : ''])
let checks=0
const check = (value,message) => { assert.ok(value,message); checks++ }
const rejects = async (promise,pattern) => { await assert.rejects(promise,pattern); checks++ }
const rpc = async (name) => (await one(`select public.${name}() as p`)).p
const saveTemplate = async p => (await one('select public.save_coach_schedule_template($1::jsonb) as id',[JSON.stringify(p)])).id
const template = async templateId => one('select t.*,t.updated_at::text as updated_at from coach_schedule_templates t where id=$1::uuid',[templateId])
const saveEvent = async (event,coaches=[]) => (await one('select public.save_coach_schedule_event($1::jsonb,$2::uuid[]) as id',[JSON.stringify(event),coaches])).id
const event = async eventId => one('select e.*,e.updated_at::text as updated_at from coach_schedule_events e where id=$1::uuid',[eventId])
const saveLeave = async p => (await one('select public.save_coach_leave_request($1::jsonb,true) as id',[JSON.stringify(p)])).id
const adminMonth = async month => (await one('select public.list_coach_schedule_admin_month($1::date) as p',[month])).p
const preview = async month => (await one('select public.preview_coach_schedule_auto_fill($1::date) as p',[month])).p
const confirm = async (month,p,keys) => (await one('select public.confirm_coach_schedule_auto_fill($1::date,$2,$3::text[]) as ids',[month,p.fingerprint,keys])).ids
const functions = ['public.save_coach_schedule_event(jsonb,uuid[])','public.save_coach_leave_request(jsonb,boolean,uuid)',
  'private.save_coach_schedule_event_base(jsonb,uuid[])','private.list_coach_schedule_admin_month_base(date)',
  'private.list_coach_schedule_dashboard_base(date)','public.delete_coach_schedule_template(uuid,timestamp with time zone)']
const hashes = async () => rows('select oid::regprocedure::text as name,md5(prosrc) as hash from pg_proc where oid=any($1::regprocedure[]) order by oid',[functions])
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
    create table training_venues(id uuid primary key default gen_random_uuid(),name text not null unique,
      address text,maps_url text,sort_order integer not null default 0,is_active boolean not null default true,
      created_by uuid references profiles(id) on delete set null,created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),check(length(btrim(name))>0));
    alter table training_venues enable row level security;
    create policy venue_view on training_venues for select to authenticated using(has_app_permission('training_locations','VIEW'));
    create policy venue_create on training_venues for insert to authenticated with check(has_app_permission('training_locations','CREATE'));
    create policy venue_edit on training_venues for update to authenticated using(has_app_permission('training_locations','EDIT')) with check(has_app_permission('training_locations','EDIT'));
    create policy venue_delete on training_venues for delete to authenticated using(has_app_permission('training_locations','DELETE'));
    grant select,insert,update,delete on training_venues to authenticated,service_role;
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
    insert into training_venues(id,name,address,maps_url,sort_order,is_active) values
      ('${id(80)}','中港國小','private address','private map',0,true),
      ('${id(81)}','輔大棒球場地',null,null,1,true),('${id(82)}','新泰國中',null,null,2,true),
      ('${id(83)}','停用球場','inactive address','inactive map',3,false),
      ('${id(84)}','中港國小 ',null,null,4,true);
    insert into training_program_settings values ('chunggang_school_team','中港總部',array[6],true,0),
      ('junior_high_school_team','國中部',array[0],true,1),('inactive_program','停用項目',array[1],false,-1);
  `)
  for(const path of ['supabase_coach_schedules_migration.sql','supabase_coach_schedules_schedulable_coaches_hotfix.sql',
    'supabase_coach_schedules_training_location_sync_hotfix.sql','supabase_zzz_coach_schedule_match_source_integrity_migration.sql',
    'supabase/migrations/20260924043936_coach_schedule_program_source_integrity.sql',
    'supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql',
    'supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql']) await db.exec(read(path))
  await user(1)
  const beforeHashes=await hashes()
  const oldTemplate=await saveTemplate({name:'舊星期範本',weekday:6,source_type:'training_date',start_time:'09:00',title:'週六訓練',coach_profile_ids:[id(2)]})
  const beforeSave=(await one("select md5(prosrc) as hash from pg_proc where oid='public.save_coach_schedule_template(jsonb)'::regprocedure")).hash
  await rejects(db.exec(read(migration)),/已有固定排班範本/)
  await db.exec('rollback')
  check(Boolean(await template(oldTemplate)),'nonempty preflight preserves the old template')
  check((await one("select md5(prosrc) as hash from pg_proc where oid='public.save_coach_schedule_template(jsonb)'::regprocedure")).hash===beforeSave,'preflight failure preserves old RPC definitions')
  check((await one("select to_regprocedure('public.list_coach_schedule_template_venues()') is null as missing")).missing,'preflight failure installs no partial new API')
  await db.query('select public.delete_coach_schedule_template($1::uuid,$2::timestamptz)',[oldTemplate,(await template(oldTemplate)).updated_at])
  await db.exec(read(migration))
  check(JSON.stringify(await hashes())===JSON.stringify(beforeHashes),'migration preserves core saves, private source bases, dashboard and versioned delete')
  const columns=await rows("select column_name,is_nullable from information_schema.columns where table_name='coach_schedule_templates'")
  check(!columns.some(c=>['weekday','source_type','start_time','title'].includes(c.column_name)),'obsolete match condition columns are removed')
  check(columns.find(c=>c.column_name==='venue_id').is_nullable==='NO','every template references a physical venue')
  check((await one("select indexdef from pg_indexes where indexname='coach_schedule_templates_active_venue_unique'")).indexdef.includes('WHERE is_active'),'active venue template uniqueness is enforced by the database')
  const trigger=await one("select tgtype,tgfoid::regprocedure::text as function from pg_trigger where tgrelid='training_venues'::regclass and tgname='coach_training_slots_lock'")
  check(trigger.tgtype===30 && trigger.function==='private.lock_coach_training_slots()','dictionary writes acquire the shared lock BEFORE each INSERT/UPDATE/DELETE statement')
  check((await one("select relrowsecurity from pg_class where oid='coach_schedule_templates'::regclass")).relrowsecurity,'template RLS remains enabled')
  check((await one("select count(*)::integer as n from pg_policy where polrelid='training_venues'::regclass")).n===4,'venue dictionary RLS policies are unchanged')
  const newFunctions=['public.list_coach_schedule_template_venues()','public.list_coach_schedule_templates()',
    'public.save_coach_schedule_template(jsonb)','public.preview_coach_schedule_auto_fill(date)',
    'public.confirm_coach_schedule_auto_fill(date,text,text[])']
  for(const fn of newFunctions) {
    const acl=await one("select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as authenticated,has_function_privilege('service_role',$1,'execute') as service,proconfig,prosecdef from pg_proc where oid=$1::regprocedure",[fn])
    check(!acl.anon && acl.authenticated && acl.service && acl.prosecdef && acl.proconfig.includes('search_path=""'),`RPC ACL and fixed search path: ${fn}`)
  }
  check(!(await one("select has_function_privilege('authenticated','private.enrich_coach_schedule_payload(jsonb)','execute') as allowed")).allowed,'private enrichment remains inaccessible directly')
  for(const table of ['coach_schedule_templates','coach_schedule_events','coach_schedule_assignments'])
    check(!(await one("select has_table_privilege('authenticated',$1,'insert,update,delete') as allowed",[table])).allowed,`raw DML remains revoked: ${table}`)

  await user(4)
  await db.exec('set role authenticated')
  const venues=await rpc('list_coach_schedule_template_venues')
  check(venues.length===4 && venues.every(v=>Object.keys(v).sort().join(',')==='id,name'),'schedule viewer reads only active IDs and names, with no addresses or maps')
  check(!(await one('select count(*)::integer as n from training_venues')).n,'schedule permission does not grant raw venue access through RLS')
  await rejects(db.query("insert into training_venues(name) values('越權場地')"),/row-level security/)
  await db.exec('reset role')
  await user(2)
  await rejects(rpc('list_coach_schedule_template_venues'),/permission required/)
  await user(null)
  await rejects(rpc('list_coach_schedule_template_venues'),/登入/)
  await user(4)
  const standard={match_mode:'venue',venue_id:id(80),coach_profile_ids:[id(2),id(3),id(2)],name:'  '}
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_schedules' and action='CREATE'")
  check((await rpc('list_coach_schedule_template_venues')).length===4,'VIEW-only manager can still select venues')
  await rejects(saveTemplate(standard),/permission required/)
  await db.exec("insert into app_role_permissions values('MANAGER','coach_schedules','CREATE')")
  for(const patch of ["is_active=false","access_start=now()+interval '1 day'","access_end=now()-interval '1 day'"]) {
    await db.exec(`update profiles set ${patch} where id='${id(4)}'`)
    await rejects(rpc('list_coach_schedule_template_venues'),/帳號已停用/)
    await rejects(saveTemplate(standard),/帳號已停用/)
    await db.exec(`update profiles set is_active=true,access_start=null,access_end=null where id='${id(4)}'`)
  }
  await rejects(saveTemplate({...standard,match_mode:undefined,venue_id:null,venue_name:'舊客戶端場地'}),/配對方式已更新/)
  check(!(await one("select 1 from training_venues where name='舊客戶端場地'")),'old client is rejected before creating any venue')
  await rejects(saveTemplate({...standard,coach_profile_ids:[]}),/至少一位有效教練/)
  await rejects(saveTemplate({...standard,coach_profile_ids:[id(5)]}),/至少一位有效教練/)
  const schoolTemplate=await saveTemplate(standard)
  check((await template(schoolTemplate)).name==='中港國小' && (await template(schoolTemplate)).coach_profile_ids.length===2,'blank name uses canonical venue and coach IDs are deduplicated')
  const listed=(await rpc('list_coach_schedule_templates'))[0]
  check(Object.keys(listed).sort().join(',')==='coach_profile_ids,id,is_active,match_mode,name,updated_at,venue_id,venue_is_active,venue_name' && listed.match_mode==='venue','list DTO contains only the new venue template contract')
  await rejects(saveTemplate(standard),/此場地已有啟用範本/)
  const disabled=await saveTemplate({...standard,name:'停用版本',is_active:false})
  await rejects(saveTemplate({...await template(disabled),match_mode:'venue',is_active:true}),/此場地已有啟用範本/)
  const oldSchool=await template(schoolTemplate)
  await saveTemplate({...oldSchool,match_mode:'venue',name:'中港固定教練'})
  await rejects(saveTemplate({...oldSchool,match_mode:'venue',name:'過期編輯'}),/已更新或刪除/)
  await rejects(saveTemplate({...await template(schoolTemplate),match_mode:'venue',updated_at:null}),/已更新或刪除/)
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_schedules' and action='EDIT'")
  await rejects(saveTemplate({...await template(schoolTemplate),match_mode:'venue'}),/permission required/)
  await db.exec("insert into app_role_permissions values('MANAGER','coach_schedules','EDIT')")

  await rejects(saveTemplate({...standard,venue_id:null,venue_name:'  交易回滾場地  ',name:'x'.repeat(101)}),/最多 100 字/)
  check(!(await one("select 1 from training_venues where name='交易回滾場地'")),'a later template failure rolls back the newly inserted venue')
  const custom=await saveTemplate({...standard,venue_id:null,venue_name:'  自訂球場  ',name:''})
  const customVenue=await one("select * from training_venues where name='自訂球場'")
  check(customVenue.is_active && customVenue.created_by===id(4) && customVenue.address===null && customVenue.maps_url===null,'atomic custom venue creation writes only a trimmed name and creator')
  check((await template(custom)).name==='自訂球場' && (await template(custom)).venue_id===customVenue.id,'new venue and template commit together with canonical default name')
  await saveTemplate({...standard,venue_id:null,venue_name:' 自訂球場 ',name:'同場地停用版',is_active:false})
  check((await one("select count(*)::integer as n from training_venues where name='自訂球場'")).n===1,'trim-exact custom venue retry/reuse creates no duplicate dictionary row')
  await rejects(saveTemplate({...standard,venue_id:null,venue_name:'自訂球場'}),/此場地已有啟用範本/)
  await rejects(saveTemplate({...standard,venue_id:id(83)}),/不存在或已停用/)
  await rejects(saveTemplate({...standard,venue_id:null,venue_name:' 停用球場 '}),/不存在或已停用/)
  check(!(await one('select is_active from training_venues where id=$1',[id(83)])).is_active,'existing inactive venue is never reactivated by name reuse')
  await rejects(saveTemplate({...standard,venue_id:id(9999)}),/不存在或已停用/)
  await rejects(saveTemplate({...standard,venue_id:null,venue_name:' '}),/場地名稱/)
  await rejects(saveTemplate({...standard,venue_id:null,venue_name:'x'.repeat(101)}),/場地名稱/)
  await saveTemplate({...standard,venue_id:id(80),venue_name:'不應改名',name:'停用參照',is_active:false,address:'不得修改',is_active_venue:false})
  const schoolVenue=await one('select * from training_venues where id=$1',[id(80)])
  check(schoolVenue.name==='中港國小' && schoolVenue.address==='private address' && schoolVenue.maps_url==='private map' && schoolVenue.is_active,'venue ID selection cannot rename, change addresses/maps or deactivate the venue')
  const outerTemplate=await saveTemplate({...standard,venue_id:id(81),name:'外場固定教練',coach_profile_ids:[id(2),id(3),id(7)]})

  const info=await one("select (date_trunc('month',now() at time zone 'Asia/Taipei')+interval '2 months')::date::text as month,((now() at time zone 'Asia/Taipei')::date-1)::text as yesterday")
  const {month,yesterday}=info
  const days=(await rows('select ($1::date+i)::text as d from generate_series(0,16) i',[month])).map(r=>r.d)
  const source = async (n,date,venue,start='09:00',end='12:00',title='任意課程',program='chunggang_school_team',snapshot='中港國小',status='published') => {
    await db.query('insert into training_location_sessions(id,program_key,training_date,title,start_time,end_time,status) values($1,$2,$3,$4,$5,$6,$7)',[id(n),program,date,title,start,end,status])
    await db.query('insert into training_location_session_venues(id,session_id,venue_id,training_date,title,start_time,end_time,venue_name) values($1,$2,$3,$4,$5,$6,$7,$8)',[id(n+100),id(n),venue,date,title,start,end,snapshot])
  }
  await db.query('insert into fixture_dates values($1),($2),($3),($4)',[days[0],days[1],days[2],days[10]])
  await user(1)
  const generic1=(await adminMonth(month)).events.find(e=>e.source_type==='training_date' && e.schedule_date===days[1])
  const trimmedGeneric=await saveEvent({...generic1,location:'  中港國小  ',title:'自訂標題',start_time:'16:00',end_time:'17:00'})
  const generic2=(await adminMonth(month)).events.find(e=>e.source_type==='training_date' && e.schedule_date===days[2])
  await saveEvent({...generic2,location:'中港國小未知分校'})
  const generic10=(await adminMonth(month)).events.find(e=>e.source_type==='training_date' && e.schedule_date===days[10])
  await saveEvent({...generic10,location:'停用球場'})
  await source(1000,days[3],id(80),'09:00','10:00','甲課')
  await source(1001,days[4],id(80),'14:00','15:00','乙課')
  // The existing source view defaults a null end to 12:30. An inverted source
  // interval remains genuinely incomplete after that real normalization.
  await source(1002,days[5],id(80),'08:00','07:00','時間不完整課')
  await source(1003,days[6],id(80),'09:00','11:00','同批先排')
  await source(1004,days[6],id(80),'10:00','12:00','同批重疊')
  await source(1005,days[6],id(80),'11:00','13:00','相鄰課')
  await source(1006,days[7],id(80),'09:00','12:00','已有教練')
  await source(1007,days[8],id(80),'09:00','12:00','已存空排班')
  await source(1008,days[9],id(80),'09:00','12:00','取消排班')
  await source(1009,days[11],id(81),'07:00','08:00','標題無關','chunggang_school_team','中港國小')
  await source(1010,days[11],id(81),'07:00','08:00','標題無關','junior_high_school_team','中港國小')
  await source(1011,days[12],id(83))
  await source(1012,yesterday,id(80))
  await source(1013,days[13],id(80),'09:00','12:00','封存來源','chunggang_school_team','中港國小','archived')
  let payload=await adminMonth(month)
  const candidateFor=n=>payload.events.find(e=>e.source_venue_id===id(n+100))
  const assigned=await saveEvent(candidateFor(1006),[id(2)])
  const empty=await saveEvent(candidateFor(1007))
  const cancelled=await saveEvent({...candidateFor(1008),status:'cancelled'})
  await saveEvent({source_type:'manual',schedule_date:days[3],start_time:'09:00',end_time:'12:00',title:'其他來源占用'},[id(3)])
  const leave1=await saveLeave({coach_profile_id:id(2),start_date:days[3],end_date:days[3],time_segment:'morning',reason:'PRIVATE VENUE TEST REASON'})
  await saveLeave({coach_profile_id:id(3),start_date:days[5],end_date:days[5],time_segment:'afternoon',reason:'SECOND PRIVATE REASON'})
  payload=await adminMonth(month)
  check(payload.events.find(e=>e.id===trimmedGeneric).venue_id===id(80),'generic resolver uses exact trimmed location against the active canonical name')
  check(payload.events.find(e=>e.schedule_date===days[2]).venue_id===null && payload.events.find(e=>e.schedule_date===days[10]).venue_id===null,'unknown and inactive generic venue names remain unresolved')
  const shared=payload.events.filter(e=>e.schedule_date===days[11] && e.source_type==='training_location')
  check(shared.length===1 && shared[0].venue_id===id(81) && shared[0].program_label.includes('中港總部') && shared[0].program_label.includes('國中部'),'location source uses authoritative physical venue ID and preserves cross-program shared slots')
  check(shared[0].location==='中港國小','physical-ID matching does not rewrite legacy source snapshots')
  let p=await preview(month)
  const byDay=(date)=>p.rows.filter(r=>r.event.schedule_date===date)
  check(p.fingerprint.startsWith('venue-v2:') && p.fingerprint.length===41,'new matching mode fingerprints carry a version prefix')
  check(byDay(days[0]).length===1 && byDay(days[1]).length===1 && byDay(days[4]).length===1,'same venue matches across weekday, start time and course title')
  check(byDay(days[1])[0].event.title==='自訂標題' && byDay(days[1])[0].event.start_time==='16:00','matching preserves existing event title/time')
  check(!byDay(days[2]).length && !byDay(days[10]).length && !byDay(days[12]).length,'unknown and inactive venues do not produce proposals')
  check(!byDay(days[7]).length && !byDay(days[9]).length && !byDay(days[13]).length,'assigned, cancelled and archived activities are excluded')
  check(!(await preview(yesterday)).rows.some(r=>r.event.schedule_date===yesterday),'past real source activity never receives an automatic proposal')
  check(byDay(days[3])[0].proposed_coach_profile_ids.length===0 && byDay(days[3])[0].excluded_coaches.map(c=>c.reason).join('|').includes('已請假'),'leave and other-source bookings exclude all conflicting coaches without private reasons')
  check(byDay(days[5])[0].time_incomplete && byDay(days[5])[0].proposed_coach_profile_ids.join()===id(2),'incomplete source interval uses conservative all-day leave overlap without a blanket ban')
  const sameBatch=byDay(days[6])
  check(sameBatch[0].proposed_coach_profile_ids.length===2 && sameBatch[1].proposed_coach_profile_ids.length===0 && sameBatch[2].proposed_coach_profile_ids.length===2,'within-preview reservations reject overlap and preserve half-open adjacent intervals')
  check(byDay(days[11])[0].template_id===outerTemplate && byDay(days[11])[0].proposed_coach_profile_ids.includes(id(7)),'ID matching ignores misleading snapshots and preserves legacy eligible coach roles')
  check(!JSON.stringify(payload).includes('PRIVATE VENUE TEST REASON') && !JSON.stringify(p).includes('SECOND PRIVATE REASON'),'candidate and preview payloads never expose private leave reasons')
  await rejects(confirm(month,p,[byDay(days[3])[0].event_key]),/無可用教練/)
  const oldFingerprint=p.fingerprint.replace('venue-v2:','')
  await db.query("insert into private.coach_schedule_auto_fill_receipts(actor_profile_id,month_start,fingerprint,event_keys,event_ids,required_actions) values($1,$2,$3,$4,$5,array['CREATE'])",[id(1),month,oldFingerprint,[byDay(days[4])[0].event_key],[assigned]])
  await rejects(confirm(month,{fingerprint:oldFingerprint},[byDay(days[4])[0].event_key]),/配對方式已更新/)
  await rejects(confirm(month,{fingerprint:null},[byDay(days[4])[0].event_key]),/配對方式已更新/)
  check((await one('select count(*)::integer as n from coach_schedule_assignments where event_id=$1',[assigned])).n===1,'old-mode receipt rejection returns no IDs and mutates no assignments')

  const key=p.rows.find(r=>r.event.schedule_date===days[4]).event_key
  await db.query("update training_venues set updated_at=updated_at+interval '1 second' where id=$1",[id(82)])
  await rejects(confirm(month,p,[key]),/已更新/)
  p=await preview(month)
  await db.query("update training_venues set name='中港新名稱',updated_at=clock_timestamp() where id=$1",[id(80)])
  await rejects(confirm(month,p,[key]),/已更新/)
  const renamed=await preview(month)
  check(!renamed.rows.some(r=>r.event.source_type==='training_date') && renamed.rows.some(r=>r.event.schedule_date===days[4]),'dictionary rename stops textual generic matches while authoritative physical sources still match')
  await db.query("update training_venues set name='中港國小',updated_at=clock_timestamp() where id=$1",[id(80)])
  p=await preview(month)
  await db.query('update training_venues set is_active=false,updated_at=clock_timestamp() where id=$1',[id(80)])
  await rejects(confirm(month,p,[key]),/已更新/)
  check((await rpc('list_coach_schedule_templates')).find(t=>t.id===schoolTemplate).venue_is_active===false,'template list explicitly reports an inactive referenced venue')
  check(!(await preview(month)).rows.some(r=>r.event.venue_id===id(80)),'deactivated venues stop all proposals')
  await rejects(saveTemplate({...await template(schoolTemplate),match_mode:'venue'}),/已停用/)
  await db.query('update training_venues set is_active=true,updated_at=clock_timestamp() where id=$1',[id(80)])
  p=await preview(month)
  await db.exec(`update profiles set is_active=false where id='${id(7)}'`)
  await rejects(confirm(month,p,[key]),/已更新/)
  await db.exec(`update profiles set is_active=true where id='${id(7)}'`)
  p=await preview(month)
  await saveTemplate({...await template(schoolTemplate),match_mode:'venue',name:'重新命名範本'})
  await rejects(confirm(month,p,[key]),/已更新/)
  p=await preview(month)
  const incompleteKey=p.rows.find(r=>r.event.schedule_date===days[5]).event_key
  const saved=await confirm(month,p,[key,incompleteKey])
  check(saved.length===2 && saved.every(eventId=>eventId!==assigned),'confirmation stores selected venue-only activities including safe incomplete times')
  check((await one('select count(*)::integer as n from coach_schedule_assignments where event_id=any($1::uuid[])',[saved])).n===3,'confirmed assignments contain only the available coach proposals')
  check(JSON.stringify(await confirm(month,p,[incompleteKey,key]))===JSON.stringify(saved),'exact retry returns the receipt with normalized selection order')
  const removedEvent=await event(saved[0])
  await saveEvent(removedEvent,[])
  check(JSON.stringify(await confirm(month,p,[key,incompleteKey]))===JSON.stringify(saved),'successful confirmation retry returns original IDs after a later edit')
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1',[saved[0]])),'retry never restores removed assignments')
  await rejects(saveEvent(removedEvent,[id(2)]),/其他操作更新/)
  await rejects(saveEvent(await event(assigned),[id(5)]),/停用/)
  const leaveDayCandidate=(await preview(month)).rows.find(r=>r.event.schedule_date===days[6] && r.proposed_coach_profile_ids.length)
  const staleLeave=await preview(month)
  await saveLeave({coach_profile_id:id(2),start_date:days[6],end_date:days[6],time_segment:'morning',reason:'NEW PRIVATE REASON'})
  await rejects(confirm(month,staleLeave,[leaveDayCandidate.event_key]),/已更新/)

  // A stored empty candidate is an edit; new candidates are creates, with no partial batch writes.
  await user(4)
  let managerPreview=await preview(month)
  const emptyKey=managerPreview.rows.find(r=>r.event.id===empty).event_key
  const newKey=managerPreview.rows.find(r=>r.event.schedule_date===days[0]).event_key
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_schedules' and action='EDIT'")
  const beforeEvents=(await one('select count(*)::integer as n from coach_schedule_events')).n
  await rejects(confirm(month,managerPreview,[newKey,emptyKey]),/permission required/)
  check((await one('select count(*)::integer as n from coach_schedule_events')).n===beforeEvents && !(await one('select 1 from coach_schedule_assignments where event_id=$1',[empty])),'mixed CREATE/EDIT permission failure rolls back the entire selected batch')
  await db.exec("insert into app_role_permissions values('MANAGER','coach_schedules','EDIT')")
  managerPreview=await preview(month)
  const managerSaved=await confirm(month,managerPreview,[emptyKey])
  check(managerSaved[0]===empty,'empty persisted candidate uses the existing source event ID')
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_schedules' and action='EDIT'")
  await rejects(confirm(month,managerPreview,[emptyKey]),/permission required/)
  await db.exec("insert into app_role_permissions values('MANAGER','coach_schedules','EDIT')")
  await db.exec(`update profiles set access_end=now()-interval '1 day' where id='${id(4)}'`)
  await rejects(confirm(month,managerPreview,[emptyKey]),/帳號已停用/)
  await db.exec(`update profiles set access_end=null where id='${id(4)}'`)
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_schedules' and action='CREATE'")
  const viewPreview=await preview(month)
  await rejects(confirm(month,viewPreview,[viewPreview.rows.find(r=>r.event.schedule_date===days[0]).event_key]),/permission required/)
  await db.exec("insert into app_role_permissions values('MANAGER','coach_schedules','CREATE')")
  const staleDisabled=await template(disabled)
  await db.exec("delete from app_role_permissions where role_key='MANAGER' and feature='coach_schedules' and action='DELETE'")
  await rejects(db.query('select delete_coach_schedule_template($1::uuid,$2::timestamptz)',[disabled,staleDisabled.updated_at]),/permission required/)
  await db.exec("insert into app_role_permissions values('MANAGER','coach_schedules','DELETE')")
  await saveTemplate({...staleDisabled,match_mode:'venue',name:'更新後的停用版本'})
  await rejects(db.query('select delete_coach_schedule_template($1::uuid,$2::timestamptz)',[disabled,staleDisabled.updated_at]),/已更新或刪除/)
  await db.query('select delete_coach_schedule_template($1::uuid,$2::timestamptz)',[disabled,(await template(disabled)).updated_at])
  check(!(await template(disabled)) && Boolean(await one('select 1 from training_venues where id=$1',[id(80)])),'versioned delete removes only the template and keeps the shared venue')
  check(JSON.stringify(await hashes())===JSON.stringify(beforeHashes),'all tests finish with deployed core and source-base function definitions unchanged')
  console.log(`Coach venue template SQL regression passed: ${checks} checks`)
} finally {
  await db.close()
}
