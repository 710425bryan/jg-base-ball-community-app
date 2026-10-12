// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { ElButton, ElIcon, ElInput, ElInputNumber } from 'element-plus'
import { describe, expect, it } from 'vitest'
import MatchPitchingStatsEditor from './MatchPitchingStatsEditor.vue'
import { createEmptyPitchingStat } from '@/utils/matchPitchingStats'

const render = (ip = 0) => {
  const stats = reactive([{ ...createEmptyPitchingStat('測試投手', '8'), ip }])
  const wrapper = mount(MatchPitchingStatsEditor, {
    props: { modelValue: stats },
    global: { components: { ElButton, ElIcon, ElInput, ElInputNumber } }
  })
  return { wrapper, stats }
}

describe('MatchPitchingStatsEditor', () => {
  it('keeps decimal input visible for correction and does not round 0.66 to one out', async () => {
    const { wrapper, stats } = render(9)
    const input = wrapper.get('[data-testid="pitching-outs"] input')
    expect(wrapper.get('[data-testid="pitching-innings"]').text()).toBe('3.0')
    await input.setValue('0.66')
    await input.trigger('blur')

    expect(stats[0]?.ip).toBe(0.66)
    expect((input.element as HTMLInputElement).value).toBe('0.66')
    expect(wrapper.get('[role="alert"]').text()).toContain('投 ⅔ 局請填 2')
    expect(wrapper.get('[data-testid="pitching-innings"]').text()).toBe('—')
    expect(wrapper.get('[data-testid="pitching-era"]').text()).toBe('—')
    expect(wrapper.text()).not.toContain('0.0.66')

    await input.setValue('2')
    await input.trigger('blur')
    expect(stats[0]?.ip).toBe(2)
    expect(wrapper.get('[data-testid="pitching-innings"]').text()).toBe('0.2')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows errors for loaded decimals and a cleared input without modifying other scores', async () => {
    const { wrapper, stats } = render(0.66)
    stats[0]!.so = 3
    expect(wrapper.get('[role="alert"]').text()).toContain('測試投手')
    const input = wrapper.get('[data-testid="pitching-outs"] input')
    await input.setValue('')
    await input.trigger('blur')
    expect(wrapper.get('[role="alert"]').text()).toContain('出局數請填 0 以上整數')
    expect(stats[0]?.so).toBe(3)
    wrapper.unmount()
  })

  it('preserves add, delete, load-current and recalculate actions', async () => {
    const { wrapper, stats } = render()
    const clickButton = async (text: string) => {
      await wrapper.findAll('button').find((button) => button.text().includes(text))!.trigger('click')
    }
    await clickButton('載入目前投手')
    expect(wrapper.emitted('load-current')).toHaveLength(1)
    await clickButton('從逐局重算')
    expect(wrapper.emitted('recalculate')).toHaveLength(1)
    await clickButton('新增投手')
    expect(stats).toHaveLength(2)
    expect(stats[1]?.ip).toBe(0)
    await wrapper.get('button[aria-label="刪除測試投手"]').trigger('click')
    expect(stats).toHaveLength(1)
    expect(stats[0]?.name).toBe('')
    wrapper.unmount()
  })
})
