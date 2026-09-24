// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import EquipmentFormDialog from './EquipmentFormDialog.vue'
import type { Equipment, EquipmentSizeStock } from '@/types/equipment'

const mocks = vi.hoisted(() => ({ saveAvailableEquipment: vi.fn(), confirm: vi.fn(), success: vi.fn(), error: vi.fn(), store: {} as any }))
vi.mock('@/stores/equipment', () => ({ useEquipmentStore: () => mocks.store }))
vi.mock('element-plus', async (importOriginal) => ({
  ...await importOriginal<typeof import('element-plus')>(),
  ElMessage: { success: mocks.success, error: mocks.error },
  ElMessageBox: { confirm: mocks.confirm }
}))

const initialSizes = [{ size: 'XL', quantity: 4 }, { size: 'S', quantity: 2 }, { size: 'SN-001', quantity: 1 }]
const render = async (sizes: EquipmentSizeStock[] = initialSizes) => {
  const equipment = { id: 'equipment-1', name: '球衣', category: '服飾類', total_quantity: sizes.reduce((sum, item) => sum + item.quantity, 0), sizes_stock: sizes.map(item => ({ ...item })) } as Equipment
  const wrapper = mount(EquipmentFormDialog, {
    props: { modelValue: false, equipment },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
        ElUpload: true,
        EquipmentPhotoCarousel: true
      }
    }
  })
  await wrapper.setProps({ modelValue: true })
  return wrapper
}
type Wrapper = Awaited<ReturnType<typeof render>>
const button = (wrapper: Wrapper, label: string) => wrapper.findAll('button').find(item => item.text() === label)!
const rows = (wrapper: Wrapper) => wrapper.findAll('[data-size-stock-row]')
const editableSizes = (wrapper: Wrapper) => rows(wrapper).map(row => ({
  size: row.get<HTMLInputElement>('input:not([role="spinbutton"])').element.value,
  quantity: Number(row.get<HTMLInputElement>('input[role="spinbutton"]').element.value)
}))

