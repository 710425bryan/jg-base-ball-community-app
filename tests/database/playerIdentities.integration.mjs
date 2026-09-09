// Isolated PostgreSQL only; never connects to Supabase.
// PGLITE_MODULE_PATH=/tmp/jg-payment-db-test/node_modules/@electric-sql/pglite/dist/index.js node tests/database/playerIdentities.integration.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite')
const db = new PGlite()
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0]
let assertions = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); assertions++ }
const fails = async (action, pattern) => { await assert.rejects(action, pattern); assertions++ }
const memberId = '00000000-0000-0000-0000-000000000001'

// Matches the live safe-view column order. Sensitive columns deliberately remain
// in the base table to verify that the migration does not expose them.
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create function public.has_app_permission(feature text, action text) returns boolean
    language sql stable as $$ select feature = 'players' and action = any(string_to_array(current_setting('test.permissions', true), ',')) $$;
  create table public.team_members (
    id uuid primary key, name text, role text not null, team_group text, status text,
    birth_date date, is_early_enrollment boolean, is_primary_payer boolean, is_half_price boolean,
    jersey_number text, jersey_name text, jersey_size text, low_income_qualification boolean,
    sibling_ids uuid[], sibling_id uuid, throwing_hand text, batting_hand text,
    contact_relation text, guardian_name text, portrait_auth boolean, notes text, avatar_url text,
    created_at timestamptz, is_inactive_or_graduated boolean, fee_billing_mode text,
    joined_date date, school_name text, grade text, training_program text,
    national_id text, guardian_phone text, contact_line_id text
  );
  alter table public.team_members enable row level security;
  create policy member_read on team_members for select to authenticated using (
    public.has_app_permission('players','VIEW') or id::text = current_setting('test.linked',true)
  );
  create policy member_insert on team_members for insert to authenticated with check (public.has_app_permission('players','CREATE'));
  create policy member_update on team_members for update to authenticated
    using (public.has_app_permission('players','EDIT')) with check (public.has_app_permission('players','EDIT'));
  create policy member_delete on team_members for delete to authenticated using (public.has_app_permission('players','DELETE'));
  grant insert, update, delete on public.team_members to authenticated;
  create view public.team_members_safe with (security_invoker=true) as
    select id,name,role,team_group,status,birth_date,is_early_enrollment,is_primary_payer,is_half_price,
      jersey_number,jersey_name,jersey_size,low_income_qualification,sibling_ids,sibling_id,
      throwing_hand,batting_hand,contact_relation,guardian_name,portrait_auth,notes,avatar_url,created_at,
      is_inactive_or_graduated,fee_billing_mode,joined_date,school_name,grade,training_program from public.team_members;
  grant select on public.team_members_safe to authenticated;
