// Execute actual payment SQL in isolated Postgres with a controlled Taiwan date.
import { setupAdminPayments } from './adminPaymentSubmission.fixture.mjs'
import { extractFunction, read, id } from './quarterlyPaymentOwnership.fixture.mjs'

const opening = 'supabase_zzzzzzzzzzzzzz_monthly_payment_open_period_migration.sql'
const programBilling = 'supabase_zzzzzzzzzzzzzzzzzzzzzzzz_school_team_training_date_per_session_migration.sql'

export async function setupMonthlyPayments(db, overrides = {}) {
  await setupAdminPayments(db, overrides)
  await db.exec(read('supabase/migrations/20260926105948_quarterly_payment_member_ownership.sql'))
  await db.exec(read('supabase/migrations/20260926111544_admin_payment_submission_members.sql'))
  await db.exec(`
    create function test_payment_date() returns date language sql stable as
      $$ select current_setting('test.payment_date')::date $$;
    select set_config('test.payment_date','2026-10-01',false);
    create function normalize_training_program_key(text) returns text language sql immutable as
      $$ select trim(both '_' from regexp_replace(lower(btrim(coalesce($1,''))), '[^a-z0-9_:-]+', '_', 'g')) $$;
    create function get_monthly_fee_calculation_type(text,text) returns text language sql stable as
      $$ select public.get_monthly_fee_calculation_type($1,$2,null::text) $$;
    create or replace function get_school_team_monthly_calculation_mode(text) returns text language sql as
      $$ select case when $1='junior_high_school_team'
        then coalesce(current_setting('test.junior_mode',true),'single_monthly') else 'training_dates' end $$;
  `)
  // Use the production helpers, replacing only their wall clock in this fixture.
  for (const name of ['get_monthly_period_index','get_monthly_payment_open_period_key','is_monthly_payment_period_open']) {
    await db.exec(extractFunction(opening,name)
      .replaceAll("((now() at time zone 'Asia/Taipei')::date)", 'public.test_payment_date()')
      .replaceAll("(now() at time zone 'Asia/Taipei')::date", 'public.test_payment_date()'))
  }
  await db.exec(extractFunction(opening,'guard_profile_payment_submission_monthly_open_period'))
  await db.exec(`
    create trigger guard_profile_payment_submission_monthly_open_period
      before insert or update of billing_mode,period_key,member_id on profile_payment_submissions
      for each row execute function guard_profile_payment_submission_monthly_open_period();
  `)
  await db.exec(read('supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzz_my_home_payment_open_period_migration.sql'))
  // Prefer exact live definitions when supplied; they include later ownership fixes.
  for (const name of ['get_my_payment_submission_estimate','get_my_home_snapshot','guard_profile_payment_submission_monthly_open_period']) {
    if (overrides[name]) await db.exec(overrides[name])
  }
  await db.exec(`
    revoke all on all functions in schema public from public,anon;
    grant execute on all functions in schema public to authenticated;
    insert into team_members(id,name,role,fee_billing_mode,training_program,is_half_price,team_group) values
      ('${id(21)}','國中一般','校隊','role_default','junior_high_school_team',false,null),
      ('${id(22)}','國中半價','校隊','role_default','junior_high_school_team',true,null),
      ('${id(23)}','中港校隊','校隊','role_default','chunggang_school_team',false,null),
      ('${id(24)}','社區計次','球員','monthly_per_session',null,false,null),
      ('${id(25)}','社區固定','球員','monthly_fixed',null,false,null),
      ('${id(26)}','不收隊費','校隊','no_fee','junior_high_school_team',false,null),
      ('${id(27)}','舊群組不猜國中','校隊','role_default',null,false,'junior_high_school_team');
    update profiles set linked_team_member_ids=array[${[21,22,23,24,25,26,27].map(n=>`'${id(n)}'`).join(',')}]::uuid[]
      where id='${id(1)}';
    insert into fee_settings values ('${id(24)}',400,null);
  `)
  // Surrounding fee helpers keep the same general/half-price rules as production;
  // calculation mode is controlled above to cover both junior-high modes.
  await db.exec(extractFunction(programBilling,'get_monthly_fee_calculation_type'))
}
