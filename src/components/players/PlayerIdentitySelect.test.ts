// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { ElOption } from 'element-plus'
import { describe, expect, it } from 'vitest'
import AppGlobalSelect from '@/components/common/AppGlobalSelect.vue'
import PlayerIdentitySelect from './PlayerIdentitySelect.vue'
import { buildPlayerIdentityOptions, COMMUNITY_PLAYER_IDENTITY } from '@/utils/playerIdentity'

describe('PlayerIdentitySelect', () => {
  const createSelect = () => mount(PlayerIdentitySelect, {
    attachTo: document.body,
    props: { modelValue: COMMUNITY_PLAYER_IDENTITY, options: buildPlayerIdentityOptions() },
    global: { components: { ElSelect: AppGlobalSelect, ElOption } }
  })

  it('selects the new preset with the actual shared Element Plus select', async () => {
    const wrapper = createSelect()
    await wrapper.get('.el-select__wrapper').trigger('click')
    await nextTick()
    const option = [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(el => el.textContent === '新太陽社區棒球隊')!
    option.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['新太陽社區棒球隊'])
    expect(wrapper.get('[role="group"]').attributes('aria-describedby')).toBe('player-identity-hint')
    wrapper.unmount()
  })

  it('creates a typed Chinese identity and retains saved options after reopening', async () => {
    const wrapper = createSelect()
    await wrapper.get('.el-select__wrapper').trigger('click')
    const input = wrapper.get('input.el-select__input')
    await input.setValue('週日社區棒球隊')
    await nextTick()
    const option = [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(el => el.textContent === '週日社區棒球隊')!
    expect(option).toBeTruthy()
    option.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['週日社區棒球隊'])
    await wrapper.setProps({ modelValue: '週日社區棒球隊', options: buildPlayerIdentityOptions(['週日社區棒球隊']) })
    expect(wrapper.text()).toContain('週日社區棒球隊')
    expect(wrapper.text()).toContain('儲存球員後會保留在選單中')
    wrapper.unmount()
  })

  it('creates an option when a Chinese IME sends composition updates without input', async () => {
    const wrapper = createSelect()
    await wrapper.get('.el-select__wrapper').trigger('click')
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.value = '晨間社區棒球隊'
    input.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: input.value }))
    await nextTick()
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: input.value }))
    await nextTick()
    const option = [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(el => el.textContent === '晨間社區棒球隊')!
    expect(option).toBeTruthy()
    option.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['晨間社區棒球隊'])
    wrapper.unmount()
  })
})
