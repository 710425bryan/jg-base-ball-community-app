import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./LandingView.vue', import.meta.url), 'utf8')

describe('LandingView public join inquiry security', () => {
  it('delegates anonymous inserts without reading protected inquiry rows back', () => {
    expect(source).toContain('await createPublicJoinInquiry({')
    expect(source).not.toContain(".from('join_inquiries')")
    expect(source).not.toContain(".select('id, parent_name')")
  })

  it('uses the inserted inquiry id for push dedupe', () => {
    expect(source).toContain("buildPushEventKey('join_inquiry', inquiryId)")
  })
})
