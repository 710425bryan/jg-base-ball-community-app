// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'
import PlayerBillingFields from './PlayerBillingFields.vue'

describe('PlayerBillingFields', () => {
  it('allows team-fee exemption and match billing independently, retaining both on re-render', async () => {
    const wrapper = mount(defineComponent({
      components: { PlayerBillingFields },
      setup: () => ({ mode: ref('no_fee'), enabled: ref(false) }),
      template: '<el-form><PlayerBillingFields role="球員" v-model:fee-billing-mode="mode" v-model:match-fee-enabled="enabled" /></el-form>'
    }), { global: { plugins: [ElementPlus] } })
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.findComponent(PlayerBillingFields).props()).toMatchObject({ feeBillingMode: 'no_fee', matchFeeEnabled: true })
    await wrapper.get('input[value="monthly_fixed"]').setValue()
    expect(wrapper.findComponent(PlayerBillingFields).props()).toMatchObject({ feeBillingMode: 'monthly_fixed', matchFeeEnabled: true })
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.findComponent(PlayerBillingFields).props()).toMatchObject({ feeBillingMode: 'monthly_fixed', matchFeeEnabled: false })
    wrapper.unmount()
  })
  it('respects disabled state during save', async () => {
    const wrapper = mount(PlayerBillingFields, { props: { role: '球員', feeBillingMode: 'no_fee', matchFeeEnabled: false, disabled: true }, global: { plugins: [ElementPlus] } })
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.emitted('update:matchFeeEnabled')).toBeUndefined()
    wrapper.unmount()
  })
  it('explains the cutoff and payment-history rules with an accessible hint', () => {
    const wrapper = mount(PlayerBillingFields, { props: { role: '校隊', feeBillingMode: 'no_fee', matchFeeEnabled: true, matchFeeStartDate: '2026-09-27' }, global: { plugins: [ElementPlus] } })
    expect(wrapper.findAll('.el-radio-button').map(r => r.text())).toEqual(['校隊月繳', '不收隊費'])
    expect(wrapper.text()).toContain('目前生效日期：2026-09-27')
    expect(wrapper.text()).toContain('過去日期不補收')
    const hintId = wrapper.get('[role="group"][aria-label="比賽費設定"]').attributes('aria-describedby')
    expect(wrapper.get(`[id="${hintId}"]`).text()).toContain('單場免繳仍有效')
    expect(wrapper.get('[role="switch"]').attributes('aria-label')).toBe('依參賽收取比賽費')
    wrapper.unmount()
  })
})
