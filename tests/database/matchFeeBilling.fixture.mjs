// Shared isolated catalog using the real match-fee tables, sync and payment RPCs.
import { read, id, extractFunction } from './quarterlyPaymentOwnership.fixture.mjs'
import { setupAdminPayments } from './adminPaymentSubmission.fixture.mjs'

export async function setupMatchFees(db) {
  const base = 'supabase_match_fees_migration.sql'
  const opening = 'supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_match_fee_payment_open_state_migration.sql'
  await setupAdminPayments(db)
  await db.exec(`
    drop table match_payment_submission_items, match_fee_items, match_payment_submissions, matches cascade;
    create table matches(id uuid primary key, players text, absent_players jsonb default '[]',
      match_name text, tournament_name text, match_date date, match_time text, category_group text, note text,
      match_fee_payment_opened_at timestamptz, match_fee_payment_opened_by uuid references profiles,
      match_fee_payment_signature text);
    alter table profiles add column nickname text, add column name text, add column email text;
  `)
  const original = read(base)
  await db.exec(original.slice(original.indexOf('alter table public.matches'), original.indexOf('alter table public.player_balance_transactions')))
  await db.exec(original.slice(original.indexOf('create unique index if not exists match_fee_items_match_member_uidx'), original.indexOf('create index if not exists match_fee_items_member_month_idx')))
  for (const name of ['normalize_match_fee_player_name', 'split_match_fee_player_names', 'sync_match_fee_items_for_month', 'sync_match_fee_items_after_match_change']) await db.exec(extractFunction(base, name))
  const leave = 'supabase_zzzzzzzzzzzzzzzz_leave_time_segments_migration.sql'
  for (const match of read(leave).matchAll(/create or replace function public\.([a-z_]+)\(/g)) {
    if (['normalize_leave_time_segment', 'extract_time_minutes', 'leave_time_segment_overlaps_event_time', 'leave_request_overlaps_event', 'get_match_leave_event_time'].includes(match[1])) await db.exec(extractFunction(leave, match[1]))
  }
  await db.exec(extractFunction('supabase_zzzzzzzzzzzzzzz_monthly_per_session_billing_migration.sql', 'get_effective_payment_billing_mode'))
  for (const name of ['get_match_fee_payment_signature', 'sync_match_fee_items_for_match', 'set_match_fee_payment_open_state', 'list_my_match_fee_items', 'list_match_fee_items_by_month', 'delete_cancelled_match_fee_group', 'create_match_payment_submission']) await db.exec(extractFunction(opening, name))
  await db.exec(`
    create trigger sync_match_fee_items_after_match_change
    after insert or update of match_name, tournament_name, match_date, match_time, category_group, players, absent_players, match_fee_amount
    on matches for each row execute function sync_match_fee_items_after_match_change();
    alter table match_fee_items enable row level security;
    grant select on match_fee_items to authenticated;
    insert into matches(id,players,match_name,match_date,match_time,match_fee_amount)
      values ('${id(41)}','兄,弟','測試盃','2026-09-27','09:00 - 12:00',500),
      ('${id(42)}','兄','另一場','2026-09-28','09:00 - 12:00',300);
  `)
}
