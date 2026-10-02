// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { reactive, type ComponentPublicInstance } from 'vue'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import { copyCoachScheduleTemplate } from '@/utils/coachScheduleTemplates'
import { normalizeCoachScheduleEvent } from '@/utils/coachSchedules'
import type { CoachScheduleTemplate } from '@/types/coachScheduleTemplate'
import type { AppRole } from '@/types/appRole'
import CoachScheduleTemplateManager from './CoachScheduleTemplateManager.vue'

const mocks = vi.hoisted(() => ({ list: vi.fn(), listVenues: vi.fn(), save: vi.fn(), delete: vi.fn(), warning: vi.fn(), error: vi.fn(), confirm: vi.fn(), fetchRoles: vi.fn() }))
const permissions = reactive({ roles: [] as AppRole[], fetchRoles: mocks.fetchRoles })
vi.mock('@/services/coachScheduleTemplatesApi', () => ({ coachScheduleTemplatesApi: mocks }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => permissions }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: mocks.error, warning: mocks.warning }, ElMessageBox: { confirm: mocks.confirm } }))
const seed = () => copyCoachScheduleTemplate(normalizeCoachScheduleEvent({ source_type: 'training_date', schedule_date: '2026-10-03',
  title: '投捕訓練', venue_id: 'venue-a', location: '中港國小', coach_profile_ids: ['a'] }))
const saved = (): CoachScheduleTemplate => ({ ...seed(), id: 'template', updated_at: 'revision', name: '中港國小', venue_id: 'venue-a', venue_is_active: true })
const create = (coachIds = ['a'], overrides: Partial<InstanceType<typeof CoachScheduleTemplateManager>['$props']> = {}) => shallowMount(CoachScheduleTemplateManager, { props: {
  modelValue: true, seed: { ...seed(), coach_profile_ids: coachIds },
  coaches: [{ id: 'a', name: '甲教練', nickname: null, role: 'COACH', avatar_url: null }],
  canCreate: true, canEdit: true, canDelete: true, ...overrides
}, global: { renderStubDefaultSlot: true, stubs: { 'el-input': true, 'el-option': true, 'el-option-group': true, 'el-select': true, 'el-switch': true, 'el-button': true,
  AppDialogFooter: false, 'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<div><slot /></div>' }, 'el-form-item': { template: '<div><slot /></div>' } } } })
const emitField = (wrapper: ReturnType<typeof create>, selector: string, value: unknown) => wrapper.findComponent<ComponentPublicInstance>(`[data-test="${selector}"]`).vm.$emit('update:modelValue', value)
const submit = async (wrapper: ReturnType<typeof create>) => { wrapper.findComponent(AppDialogFooter).vm.$emit('confirm'); await flushPromises() }
const createDraft = async (wrapper: ReturnType<typeof create>) => {
  wrapper.findComponent<ComponentPublicInstance>('[data-test="create-template"]').vm.$emit('click')
  await flushPromises()
}

