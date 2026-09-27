// Real PostgreSQL functions/triggers/RLS in PGlite; no production writes.
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { read, id, extractFunction } from './quarterlyPaymentOwnership.fixture.mjs'
import { setupMatchFees } from './matchFeeBilling.fixture.mjs'

const db = new PGlite()
const migration = 'supabase/migrations/20260927051302_independent_player_match_billing.sql'
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0]
let checks = 0
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
const fails = async (fn, message) => { await assert.rejects(fn, message); checks++ }
const login = n => query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : ''])
const fee = async (member, match) => (await query('select *, updated_at::text as version from match_fee_items where match_id=$1 and member_id=$2', [id(match), id(member)]))[0]
const sync = match => query('select sync_match_fee_items_for_match($1)', [id(match)])
const enable = (member, value) => query('update team_members set match_fee_enabled=$1 where id=$2', [value,id(member)])
const toggle = (row, value) => query('select set_match_fee_item_exemption($1,$2,$3)', [row.id,value,row.version])
try {
  await setupMatchFees(db)
  await db.exec(read('supabase/migrations/20260927040433_match_fee_single_match_exemptions.sql'))
  await login(3)
  await db.exec(`
    insert into team_members(id,name,fee_billing_mode) values ('${id(13)}','免隊費','no_fee');
    insert into team_members(id,name,role,fee_billing_mode) values ('${id(14)}','校隊免隊費','校隊','no_fee');
    -- Date-relative fixtures make the cutoff regression independent of wall clock.
    insert into matches(id,players,match_name,match_date,match_time,match_fee_amount) values
      ('${id(43)}','兄,弟,免隊費,校隊免隊費','今天', (now() at time zone 'Asia/Taipei')::date,'09:00 - 12:00',500),
      ('${id(44)}','兄,弟,免隊費','過去', (now() at time zone 'Asia/Taipei')::date - 1,'09:00 - 12:00',500),
      ('${id(45)}','兄,弟,免隊費','未來', (now() at time zone 'Asia/Taipei')::date + 1,'09:00 - 12:00',500);
  `)
  // The old function excludes no_fee players even when they participate.
  check(await fee(13,43), undefined, 'baseline confirms missing match-only billing')
  await fails(()=>enable(13,true), /does not exist/)
  const before = await query('select * from match_fee_items order by id')
  const moneyBefore = await query('select * from quarterly_fees order by member_id')
  await db.exec(read(migration))
  await db.exec(read(migration))
  check(await query('select * from match_fee_items order by id'),before,'migration itself never rewrites fee records')
  check(await query('select match_fee_enabled,match_fee_start_date from team_members where id=$1',[id(11)]),[{match_fee_enabled:true,match_fee_start_date:null}],'existing payer retains historic eligibility')
  check(await scalar('select match_fee_enabled from team_members where id=$1',[id(13)]),false,'existing no-fee player remains exempt')
  check(await scalar('select match_fee_enabled from team_members where id=$1',[id(14)]),false,'existing no-fee school member remains exempt')
  check(await scalar("select reloptions from pg_class where oid='team_members_safe'::regclass"),['security_invoker=true'],'safe view remains invoker scoped')
  await enable(13,true)
  await enable(14,true)
  check([(await fee(13,43)).amount,(await fee(13,45)).amount,(await fee(14,43)).amount],[500,500,500],'team-fee-exempt players and school members accrue match fees')
  check(await fee(13,44),undefined,'enabling does not back-charge past dates')
  check(await scalar("select get_effective_payment_billing_mode(role,fee_billing_mode) from team_members where id=$1",[id(13)]),'none','team fees still exempt')
  const start = await scalar('select match_fee_start_date::text from team_members where id=$1',[id(13)])
  check(start,await scalar("select (now() at time zone 'Asia/Taipei')::date::text"),'effective date is the server Taiwan date')
  await query("update team_members set match_fee_start_date='2000-01-01' where id=$1",[id(13)])
  check(await scalar('select match_fee_start_date::text from team_members where id=$1',[id(13)]),start,'client cannot backdate activation')
  await db.exec(read(migration))
  check(await scalar('select match_fee_start_date::text from team_members where id=$1',[id(13)]),start,'replay retains manual enable date')
  // Same omitted-column upsert shape used by Google Form sync.
  await query("insert into team_members(id,name,role,fee_billing_mode) values ($1,'免隊費','球員','no_fee') on conflict(id) do update set name=excluded.name,role=excluded.role",[id(13)])
  check(await scalar('select match_fee_enabled from team_members where id=$1',[id(13)]),true,'Google upsert leaves match setting unchanged')
  check(await scalar('select match_fee_start_date::text from team_members where id=$1',[id(13)]),start,'Google upsert retains effective date')
  await query("update team_members set fee_billing_mode='monthly_fixed' where id=$1",[id(13)])
  check(await scalar('select match_fee_enabled from team_members where id=$1',[id(13)]),true,'team fee changes do not alter match setting')
  await query("update team_members set fee_billing_mode='no_fee' where id=$1",[id(13)])
  await enable(11,false)
  check((await fee(11,43)).payment_status,'cancelled','disabling match fees cancels unpaid fees immediately')
  check(await scalar("select get_effective_payment_billing_mode(role,fee_billing_mode) from team_members where id=$1",[id(11)]),'quarterly','disabling match fees does not exempt membership')
  await enable(11,true)
  check((await fee(11,44)).payment_status,'cancelled','re-enabling does not revive historical cancelled fees')
  check((await fee(11,43)).payment_status,'unpaid','re-enabling restores eligible current matches')
  await toggle(await fee(13,43),true)
  await enable(13,false)
  await enable(13,true)
  check([(await fee(13,43)).is_exempt,(await fee(13,43)).payment_status],[true,'cancelled'],'single-match exemption wins after configuration changes')
  await toggle(await fee(13,43),false)
  check((await fee(13,43)).payment_status,'unpaid','removing single-match exemption restores independent eligibility')
  for (const segment of ['full_day','morning','afternoon']) {
    await query('insert into leave_requests values ($1,$2,$2,$3)',[id(13),start,segment])
    await sync(43)
    check((await fee(13,43)).payment_status,segment==='afternoon'?'unpaid':'cancelled',`${segment} leave still determines morning match fees`)
    await db.exec('delete from leave_requests')
  }
  await sync(43)
  await query('select * from set_match_fee_payment_open_state($1,true)',[id(43)])
  await query('select * from set_match_fee_payment_open_state($1,true)',[id(45)])
  await query('update profiles set linked_team_member_ids=$1 where id=$2',[[id(13)],id(1)])
  await login(1)
  check((await query('select * from list_my_payment_members()')).some(r=>r.member_id===id(13)&&r.billing_mode==='none'),true,'match-only member remains selectable in personal payments')
  const personal = await query('select * from list_my_match_fee_items($1)',[id(13)])
  check(personal.filter(r=>r.payment_status==='unpaid').length,2,'personal payment list returns current and future charges')
  await query("select * from create_match_payment_submission($1,'現金')",[[(await fee(13,43)).id]])
  await query("select * from create_match_payment_submission($1,'現金')",[[(await fee(13,45)).id]])
  await query("update match_fee_items set payment_status='paid' where match_id=$1 and member_id=$2",[id(45),id(13)])
  await db.exec("update match_payment_submissions set status='approved' where id in (select payment_submission_id from match_fee_items where payment_status='paid')")
  const historyBefore = await query("select * from match_fee_items where payment_status in ('paid','pending_review') order by id")
  const submissionsBefore = await query('select * from match_payment_submissions order by id')
  await login(3)
  await enable(13,false)
  await enable(13,true)
  await sync(43)
  await sync(45)
  check(await query("select * from match_fee_items where payment_status in ('paid','pending_review') order by id"),historyBefore,'pending and paid snapshots are untouched')
  check(await query('select * from match_payment_submissions order by id'),submissionsBefore,'payment submission history is untouched')
  await fails(async()=>toggle(await fee(13,43),true),/待確認或已確認/)
  await query("insert into team_members(id,name,fee_billing_mode) values ($1,'新免收','no_fee')",[id(15)])
  check(await scalar('select match_fee_enabled from team_members where id=$1',[id(15)]),false,'older client inserts inherit no-fee default')
  await query("insert into team_members(id,name,fee_billing_mode,match_fee_enabled,match_fee_start_date) values ($1,'新比賽繳費','no_fee',true,'2000-01-01')",[id(16)])
  check(await scalar('select match_fee_start_date::text from team_members where id=$1',[id(16)]),start,'new explicit match-only player starts today')
  // Read/write permissions mimic the deployed table policies; run them as the
  // actual authenticated role instead of only checking a SQL string.
  await db.exec(`
    create function auth.role() returns text language sql as $$ select current_user::text $$;
    alter table team_members add column national_id text;
    alter table team_members enable row level security;
    grant usage on schema public to authenticated;
    grant select on profiles to authenticated;
    grant select(id,name,role,fee_billing_mode,training_program,team_group,joined_date,status,
      is_inactive_or_graduated,is_half_price,is_primary_payer,sibling_ids) on team_members to authenticated;
    grant select on team_members_safe to authenticated;
    grant insert,update on team_members to authenticated;
    create policy member_read on team_members for select to authenticated using (
      public.has_app_permission('players','VIEW') or public.has_app_permission('players','EDIT')
      or exists(select 1 from profiles p where p.id=auth.uid() and team_members.id=any(p.linked_team_member_ids)));
  `)
  const policies=read('supabase_access_control_policy_cleanup_migration.sql')
  for(const name of ['team_members_insert_players_create','team_members_update_players_edit']) {
    const begin=policies.indexOf(`create policy "${name}"`)
    await db.exec(policies.slice(begin,policies.indexOf(';',begin)+1))
  }
  await db.exec(extractFunction('supabase_zzzzzzzzzzzzzzzzzzzzzzzz_team_member_notification_outbox_migration.sql','list_team_members_for_edit'))
  await db.exec('grant execute on function list_team_members_for_edit() to authenticated')
  await login(1)
  await db.exec('set role authenticated')
  check((await query('select id,match_fee_enabled from team_members_safe')).length,1,'safe view only exposes linked member rows to parent')
  await enable(13,false)
  check(await scalar('select match_fee_enabled from team_members_safe where id=$1',[id(13)]),true,'parent cannot change match billing through table update')
  await fails(()=>query('select national_id from team_members'),/permission denied/)
  await fails(()=>query('select * from list_team_members_for_edit()'),/players:EDIT/)
  await fails(()=>sync(43),/permission denied/)
  await login(3)
  check((await query('select * from list_team_members_for_edit()')).find(r=>r.id===id(13)).match_fee_enabled,true,'full edit RPC returns independent setting')
  await enable(14,false)
  check(await scalar('select match_fee_enabled from team_members_safe where id=$1',[id(14)]),false,'authorized editor can save switch under RLS')
  await db.exec('reset role')
  check(await scalar("select has_function_privilege('anon','private.normalize_player_match_billing()','execute')"),false,'anonymous cannot execute setting trigger')
  check(await query('select * from quarterly_fees order by member_id'),moneyBefore,'existing team-fee records unchanged')
  check(await scalar('select count(*) from player_balance_transactions'),0,'balance ledger unchanged')
  check(await scalar('select count(*) from equipment_transactions'),1,'equipment unchanged')
  check(await scalar('select players from matches where id=$1',[id(43)]),'兄,弟,免隊費,校隊免隊費','match roster unchanged')
  console.log(`PASS: ${checks} independent player match billing SQL checks.`)
} catch(error) { console.error(error.message); console.error(error.stack?.split('\n').filter(line=>line.includes('tests/database')).join('\n')); process.exitCode=1 } finally { await db.close() }
