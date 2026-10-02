// Real core -> notification -> venue-template -> role-eligibility integration.
// Isolated PostgreSQL only; no production users or remote SQL.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const read = path => readFileSync(new URL(`../../${path}`,import.meta.url),'utf8')
const migration='supabase/migrations/20261002180340_coach_schedule_scheduling_coach_eligibility.sql'
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const rows = async (sql,args=[]) => (await db.query(sql,args)).rows
const one = async (sql,args=[]) => (await rows(sql,args))[0]
const user = async n => db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : ''])
const asRole=async (n,role='authenticated') => { await db.exec('reset role'); await user(n); await db.exec(`set role ${role}`) }
let checks=0
const check = (value,message) => { assert.ok(value,message); checks++ }
const rejects = async (promise,pattern) => { await assert.rejects(promise,pattern); checks++ }
const eligible = async n => (await one('select private.coach_profile_is_schedulable($1::uuid) as ok',[id(n)])).ok
const coaches = async () => (await one('select public.list_schedulable_coaches() as p')).p
const saveEvent = async (event,coaches=[]) => (await one('select public.save_coach_schedule_event($1::jsonb,$2::uuid[]) as id',[JSON.stringify(event),coaches])).id
const event = async eventId => one('select e.*,e.updated_at::text as updated_at from coach_schedule_events e where id=$1::uuid',[eventId])
const saveLeave = async (p,manage=false) => (await one('select public.save_coach_leave_request($1::jsonb,$2) as id',[JSON.stringify(p),manage])).id
const leave = async leaveId => one('select l.*,l.updated_at::text as updated_at from coach_leave_requests l where id=$1::uuid',[leaveId])
const listLeaves = async (manage=false) => (await one("select public.list_coach_leave_requests(null,'all',null,$1) as p",[manage])).p
const cancelLeave=async (leaveId) => db.query('select public.cancel_coach_leave_request($1::uuid,$2::timestamptz,false)',[leaveId,(await listLeaves()).leaves.find(l=>l.id===leaveId).updated_at])
const dashboard = async month => (await one('select public.list_coach_schedule_dashboard($1::date) as p',[month])).p
const preview = async month => (await one('select public.preview_coach_schedule_auto_fill($1::date) as p',[month])).p
const confirm = async (month,p,keys) => (await one('select public.confirm_coach_schedule_auto_fill($1::date,$2,$3::text[]) as ids',[month,p.fingerprint,keys])).ids
const saveTemplate = async p => (await one('select public.save_coach_schedule_template($1::jsonb) as id',[JSON.stringify(p)])).id
const template = async templateId => one('select t.*,t.updated_at::text as updated_at from coach_schedule_templates t where id=$1::uuid',[templateId])
const signatures=['public.list_schedulable_coaches()','public.save_coach_schedule_event(jsonb,uuid[])','public.save_coach_leave_request(jsonb,boolean,uuid)',
  'public.list_coach_schedule_dashboard(date)','private.save_coach_schedule_event_base(jsonb,uuid[])','private.list_coach_schedule_dashboard_base(date)',
  'public.save_coach_schedule_template(jsonb)','public.preview_coach_schedule_auto_fill(date)','public.confirm_coach_schedule_auto_fill(date,text,text[])',
  'public.get_notification_feed(integer,boolean)','public.initialize_coach_leave_notification_deliveries(uuid)','public.get_coach_leave_notification_delivery(uuid,integer)']
