// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { systemFeatures } from '@/utils/permissionFeatures'
import RolePermissionsManager from './RolePermissionsManager.vue'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import RoleSortEditor from '@/components/RoleSortEditor.vue'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), createAppRole: vi.fn(), updateAppRoleWeight: vi.fn(), validate: vi.fn(), clearValidate: vi.fn(),
  fetchRoles: vi.fn(), success: vi.fn(), error: vi.fn(),
  permissionRows: [] as Array<{ feature: string; action: string }>,
  roleRows: [] as Array<{ role_key: string; role_name: string; is_system: boolean; weight: number }>,
  storeRoleRows: [] as Array<{ role_key: string; role_name: string; is_system: boolean; weight: number }>,
  rolesReadError: null as { message: string } | null
}))
vi.mock('@/services/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('@/services/rolesApi', () => ({ createAppRole: mocks.createAppRole, updateAppRoleWeight: mocks.updateAppRoleWeight }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({
  fetchRoles: mocks.fetchRoles, currentRole: 'ADMIN',
  get roles() { return mocks.storeRoleRows },
  set roles(value) { mocks.storeRoleRows = value }
}) }))
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success, error: mocks.error }, ElMessageBox: {} }))

const source = readFileSync(resolve('src/components/RolePermissionsManager.vue'), 'utf8')

describe('RolePermissionsManager mobile drawer', () => {
  it('teleports the permission drawer above the app shell navigation', () => {
    expect(source).toMatch(
      /<el-drawer[\s\S]*?:with-header="false"[\s\S]*?append-to-body[\s\S]*?>/
    )
  })

  it('keeps the final permission controls scrollable above the iOS safe area', () => {
    expect(source).toContain(
      'class="permissions-drawer__scroll flex-1 overflow-y-auto p-4"'
    )
    expect(source).toContain(
      'padding-bottom: calc(1rem + env(safe-area-inset-bottom));'
    )
    expect(source).toContain('-webkit-overflow-scrolling: touch;')
  })

  it('provides an accessible 44px close control', () => {
    expect(source).toContain('aria-label="關閉權限設定"')
    expect(source).toContain('title="關閉權限設定"')
    expect(source).toContain('class="flex h-11 w-11 items-center justify-center')
  })

  it('exposes registration form VIEW, CREATE, EDIT and DELETE permissions', () => {
    expect(source).toContain("import { ACTIONS, systemFeatures } from '@/utils/permissionFeatures'")
    expect(systemFeatures.find((feature) => feature.key === 'registration_forms')).toMatchObject({
      name: '賽事報名管理', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
    })
  })

  it('shows independent personal and management coach leave scopes in the permission matrix', () => {
    expect(systemFeatures.find((feature) => feature.key === 'my_coach_leave_requests')?.name).toBe('我的教練假單')
    expect(systemFeatures.find((feature) => feature.key === 'coach_leave_requests')?.name).toBe('教練請假管理')
    expect(source).toContain('v-for="feature in systemFeatures"')
  })
})

const fixtureRoles = [
  { role_key: 'ADMIN', role_name: '系統管理員', is_system: true, weight: 1 },
  { role_key: 'COACH', role_name: '教練', is_system: true, weight: 16 },
  { role_key: 'CUSTOM', role_name: '自訂角色', is_system: false, weight: 99 }
]
const createdRole = { role_key: 'ASSISTANT', role_name: '助理教練', is_system: false, weight: 100 }

