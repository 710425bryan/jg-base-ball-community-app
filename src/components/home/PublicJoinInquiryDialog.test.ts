import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./PublicJoinInquiryDialog.vue', import.meta.url), 'utf8')

describe('PublicJoinInquiryDialog contact requirements', () => {
  it('requires LINE ID above the optional phone field', () => {
    const lineFieldIndex = source.indexOf('label="LINE ID" prop="line_id"')
    const phoneFieldIndex = source.indexOf('label="聯絡電話" prop="phone"')

    expect(lineFieldIndex).toBeGreaterThan(-1)
    expect(phoneFieldIndex).toBeGreaterThan(lineFieldIndex)
    expect(source).toContain("line_id: [{ required: true, whitespace: true, message: '請填寫 LINE ID'")
    expect(source).not.toContain("phone: [{ required: true")
    expect(source).toContain('placeholder="選填，例如：09XX-XXX-XXX"')
  })

  it('enlarges both direct LINE contact IDs on mobile and desktop', () => {
    expect(source).toContain('text-lg font-black leading-none text-primary sm:text-xl">cloud019')
    expect(source).toContain('text-lg font-black leading-none text-primary sm:text-xl">yayu0215')
  })

  it('sends a nullable phone, a trimmed required LINE ID, and no protected select', () => {
    expect(source).toContain('phone: joinForm.phone.trim() || null')
    expect(source).toContain('line_id: joinForm.line_id.trim()')
    expect(source).toContain("buildPushEventKey('join_inquiry', inquiryId)")
    expect(source).not.toContain(".from('join_inquiries')")
  })
})