describe('CoachScheduleTemplateManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissions.roles = []
    mocks.fetchRoles.mockResolvedValue(undefined)
    mocks.list.mockResolvedValue([])
    mocks.listVenues.mockResolvedValue([{ id: 'venue-a', name: '中港國小' }, { id: 'venue-c', name: '河濱球場' }])
    mocks.save.mockResolvedValue('template')
    mocks.delete.mockResolvedValue(undefined)
    mocks.confirm.mockResolvedValue('confirm')
  })
  it('loads role metadata and reacts to its group order/name without changing selected profile IDs', async () => {
    const coaches = [
      { id: 'b', name: '乙教練', nickname: null, role: 'COACH', avatar_url: null },
      { id: 'head', name: '總教練', nickname: null, role: 'HEAD_COACH', avatar_url: null },
      { id: 'a', name: '甲教練', nickname: null, role: 'COACH', avatar_url: null }
    ]
    mocks.fetchRoles.mockImplementation(async () => {
      permissions.roles = [
        { role_key: 'COACH', role_name: '教練團', weight: 20, is_system: true },
        { role_key: 'HEAD_COACH', role_name: '總教練', weight: 10, is_system: true }
      ]
    })
    const wrapper = create(['a', 'head'], { coaches })
    await flushPromises()
    const groups = () => wrapper.findAll('[data-test="template-coach-role-group"]')
    expect(mocks.fetchRoles).toHaveBeenCalledOnce()
    expect(groups().map(group => group.attributes('label'))).toEqual(['總教練', '教練團'])
    expect(groups()[1]!.findAll('el-option-stub').map(option => option.attributes('value'))).toEqual(['b', 'a'])
    const coachSelect = wrapper.get('[data-test="template-coaches-select"]')
    expect(coachSelect.attributes()).toMatchObject({ multiple: '', filterable: '', 'reserve-keyword': 'false', 'model-value': 'a,head' })
    permissions.roles = [
      { role_key: 'COACH', role_name: '助理教練', weight: 5, is_system: true },
      { role_key: 'HEAD_COACH', role_name: '總教練', weight: 10, is_system: true }
    ]
    await wrapper.vm.$nextTick()
    expect(groups().map(group => group.attributes('label'))).toEqual(['助理教練', '總教練'])
    expect(coachSelect.attributes('model-value')).toBe('a,head')
    await submit(wrapper)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ coach_profile_ids: ['a', 'head'] }))
    wrapper.unmount()
  })
  it('shows exactly four venue/coach/name/enabled fields and copies no activity conditions', async () => {
    const wrapper = create()
    await flushPromises()
    expect(wrapper.classes()).toContain('coach-feature-theme')
    expect(wrapper.classes()).toContain('coach-template-manager-dialog')
    expect(wrapper.findAll('div[label]').map((item) => item.attributes('label'))).toEqual(['場地', '固定教練', '範本名稱（選填）', '啟用範本'])
    const venue = wrapper.get('[data-test="template-venue-select"]')
    expect(venue.attributes()).toMatchObject({ filterable: '', 'allow-create': '', 'default-first-option': '', 'reserve-keyword': 'false' })
    expect(wrapper.get('[data-test="template-enabled-switch"]').attributes()).toMatchObject({ 'aria-label': '啟用範本', 'model-value': 'true' })
    expect(wrapper.find('[data-test="template-activity-select"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="template-source-select"]').exists()).toBe(false)
    expect(wrapper.find('el-time-picker-stub').exists()).toBe(false)
    await submit(wrapper)
    expect(mocks.save).toHaveBeenCalledWith({ id: null, updated_at: null, match_mode: 'venue', name: '', is_active: true,
      venue_id: 'venue-a', venue_name: '中港國小', coach_profile_ids: ['a'] })
    wrapper.unmount()
  })
  it('lists all enabled venues without an events prop and saves an existing venue with a blank name', async () => {
    const wrapper = create([], { seed: null })
    await flushPromises()
    await createDraft(wrapper)
    expect(wrapper.get('[data-test="template-venue-select"]').findAll('el-option-stub').map((item) => item.attributes('value'))).toEqual(['venue-a', 'venue-c'])
    emitField(wrapper, 'template-venue-select', 'venue-c')
    emitField(wrapper, 'template-coaches-select', ['a'])
    await wrapper.vm.$nextTick()
    await submit(wrapper)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ name: '', venue_id: 'venue-c', venue_name: '河濱球場', coach_profile_ids: ['a'], is_active: true }))
    expect(mocks.listVenues).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
  it('keeps typed Chinese venue creation in the draft until explicit save and never writes on cancellation', async () => {
    const wrapper = create([], { seed: null })
    await flushPromises()
    await createDraft(wrapper)
    emitField(wrapper, 'template-venue-select', ' 新埔球場 ')
    emitField(wrapper, 'template-coaches-select', ['a'])
    await wrapper.vm.$nextTick()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.listVenues).toHaveBeenCalledTimes(1)
    wrapper.findComponent(AppDialogFooter).vm.$emit('cancel')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining('尚未儲存'), '未儲存的變更', expect.any(Object))
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(mocks.save).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('saves a typed venue atomically and reloads its ID/name after success', async () => {
    const wrapper = create()
    await flushPromises()
    emitField(wrapper, 'template-venue-select', ' 新埔球場 ')
    emitField(wrapper, 'template-name-input', '  ')
    await wrapper.vm.$nextTick()
    mocks.list.mockResolvedValueOnce([{ ...saved(), venue_id: 'created', venue_name: '新埔球場', name: '新埔球場' }])
    mocks.listVenues.mockResolvedValueOnce([{ id: 'created', name: '新埔球場' }])
    await submit(wrapper)
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: null, venue_id: null, venue_name: '新埔球場', name: '' }))
    expect(wrapper.get('[data-test="template-venue-select"]').attributes('model-value')).toBe('created')
    expect(wrapper.get('[data-test="template-name-input"]').attributes('model-value')).toBe('新埔球場')
    expect(mocks.listVenues).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
  it('validates required venue/coaches next to their fields without requiring a template name', async () => {
    const wrapper = create([], { seed: null })
    await flushPromises()
    await createDraft(wrapper)
    await submit(wrapper)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(wrapper.find('div[label="場地"]').attributes('error')).toContain('請選擇場地')
    expect(wrapper.find('div[label="固定教練"]').attributes('error')).toContain('至少選擇一位')
    emitField(wrapper, 'template-venue-select', 'venue-a')
    await wrapper.vm.$nextTick()
    await submit(wrapper)
    expect(mocks.warning).toHaveBeenLastCalledWith(expect.stringContaining('至少選擇一位'))
    wrapper.unmount()
  })
  it('keeps CREATE separate from EDIT and blocks draft changes/saves when CREATE is revoked', async () => {
    const wrapper = create([], { seed: null, canCreate: false, canEdit: true })
    await flushPromises()
    expect(wrapper.find('[data-test="create-template"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="template-name-input"]').exists()).toBe(false)
    await wrapper.setProps({ canCreate: true })
    await createDraft(wrapper)
    await wrapper.setProps({ canCreate: false })
    emitField(wrapper, 'template-name-input', '不應修改')
    emitField(wrapper, 'template-venue-select', '新埔球場')
    emitField(wrapper, 'template-coaches-select', ['a'])
    emitField(wrapper, 'template-enabled-switch', false)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-test="template-name-input"]').attributes('model-value')).toBe('')
    expect(wrapper.get('[data-test="template-venue-select"]').attributes('model-value')).toBe('')
    expect(wrapper.findComponent(AppDialogFooter).props('confirmDisabled')).toBe(true)
    await submit(wrapper)
    expect(mocks.save).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('shows venue/coaches in the list and allows DELETE-only users to inspect without editing', async () => {
    mocks.list.mockResolvedValue([saved()])
    const wrapper = create([], { seed: null, canCreate: false, canEdit: false })
    await flushPromises()
    expect(wrapper.get('[data-test="template-list-item"]').text()).toContain('中港國小')
    expect(wrapper.get('[data-test="template-list-item"]').text()).toContain('甲教練')
    await wrapper.get('[data-test="template-list-item"]').trigger('click')
    await flushPromises()
    emitField(wrapper, 'template-name-input', '不應修改')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-test="template-name-input"]').attributes('model-value')).toBe('中港國小')
    expect(wrapper.findComponent(AppDialogFooter).props('confirmDisabled')).toBe(true)
    expect(wrapper.find('[data-test="delete-template"]').exists()).toBe(true)
    await submit(wrapper)
    expect(mocks.save).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('rechecks DELETE permission after confirmation and never deletes when permission is revoked', async () => {
    mocks.list.mockResolvedValue([saved()])
    const wrapper = create([], { seed: null })
    await flushPromises()
    await wrapper.get('[data-test="template-list-item"]').trigger('click')
    await flushPromises()
    let resolve!: () => void
    mocks.confirm.mockReturnValueOnce(new Promise<void>((done) => { resolve = done }))
    wrapper.findComponent<ComponentPublicInstance>('[data-test="delete-template"]').vm.$emit('click')
    await wrapper.setProps({ canDelete: false })
    resolve()
    await flushPromises()
    expect(mocks.delete).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('updates an existing template with EDIT and its revision, then blocks changes after EDIT is revoked', async () => {
    mocks.list.mockResolvedValue([saved()])
    const wrapper = create([], { seed: null, canCreate: false })
    await flushPromises()
    await wrapper.get('[data-test="template-list-item"]').trigger('click')
    await flushPromises()
    emitField(wrapper, 'template-venue-select', 'venue-c')
    emitField(wrapper, 'template-enabled-switch', false)
    await wrapper.vm.$nextTick()
    await submit(wrapper)
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'template', updated_at: 'revision',
      venue_id: 'venue-c', venue_name: '河濱球場', is_active: false }))
    await wrapper.setProps({ canEdit: false })
    emitField(wrapper, 'template-name-input', '不應修改')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-test="template-name-input"]').attributes('model-value')).toBe('中港國小')
    await submit(wrapper)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('retains a dirty draft when delete fails and sends the loaded revision instead of modified form metadata', async () => {
    mocks.list.mockResolvedValue([saved()])
    mocks.delete.mockRejectedValueOnce(new Error('範本版本已更新'))
    const wrapper = create([], { seed: null })
    await flushPromises()
    await wrapper.get('[data-test="template-list-item"]').trigger('click')
    await flushPromises()
    emitField(wrapper, 'template-name-input', '保留草稿')
    await wrapper.vm.$nextTick()
    wrapper.findComponent<ComponentPublicInstance>('[data-test="delete-template"]').vm.$emit('click')
    await flushPromises()
    expect(mocks.delete).toHaveBeenCalledWith(saved())
    expect(wrapper.get('[data-test="template-name-input"]').attributes('model-value')).toBe('保留草稿')
    expect(wrapper.get('[data-test="template-save-error"]').text()).toBe('範本版本已更新')
    wrapper.unmount()
  })
  it('preserves dirty drafts when discard is declined and keeps duplicate failures for correction/retry', async () => {
    const wrapper = create()
    await flushPromises()
    emitField(wrapper, 'template-name-input', '未儲存範本')
    emitField(wrapper, 'template-venue-select', '新埔球場')
    await wrapper.vm.$nextTick()
    mocks.confirm.mockRejectedValueOnce('cancel')
    await createDraft(wrapper)
    expect(wrapper.get('[data-test="template-name-input"]').attributes('model-value')).toBe('未儲存範本')
    mocks.save.mockRejectedValueOnce(new Error('此場地已有啟用範本'))
    await submit(wrapper)
    expect(wrapper.get('[data-test="template-save-error"]').text()).toBe('此場地已有啟用範本')
    expect(wrapper.get('[data-test="template-venue-select"]').attributes('model-value')).toBe('新埔球場')
    expect(mocks.listVenues).toHaveBeenCalledTimes(1)
    await submit(wrapper)
    expect(mocks.save).toHaveBeenCalledTimes(2)
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ name: '未儲存範本', venue_name: '新埔球場' }))
    wrapper.unmount()
  })
  it('blocks duplicate saves and field changes while saving', async () => {
    const wrapper = create()
    await flushPromises()
    let resolve!: (id: string) => void
    mocks.save.mockReturnValueOnce(new Promise<string>((done) => { resolve = done }))
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await wrapper.vm.$nextTick()
    emitField(wrapper, 'template-name-input', '儲存中不應修改')
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await wrapper.vm.$nextTick()
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-test="template-name-input"]').attributes('model-value')).toBe('')
    resolve('template')
    await flushPromises()
    wrapper.unmount()
  })
  it('reports venue-load failures and ignores late results after the dialog closes', async () => {
    mocks.listVenues.mockRejectedValueOnce(new Error('場地讀取失敗'))
    const wrapper = create()
    await flushPromises()
    expect(wrapper.get('[data-test="template-load-error"]').text()).toBe('場地讀取失敗')
    expect(wrapper.find('[data-test="template-name-input"]').exists()).toBe(true)
    let resolve!: (value: unknown[]) => void
    mocks.list.mockReturnValueOnce(new Promise<unknown[]>((done) => { resolve = done }))
    wrapper.findComponent<ComponentPublicInstance>('[data-test="reload-templates"]').vm.$emit('click')
    await wrapper.setProps({ modelValue: false })
    resolve([saved()])
    await flushPromises()
    expect(wrapper.find('[data-test="template-list-item"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('requires a fresh revision before saving again when a successful save cannot reload its result', async () => {
    const wrapper = create()
    await flushPromises()
    mocks.list.mockRejectedValueOnce(new Error('範本重載失敗'))
    await submit(wrapper)
    expect(wrapper.get('[data-test="template-load-error"]').text()).toBe('範本重載失敗')
    expect(wrapper.findComponent(AppDialogFooter).props('confirmDisabled')).toBe(true)
    await submit(wrapper)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    mocks.list.mockResolvedValueOnce([saved()])
    wrapper.findComponent<ComponentPublicInstance>('[data-test="reload-templates"]').vm.$emit('click')
    await flushPromises()
    expect(wrapper.findComponent(AppDialogFooter).props('confirmDisabled')).toBe(false)
    expect(wrapper.get('[data-test="template-name-input"]').attributes('model-value')).toBe('中港國小')
    wrapper.unmount()
  })
})
