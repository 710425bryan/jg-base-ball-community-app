// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MyMatchFeesPanel from './MyMatchFeesPanel.vue'
import type { MatchFeeItem } from '@/types/matchFees'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  balance: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  success: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} })
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ profile: null })
}))

vi.mock('@/services/matchFees', () => ({
  listMyMatchFeeItems: mocks.list,
  createMatchPaymentSubmission: vi.fn()
}))

vi.mock('@/services/playerBalances', () => ({
  getPlayerBalance: mocks.balance
}))

vi.mock('@/utils/pushNotifications', () => ({
  buildGroupedPushEventKey: vi.fn(() => 'event-key'),
  dispatchPushNotification: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    error: mocks.error,
    warning: mocks.warning
  }
}))

const makeHistoryItem = (overrides: Partial<MatchFeeItem> = {}): MatchFeeItem => ({
  id: 'item-history',
  match_id: 'match-history',
  member_id: 'member-1',
  member_name: '王小明',
  match_name: '付款歷程場次',
  tournament_name: null,
  match_date: '2026-07-20',
  match_time: '09:00 - 10:30',
  category_group: null,
  fee_month: '2026-07',
  amount: 100,
  payment_status: 'pending_review',
  payment_submission_id: 'submission-1',
  paid_at: null,
  cancelled_reason: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  ...overrides
})

const mountPanel = async () => {
  const wrapper = mount(MyMatchFeesPanel, {
    props: {
      memberId: 'member-1',
      unifiedMode: true
    },
    global: {
      stubs: {
        AppLoadingState: true,
        PaymentAccountInfoCard: true,
        PaymentSubmissionSummary: true,
        'el-dialog': true,
        'el-form': true,
        'el-form-item': true,
        'el-date-picker': true,
        'el-select': true,
        'el-option': true,
        'el-input': true
      }
    }
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.balance.mockResolvedValue(0)
})

describe('MyMatchFeesPanel', () => {
  it('shows no payable rows or summary amount when the guarded RPC returns no opened fees', async () => {
    mocks.list.mockResolvedValue([])

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('管理者開放繳費後才會顯示')
    expect(wrapper.text()).toContain('目前沒有已開放的比賽費用項目')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)

    const summaries = wrapper.emitted('summary') || []
    expect(summaries.at(-1)?.[0]).toMatchObject({
      unpaidCount: 0,
      unpaidTotal: 0,
      pendingCount: 0,
      pendingTotal: 0
    })
  })

  it('shows an opened unpaid fee and removes it from payment choices after a closed-state refresh', async () => {
    const openedItem = makeHistoryItem({
      payment_status: 'unpaid',
      payment_submission_id: null,
      payment_opened_at: '2026-07-01T00:00:00Z',
      has_payment_history: false
    })
    mocks.list
      .mockResolvedValueOnce([openedItem])
      .mockResolvedValueOnce([])

    const wrapper = await mountPanel()
    const checkbox = wrapper.get('input[type="checkbox"]')
    await checkbox.setValue(true)

    const summaries = wrapper.emitted('summary') || []
    expect(summaries.at(-1)?.[0]).toMatchObject({ unpaidCount: 1, unpaidTotal: 100 })

    await (wrapper.vm as any).loadItems()
    await flushPromises()

    expect(wrapper.text()).toContain('目前沒有已開放的比賽費用項目')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })

  it('keeps an existing pending payment history visible when returned by the guarded RPC', async () => {
    mocks.list.mockResolvedValue([makeHistoryItem()])

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('付款歷程場次')
    expect(wrapper.text()).toContain('待確認')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })

  it('shows a rejected or rolled-back history as closed instead of making it payable', async () => {
    mocks.list.mockResolvedValue([makeHistoryItem({
      payment_status: 'unpaid',
      payment_submission_id: null,
      payment_opened_at: null,
      has_payment_history: true
    })])

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('已關閉')
    expect(wrapper.text()).toContain('管理者重新開放前無法再次付款')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)

    const summaries = wrapper.emitted('summary') || []
    expect(summaries.at(-1)?.[0]).toMatchObject({ unpaidCount: 0, unpaidTotal: 0 })
  })
})
