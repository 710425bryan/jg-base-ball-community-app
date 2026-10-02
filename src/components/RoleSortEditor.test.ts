// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import RoleSortEditor from './RoleSortEditor.vue'

const mocks = vi.hoisted(() => ({ update: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/services/rolesApi', () => ({ updateAppRoleWeight: mocks.update }))
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success, error: mocks.error } }))
const role = { role_key: 'FINANCE', role_name: '財務', is_system: true, weight: 20 }
const mountEditor = (canEdit = true) => shallowMount(RoleSortEditor, {
  props: { role, canEdit },
  global: { stubs: {
    'el-input-number': { name: 'ElInputNumber', props: ['modelValue', 'disabled', 'size'], emits: ['update:modelValue'], template: '<input :disabled="disabled" />' },
    'el-button': { name: 'ElButton', props: ['disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' }
  } }
})
const change = async (wrapper: ReturnType<typeof mountEditor>, weight: number | undefined) => {
  wrapper.findComponent({ name: 'ElInputNumber' }).vm.$emit('update:modelValue', weight)
  await flushPromises()
}
const save = (wrapper: ReturnType<typeof mountEditor>) => wrapper.findComponent({ name: 'ElButton' }).vm.$emit('click')

describe('RoleSortEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockResolvedValue({ ...role, weight: 5 })
  })

  it('saves a manual value and emits the server result for list and account refreshes', async () => {
    const wrapper = mountEditor()
    expect(wrapper.findComponent({ name: 'ElButton' }).props('disabled')).toBe(true)
    await change(wrapper, 5)
    save(wrapper)
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('FINANCE', 5)
    expect(wrapper.emitted('saved')).toEqual([[{ ...role, weight: 5 }]])
    wrapper.unmount()
  })

  it.each([undefined, 0, -1, 1.5, 2147483648])('reports invalid weight %s next to the field', async (weight) => {
    const wrapper = mountEditor()
    await change(wrapper, weight)
    save(wrapper)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('請輸入')
    expect(mocks.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('preserves the unsaved value and allows a retry after a failed save', async () => {
    mocks.update.mockRejectedValueOnce({ message: '沒有權限' })
    const wrapper = mountEditor()
    await change(wrapper, 5)
    save(wrapper)
    await flushPromises()
    expect(mocks.error).toHaveBeenCalledWith('儲存排序失敗：沒有權限')
    expect(wrapper.findComponent({ name: 'ElInputNumber' }).props('modelValue')).toBe(5)
    expect(wrapper.emitted('saved')).toBeUndefined()
    save(wrapper)
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('saved')).toHaveLength(1)
    wrapper.unmount()
  })

  it('disables input and prevents repeat requests while saving', async () => {
    let finish!: (value: typeof role) => void
    mocks.update.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = mountEditor()
    await change(wrapper, 5)
    save(wrapper)
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ElInputNumber' }).props('disabled')).toBe(true)
    save(wrapper)
    expect(mocks.update).toHaveBeenCalledOnce()
    finish({ ...role, weight: 5 })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ElButton' }).props('loading')).toBe(false)
    wrapper.unmount()
  })

  it('loads the new role weight when selection changes', async () => {
    const wrapper = mountEditor()
    await change(wrapper, 5)
    await wrapper.setProps({ role: { ...role, role_key: 'COACH', role_name: '教練', weight: 16 } })
    expect(wrapper.findComponent({ name: 'ElInputNumber' }).props('modelValue')).toBe(16)
    wrapper.unmount()
  })

  it('keeps non-admin input read-only with no save action', async () => {
    const wrapper = mountEditor(false)
    expect(wrapper.findComponent({ name: 'ElInputNumber' }).props('disabled')).toBe(true)
    expect(wrapper.findComponent({ name: 'ElButton' }).exists()).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
