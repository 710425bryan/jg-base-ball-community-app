import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

describe('send-fee-payment-reminders joined-month guard', () => {
  it('loads joined_date and filters monthly and quarterly targets', () => {
    expect(source).toContain('training_program, joined_date, status')
    expect(source).toContain('isFeePaymentReminderPeriodEligible(member, "monthly", period)')
    expect(source).toContain('isFeePaymentReminderPeriodEligible(member, "quarterly", period)')
  })
})
