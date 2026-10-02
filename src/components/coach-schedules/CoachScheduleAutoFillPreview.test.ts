// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import { normalizeCoachScheduleAutoFillPreview } from '@/utils/coachScheduleTemplates'
import CoachScheduleAutoFillPreview from './CoachScheduleAutoFillPreview.vue'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), confirm: vi.fn(), error: vi.fn() }))
vi.mock('@/services/coachScheduleTemplatesApi', () => ({ coachScheduleTemplatesApi: mocks }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: mocks.error } }))
const create = (canEdit = true) => shallowMount(CoachScheduleAutoFillPreview, { props: {
  modelValue: true, month: '2026-10', coaches: [], canCreate: false, canEdit
}, global: { stubs: { 'el-button': true, 'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-checkbox-group': { template: '<div><slot /></div>' }, 'el-checkbox': { template: '<div><slot /></div>' } } } })
describe('CoachScheduleAutoFillPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.preview.mockResolvedValue(normalizeCoachScheduleAutoFillPreview({ fingerprint: 'version', rows: [
      { event_key: 'eligible', event: { id: 'saved', schedule_date: '2026-10-03', title: '訓練' }, proposed_coach_profile_ids: ['a'], time_incomplete: true },
      { event_key: 'vacant', event: { id: 'other', schedule_date: '2026-10-10', title: '訓練' }, proposed_coach_profile_ids: [],
        vacancy_count: 1, excluded_coaches: [{ id: 'b', name: '乙教練', reason: 'leave' }] },
      { event_key: 'no-create', event: { schedule_date: '2026-10-17', title: '訓練' }, proposed_coach_profile_ids: ['a'] }
    ] }))
    mocks.confirm.mockResolvedValue(['saved'])
  })
  it('shows exclusions and vacancies but confirms only selected eligible rows with their fingerprint', async () => {
    const wrapper = create()
    await flushPromises()
    expect(wrapper.classes()).toContain('coach-feature-theme')
    expect(wrapper.text()).toContain('依場地範本帶入')
    expect(wrapper.text()).toContain('乙教練（請假）')
    expect(wrapper.text()).toContain('待補 1 位教練')
    expect(wrapper.text()).toContain('依全日檢查請假與排班衝突')
    expect(wrapper.findComponent(AppDialogFooter).props('confirmLabel')).toBe('確認帶入 1 筆')
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledWith('2026-10', 'version', ['eligible'])
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })
  it('does not confirm when all rows are unavailable or lack the required action', async () => {
    const wrapper = create(false)
    await flushPromises()
    expect(wrapper.findComponent(AppDialogFooter).props('confirmDisabled')).toBe(true)
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await flushPromises()
    expect(mocks.confirm).not.toHaveBeenCalled()
  })
  it('keeps the dialog open and clears selections when the server rejects a stale preview', async () => {
    const wrapper = create()
    await flushPromises()
    mocks.confirm.mockRejectedValue(new Error('預覽已過期'))
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await flushPromises()
    expect(mocks.error).toHaveBeenCalledWith('預覽已過期')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.findComponent(AppDialogFooter).props('confirmDisabled')).toBe(true)
    expect(wrapper.text()).toContain('此預覽已失效')
    ;(wrapper.vm as any).selectedKeys = ['eligible']
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
  })
})
