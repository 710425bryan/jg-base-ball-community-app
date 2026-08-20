import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./LandingView.vue', import.meta.url), 'utf8')

describe('LandingView public join inquiry security', () => {
  it('delegates the shared mobile and desktop inquiry dialog without reading protected rows', () => {
    expect(source).toContain('<PublicJoinInquiryDialog v-model="isJoinModalOpen" />')
    expect(source).not.toContain(".from('join_inquiries')")
    expect(source).not.toContain(".select('id, parent_name')")
  })
})
