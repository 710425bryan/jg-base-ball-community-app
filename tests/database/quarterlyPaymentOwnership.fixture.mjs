// Minimal catalog for isolated execution of the real payment RPC definitions.
// No connection strings, customer records, or production writes.
import { readFileSync } from 'node:fs'
export const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
export const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const reconciliation = 'supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_profile_payment_amount_reconciliation_migration.sql'
export function extractFunction(path, name) {
  const sql = read(path)
  const start = sql.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`, 'i'))
  if (start < 0) throw new Error(`Missing function ${name} in ${path}`)
  const tail = sql.slice(start)
  const delimiter = tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1]
  const bodyStart = tail.indexOf(delimiter)
  return tail.slice(0, tail.indexOf(delimiter + ';', bodyStart + delimiter.length) + delimiter.length + 1)
}
export const baselineDefinitions = () => Object.fromEntries([
  ['get_my_payment_records', 'supabase_member_joined_fee_period_guard_migration.sql'],
  ['get_my_payment_submission_estimate', 'supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_junior_high_single_monthly_payment_estimate_hotfix.sql'],
  ['create_my_payment_submission', reconciliation],
  ['create_my_quarterly_payment_submission', reconciliation],
  ['review_profile_payment_submission', reconciliation],
  ['get_my_home_snapshot', 'supabase_no_fee_billing_migration.sql'],
  ['get_fee_management_reminders', 'supabase_no_fee_billing_migration.sql'],
  ['upsert_quarterly_fee_compensation_drafts', 'supabase_quarterly_fee_compensation_migration.sql']
].map(([name, path]) => [name, extractFunction(path, name)]))

export async function setup(db, definitions) {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table profiles(id uuid primary key, role text default 'PARENT', linked_team_member_ids uuid[]);
    create table team_members(id uuid primary key, name text, role text default '球員',
      fee_billing_mode text default 'role_default', training_program text, team_group text,
      joined_date date default '2026-01-01', status text default '在隊', is_inactive_or_graduated boolean default false,
      is_half_price boolean default false, is_primary_payer boolean default false, sibling_ids uuid[] default '{}');
    create view team_members_safe as select * from team_members;
    create function has_app_permission(text,text) returns boolean language sql stable as
      $$ select coalesce((select role='ADMIN' from profiles where id=auth.uid()),false) $$;
    create table fee_settings(member_id uuid primary key, per_session_fee integer, monthly_fixed_fee integer);
    create table monthly_fees(id uuid default gen_random_uuid(), member_id uuid, year_month text,
      payable_amount integer, balance_amount integer default 0, status text default 'unpaid',
      total_sessions integer, leave_sessions integer, per_session_fee integer, deduction_amount integer,
      calculation_type text, fixed_monthly_fee integer, training_program text, paid_at timestamptz,
      payment_method text, account_last_5 text, remittance_date date, created_at timestamptz default now(), updated_at timestamptz default now(),
      constraint monthly_fees_member_id_year_month_key unique(member_id,year_month));
    create table quarterly_fees(id uuid primary key default gen_random_uuid(), member_id uuid, member_ids uuid[],
      year_quarter text, amount integer, balance_amount integer default 0, status text default 'unpaid',
      amount_type text, payment_items jsonb, payment_method text, account_last_5 text, remittance_date date,
      paid_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
    create index quarterly_owner_period on quarterly_fees(member_id,year_quarter);
    create table profile_payment_submissions(id uuid primary key default gen_random_uuid(), profile_id uuid,
      member_id uuid, billing_mode text, period_key text, amount integer, expected_amount integer,
      balance_amount integer default 0, reported_external_amount integer, payment_method text, account_last_5 text,
      remittance_date date, note text, amount_mismatch_reason text, rejection_reason text, status text,
      reviewed_at timestamptz, reviewed_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
    create table profile_payment_submission_items(id uuid primary key default gen_random_uuid(),
      submission_id uuid references profile_payment_submissions, member_id uuid, period_key text,
      amount integer, expected_amount integer, balance_amount integer default 0, reported_external_amount integer,
      created_at timestamptz default now(), updated_at timestamptz default now());
    create table player_balance_transactions(id uuid primary key default gen_random_uuid(), member_id uuid,
      delta integer, reason text, source text, related_profile_payment_submission_id uuid,
      idempotency_key text unique, created_by uuid);
    create function get_player_balance_unchecked(uuid) returns integer language sql stable as
      $$ select coalesce(sum(delta),0)::integer from player_balance_transactions where member_id=$1 $$;
    create table training_month_date_settings(month_start date, program_key text, training_dates date[]);
    create table leave_requests(user_id uuid, start_date date, end_date date, leave_time_segment text);
    -- Surrounding monthly configuration is controlled; the real estimator and
    -- all quarterly reads/writes below execute unchanged from repository SQL.
    create function get_monthly_fee_calculation_type(text,text,text) returns text language sql as
      $$ select case when $2='monthly_fixed' then 'monthly_fixed' else 'per_session' end $$;
    create function get_member_training_program_key_v2(text,text,text,text) returns text language sql as
      $$ select coalesce($1,'chunggang_school_team') $$;
    create function get_school_team_monthly_calculation_mode(text) returns text language sql as
      $$ select case when $1='junior_high_school_team' then 'single_monthly' else 'training_dates' end $$;
    create function is_school_team_monthly_fee_discounted(uuid) returns boolean language sql as
      $$ select is_half_price from team_members where id=$1 $$;
    create function get_school_team_single_monthly_amount(text,boolean) returns integer language sql as
      $$ select case when $2 then 1000 else 2000 end $$;
    create function get_school_team_monthly_per_session_amount(text,boolean) returns integer language sql as
      $$ select case when $2 then 250 else 500 end $$;
    create function get_default_training_month_dates(date,text) returns date[] language sql as
      $$ select array_agg(d::date) from generate_series($1,$1+interval '1 month - 1 day','1 day') d where extract(dow from d)=6 $$;
    create function is_monthly_fee_deductible_leave_segment(text) returns boolean language sql as
      $$ select $1 in ('full_day','morning') $$;
    create function is_monthly_payment_period_open(text,text,date) returns boolean language sql as $$ select true $$;
    set check_function_bodies = off;
  `)
  await db.exec(extractFunction('supabase_zzzzzzzzzzzzzzz_monthly_per_session_billing_migration.sql', 'get_effective_payment_billing_mode'))
  for (const name of ['get_quarterly_period_index', 'get_quarterly_payment_open_period_key', 'is_quarterly_payment_period_open']) {
    await db.exec(extractFunction('supabase_zzzzzzzzzzzz_quarterly_payment_open_period_migration.sql', name))
  }
  await db.exec(extractFunction('supabase_member_joined_fee_period_guard_migration.sql', 'is_member_fee_period_on_or_after_join'))
  for (const definition of Object.values(definitions)) await db.exec(definition)
  for (const name of ['list_profile_payment_submissions_unchecked', 'list_my_payment_submissions']) {
    await db.exec(extractFunction(reconciliation, name))
  }
  await db.exec(`
    revoke all on all functions in schema public from public, anon;
    grant execute on all functions in schema public to authenticated;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    alter table quarterly_fees enable row level security;
    alter table profile_payment_submissions enable row level security;
    alter table profile_payment_submission_items enable row level security;
    insert into profiles values
      ('${id(1)}','PARENT',array['${id(11)}','${id(12)}']::uuid[]),
      ('${id(2)}','PARENT',array['${id(12)}']::uuid[]),
      ('${id(3)}','ADMIN','{}'),('${id(4)}','PARENT','{}');
    insert into team_members(id,name,is_primary_payer,is_half_price,sibling_ids) values
      ('${id(11)}','兄',true,false,array['${id(12)}']::uuid[]),
      ('${id(12)}','弟',false,true,array['${id(11)}']::uuid[]);
    select set_config('request.jwt.claim.sub','${id(1)}',false);
  `)
}
