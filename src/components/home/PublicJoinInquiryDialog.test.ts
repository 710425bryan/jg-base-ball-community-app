// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AppGlobalDialog from '@/components/common/AppGlobalDialog.vue'
import PublicJoinInquiryDialog from './PublicJoinInquiryDialog.vue'

const source = readFileSync('src/components/home/PublicJoinInquiryDialog.vue', 'utf8')
let wrapper: ReturnType<typeof mount> | undefined

const openDialog = async () => {
  wrapper = mount(PublicJoinInquiryDialog, {
    props: { modelValue: true },
    global: { components: { ElDialog: AppGlobalDialog } }
  })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('PublicJoinInquiryDialog LINE contact flow', () => {
  it('shows both supplied QR codes and their decoded LINE links without a contact form', async () => {
    await openDialog()
    const dialog = document.querySelector('[role="dialog"]')!
    const images = Array.from(dialog.querySelectorAll('img'))
    expect(images).toHaveLength(2)
    expect(images.every((image) => image.alt.includes('加好友 QR Code'))).toBe(true)
    expect(images[0]?.src).toContain('contact-1.jpg')
    expect(images[1]?.src).toContain('contact-2.png')
    expect(Array.from(dialog.querySelectorAll('a')).map((link) => link.href)).toEqual([
      'https://line.me/ti/p/UaQT4myIvS',
      'https://line.me/ti/p/xdXQGLddCW'
    ])
    expect(dialog.querySelector('form, input, textarea')).toBeNull()
    expect(dialog.textContent).not.toContain('送出資料')
    expect(dialog.textContent).not.toContain('請留下')
    expect(source).not.toMatch(/createPublicJoinInquiry|dispatchPushNotification|submitJoinForm/)
  })

  it('closes via the only footer action', async () => {
    const mounted = await openDialog()
    const closeButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === '關閉')!
    closeButton.click()
    await mounted.vm.$nextTick()
    expect(mounted.emitted('update:modelValue')).toEqual([[false]])
  })
})
