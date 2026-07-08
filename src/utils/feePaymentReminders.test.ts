import { describe, expect, it } from 'vitest'
import {
  buildFeePaymentReminderBody,
  buildFeePaymentReminderEventKey,
  getDefaultFeePaymentReminderPeriods,
  getFeePaymentReminderBillingMode,
  getFeePaymentReminderMemberCategory,
  groupFeePaymentReminderTargets,
  normalizeFeePaymentReminderCategories,
  normalizeMonthlyReminderPeriod,
  normalizeQuarterlyReminderPeriod
} from './feePaymentReminders'

describe('feePaymentReminders', () => {
  it('normalizes categories and drops unknown values', () => {
    expect(normalizeFeePaymentReminderCategories([
      'community',
      'unknown',
      'xintai_school_team',
      'community'
    ], ['chunggang_school_team'])).toEqual(['community', 'xintai_school_team'])
    expect(normalizeFeePaymentReminderCategories([], ['chunggang_school_team']))
      .toEqual(['chunggang_school_team'])
  })

  it('validates monthly and quarterly periods with fallbacks', () => {
    expect(normalizeMonthlyReminderPeriod('2026-07', '2026-06')).toBe('2026-07')
    expect(normalizeMonthlyReminderPeriod('2026-13', '2026-06')).toBe('2026-06')
    expect(normalizeQuarterlyReminderPeriod('2026-q3', '2026-Q2')).toBe('2026-Q3')
    expect(normalizeQuarterlyReminderPeriod('2026-Q5', '2026-Q2')).toBe('2026-Q2')
  })

  it('defaults periods in Asia/Taipei using the existing fee reminder rule', () => {
    expect(getDefaultFeePaymentReminderPeriods(new Date('2026-07-08T13:00:00.000Z'))).toEqual({
      monthly_period: '2026-06',
      quarterly_period: '2026-Q3'
    })
    expect(getDefaultFeePaymentReminderPeriods(new Date('2026-07-25T01:00:00.000Z')).monthly_period)
      .toBe('2026-07')
  })

  it('classifies Chunggang, Xintai, and community billable members', () => {
    expect(getFeePaymentReminderMemberCategory({
      role: '校隊',
      training_program: 'chunggang_school_team'
    })).toBe('chunggang_school_team')
    expect(getFeePaymentReminderMemberCategory({
      role: '校隊',
      training_program: 'Junior High School Team'
    })).toBe('xintai_school_team')
    expect(getFeePaymentReminderMemberCategory({
      role: '球員',
      fee_billing_mode: 'monthly_fixed'
    })).toBe('community')
    expect(getFeePaymentReminderMemberCategory({
      role: '球員',
      fee_billing_mode: 'no_fee'
    })).toBeNull()
  })

  it('matches current billing-mode rules for reminder scope', () => {
    expect(getFeePaymentReminderBillingMode({ role: '校隊' })).toBe('monthly')
    expect(getFeePaymentReminderBillingMode({ role: '球員', fee_billing_mode: 'monthly_fixed' })).toBe('monthly')
    expect(getFeePaymentReminderBillingMode({ role: '球員', fee_billing_mode: 'monthly_per_session' })).toBe('monthly')
    expect(getFeePaymentReminderBillingMode({ role: '球員', fee_billing_mode: 'role_default' })).toBe('quarterly')
    expect(getFeePaymentReminderBillingMode({ role: '校隊', fee_billing_mode: 'no_fee' })).toBe('none')
  })

  it('builds stable daily event keys', () => {
    expect(buildFeePaymentReminderEventKey({
      userId: 'user-1',
      monthlyPeriod: '2026-06',
      quarterlyPeriod: '2026-Q3',
      categories: ['community', 'chunggang_school_team'],
      dispatchDate: '2026-07-08'
    })).toBe('fee_payment_reminder:user-1:2026-06:2026-Q3:chunggang_school_team,community:2026-07-08')
  })

  it('groups target items per user and builds single-item copy', () => {
    const groups = groupFeePaymentReminderTargets([{
      user_id: 'user-1',
      item: {
        fee_id: 'monthly-1',
        billing_type: 'monthly',
        period_key: '2026-06',
        period_label: '2026-06',
        category: 'chunggang_school_team',
        member_ids: ['member-1'],
        member_names: ['王小明'],
        amount: 2000
      }
    }], {
      monthlyPeriod: '2026-06',
      quarterlyPeriod: '2026-Q3',
      categories: ['chunggang_school_team'],
      dispatchDate: '2026-07-08'
    })

    expect(groups).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        member_ids: ['member-1'],
        member_names: ['王小明'],
        total_amount: 2000,
        body: '王小明 的 2026-06 月費 尚未繳費，金額 $2,000。請至繳費資訊查看。',
        event_key: 'fee_payment_reminder:user-1:2026-06:2026-Q3:chunggang_school_team:2026-07-08'
      })
    ])
  })

  it('builds grouped multi-item copy without duplicating a fee item', () => {
    const item = {
      fee_id: 'quarterly-1',
      billing_type: 'quarterly' as const,
      period_key: '2026-Q3',
      period_label: '2026-Q3',
      category: 'community' as const,
      member_ids: ['member-1', 'member-2'],
      member_names: ['王小明', '王小華'],
      amount: 6000
    }
    const groups = groupFeePaymentReminderTargets([
      { user_id: 'user-1', item },
      { user_id: 'user-1', item },
      {
        user_id: 'user-1',
        item: {
          ...item,
          fee_id: 'monthly-1',
          billing_type: 'monthly',
          period_key: '2026-06',
          period_label: '2026-06',
          member_ids: ['member-3'],
          member_names: ['王小安'],
          amount: 1500
        }
      }
    ])

    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].member_names).toEqual(['王小明', '王小華', '王小安'])
    expect(buildFeePaymentReminderBody(groups[0])).toBe('3 位球員有 2 筆未繳款項，合計 $7,500。請至繳費資訊查看。')
  })
})