const hashes = async () => rows('select oid::regprocedure::text as name,md5(prosrc) as hash from pg_proc where oid=any($1::regprocedure[]) order by oid',[signatures])
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
  const originalHelper=(await one("select md5(prosrc) as hash from pg_proc where oid='private.coach_profile_is_schedulable(uuid)'::regprocedure")).hash
  await rejects(db.exec(read(migration)),/教練請假核心與通知/)
  await db.exec('rollback')
  check((await one("select md5(prosrc) as hash from pg_proc where oid='private.coach_profile_is_schedulable(uuid)'::regprocedure")).hash===originalHelper,'missing notification prerequisite leaves eligibility untouched')
  await db.exec(`
    create table app_roles(role_key text primary key,role_name text,is_system boolean default false,weight integer default 99);
    insert into app_roles values('SCHEDULINGCOACH','排班教練',false,15),('NAME_ONLY','排班教練',false,15);
    insert into profiles(id,name,role,is_active,access_start,access_end) values
      ('${id(10)}','排班教練甲','SCHEDULINGCOACH',true,null,null),
      ('${id(11)}','未到期排班教練','SCHEDULINGCOACH',true,now()+interval '1 day',null),
      ('${id(12)}','停用排班教練','SCHEDULINGCOACH',false,null,null),
      ('${id(13)}','過期排班教練','SCHEDULINGCOACH',true,null,now()-interval '1 day'),
      ('${id(14)}','同名但不同角色','NAME_ONLY',true,null,null),
      ('${id(15)}','非精確角色key',' SCHEDULINGCOACH ',true,null,null);
    insert into app_role_permissions select 'SCHEDULINGCOACH','coach_schedules',a from (values('VIEW'),('CREATE'),('EDIT')) aa(a);
    insert into app_role_permissions select 'SCHEDULINGCOACH','my_coach_leave_requests',a from (values('VIEW'),('CREATE'),('EDIT'),('DELETE')) aa(a);
    insert into app_role_permissions values('PARENT','coach_schedules','VIEW'),('NAME_ONLY','coach_schedules','VIEW');
    alter table public.push_dispatch_events add column locked_at timestamptz,add column completed_at timestamptz,
      add column updated_at timestamptz default now(),add column last_error text,add column target_count integer default 0,
      add column sent_count integer default 0,add column expired_count integer default 0,add column failed_count integer default 0,
      add column provider_counts jsonb default '{}';
    create table public.web_push_subscriptions(id uuid primary key,user_id uuid,endpoint text,subscription jsonb,enabled boolean);
    create table public.push_dispatch_deliveries(id uuid primary key default gen_random_uuid(),event_id uuid references push_dispatch_events,
      subscription_id uuid,user_id uuid,endpoint text,subscription jsonb,provider text,status text default 'pending',attempt_count integer default 0,
      next_attempt_at timestamptz default now(),locked_at timestamptz,sent_at timestamptz,last_error text,
      created_at timestamptz default now(),updated_at timestamptz default now(),unique(event_id,subscription_id));
    create function public.current_profile_role() returns text language sql stable security definer set search_path='' as $$
      select role from public.profiles where id=auth.uid() and coalesce(is_active,true)
        and (access_start is null or access_start<=now()) and (access_end is null or access_end>=now()) $$;
    create function public.get_notification_feed(integer default 10,boolean default false)
      returns table(id text,source text,title text,body text,created_at timestamptz,link text,highlight_member_id uuid)
      language sql as $$ select 'legacy_feed','training_location','原有通知','原有內容',now()-interval '1 day','/training-locations',null::uuid $$;
    insert into web_push_subscriptions values
      ('${id(310)}','${id(10)}','https://push.example/scheduling-coach','{}',true),
      ('${id(306)}','${id(6)}','https://push.example/parent','{}',true),
      ('${id(314)}','${id(14)}','https://push.example/name-only','{}',true);
  `)
  await db.exec(read('supabase/migrations/20261002150855_coach_leave_notification_outbox.sql').split('-- Cron deployment:')[0]+'commit;')
  await db.exec(read('supabase/migrations/20261002171951_coach_schedule_venue_templates.sql'))
  const programSQL=read('supabase_zzzzzzzzzzzzzzzzzz_training_program_scope_migration.sql')
  for(const name of ['normalize_training_program_key','get_default_training_month_dates','get_training_month_dates'])
    await db.exec(programSQL.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0])
  await db.exec(read('supabase/migrations/20261002155846_coach_leave_batch_create_and_training_dates.sql'))
  const beforeHashes=await hashes()
  const beforePermissions=await rows('select * from app_role_permissions order by role_key,feature,action')
  const helperSignatures=['private.coach_profile_is_schedulable(uuid)','private.can_receive_coach_leave_notification(uuid)']
  const beforeSecurity=await rows('select oid::regprocedure::text as signature,proacl::text as acl,prosecdef,proconfig from pg_proc where oid=any($1::regprocedure[]) order by oid',[helperSignatures])
  check(!(await eligible(10)),'deployed core reproduces the missing scheduling-coach candidate')
  await user(1)
  check(!(await coaches()).some(c=>c.id===id(10)),'original listing excludes the verified custom role despite its schedule permissions')
  await db.exec(read(migration))
  check(JSON.stringify(await hashes())===JSON.stringify(beforeHashes),'forward migration preserves all public saves, templates, source/dashboard bases, feed and worker implementations')
  check(JSON.stringify(await rows('select * from app_role_permissions order by role_key,feature,action'))===JSON.stringify(beforePermissions),'role eligibility migration grants or changes no feature permissions')
  check(JSON.stringify(await rows('select oid::regprocedure::text as signature,proacl::text as acl,prosecdef,proconfig from pg_proc where oid=any($1::regprocedure[]) order by oid',[helperSignatures]))===JSON.stringify(beforeSecurity),'both private helpers preserve their exact ACL, SECURITY DEFINER and fixed search path')
  check((await eligible(10)) && (await eligible(2)) && (await eligible(3)) && (await eligible(7)),'verified custom key and all existing canonical/legacy coach roles remain eligible')
  for(const n of [1,4,6,11,12,13,14,15]) check(!(await eligible(n)),`non-coach, same-name or invalid-window profile ${n} remains excluded`)
  const listed=await coaches()
  check(listed.some(c=>c.id===id(10) && c.role==='SCHEDULINGCOACH') && !listed.some(c=>[id(11),id(12),id(13),id(14)].includes(c.id)),'real listing exposes the new valid candidate and excludes invalid accounts')
  await db.exec("update app_roles set role_name='自訂顯示新名稱' where role_key='SCHEDULINGCOACH'")
  check(await eligible(10),'changing role display name does not change assignability')
  await db.exec("update app_roles set weight=99 where role_key='SCHEDULINGCOACH'")
  check(await eligible(10),'role display weight never controls eligibility')
  const info=await one("select (date_trunc('month',now() at time zone 'Asia/Taipei')+interval '2 months')::date::text as month")
  const {month}=info
  const days=(await rows('select ($1::date+i)::text as d from generate_series(0,12) i',[month])).map(r=>r.d)
  const base={source_type:'manual',schedule_date:days[0],start_time:'09:00',end_time:'13:00',title:'排班教練上午課'}
  const morning=await saveEvent(base,[id(10),id(2)])
  const afternoon=await saveEvent({...base,start_time:'13:00',end_time:'15:00',title:'排班教練下午課'},[id(10)])
  const other=await saveEvent({...base,schedule_date:days[8],title:'其他教練課'},[id(3)])
  check((await one('select count(*)::integer as n from coach_schedule_assignments where coach_profile_id=$1',[id(10)])).n===2,'actual manual save assigns the newly eligible role')
  await rejects(saveEvent({...base,start_time:'12:00',end_time:'14:00'},[id(10)]),/同時段/)
  await rejects(saveEvent({...base,schedule_date:days[10]},[id(12)]),/停用/)
  await rejects(saveEvent({...base,schedule_date:days[10]},[id(6)]),/不符合排班資格/)
  const match=id(700)
  await db.query("insert into matches(id,match_level,match_date,match_time,match_name,location) values($1,'友誼賽',$2,'09:00 - 12:00','測試比賽','中港國小')",[match,days[7]])
  const matchEvent=await saveEvent({source_type:'match',source_id:match},[id(10)])
  check(Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1 and coach_profile_id=$2',[matchEvent,id(10)])),'authoritative match-source save also accepts the verified role')
  await asRole(10)
  const allDashboard=await dashboard(month)
  check(allDashboard.scope==='all' && allDashboard.events.some(e=>e.id===other),'schedule VIEW keeps the existing all-coach dashboard scope')
  await db.exec('reset role')
  await db.exec("delete from app_role_permissions where role_key='SCHEDULINGCOACH' and feature='coach_schedules' and action='VIEW'")
  await asRole(10)
  const ownDashboard=await dashboard(month)
  check(ownDashboard.scope==='own' && ownDashboard.events.some(e=>e.id===afternoon) && !ownDashboard.events.some(e=>e.id===other),'without schedule VIEW, shared eligibility gives the custom coach only their assigned dashboard events')
  await rejects(coaches(),/permission required/)
  await db.exec('reset role')
  await db.exec("insert into app_role_permissions values('SCHEDULINGCOACH','coach_schedules','VIEW')")
  await asRole(10)
  const staleMorning=await event(morning)
  const ownLeave=await saveLeave({start_date:days[0],end_date:days[0],time_segment:'morning',reason:'SCHEDULING PRIVATE REASON'})
  await db.exec('reset role')
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1 and coach_profile_id=$2',[morning,id(10)])),'new role own leave actually removes overlapping assigned work')
  check(Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1 and coach_profile_id=$2',[morning,id(2)])) && Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1',[afternoon])),'leave preserves the other coach and the 13:00 adjacent afternoon assignment')
  check((await event(morning)).updated_at!==staleMorning.updated_at && Boolean(await one('select 1 from private.coach_schedule_assignment_changes where leave_id=$1',[ownLeave])),'new role leave keeps assignment audit and version invalidation')
  await asRole(10)
  const ownLeaves=await listLeaves()
  check(ownLeaves.leaves.some(l=>l.id===ownLeave && l.reason==='SCHEDULING PRIVATE REASON') && ownLeaves.coaches.length===0,'owner can read their private reason without an arbitrary profile list')
  const ownRevision=ownLeaves.leaves.find(l=>l.id===ownLeave)
  check(await saveLeave({...ownRevision,reason:'UPDATED OWNER PRIVATE'})===ownLeave,'new role can update its own leave through the versioned save RPC')
  await rejects(saveLeave({...ownRevision,reason:'stale owner edit'}),/已更新/)
  await rejects(listLeaves(true),/permission required/)
  await rejects(saveEvent(staleMorning,[id(10)]),/其他操作更新/)
  await rejects(saveEvent(await event(morning),[id(10)]),/已請假/)
  await cancelLeave(ownLeave)
  await db.exec('reset role')
  check(!(await one('select 1 from coach_schedule_assignments where event_id=$1 and coach_profile_id=$2',[morning,id(10)])),'cancelling new role leave never restores the removed assignment')
  await user(1)
  await saveEvent(await event(morning),[id(10),id(2)])
  const managed=await listLeaves(true)
  check(managed.coaches.some(c=>c.id===id(10)),'leave manager coach selector uses the same expanded helper')
  await asRole(10)
  const batchRecords=[{start_date:days[2],end_date:days[2],time_segment:'afternoon',reason:'BATCH SCHEDULING PRIVATE'}]
  const batchIds=(await one('select public.create_coach_leave_requests($1::jsonb,false,$2::uuid) as ids',[JSON.stringify(batchRecords),id(950)])).ids
  check(batchIds.length===1 && (await listLeaves()).leaves.find(l=>l.id===batchIds[0]).coach_profile_id===id(10),'batch create accepts the new eligible owner using existing explicit own permission')
  const trainingDates=(await one('select public.list_coach_leave_training_dates($1::date,false) as p',[month])).p
  check(trainingDates.programs.length===2 && !JSON.stringify(trainingDates).includes('note'),'new role can read authorized training dates without private notes')
  await db.exec('reset role')
  await user(1)
  const templateId=await saveTemplate({match_mode:'venue',venue_id:id(80),coach_profile_ids:[id(10)],name:'排班教練固定班'})
  check((await template(templateId)).coach_profile_ids.join()===id(10),'template save accepts the stable custom role')
  await rejects(saveTemplate({match_mode:'venue',venue_id:id(81),coach_profile_ids:[id(14)]}),/有效教練/)
  // The one-argument historical candidate function reads this isolated date fixture;
  // the own-date RPC above called the actual program-aware two-argument function.
  await db.query('insert into fixture_dates values($1),($2),($3)',[days[1],days[2],days[3]])
  let p=await preview(month)
  const day1=p.rows.find(r=>r.event.schedule_date===days[1])
  const day2=p.rows.find(r=>r.event.schedule_date===days[2])
  check(day1.proposed_coach_profile_ids.join()===id(10) && day2.proposed_coach_profile_ids.join()===id(10),'preview proposes new role and preserves afternoon-leave/morning-activity half-open rules')
  const filled=await confirm(month,p,[day1.event_key])
  check(filled.length===1 && Boolean(await one('select 1 from coach_schedule_assignments where event_id=$1 and coach_profile_id=$2',[filled[0],id(10)])),'confirm persists the new role rather than failing later in the base save')
  const stalePreview=await preview(month)
  await db.exec(`update profiles set is_active=false where id='${id(10)}'`)
  await rejects(confirm(month,stalePreview,[day2.event_key]),/已更新/)
  check((await preview(month)).rows.every(r=>!r.proposed_coach_profile_ids.includes(id(10))),'account deactivation removes new role proposals')
  await rejects(saveTemplate({...await template(templateId),match_mode:'venue'}),/有效教練/)
  await db.exec(`update profiles set is_active=true where id='${id(10)}'`)
  for(const assignment of ["access_start=now()+interval '1 day'","access_end=now()-interval '1 day'"]) {
    await db.exec(`update profiles set ${assignment} where id='${id(10)}'`)
    check(!(await eligible(10)),'new role retains current access-window eligibility checks')
    await rejects(saveEvent({...base,schedule_date:days[12]},[id(10)]),/不符合排班資格/)
    await user(10)
    await rejects(dashboard(month),/帳號已停用/)
    await rejects(listLeaves(),/帳號已停用/)
    await user(1)
    await db.exec(`update profiles set access_start=null,access_end=null where id='${id(10)}'`)
  }

  // No management VIEW: actual enqueue/feed/worker must recognize schedule-only custom coaches.
  const ownEvent=await one('select * from push_dispatch_events where event_key=$1',[`coach_leave:${ownLeave}:1:created`])
  await asRole(10)
  const feed=await rows('select * from public.get_notification_feed(100,false)')
  check(feed.some(r=>r.id===ownEvent.event_key && r.link===`/coach-schedules?month=${month.slice(0,7)}`),'schedule-only custom role receives actual reason-free notifications with the month link')
  check(feed.some(r=>r.id==='legacy_feed') && !JSON.stringify(feed).includes('SCHEDULING PRIVATE REASON') && !JSON.stringify(feed).includes('UPDATED OWNER PRIVATE') && !JSON.stringify(ownEvent).includes('SCHEDULING PRIVATE REASON'),'notification extension preserves legacy feed and never leaks owner reasons')
  await db.exec('reset role')
  check((await one('select private.can_receive_coach_leave_notification($1::uuid) as ok',[id(10)])).ok,'new role qualifies for the shared schedule-only notification audience')
  check(!(await one('select private.can_receive_coach_leave_notification($1::uuid) as ok',[id(6)])).ok && !(await one('select private.can_receive_coach_leave_notification($1::uuid) as ok',[id(14)])).ok,'VIEW parents and same-name non-coach roles remain outside the notification audience')
  for(const n of [11,12,13]) check(!(await one('select private.can_receive_coach_leave_notification($1::uuid) as ok',[id(n)])).ok,`notification audience retains active/access restrictions for profile ${n}`)
  await asRole(null,'service_role')
  await rows('select * from public.claim_coach_leave_notification_outbox_events(100)')
  check((await one('select public.initialize_coach_leave_notification_deliveries($1::uuid) as n',[ownEvent.id])).n===1,'only the eligible custom coach subscription becomes a delivery')
  const deliveries=await rows('select * from public.claim_coach_leave_notification_deliveries(100)')
  const delivery=deliveries.find(d=>d.user_id===id(10))
  check(Boolean(delivery) && !deliveries.some(d=>[id(6),id(14)].includes(d.user_id)),'worker claims include the stable custom role without broadening targets')
  const refreshed=(await rows('select * from public.get_coach_leave_notification_delivery($1::uuid,$2)',[delivery.id,delivery.attempt_count]))[0]
  check(refreshed.url===`/coach-schedules?month=${month.slice(0,7)}` && !JSON.stringify(refreshed).includes('SCHEDULING PRIVATE REASON'),'worker delivery refresh preserves month link and private-reason boundary')
  await db.exec('reset role')
  await db.exec("delete from app_role_permissions where role_key='SCHEDULINGCOACH' and feature='coach_schedules' and action='VIEW'")
  await asRole(10)
  check(!(await rows('select * from public.get_notification_feed(100,false)')).some(r=>r.source==='coach_leave'),'schedule VIEW withdrawal hides coach-leave feed immediately')
  await asRole(null,'service_role')
  check(!(await rows('select * from public.get_coach_leave_notification_delivery($1::uuid,$2)',[delivery.id,delivery.attempt_count])).length,'schedule VIEW withdrawal blocks a previously claimed worker delivery')
  await db.exec('reset role')
  await db.exec("insert into app_role_permissions values('SCHEDULINGCOACH','coach_schedules','VIEW')")
  await db.exec(`update profiles set is_active=false where id='${id(10)}'`)
  check(!(await one('select private.can_receive_coach_leave_notification($1::uuid) as ok',[id(10)])).ok,'inactive custom coach receives no notifications')
  await asRole(10)
  await rejects(rows('select * from public.get_notification_feed(100,false)'),/Not authenticated/)
  await db.exec('reset role')
  await db.exec(`update profiles set is_active=true where id='${id(10)}'; insert into app_role_permissions values('SCHEDULINGCOACH','coach_leave_requests','VIEW')`)
  await asRole(10)
  check((await rows('select * from public.get_notification_feed(100,false)')).some(r=>r.id===ownEvent.event_key && r.link===`/coach-leave-requests?highlight_leave_id=${ownLeave}`),'existing management VIEW still takes the management leave deep link')
  await db.exec('reset role')
  await db.exec("delete from app_role_permissions where role_key='SCHEDULINGCOACH' and feature='my_coach_leave_requests' and action='CREATE'")
  await asRole(10)
  await rejects(saveLeave({start_date:days[9],end_date:days[9],time_segment:'full_day'}),/permission required/)
  await db.exec('reset role')
  await db.exec("delete from app_role_permissions where role_key='SCHEDULINGCOACH' and feature='coach_schedules' and action='CREATE'")
  await asRole(10)
  await rejects(saveEvent({...base,schedule_date:days[9]},[id(10)]),/permission required/)
  await db.exec('reset role')
  check(JSON.stringify(await hashes())===JSON.stringify(beforeHashes),'all integration paths leave deployed public RPC and source/dashboard base definitions unchanged')
  console.log(`Scheduling coach eligibility SQL regression passed: ${checks} checks`)
} catch(error) {
  console.error(error.message,error.where || '')
  process.exitCode=1
} finally {
  await db.close()
}
