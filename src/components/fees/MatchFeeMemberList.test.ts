// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ElSwitch } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchFeeMemberList from './MatchFeeMemberList.vue'
import type { MatchFeeItem } from '@/types/matchFees'

const mocks = vi.hoisted(() => ({ save: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/services/matchFees', () => ({ setMatchFeeItemExemption: mocks.save }))
vi.mock('element-plus', async (original) => ({
  ...await original<typeof import('element-plus')>(),
  ElMessage: { success: mocks.success, error: mocks.error }
}))
const item = (overrides: Partial<MatchFeeItem> = {}): MatchFeeItem => ({
  id: 'fee-1', match_id: 'match-1', member_id: 'member-1', member_name: '王小明',
  match_name: '測試盃', tournament_name: null, match_date: '2026-09-27', match_time: null,
  category_group: null, fee_month: '2026-09', amount: 500, payment_status: 'unpaid',
  payment_submission_id: null, paid_at: null, cancelled_reason: null,
  created_at: '2026-09-01', updated_at: '2026-09-27T01:00:00Z', ...overrides
})
const mountList = (items = [item()], canEdit = true) => mount(MatchFeeMemberList, {
  props: { items, canEdit, processingIds: new Set<string>() },
  global: { components: { ElSwitch } }
})
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue(undefined) })

describe('MatchFeeMemberList', () => {
  it('saves only the selected player and match with the displayed version, then reloads', async () => {
    const wrapper = mountList()
    await wrapper.get('[role="switch"]').trigger('click')
    await flushPromises()
    expect(mocks.save).toHaveBeenCalledWith('fee-1', true, '2026-09-27T01:00:00Z')
    expect(wrapper.emitted('exemption-updated')).toHaveLength(1)
    await wrapper.setProps({ items: [item({ is_exempt: true, payment_status: 'cancelled' })] })
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('[data-testid="member-amount"]').text()).toBe('免繳')
    expect(wrapper.text()).not.toContain('$500')
    await wrapper.get('[role="switch"]').trigger('click')
    await flushPromises()
    expect(mocks.save).toHaveBeenLastCalledWith('fee-1', false, '2026-09-27T01:00:00Z')
  })
  it('blocks pending and paid fees and hides controls from viewers', async () => {
    const wrapper = mountList([
      item({ payment_status: 'pending_review', payment_submission_id: 'submission' }),
      item({ id: 'paid', payment_status: 'paid', payment_submission_id: 'paid-submission' })
    ])
    for (const control of wrapper.findAll('[role="switch"]')) {
      expect(control.attributes('aria-disabled')).toBe('true')
      await control.trigger('click')
    }
    expect(mocks.save).not.toHaveBeenCalled()
    await wrapper.setProps({ canEdit: false })
    expect(wrapper.find('[role="switch"]').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
  })
  it('keeps the server value after failure and reloads a stale record', async () => {
    mocks.save.mockRejectedValue({ code: 'P0002', message: '費用已更新' })
    const wrapper = mountList()
    await wrapper.get('[role="switch"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(mocks.error).toHaveBeenCalledWith('費用已更新')
    expect(wrapper.emitted('exemption-updated')).toHaveLength(1)
  })
  it('prevents repeated saves while the server is processing', async () => {
    let finish!: () => void
    mocks.save.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
    const wrapper = mountList()
    await wrapper.get('[role="switch"]').trigger('click')
    await wrapper.get('[role="switch"]').trigger('click')
    expect(mocks.save).toHaveBeenCalledTimes(1)
    finish()
    await flushPromises()
  })
})
