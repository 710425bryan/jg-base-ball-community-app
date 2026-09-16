// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EquipmentOrderDialog from './EquipmentOrderDialog.vue'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import type { Equipment } from '@/types/equipment'

const mocks = vi.hoisted(() => ({ reorderEquipments: vi.fn(), success: vi.fn() }))
vi.mock('@/stores/equipment', () => ({ useEquipmentStore: () => mocks }))
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success } }))
const equipments = [{ id: 'a', name: '球衣', category: '服飾類' }, { id: 'b', name: '球棒', category: '球具類' }] as Equipment[]
const render = () => mount(EquipmentOrderDialog, {
  props: { modelValue: true, equipments },
  global: { stubs: {
    ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
    ElIcon: { template: '<span><slot /></span>' },
    ElButton: { template: '<button><slot /></button>' }
  } }
})
const ids = (wrapper: ReturnType<typeof render>) => wrapper.findAll('li').map(row => row.attributes('data-equipment-id'))

describe('EquipmentOrderDialog', () => {
  beforeEach(() => vi.resetAllMocks())
  it('keeps changes as a draft, respects boundaries and discards on cancel/reopen', async () => {
    const wrapper = render()
    expect(wrapper.get('[aria-label="上移球衣"]').attributes('disabled')).toBeDefined()
    expect(wrapper.getComponent(AppDialogFooter).props('confirmDisabled')).toBe(true)
    await wrapper.get('[aria-label="下移球衣"]').trigger('click')
    expect(ids(wrapper)).toEqual(['b', 'a'])
    expect(equipments.map(item => item.id)).toEqual(['a', 'b'])
    wrapper.getComponent(AppDialogFooter).vm.$emit('cancel')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(mocks.reorderEquipments).not.toHaveBeenCalled()
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    expect(ids(wrapper)).toEqual(['a', 'b'])
  })
  it('supports drag/drop and persists the full order only on save', async () => {
    const wrapper = render()
    await wrapper.find('[draggable="true"]').trigger('dragstart')
    await wrapper.findAll('li')[1].trigger('drop')
    expect(ids(wrapper)).toEqual(['b', 'a'])
    wrapper.getComponent(AppDialogFooter).vm.$emit('confirm')
    await flushPromises()
    expect(mocks.reorderEquipments).toHaveBeenCalledWith(['b', 'a'], ['a', 'b'])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
  it('blocks repeated saves/close/moves while saving and preserves the draft on failure', async () => {
    let rejectSave!: (error: Error) => void
    mocks.reorderEquipments.mockReturnValue(new Promise((_, reject) => { rejectSave = reject }))
    const wrapper = render()
    await wrapper.get('[aria-label="下移球衣"]').trigger('click')
    const footer = wrapper.getComponent(AppDialogFooter)
    footer.vm.$emit('confirm')
    footer.vm.$emit('confirm')
    footer.vm.$emit('cancel')
    await flushPromises()
    expect(mocks.reorderEquipments).toHaveBeenCalledTimes(1)
    expect(footer.props('loading')).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    rejectSave(new Error('裝備清單或排序已更新'))
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('排序已更新')
    expect(ids(wrapper)).toEqual(['b', 'a'])
    expect(footer.props('loading')).toBe(false)
  })
})
