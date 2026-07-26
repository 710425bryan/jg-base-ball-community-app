import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./SchoolTeamFees.vue', import.meta.url), 'utf8')

describe('SchoolTeamFees joined-month scope', () => {
  it('loads joined_date and excludes monthly periods before the member joined', () => {
    expect(source).toContain("training_program, joined_date, status")
    expect(source).toContain("isMemberFeePeriodOnOrAfterJoin(m, 'monthly', selectedMonth.value)")
  })
})
