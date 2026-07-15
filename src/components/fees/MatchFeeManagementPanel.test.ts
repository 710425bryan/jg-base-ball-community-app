// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchFeeManagementPanel from './MatchFeeManagementPanel.vue'
import type { MatchFeeItem } from '@/types/matchFees'

const mocks = vi.hoisted(() => ({
  can: vi.fn(() => true),
  confirm: vi.fn(async () => undefined),
  list: vi.fn(),
  setOpenState: vi.fn(),
  deleteGroup: vi.fn(),
  rollback: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}))

vi.mock('@/stores/permissions', () => ({
  usePermissionsStore: () => ({ can: mocks.can })
}))

vi.mock('@/services/matchFees', () => ({
  listMatchFeeItemsByMonth: mocks.list,
  setMatchFeePaymentOpenState: mocks.setOpenState,
  deleteCancelledMatchFeeGroup: mocks.deleteGroup,
  rollbackMatchPaymentSubmission: mocks.rollback
}))

vi.mock('@/utils/pushNotifications', () => ({
  buildPushEventKey: vi.fn(() => 'event-key'),
  dispatchPushNotification: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    error: mocks.error,
    warning: mocks.warning
  },
  ElMessageBox: {
    confirm: mocks.confirm
  }
}))

const makeItem = (overrides: Partial<MatchFeeItem> = {}): MatchFeeItem => ({
  id: 'item-1',
  match_id: 'match-1',
  member_id: 'member-1',
  member_name: '王小明',
  member_role: '球員',
  match_name: '測試比賽',
  tournament_name: '測試盃',
  match_date: '2026-07-20',
  match_time: '09:00 - 10:30',
  category_group: 'U11',
  fee_month: '2026-07',
  amount: 100,
  match_fee_amount: 100,
  payment_opened_at: null,
  payment_opened_by_name: null,
  has_payment_history: false,
  payment_status: 'unpaid',
  payment_submission_id: null,
  paid_at: null,
  cancelled_reason: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  ...overrides
})

