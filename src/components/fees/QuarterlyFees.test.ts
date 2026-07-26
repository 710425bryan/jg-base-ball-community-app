import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./QuarterlyFees.vue', import.meta.url), 'utf8')

describe('QuarterlyFees joined-month scope', () => {
  it('loads joined_date and excludes quarters ending before the member joined', () => {
    expect(source).toContain("id, name, joined_date, status")
    expect(source).toContain("isMemberFeePeriodOnOrAfterJoin(member, 'quarterly', selectedPeriodLabel.value)")
  })
})
