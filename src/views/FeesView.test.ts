import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./FeesView.vue', import.meta.url), 'utf8')

describe('FeesView equipment workspace extraction', () => {
  it('no longer renders or imports equipment purchase administration', () => {
    expect(source).not.toContain("{ id: 'equipment'")
    expect(source).not.toContain('EquipmentPaymentSubmissionInbox')
    expect(source).not.toContain('EquipmentRequestReviewPanel')
    expect(source).not.toContain('activeTab === \'equipment\'')
  })

  it('keeps the fee header focused on fee-owned areas', () => {
    expect(source).toContain('管理月費、球員季費、比賽費用、球員餘額與收費設定')
  })
})
