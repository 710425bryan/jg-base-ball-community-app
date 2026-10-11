// Isolated PostgreSQL only. Exercises the actual administrative SQL and actual
// feed/claim definitions, without connecting to Supabase or sending Web Push.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const read = path => readFileSync(new URL(`../../${path}`,import.meta.url),'utf8')
const script = read('scripts/suppress-coach-leave-historical-push-20261009.sql')
const fingerprintSQL = script.slice(script.indexOf('-- select count(*)'),script.indexOf('\nbegin;'))
  .replace(/^-- ?/gm,'')
const id = number => `00000000-0000-0000-0000-${String(number).padStart(12,'0')}`
const query = async (sql,args=[]) => (await db.query(sql,args)).rows
const one = async (sql,args=[]) => (await query(sql,args))[0]
const loadFunction = (path,name) => {
  const definition = read(path).match(new RegExp(`create or replace function ${name.replaceAll('.','\\.')}\\([\\s\\S]*?\\$\\$;`,'i'))?.[0]
  assert.ok(definition,`missing real definition: ${name}`)
  return db.exec(definition)
}
let checks=0
const check = (value,message) => { assert.ok(value,message); checks++ }
const metadata = () => one(fingerprintSQL)
const execute = digest => db.exec(script.replace('__EXPECTED_METADATA_MD5__',digest))
const allRows = () => query('select * from public.push_dispatch_events order by id')
const asUser = async (user,role='authenticated') => {
  await db.exec('reset role')
  await query("select set_config('request.jwt.claim.sub',$1,false)",[user])
  await db.exec(`set role ${role}`)
}
const seed = async () => {
  await db.exec(`
    reset role;
    truncate public.push_dispatch_deliveries,public.push_dispatch_events;
    insert into public.push_dispatch_events(id,event_key,feature,action,title,body,url,coach_leave_payload,created_at,updated_at)
    select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
      'coach_leave:'||n||':1:created','coach_leave_requests','VIEW','教練請假fixture','日期及區段fixture',
      '/coach-leave-requests?highlight_leave_id='||n,jsonb_build_object('leave_id',n,'start_date','2026-10-02'),
      '2026-10-06T07:07:21.743675Z'::timestamptz-(11-n)*interval '1 hour',
      '2026-10-06T07:07:21.743675Z'::timestamptz-(11-n)*interval '1 hour'
    from generate_series(1,11) n;
    insert into public.push_dispatch_events(id,event_key,feature,action,title,body,url,coach_leave_payload,created_at,updated_at)
    values('${id(12)}','coach_leave:1:2:updated','coach_leave_requests','VIEW','新版本fixture','同一歷史假單的新異動fixture',
      '/coach-leave-requests?highlight_leave_id=1','{"leave_id":1,"revision":2,"operation":"updated","start_date":"2026-10-09"}',
      '2026-10-09T06:00:00Z','2026-10-09T06:00:00Z'),
      ('${id(13)}','team_member:unrelated','players','VIEW','其他outbox','保留','/players','{}',
      '2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
  `)
}
const rejectUnchanged = async (operation,code) => {
  const before=await allRows()
  await assert.rejects(operation,error=>error.code===code)
  await db.exec('rollback')
  assert.deepEqual(await allRows(),before)
  checks++
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.profiles(id uuid primary key,role text,is_active boolean default true,
      access_start timestamptz,access_end timestamptz);
    create table public.app_role_permissions(role_key text,feature text,action text);
    create function public.current_profile_role() returns text language sql stable security definer as $$
      select role from public.profiles where id=auth.uid() and is_active $$;
    insert into public.profiles values ('${id(100)}','ADMIN',true,null,null),('${id(101)}','PARENT',true,null,null);
    create table public.push_dispatch_events(
      id uuid primary key,event_key text unique,feature text,action text,title text,body text,url text,
      coach_leave_payload jsonb,created_at timestamptz,updated_at timestamptz,
      dispatch_mode text default 'outbox',dispatch_status text default 'pending',
      locked_at timestamptz,completed_at timestamptz,last_error text,
      target_count integer not null default 0,sent_count integer not null default 0,
      expired_count integer not null default 0,failed_count integer not null default 0,
      provider_counts jsonb not null default '{}'
    );
    create table public.push_dispatch_deliveries(id uuid primary key,event_id uuid references public.push_dispatch_events);
    create function private.notification_feed_before_coach_leave(integer,boolean)
    returns table(id text,source text,title text,body text,created_at timestamptz,link text,highlight_member_id uuid)
    language sql as $$ select 'legacy','training_location','既有通知','原內容',now(),'/training-locations',null::uuid $$;
  `)
  const eligibility='supabase/migrations/20261002180340_coach_schedule_scheduling_coach_eligibility.sql'
  const notification='supabase/migrations/20261002150855_coach_leave_notification_outbox.sql'
  for (const name of ['private.coach_profile_is_schedulable','private.can_receive_coach_leave_notification']) {
    await loadFunction(eligibility,name)
  }
  for (const name of ['private.coach_leave_notification_link','public.get_notification_feed',
    'public.claim_coach_leave_notification_outbox_events']) await loadFunction(notification,name)
  await db.exec(`
    revoke all on function public.get_notification_feed(integer,boolean),public.claim_coach_leave_notification_outbox_events(integer)
      from public,anon,authenticated,service_role;
    grant execute on function public.get_notification_feed(integer,boolean) to authenticated;
    grant execute on function public.claim_coach_leave_notification_outbox_events(integer) to service_role;
  `)
  const definitionsBefore=await query(`select proname,md5(prosrc) as fingerprint,proacl::text from pg_proc
    where oid in ('public.get_notification_feed(integer,boolean)'::regprocedure,
      'public.claim_coach_leave_notification_outbox_events(integer)'::regprocedure) order by proname`)
  await seed()
  check((await metadata()).event_count===11,'fingerprint scope includes exactly the approved historical cutoff')
  await rejectUnchanged(()=>db.exec(script),'22023')
  await rejectUnchanged(()=>execute('00000000000000000000000000000000'),'55000')

  const protectedFields=row=>{
    const {dispatch_status,completed_at,updated_at,...preserved}=row
    return preserved
  }
  const before=await allRows()
  const originalDigest=(await metadata()).metadata_md5
  await execute(originalDigest)
  const after=await allRows()
  for(let index=0;index<11;index++) {
    assert.deepEqual(protectedFields(after[index]),protectedFields(before[index]))
    check(after[index].dispatch_status==='recorded'&&after[index].completed_at,
      'historical content is preserved and marked site-only, never sent')
  }
  assert.deepEqual(after.slice(11),before.slice(11));checks++
  await rejectUnchanged(()=>execute(originalDigest),'55000')
  const definitionsAfter=await query(`select proname,md5(prosrc) as fingerprint,proacl::text from pg_proc
    where oid in ('public.get_notification_feed(integer,boolean)'::regprocedure,
      'public.claim_coach_leave_notification_outbox_events(integer)'::regprocedure) order by proname`)
  assert.deepEqual(definitionsAfter,definitionsBefore);checks++

  await asUser(id(100))
  const adminFeed=await query('select * from public.get_notification_feed(50,false)')
  check(adminFeed.filter(row=>row.source==='coach_leave').length===12,
    'all eleven site-only records and the new record remain in the real feed')
  check(adminFeed.some(row=>row.id==='legacy'),'existing feed sources remain visible')
  await asUser(id(101))
  check(!(await query('select * from public.get_notification_feed(50,false)')).some(row=>row.source==='coach_leave'),
    'site-only history does not grant a parent new notification permissions')
  await asUser('','service_role')
  const claimed=await query('select * from public.claim_coach_leave_notification_outbox_events(25)')
  check(claimed.length===1&&claimed[0].id===id(12)&&claimed[0].event_key==='coach_leave:1:2:updated',
    'real worker claim returns only the post-cutoff revision of the same historical leave')
  await db.exec('reset role')
  const newRevision=await one('select coach_leave_payload from public.push_dispatch_events where id=$1',[id(12)])
  check(newRevision.coach_leave_payload.leave_id===1&&newRevision.coach_leave_payload.revision===2,
    'claimable new revision retains the same leave identity rather than bypassing suppression with a new leave')

  const mutations=[
    "dispatch_status='processing'","locked_at=now()","completed_at=now()","last_error='prior failure'",
    'target_count=1','sent_count=1','expired_count=1','failed_count=1',"provider_counts='{\"Unknown\":1}'",
    "updated_at=updated_at+interval '1 microsecond'","event_key='coach_leave:changed:1:created'",
    "created_at=created_at-interval '1 microsecond'","dispatch_mode='direct'","feature='players'","action='EDIT'"
  ]
  for(const mutation of mutations) {
    await seed()
    const digest=(await metadata()).metadata_md5
    await db.exec(`update public.push_dispatch_events set ${mutation} where id='${id(1)}'`)
    await rejectUnchanged(()=>execute(digest),'55000')
  }
  await seed()
  const withDeliveryDigest=(await metadata()).metadata_md5
  await db.exec(`insert into public.push_dispatch_deliveries values ('${id(200)}','${id(1)}')`)
  await rejectUnchanged(()=>execute(withDeliveryDigest),'55000')
  await seed()
  const beforeInsertion=(await metadata()).metadata_md5
  await db.exec(`insert into public.push_dispatch_events(id,event_key,feature,action,created_at,updated_at)
    values('${id(14)}','coach_leave:backdated:1:created','coach_leave_requests','VIEW',
      '2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')`)
  await rejectUnchanged(()=>execute(beforeInsertion),'55000')

  // A trigger unexpectedly changing protected content must roll back all eleven
  // status updates, even though the metadata precondition still matched.
  await seed()
  const triggerDigest=(await metadata()).metadata_md5
  await db.exec(`create function public.fixture_corrupt_content() returns trigger language plpgsql as $$
    begin new.body := 'unexpected change'; return new; end; $$;
    create trigger fixture_corrupt_content before update on public.push_dispatch_events
      for each row execute function public.fixture_corrupt_content();`)
  await rejectUnchanged(()=>execute(triggerDigest),'55000')
  console.log(`PASS: ${checks} historical coach-leave push suppression PostgreSQL checks`)
} finally {
  await db.close()
}
