import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./FeeSettingMemberEditor.vue', import.meta.url), 'utf8')

describe('FeeSettingMemberEditor responsive layout', () => {
  it('uses mobile cards and a desktop table without shrinking controls', () => {
    expect(source).toContain('class="grid gap-3 p-3 md:hidden"')
    expect(source).toContain('class="hidden overflow-x-auto md:block"')
    expect(source).toContain('class="!w-full font-mono font-bold"')
    expect(source).toContain('min-h-11 w-full')
  })

  it('emits explicit value and save events instead of mutating props', () => {
    expect(source).toContain("(event: 'update-value'")
    expect(source).toContain("(event: 'save'")
    expect(source).toContain("emit('update-value', { memberId, value })")
  })

  it('uses 國中部 as the junior-high program fallback label', () => {
    expect(source).toContain("isFixedMonthly ? '國中部' : '中港總部'")
    expect(source).not.toContain('新泰總部')
  })
})