describe('EquipmentFormDialog size stock ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveAvailableEquipment.mockResolvedValue(undefined)
    mocks.confirm.mockResolvedValue('confirm')
    mocks.store = reactive({ isSaving: false, saveAvailableEquipment: mocks.saveAvailableEquipment })
  })

  it('moves size and quantity together, preserves the row element and saves the chosen order', async () => {
    const wrapper = await render()
    await button(wrapper, '調整排序').trigger('click')
    const firstRow = rows(wrapper)[0].element
    expect(wrapper.get('[aria-label="上移XL"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="下移SN-001"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="下移XL"]').trigger('click')
    expect(rows(wrapper)[1].element).toBe(firstRow)
    await wrapper.get('[aria-label="上移SN-001"]').trigger('click')
    expect(mocks.saveAvailableEquipment).not.toHaveBeenCalled()
    expect(wrapper.props('equipment')!.sizes_stock).toEqual(initialSizes)
    await button(wrapper, '完成排序').trigger('click')
    expect(editableSizes(wrapper)).toEqual([initialSizes[1], initialSizes[2], initialSizes[0]])
    await button(wrapper, '儲存').trigger('click')
    await flushPromises()
    expect(mocks.saveAvailableEquipment).toHaveBeenCalledWith(expect.objectContaining({
      stock: { sizes: [initialSizes[1], initialSizes[2], initialSizes[0]], available_quantity: 7 }
    }), { id: 'equipment-1', expectedUpdatedAt: null, imageFiles: [] })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    wrapper.unmount()
  })

  it('discards unsaved ordering on cancel and loads the saved order when reopened', async () => {
    const wrapper = await render()
    await button(wrapper, '調整排序').trigger('click')
    await wrapper.get('[aria-label="下移XL"]').trigger('click')
    await button(wrapper, '取消').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(mocks.saveAvailableEquipment).not.toHaveBeenCalled()
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    expect(editableSizes(wrapper)).toEqual(initialSizes)
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ equipment: { ...wrapper.props('equipment')!, sizes_stock: [...initialSizes].reverse() }, modelValue: true })
    expect(editableSizes(wrapper)).toEqual([...initialSizes].reverse())
    wrapper.unmount()
  })

  it('keeps additions, edits, removals and duplicate normalization working after a move', async () => {
    const wrapper = await render([{ size: 'M', quantity: 2 }, { size: ' L ', quantity: 3 }, { size: 'M', quantity: 1 }])
    await button(wrapper, '新增').trigger('click')
    await button(wrapper, '調整排序').trigger('click')
    await wrapper.get('[aria-label="上移 L "]').trigger('click')
    await button(wrapper, '完成排序').trigger('click')
    await rows(wrapper)[1].get('input[role="spinbutton"]').setValue('5')
    await button(wrapper, '新增').trigger('click')
    await rows(wrapper)[4].get('input:not([role="spinbutton"])').setValue('REMOVE')
    await wrapper.get('[aria-label="移除REMOVE"]').trigger('click')
    await wrapper.findComponent({ name: 'ElCheckbox' }).setValue(true)
    await wrapper.get('textarea[placeholder="例如：完成盤點，依實際可用數量修正"]').setValue('盤點')
    await button(wrapper, '儲存').trigger('click')
    await flushPromises()
    expect(mocks.saveAvailableEquipment.mock.calls[0][0].stock.sizes).toEqual([{ size: 'L', quantity: 3 }, { size: 'M', quantity: 6 }])
    wrapper.unmount()
  })

  it('retains the draft on save failure and disables reordering while saving', async () => {
    mocks.saveAvailableEquipment.mockRejectedValue(new Error('儲存失敗'))
    const wrapper = await render()
    await button(wrapper, '調整排序').trigger('click')
    await wrapper.get('[aria-label="下移XL"]').trigger('click')
    mocks.store.isSaving = true
    await flushPromises()
    expect(wrapper.get('[aria-label="上移XL"]').attributes('disabled')).toBeDefined()
    expect(button(wrapper, '完成排序').attributes('disabled')).toBeDefined()
    mocks.store.isSaving = false
    await flushPromises()
    await button(wrapper, '儲存').trigger('click')
    await flushPromises()
    expect(mocks.error).toHaveBeenCalledWith('儲存失敗')
    expect(rows(wrapper)[0].text()).toContain('S')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows ordering only when at least two rows exist', async () => {
    const wrapper = await render([])
    expect(button(wrapper, '調整排序')).toBeUndefined()
    await button(wrapper, '新增').trigger('click')
    expect(button(wrapper, '調整排序')).toBeUndefined()
    await button(wrapper, '新增').trigger('click')
    expect(button(wrapper, '調整排序')).toBeDefined()
    wrapper.unmount()
  })

  it('edits available quantities, preserves allocations and requires a reason plus reduction confirmation', async () => {
    const wrapper = await render([{size:'S',quantity:1},{size:'M',quantity:8}])
    await wrapper.setProps({modelValue:false})
    await wrapper.setProps({equipment:{...wrapper.props('equipment')!,updated_at:'2026-09-24T00:00:00Z',inventory_snapshot:[
      {equipment_id:'equipment-1',size:'S',used_quantity:1,reserved_quantity:0},
      {equipment_id:'equipment-1',size:'M',used_quantity:2,reserved_quantity:2}
    ]},modelValue:true})
    expect(editableSizes(wrapper)).toEqual([{size:'S',quantity:0},{size:'M',quantity:4}])
    expect(wrapper.text()).not.toContain('總數量')
    await rows(wrapper)[1].get('input[role="spinbutton"]').setValue('3')
    await button(wrapper,'儲存').trigger('click'); await flushPromises()
    expect(mocks.error).toHaveBeenCalledWith('請填寫庫存調整原因')
    expect(mocks.saveAvailableEquipment).not.toHaveBeenCalled()
    await wrapper.get('textarea[placeholder="例如：完成盤點，依實際可用數量修正"]').setValue('盤點短少')
    mocks.confirm.mockRejectedValueOnce('cancel')
    await button(wrapper,'儲存').trigger('click'); await flushPromises()
    expect(mocks.saveAvailableEquipment).not.toHaveBeenCalled()
    await button(wrapper,'儲存').trigger('click'); await flushPromises()
    expect(mocks.saveAvailableEquipment).toHaveBeenCalledWith(expect.objectContaining({stock:{available_quantity:3,sizes:[{size:'S',quantity:0},{size:'M',quantity:3}]}}), expect.objectContaining({expectedUpdatedAt:'2026-09-24T00:00:00Z'}))
    wrapper.unmount()
  })

  it('leaves stock untouched on metadata-only saves, including inconsistent legacy data', async () => {
    const wrapper = await render([{size:'S',quantity:1}])
    await wrapper.setProps({modelValue:false})
    await wrapper.setProps({equipment:{...wrapper.props('equipment')!,total_quantity:99},modelValue:true})
    expect(wrapper.text()).toContain('庫存資料不一致')
    await button(wrapper,'儲存').trigger('click'); await flushPromises()
    expect(mocks.saveAvailableEquipment.mock.calls[0][0].stock).toBeNull()
    wrapper.unmount()
  })

  it('confirms a reduction when reconciling an inflated aggregate with unchanged size counts', async () => {
    const wrapper = await render([{size:'M',quantity:2}])
    await wrapper.setProps({modelValue:false})
    await wrapper.setProps({equipment:{...wrapper.props('equipment')!,total_quantity:120,inventory_snapshot:[
      {equipment_id:'equipment-1',size:'M',used_quantity:1,reserved_quantity:0}
    ]},modelValue:true})
    expect(wrapper.text()).toContain('目前可用 119 件，各尺寸可用合計 1 件，相差 118 件')
    await wrapper.findComponent({ name: 'ElCheckbox' }).setValue(true)
    await wrapper.get('textarea[placeholder="例如：完成盤點，依實際可用數量修正"]').setValue('核對尺寸數量')
    mocks.confirm.mockRejectedValueOnce('cancel')
    await button(wrapper,'儲存').trigger('click'); await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.saveAvailableEquipment).not.toHaveBeenCalled()
    await button(wrapper,'儲存').trigger('click'); await flushPromises()
    expect(mocks.saveAvailableEquipment).toHaveBeenCalledWith(expect.objectContaining({stock:{available_quantity:1,sizes:[{size:'M',quantity:1}]}}),expect.anything())
    wrapper.unmount()
  })
})
