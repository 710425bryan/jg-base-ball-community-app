import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./MatchesGrid.vue', import.meta.url), 'utf8')

describe('MatchesGrid month headings', () => {
  it('keeps sticky month headings below the measured match records toolbar', () => {
    const monthHeading = source.match(/<div class="([^"]+)"[^>]*>\s*<h2[^>]*>\{\{ group\.month \}\}/)?.[1] || ''

    expect(monthHeading).toContain('-mx-4')
    expect(monthHeading).toContain('match-month-heading')
    expect(monthHeading).toContain('sticky')
    expect(monthHeading).toContain('z-10')
    expect(monthHeading).not.toContain('top-0')
    expect(source).toContain('top: var(--match-records-sticky-offset, 0px);')
  })
})
