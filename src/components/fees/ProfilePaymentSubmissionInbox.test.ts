import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('ProfilePaymentSubmissionInbox amount review guard', () => {
  const source = readFileSync(new URL('./ProfilePaymentSubmissionInbox.vue', import.meta.url), 'utf8')

  it('shows all reconciliation amounts and disables approval for unsafe statuses', () => {
    expect(source).toContain('系統應收')
    expect(source).toContain('申請折抵')
    expect(source).toContain('正確應付')
    expect(source).toContain('實際付款')
    expect(source).toContain("submission.reconciliation_status === 'matched'")
    expect(source).toContain("submission.reconciliation_status === 'overpaid'")
  })

  it('uses fixed rejection reasons and a targeted reminder deep link', () => {
    expect(source).toContain("['金額不足', '金額超出', '餘額不足', '匯款資料不符', '其他']")
    expect(source).toContain("action: 'PAYMENT_REMINDER'")
    expect(source).toContain('targetUserIds: [submission.profile_id]')
    expect(source).toContain('/my-payments?highlight_submission_id=${submission.id}')
  })
})
