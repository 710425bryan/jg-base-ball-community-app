import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { experienceSteps, recruitmentFaqs, recruitmentHighlights } from '@/components/home/publicRecruitmentContent'

const source = readFileSync(new URL('./LandingView.vue', import.meta.url), 'utf8')

describe('LandingView public join inquiry security', () => {
  it('delegates the shared mobile and desktop inquiry dialog without reading protected rows', () => {
    expect(source).toContain('<PublicJoinInquiryDialog v-model="isJoinModalOpen" />')
    expect(source).not.toContain(".from('join_inquiries')")
    expect(source).not.toContain(".select('id, parent_name')")
  })

  it('directs the recruitment steps and FAQ to LINE without promising a submitted form', () => {
    const recruitmentCopy = JSON.stringify({ experienceSteps, recruitmentFaqs, recruitmentHighlights })
    expect(experienceSteps[0]?.title).toBe('加入 LINE')
    expect(recruitmentFaqs.some((faq) => faq.answer.includes('請主動傳訊息'))).toBe(true)
    expect(recruitmentCopy).not.toMatch(/送出表單|表單送出|填寫家長聯絡/)
    expect(source).not.toContain('送出表單')
  })
})
