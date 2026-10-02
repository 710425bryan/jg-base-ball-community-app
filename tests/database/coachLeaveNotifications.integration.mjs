// Runs only isolated PostgreSQL; never opens a remote Supabase connection.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++ }
const query = async sql => (await db.query(sql)).rows
const asUser = async (user, role='authenticated') => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role ${role}`)
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table profiles(id uuid primary key,role text,is_active boolean default true,
      access_start timestamptz,access_end timestamptz);
    create table app_role_permissions(role_key text,feature text,action text);
    create function current_profile_role() returns text language sql stable security definer set search_path='' as
      $$ select role from public.profiles where id=auth.uid() and is_active
        and (access_start is null or access_start<=now()) and (access_end is null or access_end>=now()) $$;
    create table push_dispatch_events(id uuid primary key default gen_random_uuid(),event_key text unique,
      feature text,action text,title text,body text,url text,created_at timestamptz default now(),
      dispatch_mode text default 'outbox',dispatch_status text default 'pending',locked_at timestamptz,
      completed_at timestamptz,updated_at timestamptz default now(),last_error text,target_count integer default 0,
      sent_count integer default 0,expired_count integer default 0,failed_count integer default 0,
      provider_counts jsonb default '{}');
    create table web_push_subscriptions(id uuid primary key,user_id uuid,endpoint text,subscription jsonb,enabled boolean);
    create table push_dispatch_deliveries(id uuid primary key default gen_random_uuid(),event_id uuid references push_dispatch_events,
      subscription_id uuid,user_id uuid,endpoint text,subscription jsonb,provider text,status text default 'pending',
      attempt_count integer default 0,next_attempt_at timestamptz default now(),locked_at timestamptz,sent_at timestamptz,
      last_error text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(event_id,subscription_id));
    create function get_notification_feed(integer default 10,boolean default false)
    returns table(id text,source text,title text,body text,created_at timestamptz,link text,highlight_member_id uuid)
    language sql as $$ select 'preserved','training_location','Existing targeted feed','Original source',
      now()-interval '1 day','/training-locations',null::uuid $$;
    insert into profiles(id,role) values
      ('${id(1)}','ADMIN'),('${id(2)}','MANAGER'),('${id(3)}','COACH'),('${id(4)}','HEAD_COACH'),
      ('${id(5)}','PARENT'),('${id(6)}','OTHER_MANAGER'),('${id(7)}','NO_SUB_MANAGER');
    update profiles set is_active=false where id='${id(6)}';
    insert into app_role_permissions values ('MANAGER','coach_leave_requests','VIEW'),
      ('NO_SUB_MANAGER','coach_leave_requests','VIEW'),('COACH','coach_schedules','VIEW'),('PARENT','coach_schedules','VIEW'),
      ('OTHER_MANAGER','coach_leave_requests','VIEW');
    insert into web_push_subscriptions values
      ('${id(11)}','${id(1)}','https://push.example/admin','{}',true),
      ('${id(12)}','${id(2)}','https://push.example/manager','{}',true),
      ('${id(13)}','${id(3)}','https://push.example/coach','{}',true),
      ('${id(14)}','${id(4)}','https://push.example/head','{}',true),
      ('${id(15)}','${id(5)}','https://push.example/parent','{}',true),
      ('${id(16)}','${id(6)}','https://push.example/inactive','{}',true);
  `)
  const migration = readFileSync(new URL('../../supabase/migrations/20261002150855_coach_leave_notification_outbox.sql',import.meta.url),'utf8')
  const executable = migration.split('-- Cron deployment:')[0]+'commit;'
  const rejectsMissingCore = async () => {
    await assert.rejects(db.exec(executable), error =>
      error.code === '55000' && error.message.includes('前置 migration')
      && error.hint.includes('20261002150832_coach_leave_and_schedule_templates.sql'))
    checks++
    await db.exec('rollback')
  }
  await rejectsMissingCore()
  check((await query("select to_regprocedure('private.can_receive_coach_leave_notification(uuid)') is null as missing"))[0].missing,
    'missing core fails before creating notification functions')
  check((await query("select to_regprocedure('public.get_notification_feed(integer,boolean)') is not null as preserved"))[0].preserved,
    'missing core leaves the original feed in place')
  // Notification-only fixture markers; the coach core regression separately
  // executes both real migrations and verifies the actual enqueue/feed chain.
  await db.exec(`
    create table coach_leave_requests(id uuid primary key);
    create table coach_schedule_templates(id uuid primary key);
    create function save_coach_leave_request(jsonb,boolean,uuid) returns uuid language sql as $$ select null::uuid $$;
  `)
  await rejectsMissingCore()
  // Use the actual column definition rather than prebuilding it in the baseline.
  const core = readFileSync(new URL('../../supabase/migrations/20261002150832_coach_leave_and_schedule_templates.sql',import.meta.url),'utf8')
  const payloadDDL = core.match(/^alter table public\.push_dispatch_events add column if not exists coach_leave_payload jsonb;$/m)?.[0]
  check(Boolean(payloadDDL), 'payload schema comes from the real prerequisite migration')
  await db.exec(payloadDDL)
  await db.exec('alter table push_dispatch_deliveries rename to fixture_hidden_deliveries')
  await assert.rejects(db.exec(executable), error =>
    error.code === '55000' && error.message.includes('共用 Outbox'))
  checks++
  await db.exec('rollback; alter table fixture_hidden_deliveries rename to push_dispatch_deliveries')
  await db.exec(`insert into push_dispatch_events(id,event_key,feature,action,title,body,url,coach_leave_payload)
    values ('${id(21)}','coach_leave:${id(31)}:1:created','coach_leave_requests','VIEW','教練請假','10/03 上午',
      '/coach-leave-requests?highlight_leave_id=${id(31)}','{"leave_id":"${id(31)}","start_date":"2026-10-03"}'),
      ('${id(22)}','team_member:unrelated','players','VIEW','Legacy outbox','Keep untouched','/players','{}');
  `)
  await db.exec(executable)
  for (const [user,expected,link] of [
    [1,1,'/coach-leave-requests?highlight_leave_id='],[2,1,'/coach-leave-requests?highlight_leave_id='],
    [3,1,'/coach-schedules?month=2026-10'],[4,0,null],[5,0,null],[7,1,'/coach-leave-requests?highlight_leave_id=']
  ]) {
    await asUser(id(user))
    const feed=await query('select * from get_notification_feed(10,false)')
    const leave=feed.filter(row=>row.source==='coach_leave')
    check(leave.length===expected,`audience user ${user}`)
    if (expected) check(leave[0].link.startsWith(link),`correct deep link user ${user}`)
    check(feed.some(row=>row.id==='preserved'),'keeps pre-existing feed implementation')
  }
  await asUser(id(6))
  await assert.rejects(query('select * from get_notification_feed(10,false)'),/Not authenticated/);checks++
  await assert.rejects(query('select * from claim_coach_leave_notification_outbox_events(25)'),/permission denied/);checks++
  await asUser('', 'anon')
  await assert.rejects(query('select * from get_notification_feed(10,false)'),/permission denied/);checks++
  await asUser('', 'service_role')
  check((await query('select * from claim_coach_leave_notification_outbox_events(25)')).length===1,'claims only coach leave events')
  check((await query('select * from claim_coach_leave_notification_outbox_events(25)')).length===0,'claimed event cannot be claimed twice')
  check((await query(`select initialize_coach_leave_notification_deliveries('${id(21)}') as n`))[0].n===3,'deduplicated eligible subscription targets')
  await db.exec('reset role')
  check((await query(`select dispatch_status from push_dispatch_events where id='${id(22)}'`))[0].dispatch_status==='pending','other outboxes untouched')
  await asUser('', 'service_role')
  const claimed=await query('select * from claim_coach_leave_notification_deliveries(100)')
  check(claimed.length===3,'claims each pending device once')
  check((await query('select * from claim_coach_leave_notification_deliveries(100)')).length===0,'processing devices do not duplicate')
  const coach=claimed.find(row=>row.user_id===id(3))
  let current=await query(`select * from get_coach_leave_notification_delivery('${coach.id}',1)`)
  check(current[0].url==='/coach-schedules?month=2026-10','send rechecks current recipient target URL')
  await db.exec("reset role; delete from app_role_permissions where role_key='COACH'")
  await asUser('', 'service_role')
  check((await query(`select * from get_coach_leave_notification_delivery('${coach.id}',1)`)).length===0,'withdrawn permission blocks pending send')
  await db.exec(`reset role; update web_push_subscriptions set enabled=false where user_id='${id(2)}'`)
  const manager=claimed.find(row=>row.user_id===id(2))
  await asUser('', 'service_role')
  check((await query(`select * from get_coach_leave_notification_delivery('${manager.id}',1)`)).length===0,'disabled subscription blocks send')
  await db.exec(`reset role; update push_dispatch_deliveries set status='sent' where id<>'${coach.id}';
    update push_dispatch_deliveries set locked_at=now()-interval '6 minutes',attempt_count=6 where id='${coach.id}'`)
  await asUser('', 'service_role')
  await query('select * from claim_coach_leave_notification_deliveries(100)')
  await db.exec('reset role')
  check((await query(`select status from push_dispatch_deliveries where id='${coach.id}'`))[0].status==='failed','interrupted final attempt ends in failed')
  check((await query(`select dispatch_status from push_dispatch_events where id='${id(21)}'`))[0].dispatch_status==='partial_failed','interrupted final attempt automatically finalizes the event without a returned delivery')
  await db.exec(`update push_dispatch_deliveries set status='processing',attempt_count=6,locked_at=now()-interval '6 minutes';
    update push_dispatch_events set dispatch_status='retrying' where id='${id(21)}'`)
  await asUser('', 'service_role')
  check((await query('select * from claim_coach_leave_notification_deliveries(100)')).length===0,'final interrupted devices are not claimed again')
  await db.exec('reset role')
  check((await query(`select dispatch_status from push_dispatch_events where id='${id(21)}'`))[0].dispatch_status==='failed','all interrupted final attempts automatically terminate the outbox event')
  await db.exec(`update push_dispatch_events set dispatch_status='retrying' where id='${id(21)}'`)
  await asUser('', 'service_role')
  await query('select * from claim_coach_leave_notification_deliveries(100)')
  await db.exec('reset role')
  check((await query(`select dispatch_status from push_dispatch_events where id='${id(21)}'`))[0].dispatch_status==='failed','legacy-worker cleanup is finalized on the next coach claim')
  await db.exec(`update push_dispatch_deliveries set status='sent';
    update push_dispatch_events set dispatch_status='retrying' where id='${id(21)}'`)
  await asUser('', 'service_role')
  await query('select * from claim_coach_leave_notification_deliveries(100)')
  await db.exec('reset role')
  check((await query(`select dispatch_status from push_dispatch_events where id='${id(21)}'`))[0].dispatch_status==='completed','interruption after sent status is repaired without resending')
  await asUser(id(7))
  check((await query('select * from get_notification_feed(10,false)')).some(row=>row.source==='coach_leave'),'no-subscription users still receive the site notification')
  console.log(`Coach leave notification SQL: ${checks} checks passed`)
} catch (error) {
  console.error(error.message, error.internalQuery || '')
  process.exitCode = 1
} finally { await db.close() }
