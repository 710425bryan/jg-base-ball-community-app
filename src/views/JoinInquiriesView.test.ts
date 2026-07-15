import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./JoinInquiriesView.vue', import.meta.url), 'utf8')

describe('JoinInquiriesView responsive states', () => {
  it('renders loading, error, empty, and mobile card states instead of a blank phone view', () => {
    expect(source).toContain('<AppLoadingState v-if="isLoading"')
    expect(source).toContain('v-else-if="loadError"')
    expect(source).toContain('v-else-if="inquiries.length === 0"')
    expect(source).toContain('目前沒有家長入隊申請')
    expect(source).toContain('class="grid gap-3 md:hidden"')
    expect(source).toContain('<article v-for="inquiry in inquiries"')
  })

  it('clears and records visible load errors around each refresh', () => {
    expect(source).toContain("loadError.value = ''")
    expect(source).toContain("loadError.value = '目前無法取得資料，請稍後再試。'")
  })
})
