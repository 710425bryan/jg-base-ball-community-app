import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase_zzzzzzzzzzzzzzzzzzzzzzzz_school_team_training_date_per_session_migration.sql', import.meta.url),
  'utf8'
)

describe('school-team training-date per-session migration', () => {
  it('stores protected, independent Chunggang and Xintai defaults', () => {
    expect(migration).toContain("'chunggang_monthly_per_session_defaults'")
    expect(migration).toContain("'xintai_monthly_per_session_defaults'")
    expect(migration).toContain("'regular_per_session_fee', 500")
    expect(migration).toContain("'discount_per_session_fee', 250")
    expect(migration).toContain("'calculation_mode', 'single_monthly'")
    expect(migration).toContain("'single_monthly_fee', 2000")
    expect(migration).toContain("'國中部單次月費與訓練日期計費設定'")
    expect(migration).not.toContain('新泰校隊')
    expect(migration).toContain('create or replace function public.get_school_team_monthly_per_session_defaults')
    expect(migration).toContain('create or replace function public.save_school_team_monthly_per_session_defaults')
    expect(migration).toContain('create or replace function public.get_monthly_fee_calculation_type')
    expect(migration).toContain("else 'per_session'")
    expect(migration).not.toContain('leave_daily_credit')
    expect(migration).toContain('fees EDIT permission required')
  })

  it('defaults junior high to a 2000 single monthly fee and preserves the training-date option', () => {
    expect(migration).toContain('create or replace function public.get_school_team_monthly_calculation_mode')
    expect(migration).toContain('create or replace function public.get_school_team_single_monthly_amount')
    expect(migration).toContain("when v_value->>'calculation_mode' = 'training_dates' then 'training_dates'")
    expect(migration).toContain("else 'single_monthly'")
    expect(migration).toContain('round(v_single_monthly_fee / 2.0)::integer')
    expect(migration).toContain("then 'monthly_fixed'")
    expect(migration).toContain('monthly_context.fixed_monthly_fee - monthly_context.deduction_amount')
  })

  it('uses each school-team program date set and rate in family estimates', () => {
    expect(migration).toContain("v_program_key not in ('chunggang_school_team', 'junior_high_school_team')")
    expect(migration).toContain('from public.training_month_date_settings settings')
    expect(migration).toContain('public.is_monthly_fee_deductible_leave_segment(leave_requests.leave_time_segment)')
    expect(migration).toContain('public.get_school_team_monthly_per_session_amount(')
    expect(migration).toContain('linked_member.training_program_key')
    expect(migration).toContain('linked_member.is_school_team_discounted')
    expect(migration).toContain('- coalesce(monthly_context.leave_sessions, 0),')
    expect(migration).toContain('* coalesce(monthly_context.per_session_fee, 0) - monthly_context.deduction_amount')
  })

  it('keeps Xintai leave days informational without reducing family estimates', () => {
    expect(migration).toContain("when monthly_context.training_program_key = 'junior_high_school_team'")
    expect(migration).toContain('then coalesce(monthly_context.total_sessions, 0)')
    expect(migration).toContain('* coalesce(monthly_context.per_session_fee, 0)')
    expect(migration).toContain('- coalesce(monthly_context.leave_sessions, 0),')
  })

  it('opens Xintai next-month payments on the 25th while keeping Chunggang in arrears', () => {
    expect(migration).toContain('create or replace function public.get_monthly_payment_open_calculation_type')
    expect(migration).toContain("public.normalize_training_program_key(p_training_program) = 'junior_high_school_team'")
    expect(migration).toContain("when p_role = '校隊'")
    expect(migration).toContain("then 'per_session'")
    expect(migration).toContain('create or replace function public.guard_profile_payment_submission_monthly_open_period()')
    expect(migration).toContain('v_open_period_key := public.get_monthly_payment_open_period_key(v_open_calculation_type)')
    expect(migration).toContain('public.is_monthly_payment_period_open(v_period_key, v_open_calculation_type)')
    expect(migration).toContain("pg_get_functiondef('public.get_my_home_snapshot(date)'::regprocedure)")
    expect(migration).toContain('v_program_aware_condition')
  })

  it('does not expose settings mutations or payment estimates to anonymous callers', () => {
    expect(migration).toContain(
      'revoke all on function public.save_school_team_monthly_per_session_defaults(text, text, integer, integer, integer) from public, anon'
    )
    expect(migration).toContain(
      'revoke all on function public.get_school_team_monthly_calculation_mode(text) from public, anon, authenticated'
    )
    expect(migration).toContain(
      'revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public, anon'
    )
    expect(migration).toContain(
      'revoke all on function public.get_monthly_payment_open_calculation_type(text, text, text, text) from public, anon, authenticated'
    )
  })
})
