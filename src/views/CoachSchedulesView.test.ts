// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { normalizeCoachScheduleMonthPayload } from '@/utils/coachSchedules'
import CoachScheduleEventEditor from '@/components/coach-schedules/CoachScheduleEventEditor.vue'
import CoachScheduleTemplateManager from '@/components/coach-schedules/CoachScheduleTemplateManager.vue'
import CoachScheduleMonthOverview from '@/components/coach-schedules/CoachScheduleMonthOverview.vue'
import CoachSchedulesView from './CoachSchedulesView.vue'

const mocks = vi.hoisted(() => ({ listAdminMonth: vi.fn(), listSchedulableCoaches: vi.fn(), saveEvent: vi.fn(), fetchRoles: vi.fn() }))
vi.mock('@/services/coachSchedulesApi', () => ({ coachSchedulesApi: mocks }))
vi.mock('@/services/coachScheduleTemplatesApi', () => ({ coachScheduleTemplatesApi: {} }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: () => true, roles: [], fetchRoles: mocks.fetchRoles }) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { month: '2026-09' } }),
  useRouter: () => ({ replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn()
}))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: {} }))

describe('CoachSchedulesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchRoles.mockResolvedValue(undefined)
    mocks.listSchedulableCoaches.mockResolvedValue([])
    mocks.saveEvent.mockResolvedValue('a')
    mocks.listAdminMonth.mockResolvedValue(normalizeCoachScheduleMonthPayload({ events: [
      { id: 'a', source_type: 'training_location', source_id: 'junior', source_venue_id: 'va',
        program_label: '國中部', schedule_date: '2026-09-25', title: '訓練課程', coach_profile_ids: ['coach-a'] },
      { source_type: 'training_location', source_id: 'primary', source_venue_id: 'vb',
        program_label: '中港總部', schedule_date: '2026-09-25', title: '訓練課程' }
    ] }))
  })

  it('renders separate cards without program labels and saves only the selected source and coaches', async () => {
    const wrapper = shallowMount(CoachSchedulesView, { global: { stubs: {
      AppPageHeader: { template: '<header><slot name="actions" /></header>' },
      'el-dropdown': { name: 'ElDropdown', emits: ['command'], template: '<div><slot /><slot name="dropdown" /></div>' }, 'el-dropdown-menu': { template: '<div><slot /></div>' }, 'el-dropdown-item': true,
      CoachScheduleEventEditor: false, CoachScheduleEventSummary: false, 'el-button': { template: '<button><slot /></button>' },
      'el-icon': true, 'el-option': true, 'el-option-group': true, 'el-time-picker': true, 'el-form': true, 'el-dialog': true, 'el-select': true, 'el-input': true,
      'el-form-item': { template: '<div><slot /></div>' }, 'el-date-picker': true
    } } })
    await flushPromises()
    expect(mocks.fetchRoles).toHaveBeenCalledOnce()
    expect(wrapper.classes()).toContain('coach-feature-theme')
    expect(wrapper.get('header').findAll('button')).toHaveLength(2)
    expect(wrapper.get('header').find('el-dropdown-item-stub[command="refresh"]').exists()).toBe(true)
    wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'refresh')
    await flushPromises()
    expect(mocks.listAdminMonth).toHaveBeenCalledTimes(2)
    expect(mocks.fetchRoles).toHaveBeenCalledOnce()
    const cards = wrapper.findAll('[data-test="coach-schedule-event"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).not.toContain('國中部')
    expect(cards[1].text()).not.toContain('中港總部')
    await cards[0].findAll('button').find(button => button.text().includes('更新排班'))!.trigger('click')
    await flushPromises()
    expect(mocks.saveEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'a', source_id: 'junior', source_venue_id: 'va', coach_profile_ids: ['coach-a']
    }))
    expect(mocks.saveEvent).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renders one shared lesson and edits its full coach list with a revision check', async () => {
    mocks.listAdminMonth.mockResolvedValue(normalizeCoachScheduleMonthPayload({ events: [
      { id: 'shared', source_type: 'training_location', source_id: 'primary', source_venue_id: 'vb',
        program_label: '合班｜中港總部、國中部', schedule_date: '2026-09-25', title: '訓練課程',
        location: '中港國小', start_time: '09:00', end_time: '12:30',
        updated_at: '2026-09-24T06:00:00.123456+00:00', coach_profile_ids: ['coach-a', 'coach-b', 'coach-c'] }
    ] }))
    const wrapper = shallowMount(CoachSchedulesView, { global: { stubs: {
      'el-dropdown': true, 'el-dropdown-menu': true, 'el-dropdown-item': true,
      CoachScheduleEventEditor: false, CoachScheduleEventSummary: false, 'el-button': { template: '<button><slot /></button>' },
      'el-icon': true, 'el-option': true, 'el-option-group': true, 'el-time-picker': true,
      'el-form': true, 'el-dialog': true, 'el-select': true, 'el-input': true,
      'el-form-item': { template: '<div><slot /></div>' }, 'el-date-picker': true
    } } })
    await flushPromises()
    const cards = wrapper.findAll('[data-test="coach-schedule-event"]')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).not.toContain('國中部')
    expect(cards[0].text()).not.toContain('中港總部')
    expect(cards[0].text()).toContain('09:00 - 12:30')
    await cards[0].findAll('button').find(button => button.text().includes('更新排班'))!.trigger('click')
    await flushPromises()
    expect(mocks.saveEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'shared', source_id: 'primary', source_venue_id: 'vb',
      updated_at: '2026-09-24T06:00:00.123456+00:00', coach_profile_ids: ['coach-a', 'coach-b', 'coach-c']
    }))
    wrapper.unmount()
  })

  it('copies a training card venue and unsaved coach selection without title/time or month-derived venue props', async () => {
    mocks.listAdminMonth.mockResolvedValue(normalizeCoachScheduleMonthPayload({ events: [{
      source_type: 'training_date', schedule_date: '2026-09-25', title: '合班投捕', location: '中港國小',
      venue_id: 'physical', start_time: null, coach_profile_ids: ['coach-a']
    }] }))
    const wrapper = shallowMount(CoachSchedulesView, { global: { stubs: {
      'el-icon': true, 'el-button': true, 'el-dropdown-item': true, 'el-dropdown-menu': true,
      'el-dropdown': true, 'el-date-picker': true, 'el-form-item': true
    } } })
    await flushPromises()
    const card = wrapper.findComponent(CoachScheduleEventEditor)
    card.vm.$emit('update:form', { coachProfileIds: ['coach-b'], status: 'scheduled', note: '尚未儲存' })
    await wrapper.vm.$nextTick()
    card.vm.$emit('copy-template')
    await wrapper.vm.$nextTick()
    const manager = wrapper.findComponent(CoachScheduleTemplateManager)
    expect(manager.props('modelValue')).toBe(true)
    expect(manager.props('seed')).toEqual({ id: null, updated_at: null, match_mode: 'venue',
      name: '', is_active: true, venue_id: 'physical', venue_name: '中港國小', coach_profile_ids: ['coach-b'] })
    expect(manager.props()).not.toHaveProperty('events')
    expect(mocks.saveEvent).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  const createOverviewView = () => shallowMount(CoachSchedulesView, { global: { stubs: {
    AppPageHeader: { template: '<header><slot name="actions" /></header>' },
    'el-icon': true, 'el-button': { template: '<button><slot /></button>' }, 'el-dropdown-item': true,
    'el-dropdown-menu': true, 'el-dropdown': { template: '<div><slot /></div>' },
    'el-date-picker': { name: 'ElDatePicker', emits: ['update:modelValue'], template: '<div />' },
    'el-form-item': { template: '<div><slot /></div>' }
  } } })
  const snapshot = (name: string, month = '2026-09') => normalizeCoachScheduleMonthPayload({ events: [
    { id: 'saved-training', source_type: 'training_location', source_id: 'session', source_venue_id: 'block', schedule_date: `${month}-01`,
      title: '場地訓練', coach_profile_ids: ['saved-coach'], assignments: [{ coach_profile_id: 'saved-coach', coach_name: name }] },
    { id: 'match', source_type: 'match', source_id: 'match-source', schedule_date: `${month}-30`, title: '月底比賽' }
  ] }, month)

  it('filters unassigned saved IDs together with the source, keeps drafts and cancelled labels, and removes passive statistics', async () => {
    mocks.listAdminMonth.mockResolvedValue(normalizeCoachScheduleMonthPayload({ events: [
      { id: 'assigned-training', source_type: 'training_location', source_id: 'assigned', source_venue_id: 'va',
        schedule_date: '2026-09-25', title: '已有教練', coach_profile_ids: ['coach-a'] },
      { id: 'empty-training', source_type: 'training_location', source_id: 'empty', source_venue_id: 'vb',
        schedule_date: '2026-09-25', title: '已儲存待指派' },
      { source_type: 'training_location', source_id: 'candidate', source_venue_id: 'vc',
        schedule_date: '2026-09-25', title: '候選待指派' },
      { id: 'empty-match', source_type: 'match', source_id: 'empty-match-source', schedule_date: '2026-09-26', title: '待指派比賽' },
      { id: 'assigned-match', source_type: 'match', source_id: 'assigned-match-source', schedule_date: '2026-09-26',
        title: '已指派比賽', coach_profile_ids: ['coach-b'] },
      { id: 'cancelled', source_type: 'manual', schedule_date: '2026-09-27', title: '已取消活動', status: 'cancelled' }
    ] }))
    const wrapper = createOverviewView()
    await flushPromises()
    const cards = () => wrapper.findAllComponents(CoachScheduleEventEditor)
    const unassigned = wrapper.get('[data-test="filter-unassigned"]')
    expect(wrapper.text()).not.toContain('候選活動')
    expect(wrapper.text()).not.toContain('已儲存')
    expect(wrapper.text()).not.toContain('已指派教練')
    expect(unassigned.text()).toBe('未指派教練4')
    await unassigned.trigger('click')
    expect(unassigned.attributes('aria-pressed')).toBe('true')
    expect(cards()).toHaveLength(4)
    expect(cards().some((card) => card.props('event').status === 'cancelled')).toBe(true)
    await wrapper.findAll('button').find((button) => button.text().startsWith('場地訓練'))!.trigger('click')
    expect(cards()).toHaveLength(2)
    expect(unassigned.text()).toBe('未指派教練2')
    const training = cards().find((card) => card.props('event').id === 'empty-training')!
    training.vm.$emit('update:form', { coachProfileIds: ['draft-coach'], status: 'scheduled', note: '保留草稿' })
    await wrapper.vm.$nextTick()
    expect(cards()).toHaveLength(2)
    await wrapper.findAll('button').find((button) => button.text().startsWith('比賽'))!.trigger('click')
    expect(cards().map((card) => card.props('event').id)).toEqual(['empty-match'])
    expect(unassigned.text()).toBe('未指派教練1')
    await wrapper.findAll('button').find((button) => button.text().startsWith('全部'))!.trigger('click')
    expect(cards()).toHaveLength(4)
    expect(unassigned.attributes('aria-pressed')).toBe('true')
    await unassigned.trigger('click')
    expect(cards()).toHaveLength(6)
    expect(cards().find((card) => card.props('event').id === 'empty-training')!.props('form').coachProfileIds).toEqual(['draft-coach'])
    expect(mocks.listAdminMonth).toHaveBeenCalledOnce()
    expect(mocks.saveEvent).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('removes newly saved assignments from the active filter and shows a filter-specific empty state', async () => {
    const before = normalizeCoachScheduleMonthPayload({ events: [
      { id: 'empty-training', source_type: 'training_location', source_id: 'session', source_venue_id: 'block',
        schedule_date: '2026-09-25', title: '待排班' }
    ] })
    const after = normalizeCoachScheduleMonthPayload({ events: [
      { ...before.events[0], coach_profile_ids: ['coach-a'], updated_at: '2026-09-25T01:00:00Z' }
    ] })
    mocks.listAdminMonth.mockResolvedValueOnce(before).mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    const wrapper = createOverviewView()
    await flushPromises()
    const unassigned = wrapper.get('[data-test="filter-unassigned"]')
    await unassigned.trigger('click')
    const card = wrapper.findComponent(CoachScheduleEventEditor)
    card.vm.$emit('update:form', { coachProfileIds: ['coach-a'], status: 'scheduled', note: '' })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAllComponents(CoachScheduleEventEditor)).toHaveLength(1)
    card.vm.$emit('save')
    await flushPromises()
    expect(mocks.saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'empty-training', coach_profile_ids: ['coach-a'] }))
    expect(wrapper.findAllComponents(CoachScheduleEventEditor)).toHaveLength(0)
    expect(unassigned.text()).toBe('未指派教練0')
    expect(wrapper.text()).toContain('目前篩選條件下沒有未指派教練的活動。')
    expect(wrapper.text()).not.toContain('這個月份目前沒有可排班活動。')
    await unassigned.trigger('click')
    expect(wrapper.findComponent(CoachScheduleEventEditor).props('event').coach_profile_ids).toEqual(['coach-a'])
    wrapper.unmount()
  })

  it('opens a visible month overview using a fresh snapshot regardless of source filters and keeps card drafts intact', async () => {
    mocks.listAdminMonth.mockResolvedValueOnce(snapshot('原有教練'))
    const wrapper = createOverviewView()
    await flushPromises()
    const training = wrapper.findAllComponents(CoachScheduleEventEditor).find((card) => card.props('event').id === 'saved-training')!
    training.vm.$emit('update:form', { coachProfileIds: ['draft-coach'], status: 'scheduled', note: '未存草稿' })
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find((button) => button.text().startsWith('比賽'))!.trigger('click')
    await wrapper.get('[data-test="filter-unassigned"]').trigger('click')
    expect(wrapper.findAllComponents(CoachScheduleEventEditor)).toHaveLength(1)
    const latest = snapshot('最新已存教練')
    mocks.listAdminMonth.mockResolvedValueOnce(latest)
    await wrapper.get('[data-test="open-month-overview"]').trigger('click')
    await flushPromises()
    const overview = wrapper.findComponent(CoachScheduleMonthOverview)
    expect(wrapper.get('header').findAll('button')).toHaveLength(2)
    expect(overview.props('modelValue')).toBe(true)
    expect(overview.props('hasUnsavedChanges')).toBe(true)
    expect(overview.props('events')).toEqual(latest.events)
    expect(overview.props('events')[0]!.assignments[0]!.coach_name).toBe('最新已存教練')
    expect(mocks.listAdminMonth).toHaveBeenCalledTimes(2)
    expect(mocks.listSchedulableCoaches).toHaveBeenCalledOnce()
    expect(mocks.saveEvent).not.toHaveBeenCalled()
    await wrapper.findAll('button').find((button) => button.text().startsWith('全部'))!.trigger('click')
    await wrapper.get('[data-test="filter-unassigned"]').trigger('click')
    const retained = wrapper.findAllComponents(CoachScheduleEventEditor).find((card) => card.props('event').id === 'saved-training')!
    expect(retained.props('form')).toEqual({ coachProfileIds: ['draft-coach'], status: 'scheduled', note: '未存草稿' })
    wrapper.unmount()
  })

  it('clears a failed overview snapshot and retries without changing the page event data', async () => {
    const wrapper = createOverviewView()
    await flushPromises()
    mocks.listAdminMonth.mockRejectedValueOnce(new Error('月份總覽讀取失敗'))
    await wrapper.get('[data-test="open-month-overview"]').trigger('click')
    await flushPromises()
    const overview = wrapper.findComponent(CoachScheduleMonthOverview)
    expect(overview.props('events')).toEqual([])
    expect(overview.props('error')).toBe('月份總覽讀取失敗')
    expect(overview.props('loading')).toBe(false)
    expect(wrapper.findAllComponents(CoachScheduleEventEditor)).toHaveLength(2)
    mocks.listAdminMonth.mockResolvedValueOnce(snapshot('重試資料'))
    overview.vm.$emit('refresh')
    await flushPromises()
    expect(overview.props('error')).toBe('')
    expect(overview.props('events')[0]!.assignments[0]!.coach_name).toBe('重試資料')
    expect(mocks.listAdminMonth).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it('reloads on reopen and ignores a late response from the closed overview', async () => {
    const wrapper = createOverviewView()
    await flushPromises()
    let resolve!: (value: ReturnType<typeof snapshot>) => void
    mocks.listAdminMonth.mockReturnValueOnce(new Promise<ReturnType<typeof snapshot>>((done) => { resolve = done }))
    await wrapper.get('[data-test="open-month-overview"]').trigger('click')
    const overview = wrapper.findComponent(CoachScheduleMonthOverview)
    expect(overview.props('loading')).toBe(true)
    overview.vm.$emit('update:modelValue', false)
    await wrapper.vm.$nextTick()
    mocks.listAdminMonth.mockResolvedValueOnce(snapshot('重新開啟資料'))
    await wrapper.get('[data-test="open-month-overview"]').trigger('click')
    await flushPromises()
    resolve(snapshot('應忽略的舊資料'))
    await flushPromises()
    expect(overview.props('events')[0]!.assignments[0]!.coach_name).toBe('重新開啟資料')
    expect(mocks.listAdminMonth).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it('ignores the previous month response when the month changes with overview open', async () => {
    const wrapper = createOverviewView()
    await flushPromises()
    let resolve!: (value: ReturnType<typeof snapshot>) => void
    mocks.listAdminMonth.mockImplementation((month: string) => month === '2026-09'
      ? new Promise<ReturnType<typeof snapshot>>((done) => { resolve = done }) : Promise.resolve(snapshot('十月資料', month)))
    await wrapper.get('[data-test="open-month-overview"]').trigger('click')
    wrapper.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-10')
    await flushPromises()
    const overview = wrapper.findComponent(CoachScheduleMonthOverview)
    expect(overview.props('month')).toBe('2026-10')
    expect(overview.props('events')[0]!.schedule_date).toBe('2026-10-01')
    resolve(snapshot('舊九月資料'))
    await flushPromises()
    expect(overview.props('events')[0]!.assignments[0]!.coach_name).toBe('十月資料')
    expect(overview.props('error')).toBe('')
    wrapper.unmount()
  })

  it('refreshes only the open overview on foreground return, keeping a dirty card and loaded coaches unchanged', async () => {
    mocks.listAdminMonth.mockResolvedValueOnce(snapshot('原教練'))
    const wrapper = createOverviewView()
    await flushPromises()
    const card = wrapper.findAllComponents(CoachScheduleEventEditor).find((item) => item.props('event').id === 'saved-training')!
    card.vm.$emit('update:form', { coachProfileIds: ['draft-coach'], status: 'scheduled', note: '保留草稿' })
    await wrapper.vm.$nextTick()
    mocks.listAdminMonth.mockResolvedValueOnce(snapshot('開啟資料'))
    await wrapper.get('[data-test="open-month-overview"]').trigger('click')
    await flushPromises()
    mocks.listAdminMonth.mockResolvedValueOnce(snapshot('前景最新資料'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.findComponent(CoachScheduleMonthOverview).props('events')[0]!.assignments[0]!.coach_name).toBe('前景最新資料')
    expect(card.props('form')).toEqual({ coachProfileIds: ['draft-coach'], status: 'scheduled', note: '保留草稿' })
    expect(mocks.listSchedulableCoaches).toHaveBeenCalledOnce()
    expect(mocks.listAdminMonth).toHaveBeenCalledTimes(3)
    wrapper.unmount()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(mocks.listAdminMonth).toHaveBeenCalledTimes(3)
  })
})
