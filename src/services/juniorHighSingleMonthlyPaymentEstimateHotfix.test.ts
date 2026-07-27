import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_junior_high_single_monthly_payment_estimate_hotfix.sql',
    import.meta.url
  ),
  'utf8'
)

describe('junior-high single monthly payment estimate hotfix', () => {
  it('backfills the independent calculation mode and amount settings', () => {
    expect(migration).toContain("'chunggang_monthly_per_session_defaults'")
    expect(migration).toContain("'xintai_monthly_per_session_defaults'")
    expect(migration).toContain("'calculation_mode', 'training_dates'")
    expect(migration).toContain("'calculation_mode', 'single_monthly'")
    expect(migration).toContain("'single_monthly_fee', 2000")
    expect(migration).toContain("value ->> 'calculation_mode' = 'training_dates'")
  })

  it('upgrades the settings RPC contract and configured-amount helpers', () => {
    expect(migration).toContain(
      'create or replace function public.get_school_team_monthly_calculation_mode'
    )
    expect(migration).toContain(
      'create or replace function public.get_school_team_single_monthly_amount'
    )
    expect(migration).toContain(
      'drop function if exists public.save_school_team_monthly_per_session_defaults(text, integer, integer)'
    )
    expect(migration).toContain(
      'create or replace function public.save_school_team_monthly_per_session_defaults'
    )
    expect(migration).toContain('p_calculation_mode text')
    expect(migration).toContain('p_single_monthly_fee integer')
  })

  it('repairs only safe current-or-future unpaid junior-high snapshots', () => {
    expect(migration).toContain('update public.monthly_fees as monthly_fee')
    expect(migration).toContain("monthly_fee.status = 'unpaid'")
    expect(migration).toContain("monthly_fee.year_month >= to_char(")
    expect(migration).toContain("team_member.training_program::text = 'junior_high_school_team'")
    expect(migration).toContain("calculation_type = 'monthly_fixed'")
    expect(migration).toContain('fixed_monthly_fee = public.get_school_team_single_monthly_amount(')
    expect(migration).toContain("payment_submission.status = 'pending_review'")
    expect(migration).toContain('and not exists (')
    expect(migration).not.toContain("monthly_fee.status = 'paid'")
  })

  it('makes a missing monthly snapshot use the configured single monthly amount', () => {
    expect(migration).toContain(
      'create or replace function public.get_my_payment_submission_estimate'
    )
    expect(migration).toContain(
      "public.get_school_team_monthly_calculation_mode(\n          team_members.training_program::text\n        ) = 'single_monthly'"
    )
    expect(migration).toContain(
      'then public.get_school_team_single_monthly_amount('
    )
    expect(migration).toContain(
      'coalesce(monthly_fees.calculation_type, linked_member.calculation_type)'
    )
    expect(migration).toContain('monthly_fees.payable_amount as stored_payable_amount')
  })

  it('keeps internal helpers private and the user-facing RPC authenticated', () => {
    expect(migration).toContain(
      'revoke all on function public.get_school_team_monthly_calculation_mode(text) from public, anon, authenticated'
    )
    expect(migration).toContain(
      'grant execute on function public.get_school_team_monthly_calculation_mode(text) to service_role'
    )
    expect(migration).toContain(
      'revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public, anon'
    )
    expect(migration).toContain(
      'grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated, service_role'
    )
  })
})
