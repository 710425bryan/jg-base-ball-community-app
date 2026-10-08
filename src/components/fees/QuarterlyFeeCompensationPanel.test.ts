// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QuarterlyFeeCompensationPanel from './QuarterlyFeeCompensationPanel.vue'

const mocks = vi.hoisted(() => ({
  can: vi.fn(), dates: vi.fn(), defaults: vi.fn(), list: vi.fn(), generate: vi.fn(),
  approve: vi.fn(), skip: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn()
}))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: mocks.can }) }))
vi.mock('@/services/trainingDatesApi', () => ({ trainingDatesApi: { getMonthDates: mocks.dates } }))
vi.mock('@/services/quarterlyFeeCompensations', () => ({
  getQuarterlyFeeCompensationDefaults: mocks.defaults,
  listQuarterlyFeeCompensationItems: mocks.list,
  generateQuarterlyFeeCompensationDrafts: mocks.generate,
  approveQuarterlyFeeCompensationItem: mocks.approve,
  skipQuarterlyFeeCompensationItem: mocks.skip
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: mocks.success, info: mocks.info, warning: mocks.warning, error: mocks.error },
  ElMessageBox: { confirm: vi.fn() }
}))

const item = (status = 'pending') => ({
  id: status, status, member_name: '測試球員', month: '2026-11',
  baseline_session_count: 4, configured_session_count: 3, compensation_days: 1,
  daily_credit_amount: 500, suggested_amount: 500, approved_amount: status === 'approved' ? 500 : 0
})
const mountPanel = async () => {
  const wrapper = mount(QuarterlyFeeCompensationPanel, {
    props: { periodKey: '2026-Q4', startMonth: '2026-10', endMonth: '2026-12' },
    global: {
      directives: { loading: () => {} },
      stubs: { 'el-select': true, 'el-option': true, 'el-icon': true, 'el-input': true, 'el-input-number': true }
    }
  })
  await flushPromises()
  wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', '2026-11')
  await flushPromises()
  return wrapper
}
const generateButton = (wrapper: Awaited<ReturnType<typeof mountPanel>>) =>
  wrapper.findAll('button').find(button => button.text().includes('產生待審核'))!

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T04:00:00Z'))
  mocks.can.mockReturnValue(true)
  mocks.defaults.mockResolvedValue({ regularDailyCredit: 500, discountDailyCredit: 250 })
  mocks.dates.mockImplementation(async (month: string) => ({
    training_dates: [`${month}-07`, `${month}-14`, `${month}-21`]
  }))
  mocks.list.mockResolvedValue([])
  mocks.generate.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('QuarterlyFeeCompensationPanel', () => {
  it('warns persistently when generation returns no records instead of claiming success', async () => {
    const wrapper = await mountPanel()
    await generateButton(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledWith('本次未產生補償資料，請確認訓練日期設定與季繳球員資料。')
    expect(wrapper.text()).toContain('本次未產生補償資料')
    wrapper.unmount()
  })

  it('allows November drafts in October and counts pending records only', async () => {
    mocks.generate.mockResolvedValue([item(), item('approved')])
    const wrapper = await mountPanel()
    expect(mocks.dates).toHaveBeenLastCalledWith('2026-11', { programKey: 'chunggang_school_team' })
    expect(wrapper.text()).toContain('2026-11 尚有 1 天不足')
    expect(generateButton(wrapper).attributes('disabled')).toBeUndefined()
    await generateButton(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.generate).toHaveBeenCalledWith({ periodKey: '2026-Q4', month: '2026-11' })
    expect(mocks.success).toHaveBeenCalledWith('已更新待審核補償資料，共 1 筆')
    expect(mocks.approve).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reports reviewed records without claiming new pending drafts', async () => {
    mocks.generate.mockResolvedValue([item('approved'), item('skipped')])
    const wrapper = await mountPanel()
    await generateButton(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledWith('本月補償紀錄皆已審核，沒有待審核資料。')
    wrapper.unmount()
  })

  it('disables generation without EDIT permission', async () => {
    mocks.can.mockReturnValue(false)
    const wrapper = await mountPanel()
    expect(generateButton(wrapper).attributes('disabled')).toBeDefined()
    expect(mocks.generate).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not generate when a non-Saturday makeup date fills the missing session', async () => {
    mocks.dates.mockResolvedValue({ training_dates: ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-27'] })
    const wrapper = await mountPanel()
    expect(generateButton(wrapper).attributes('disabled')).toBeDefined()
    expect(mocks.generate).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