const mountManager = () => shallowMount(RolePermissionsManager, {
  global: {
    directives: { loading: () => {} },
    stubs: {
      'el-drawer': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
      'el-dialog': { name: 'ElDialog', props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
      'el-form': defineComponent({
        name: 'ElForm', props: ['disabled'],
        setup(_, { expose }) { expose({ validate: mocks.validate, clearValidate: mocks.clearValidate }) },
        template: '<div><slot /></div>'
      }),
      'el-form-item': { template: '<div><slot /></div>' },
      'el-input': { name: 'ElInput', props: ['modelValue', 'size'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
      'el-select': { name: 'ElSelect', props: ['modelValue', 'emptyValues'], emits: ['update:modelValue'], template: '<div><slot /></div>' },
      'el-option': { name: 'ElOption', props: ['label', 'value', 'disabled'], template: '<span>{{ label }}</span>' }
    }
  }
})
type ManagerWrapper = ReturnType<typeof mountManager>
const openForm = async (wrapper: ManagerWrapper) => {
  await wrapper.get('button').trigger('click')
  await flushPromises()
}
const fillForm = async (wrapper: ManagerWrapper, copySource = '') => {
  const inputs = wrapper.findAllComponents({ name: 'ElInput' })
  inputs[0]!.vm.$emit('update:modelValue', 'ASSISTANT')
  inputs[1]!.vm.$emit('update:modelValue', '助理教練')
  wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', copySource)
  await flushPromises()
}
const confirm = (wrapper: ManagerWrapper) => wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')

describe('RolePermissionsManager role creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validate.mockResolvedValue(true)
    mocks.fetchRoles.mockResolvedValue(undefined)
    mocks.createAppRole.mockResolvedValue(createdRole)
    mocks.permissionRows = []
    mocks.roleRows = fixtureRoles.map(role => ({ ...role }))
    mocks.storeRoleRows = fixtureRoles.map(role => ({ ...role }))
    mocks.rolesReadError = null
    mocks.from.mockImplementation((table) => ({
      select: () => ({
        order: async () => ({ data: mocks.roleRows, error: mocks.rolesReadError }),
        eq: async () => ({ data: table === 'app_role_permissions' ? mocks.permissionRows : [], error: null })
      })
    }))
  })

  it('offers existing system and custom roles while marking ADMIN unavailable', async () => {
    const wrapper = mountManager()
    await flushPromises()
    await openForm(wrapper)
    const options = wrapper.findAllComponents({ name: 'ElOption' })
    expect(options.map((option) => option.props('value'))).toEqual(['', 'ADMIN', 'COACH', 'CUSTOM'])
    expect(options.find((option) => option.props('value') === 'ADMIN')?.props('disabled')).toBe(true)
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toBe('')
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('emptyValues')).toEqual([null, undefined])
    wrapper.unmount()
  })

  it.each(['', 'COACH', 'CUSTOM'])('creates with copy source %s and opens the new role permissions', async (copySource) => {
    mocks.permissionRows = copySource ? [{ feature: 'players', action: 'VIEW' }] : []
    const wrapper = mountManager()
    await flushPromises()
    await openForm(wrapper)
    await fillForm(wrapper, copySource)
    confirm(wrapper)
    await flushPromises()
    expect(mocks.createAppRole).toHaveBeenCalledExactlyOnceWith({ role_key: 'ASSISTANT', role_name: '助理教練', copy_from_role_key: copySource })
    expect(mocks.fetchRoles).toHaveBeenCalledOnce()
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(false)
    expect(wrapper.text()).toContain('助理教練')
    expect(wrapper.find('.border-blue-400.bg-blue-50').exists()).toBe(Boolean(copySource))
    wrapper.unmount()
  })

  it('preserves the fields and source when creation fails, then resets after reopening', async () => {
    mocks.createAppRole.mockRejectedValue({ code: '23505', message: 'duplicate' })
    const wrapper = mountManager()
    await flushPromises()
    await openForm(wrapper)
    await fillForm(wrapper, 'CUSTOM')
    confirm(wrapper)
    await flushPromises()
    expect(mocks.error).toHaveBeenCalledWith('該識別碼已存在，請更換一個')
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(true)
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toBe('CUSTOM')
    expect(wrapper.findComponent({ name: 'ElInput' }).props('modelValue')).toBe('ASSISTANT')
    expect(mocks.fetchRoles).not.toHaveBeenCalled()
    wrapper.findComponent(AppDialogFooter).vm.$emit('cancel')
    await flushPromises()
    await openForm(wrapper)
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toBe('')
    expect(wrapper.findComponent({ name: 'ElInput' }).props('modelValue')).toBe('')
    wrapper.unmount()
  })

  it('stops invalid forms and releases the loading state', async () => {
    mocks.validate.mockRejectedValue({ role_key: 'required' })
    const wrapper = mountManager()
    await flushPromises()
    await openForm(wrapper)
    confirm(wrapper)
    await flushPromises()
    expect(mocks.createAppRole).not.toHaveBeenCalled()
    expect(wrapper.findComponent(AppDialogFooter).props('loading')).toBe(false)
    wrapper.unmount()
  })

  it('blocks duplicate submission and closing while the role is being created', async () => {
    let finish!: (role: typeof createdRole) => void
    mocks.createAppRole.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = mountManager()
    await flushPromises()
    await openForm(wrapper)
    await fillForm(wrapper, 'COACH')
    confirm(wrapper)
    await flushPromises()
    confirm(wrapper)
    wrapper.findComponent(AppDialogFooter).vm.$emit('cancel')
    await flushPromises()
    expect(mocks.createAppRole).toHaveBeenCalledOnce()
    expect(wrapper.findComponent(AppDialogFooter).props('loading')).toBe(true)
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(true)
    finish(createdRole)
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('keeps both sorting editors connected and refreshes role options after a saved weight', async () => {
    const wrapper = mountManager()
    await flushPromises()
    const roleCards = wrapper.findAll('.p-4.mb-2.cursor-pointer')
    await roleCards.find(card => card.text().includes('自訂角色'))!.trigger('click')
    await flushPromises()
    const updated = { ...fixtureRoles[2]!, weight: 5 }
    mocks.roleRows = mocks.roleRows.map(role => role.role_key === 'CUSTOM' ? updated : role)
    const editor = wrapper.findComponent(RoleSortEditor)
    expect(editor.props('canEdit')).toBe(true)
    editor.vm.$emit('saved', updated)
    await flushPromises()
    expect(mocks.fetchRoles).toHaveBeenCalledOnce()
    expect(wrapper.findComponent(RoleSortEditor).props('role')).toEqual(updated)
    expect(wrapper.findAll('.p-4.mb-2.cursor-pointer').map(card => card.text())).toEqual([
      expect.stringContaining('系統管理員'), expect.stringContaining('自訂角色'), expect.stringContaining('教練')
    ])
    expect(source.match(/<RoleSortEditor/g)).toHaveLength(2)
    wrapper.unmount()
  })

  it('updates account role ordering from the saved result even when both refreshes fail', async () => {
    const wrapper = mountManager()
    await flushPromises()
    await wrapper.findAll('.p-4.mb-2.cursor-pointer').find(card => card.text().includes('自訂角色'))!.trigger('click')
    await flushPromises()
    mocks.rolesReadError = { message: 'role refresh failed' }
    // The real store keeps its previous roles when the read request fails.
    mocks.fetchRoles.mockResolvedValue(undefined)
    const updated = { ...fixtureRoles[2]!, weight: 5 }
    wrapper.findComponent(RoleSortEditor).vm.$emit('saved', updated)
    await flushPromises()
    expect(mocks.error).toHaveBeenCalledWith('無法載入角色名單')
    expect(mocks.storeRoleRows.map(role => [role.role_key, role.weight])).toEqual([
      ['ADMIN', 1], ['CUSTOM', 5], ['COACH', 16]
    ])
    expect(wrapper.findComponent(RoleSortEditor).props('role')).toEqual(updated)
    expect(mocks.fetchRoles).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
