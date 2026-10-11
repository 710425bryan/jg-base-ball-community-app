// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import RoleNameEditor from './RoleNameEditor.vue'

const mocks = vi.hoisted(() => ({ update: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/services/rolesApi', () => ({ updateAppRoleName: mocks.update }))
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success, error: mocks.error } }))
const role = { role_key: 'FINANCE', role_name: '財務', is_system: true, weight: 20 }
const mountEditor = (canEdit = true) => shallowMount(RoleNameEditor, {
  props: { role, canEdit },
  global: { stubs: {
    'el-input': { name: 'ElInput', props: ['modelValue', 'disabled', 'size'], emits: ['update:modelValue'], template: '<input :disabled="disabled" />' },
    'el-button': { name: 'ElButton', props: ['disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' }
  } }
})
const change = async (wrapper: ReturnType<typeof mountEditor>, name: string) => {
  wrapper.findComponent({ name: 'ElInput' }).vm.$emit('update:modelValue', name)
  await flushPromises()
}
const save = (wrapper: ReturnType<typeof mountEditor>) => wrapper.findComponent({ name: 'ElButton' }).vm.$emit('click')

describe('RoleNameEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockResolvedValue({ ...role, role_name: '財務管理' })
  })

  it('saves only a trimmed name for the existing key, including system roles', async () => {
    const wrapper = mountEditor()
    expect(wrapper.findComponent({ name: 'ElButton' }).props('disabled')).toBe(true)
    expect(wrapper.findAllComponents({ name: 'ElInput' })).toHaveLength(1)
    expect(wrapper.text()).toContain('FINANCE（不可修改）')
    await change(wrapper, ' 財務管理 ')
    save(wrapper)
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('FINANCE', '財務管理')
    expect(wrapper.emitted('saved')).toEqual([[{ ...role, role_name: '財務管理' }]])
    wrapper.unmount()
  })

  it.each(['', '  ', '名'.repeat(101)])('shows invalid names next to the field', async (name) => {
    const wrapper = mountEditor()
    await change(wrapper, name)
    save(wrapper)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('1 到 100')
    expect(mocks.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('preserves the draft and allows retry after failure', async () => {
    mocks.update.mockRejectedValueOnce({ message: '沒有權限' })
    const wrapper = mountEditor()
    await change(wrapper, '財務管理')
    save(wrapper)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('沒有權限')
    expect(wrapper.findComponent({ name: 'ElInput' }).props('modelValue')).toBe('財務管理')
    expect(wrapper.emitted('saved')).toBeUndefined()
    save(wrapper)
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('saved')).toHaveLength(1)
    wrapper.unmount()
  })

  it('prevents duplicate saves and disables the field while pending', async () => {
    let finish!: (value: typeof role) => void
    mocks.update.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = mountEditor()
    await change(wrapper, '財務管理')
    save(wrapper)
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ElInput' }).props('disabled')).toBe(true)
    save(wrapper)
    expect(mocks.update).toHaveBeenCalledOnce()
    finish({ ...role, role_name: '財務管理' })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ElButton' }).props('loading')).toBe(false)
    wrapper.unmount()
  })

  it('loads the next role name without reusing the previous draft', async () => {
    const wrapper = mountEditor()
    await change(wrapper, '未儲存')
    await wrapper.setProps({ role: { ...role, role_key: 'COACH', role_name: '教練' } })
    expect(wrapper.findComponent({ name: 'ElInput' }).props('modelValue')).toBe('教練')
    wrapper.unmount()
  })

  it('retains the name draft when only the saved sort weight changes', async () => {
    const wrapper = mountEditor()
    await change(wrapper, '名稱草稿')
    await wrapper.setProps({ role: { ...role, weight: 5 } })
    expect(wrapper.findComponent({ name: 'ElInput' }).props('modelValue')).toBe('名稱草稿')
    wrapper.unmount()
  })

  it('does not put an old save response into a newly selected role', async () => {
    let finish!: (value: typeof role) => void
    mocks.update.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = mountEditor()
    await change(wrapper, '財務管理')
    save(wrapper)
    await wrapper.setProps({ role: { ...role, role_key: 'COACH', role_name: '教練' } })
    finish({ ...role, role_name: '財務管理' })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ElInput' }).props('modelValue')).toBe('教練')
    expect(wrapper.emitted('saved')).toEqual([[{ ...role, role_name: '財務管理' }]])
    wrapper.unmount()
  })

  it('keeps non-admin names read-only with no save action', async () => {
    const wrapper = mountEditor(false)
    expect(wrapper.findComponent({ name: 'ElInput' }).props('disabled')).toBe(true)
    expect(wrapper.findComponent({ name: 'ElButton' }).exists()).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
