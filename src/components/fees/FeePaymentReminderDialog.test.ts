import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./FeePaymentReminderDialog.vue', import.meta.url), 'utf8')

describe('FeePaymentReminderDialog school-team terminology', () => {
  it('labels the junior-high reminder category as 國中部', () => {
    expect(source).toContain("xintai_school_team: '校隊，訓練項目為國中部'")
    expect(source).toContain("chunggang_school_team: '校隊，且訓練項目非國中部'")
    expect(source).not.toContain('新泰校隊')
  })
})