const mountPanel = async () => {
  const wrapper = mount(MatchFeeManagementPanel, {
    global: {
      stubs: {
        AppLoadingState: true,
        'el-date-picker': true,
        'el-icon': { template: '<span><slot /></span>' },
        'el-collapse-transition': { template: '<div><slot /></div>' }
      }
    }
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.can.mockReturnValue(true)
  mocks.confirm.mockResolvedValue(undefined)
  mocks.setOpenState.mockResolvedValue({
    match_id: 'match-1',
    is_payment_open: true,
    payment_opened_at: '2026-07-01T00:00:00Z',
    payable_item_count: 2,
    payable_amount: 200
  })
  mocks.deleteGroup.mockResolvedValue(1)
})

describe('MatchFeeManagementPanel', () => {
  it('sorts matches from earlier to later, puts unknown times last, and defaults to collapsed', async () => {
    mocks.list.mockResolvedValue([
      makeItem({ id: 'late', match_id: 'late-match', match_name: '晚場', match_time: '14:00 - 15:30' }),
      makeItem({ id: 'unknown', match_id: 'unknown-match', match_name: '未定時間', match_time: null }),
      makeItem({ id: 'early', match_id: 'early-match', match_name: '早場', match_time: '09:00 - 10:30' })
    ])

    const wrapper = await mountPanel()

    expect(wrapper.findAll('article h4').map((heading) => heading.text())).toEqual([
      '早場',
      '晚場',
      '未定時間'
    ])

    const toggles = wrapper.findAll('[data-testid="match-fee-collapse-toggle"]')
    expect(toggles).toHaveLength(3)
    expect(toggles[0].attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('[data-testid="match-fee-group-details"]')[0].attributes('style')).toContain('display: none')

    await toggles[0].trigger('click')
    expect(toggles[0].attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[data-testid="match-fee-group-details"]')[0].attributes('style') || '').not.toContain('display: none')
  })

  it('keeps the mobile action and collapse controls in aligned equal-width columns', async () => {
    mocks.list.mockResolvedValue([
      makeItem({
        id: 'cancelled-safe',
        match_id: null,
        match_name: '已取消場次',
        payment_status: 'cancelled',
        cancelled_reason: '比賽已刪除'
      }),
      makeItem({
        id: 'collapse-only',
        match_id: 'collapse-only-match',
        match_name: '無管理操作場次',
        match_fee_amount: 0
      })
    ])

    const wrapper = await mountPanel()
    const actionRows = wrapper.findAll('[data-testid="match-fee-group-actions"]')
    const toggles = wrapper.findAll('[data-testid="match-fee-collapse-toggle"]')

    expect(actionRows).toHaveLength(2)
    actionRows.forEach((row) => {
      expect(row.classes()).toContain('grid-cols-2')
      expect(row.classes()).toContain('md:flex')
    })
    toggles.forEach((toggle) => {
      expect(toggle.classes()).toContain('col-start-2')
      expect(toggle.classes()).toContain('w-full')
      expect(toggle.classes()).toContain('md:w-auto')
    })
    expect(wrapper.get('[data-testid="delete-cancelled-group-button"]').classes()).toContain('w-full')
  })

  it('does not offer payment opening when the configured per-player amount is zero', async () => {
    mocks.list.mockResolvedValue([
      makeItem({ match_fee_amount: 0, amount: 100 })
    ])

    const wrapper = await mountPanel()

    expect(wrapper.find('[data-testid="open-payment-button"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="payment-open-state"]').text()).toBe('未開放')
  })

  it('confirms the per-player fee, player count, and total before opening payment', async () => {
    mocks.list.mockResolvedValue([
      makeItem(),
      makeItem({ id: 'item-2', member_id: 'member-2', member_name: '李小華' })
    ])

    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="open-payment-button"]').trigger('click')
    await flushPromises()

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining('每位球員 $100，應繳 2 人，總計 $200'),
      '確認開放比賽費用繳費',
      expect.objectContaining({ confirmButtonText: '確認開放' })
    )
    expect(mocks.setOpenState).toHaveBeenCalledWith('match-1', true)
  })

  it('disables closing and cancelled-group deletion when any item has payment history', async () => {
    mocks.list.mockResolvedValue([
      makeItem({
        id: 'active-history',
        match_id: 'active-match',
        match_name: '已開放場次',
        payment_opened_at: '2026-07-01T00:00:00Z',
        has_payment_history: true
      }),
      makeItem({
        id: 'cancelled-history',
        match_id: null,
        match_name: '已刪除場次',
        payment_status: 'cancelled',
        has_payment_history: true,
        cancelled_reason: '比賽已刪除'
      })
    ])

    const wrapper = await mountPanel()

    const closeButton = wrapper.get('[data-testid="close-payment-button"]')
    expect(closeButton.attributes('disabled')).toBeDefined()
    expect(closeButton.text()).toContain('已有付款歷程')

    const deleteButton = wrapper.get('[data-testid="delete-cancelled-group-button"]')
    expect(deleteButton.attributes('disabled')).toBeDefined()
    expect(deleteButton.text()).toContain('保留付款紀錄')
  })

  it('allows an opened group with no payment history to be closed', async () => {
    mocks.list.mockResolvedValue([
      makeItem({ payment_opened_at: '2026-07-01T00:00:00Z' })
    ])

    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="close-payment-button"]').trigger('click')
    await flushPromises()

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining('尚未付款的家長將看不到這場費用'),
      '確認關閉比賽費用繳費',
      expect.objectContaining({ confirmButtonText: '確認關閉' })
    )
    expect(mocks.setOpenState).toHaveBeenCalledWith('match-1', false)
  })

  it('deletes an all-cancelled group with no payment history as one operation', async () => {
    mocks.list.mockResolvedValue([
      makeItem({
        id: 'cancelled-safe',
        match_id: null,
        payment_status: 'cancelled',
        cancelled_reason: '比賽已刪除'
      })
    ])
    mocks.deleteGroup.mockResolvedValue(1)

    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="delete-cancelled-group-button"]').trigger('click')
    await flushPromises()

    expect(mocks.deleteGroup).toHaveBeenCalledWith('cancelled-safe')
    expect(mocks.success).toHaveBeenCalledWith('已刪除 1 筆已取消比賽費用')
  })
})
