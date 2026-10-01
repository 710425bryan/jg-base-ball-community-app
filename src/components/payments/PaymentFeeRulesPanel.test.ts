// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PaymentFeeRulesPanel from './PaymentFeeRulesPanel.vue'

describe('PaymentFeeRulesPanel', () => {
  it('keeps the rules collapsed until requested and exposes an accessible toggle', async () => {
    const wrapper = mount(PaymentFeeRulesPanel)
    const toggle = wrapper.get('[data-test="payment-fee-rules-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-test="payment-fee-rules-content"]').exists()).toBe(false)

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('aria-controls')).toBe(wrapper.get('[data-test="payment-fee-rules-content"]').attributes('id'))
    expect(wrapper.findAll('article')).toHaveLength(9)

    await toggle.trigger('click')
    expect(wrapper.find('[data-test="payment-fee-rules-content"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('distinguishes advance monthly, ended monthly and quarterly opening dates', async () => {
    const wrapper = mount(PaymentFeeRulesPanel)
    await wrapper.get('button').trigger('click')
    for (const id of ['junior-single-monthly','junior-training-monthly','community-fixed-monthly']) {
      expect(wrapper.get(`[data-test="payment-fee-rule-${id}"]`).text()).toContain('每月 25 日起開放下個月')
    }
    for (const id of ['chunggang-monthly','community-session-monthly']) {
      expect(wrapper.get(`[data-test="payment-fee-rule-${id}"]`).text()).toContain('次月 1 日開放')
    }
    expect(wrapper.get('[data-test="payment-fee-rule-community-quarterly"]').text()).toContain('3／6／9／12 月 25 日')
    wrapper.unmount()
  })

  it('explains leave deductions, manual opening, equipment fulfillment and independent match billing', async () => {
    const wrapper = mount(PaymentFeeRulesPanel)
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('[data-test="payment-fee-rule-chunggang-monthly"]').text()).toContain('下午請假不扣堂')
    expect(wrapper.get('[data-test="payment-fee-rule-junior-single-monthly"]').text()).toContain('不扣月費')
    expect(wrapper.get('[data-test="payment-fee-rule-junior-training-monthly"]').text()).toContain('不扣金額')
    expect(wrapper.get('[data-test="payment-fee-rule-community-fixed-monthly"]').text()).toContain('不依訓練堂數或請假計算')
    expect(wrapper.get('[data-test="payment-fee-rule-match"]').text()).toContain('手動開放')
    expect(wrapper.get('[data-test="payment-fee-rule-equipment"]').text()).toContain('不需等備貨或領取')
    expect(wrapper.get('[data-test="payment-fee-rule-no-membership-fee"]').text()).toContain('比賽費依個別開關')
    expect(wrapper.text()).toContain('付款確認後才正式扣除')
    expect(wrapper.text()).toContain('月費扣減後最低為 0 元')
    expect(wrapper.text()).toContain('已付款及有付款歷史的金額快照保留')
    wrapper.unmount()
  })
})