`)
const safeColumns = (await db.query("select column_name from information_schema.columns where table_name='team_members_safe' order by ordinal_position")).rows.map(row => row.column_name)
await db.exec(`grant select (${safeColumns.join(',')}) on public.team_members to authenticated;`)
await db.exec(readFileSync(new URL('../../supabase/migrations/20260909133628_player_custom_identity_labels.sql', import.meta.url), 'utf8'))
const billingSql = readFileSync(new URL('../../supabase_zzzzzzzzzzzzzzz_monthly_per_session_billing_migration.sql', import.meta.url), 'utf8')
const billingFunction = billingSql.match(/create or replace function public\.get_effective_payment_billing_mode\([\s\S]*?\$\$;/i)?.[0]
assert.ok(billingFunction, 'existing authoritative billing helper must be loaded unchanged')
await db.exec(billingFunction)

const login = async (permissions, linked = '') => {
  await db.exec('reset role;')
  await db.query("select set_config('test.permissions',$1,false),set_config('test.linked',$2,false)", [permissions,linked])
  await db.exec('set role authenticated;')
}
await login('VIEW,CREATE,EDIT,DELETE')
check(await scalar("select name from player_identity_labels"), '新太陽社區棒球隊')
for (const [mode, expected] of [['role_default','quarterly'], ['monthly_fixed','monthly'], ['monthly_per_session','monthly'], ['no_fee','none']]) {
  await db.query("insert into team_members(id,name,role,fee_billing_mode,member_identity_label,is_half_price,is_primary_payer,team_group) values ($1,'測試球員','球員',$2,' 自訂棒球隊 ',true,false,'黑熊(中組)') on conflict(id) do update set fee_billing_mode=excluded.fee_billing_mode", [memberId,mode])
  check((await db.query('select role,member_identity_label,fee_billing_mode,is_half_price,is_primary_payer,team_group from team_members_safe where id=$1',[memberId])).rows[0], {
    role:'球員',member_identity_label:'自訂棒球隊',fee_billing_mode:mode,is_half_price:true,is_primary_payer:false,team_group:'黑熊(中組)'
  })
  check(await scalar('select get_effective_payment_billing_mode(role,fee_billing_mode) from team_members_safe where id=$1',[memberId]), expected)
}
check(await scalar("select count(*)::int from player_identity_labels where name='自訂棒球隊'"), 1)
// A Google sync upsert omits the label, retaining its saved value.
await db.query("insert into team_members(id,name,role) values ($1,'測試球員同步','球員') on conflict(id) do update set name=excluded.name,role=excluded.role",[memberId])
check(await scalar('select member_identity_label from team_members_safe where id=$1',[memberId]),'自訂棒球隊')
// Failed writes must not leave a new option behind.
await fails(() => db.query("insert into team_members(id,name,role,member_identity_label) values ($1,'重複主鍵','球員','失敗不保存')",[memberId]),/duplicate key/)
check(await scalar("select count(*)::int from player_identity_labels where name='失敗不保存'"),0)
for (const value of ['熊'.repeat(61),'不合法\n名稱','教練']) {
  await fails(() => db.query('update team_members set member_identity_label=$1 where id=$2',[value,memberId]),/check constraint/)
}
await db.query("update team_members set member_identity_label=null where id=$1",[memberId])
check(await scalar('select member_identity_label from team_members_safe where id=$1',[memberId]),null)
await db.query("update team_members set member_identity_label='自訂棒球隊',role='教練' where id=$1",[memberId])
check(await scalar('select member_identity_label from team_members_safe where id=$1',[memberId]),null)
await db.query("update team_members set member_identity_label='自訂棒球隊',role='球員' where id=$1",[memberId])
await fails(() => db.query("insert into player_identity_labels(name) values ('不可直接建立')"),/permission denied/)
await fails(() => db.query('select private.capture_player_identity_label()'),/permission denied/)
await fails(() => db.query('select national_id from team_members'),/permission denied/)
await fails(() => db.query('select national_id from team_members_safe'),/does not exist/)

await login('VIEW')
check(await scalar('select count(*)::int from player_identity_labels'),2)
await db.query("update team_members set member_identity_label='唯讀不可改' where id=$1",[memberId])
check(await scalar('select member_identity_label from team_members_safe where id=$1',[memberId]),'自訂棒球隊')
await fails(() => db.query("insert into team_members(id,name,role,member_identity_label) values ('00000000-0000-0000-0000-000000000002','不可新增','球員','唯讀不可存')"),/row-level security/)
check(await scalar("select count(*)::int from player_identity_labels where name='唯讀不可存'"),0)
await login('',memberId)
check(await scalar('select count(*)::int from player_identity_labels'),0)
check(await scalar('select member_identity_label from team_members_safe where id=$1',[memberId]),'自訂棒球隊')
await db.exec('reset role;set role anon;')
await fails(() => db.query('select * from player_identity_labels'),/permission denied/)

await login('VIEW,DELETE')
await db.query('delete from team_members where id=$1',[memberId])
check(await scalar("select name from player_identity_labels where name='自訂棒球隊'"),'自訂棒球隊')
check(await scalar('select count(*)::int from team_members_safe'),0)
await db.close()
console.log(`Player identity PostgreSQL integration: ${assertions} assertions passed`)
