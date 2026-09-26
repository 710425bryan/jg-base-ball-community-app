import { extractFunction, setup, baselineDefinitions, id } from './quarterlyPaymentOwnership.fixture.mjs'

export async function setupAdminPayments(db, overrides = {}) {
  await setup(db, baselineDefinitions())
  await db.exec(`
    alter function get_player_balance_unchecked(uuid) set search_path = public;
    alter table profiles add column is_active boolean default true,
      add column access_start timestamptz, add column access_end timestamptz;
    alter table player_balance_transactions add column related_equipment_payment_submission_id uuid,
      add column related_match_payment_submission_id uuid;
    alter table profile_payment_submission_items drop constraint profile_payment_submission_items_submission_id_fkey;
    alter table profile_payment_submission_items add foreign key(submission_id) references profile_payment_submissions on delete cascade;
    create table training_program_settings(program_key text primary key,label text);
    create table equipment(id uuid primary key, name text, purchase_price integer);
    create table equipment_purchase_requests(id uuid primary key, status text, picked_up_at timestamptz);
    create table equipment_purchase_request_items(id uuid primary key,request_id uuid,ready_at timestamptz,picked_up_at timestamptz);
    create table equipment_transactions(id uuid primary key,member_id uuid,equipment_id uuid,request_item_id uuid,
      transaction_type text default 'purchase', quantity integer default 1,unit_price integer,size text,jersey_number text,
      payment_status text default 'unpaid',payment_submission_id uuid, transaction_date date default current_date,
      created_at timestamptz default now(),updated_at timestamptz default now());
    create table matches(id uuid primary key,match_fee_payment_opened_at timestamptz);
    create table match_fee_items(id uuid primary key,match_id uuid,member_id uuid,amount integer,
      payment_status text default 'unpaid',payment_submission_id uuid, member_name_snapshot text,
      match_name_snapshot text,match_date_snapshot date,match_time_snapshot text,tournament_name_snapshot text,
      category_group_snapshot text,fee_month text,created_at timestamptz default now(),updated_at timestamptz default now());
    -- This fixture tests payment scope with existing fee items; match generation
    -- itself is outside the changed code and covered by the fee regression suite.
    create function sync_match_fee_items_for_match(uuid) returns void language sql as $$ select $$;
  `)
  for (const kind of ['equipment', 'match']) {
    await db.exec(`
      create table ${kind}_payment_submissions(id uuid primary key default gen_random_uuid(),profile_id uuid,member_id uuid,
        amount integer,balance_amount integer default 0,payment_method text,account_last_5 text,remittance_date date,note text,
        status text,reviewed_at timestamptz,reviewed_by uuid,created_at timestamptz default now(),updated_at timestamptz default now());
      create table ${kind}_payment_submission_items(id uuid primary key default gen_random_uuid(),
        submission_id uuid references ${kind}_payment_submissions on delete cascade,
        ${kind === 'equipment' ? 'transaction_id' : 'match_fee_item_id'} uuid);
    `)
  }
  const sources = {
    current_profile_role: 'supabase_profile_access_control_migration.sql',
    list_my_payment_members: 'supabase_no_fee_billing_migration.sql',
    create_equipment_payment_submission: 'supabase_zzzzzzzzzz_equipment_approved_payment_scope_migration.sql',
    list_equipment_payment_submissions: 'supabase_zzzzzzzzzzzzzz_equipment_payment_item_fulfillment_status_migration.sql',
    create_match_payment_submission: 'supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_match_fee_payment_open_state_migration.sql',
    list_match_payment_submissions: 'supabase_match_fees_migration.sql',
    list_my_pending_payment_submissions: 'supabase_pending_payment_submission_schema_names_hotfix.sql',
    mutate_my_pending_payment_submission: 'supabase_pending_payment_submission_self_service_migration.sql'
  }
  for (const [name, path] of Object.entries(sources)) {
    await db.exec(overrides[name] || extractFunction(path, name))
  }
  for (const name of ['create_my_payment_submission','create_my_quarterly_payment_submission','get_my_payment_submission_estimate']) {
    if (overrides[name]) await db.exec(overrides[name])
  }
  await db.exec(`
    create or replace function has_app_permission(text,text) returns boolean language sql stable as
      $$ select coalesce(public.current_profile_role() in ('ADMIN','MANAGER'),false) $$;
    revoke all on all functions in schema public from public,anon;
    grant execute on all functions in schema public to authenticated;
    insert into profiles(id,role,linked_team_member_ids) values ('${id(5)}','MANAGER','{}'),('${id(6)}','ADMIN','{}');
    insert into quarterly_fees(member_id,member_ids,year_quarter,amount) values
      ('${id(11)}',array['${id(11)}','${id(12)}']::uuid[],'2026-Q4',6700),
      ('${id(12)}',array['${id(11)}','${id(12)}']::uuid[],'2026-Q4',3700);
    insert into equipment values ('${id(21)}','測試球衣',800);
    insert into equipment_transactions(id,member_id,equipment_id) values ('${id(31)}','${id(12)}','${id(21)}');
    insert into matches values ('${id(41)}',now());
    insert into match_fee_items(id,match_id,member_id,amount,match_name_snapshot) values ('${id(51)}','${id(41)}','${id(12)}',500,'測試賽事');
  `)
}
