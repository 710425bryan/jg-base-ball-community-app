// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CoachLeaveRequestTable from './CoachLeaveRequestTable.vue'
import type { CoachLeaveRequest } from '@/types/coachLeaveRequest'

const base: CoachLeaveRequest = {
  id: 'leave-a', coach_profile_id: 'coach-a', coach_name: '王教練', coach_nickname: '小王',
  start_date: '2026-10-05', end_date: '2026-10-05', time_segment: 'morning', reason: null, status: 'active',
  created_at: '2026-10-01', updated_at: '2026-10-01T00:00:00Z'
}
const stubs = { 'el-button': { props: ['disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' } }
const mountTable = (props: Partial<InstanceType<typeof CoachLeaveRequestTable>['$props']> = {}) => mount(CoachLeaveRequestTable, {
  props: { leaves: [base], canEdit: true, canCancel: true, ...props } as any, global: { stubs }
})

describe('CoachLeaveRequestTable', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T04:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('renders one row per leave with nickname, segment, status and reason fallback', () => {
    const wrapper = mountTable()
    const row = wrapper.get('[data-test="coach-leave-row"]')
    expect(wrapper.findAll('th').map((th) => th.text())).toEqual(['教練', '請假日期', '時段', '狀態', '原因', '操作'])
    expect(row.attributes('id')).toBe('coach-leave-leave-a')
    expect(row.text()).toContain('小王')
    expect(row.text()).toContain('有效')
    expect(row.text()).toContain('未填寫原因')
  })

  it('emits edit and cancel, and disables actions while another leave is cancelling', async () => {
    const wrapper = mountTable()
    await wrapper.get('[data-test="edit-leave"]').trigger('click')
    await wrapper.get('[data-test="cancel-leave"]').trigger('click')
    expect(wrapper.emitted('edit')![0]).toEqual([base])
    expect(wrapper.emitted('cancel')![0]).toEqual([base])
    await wrapper.setProps({ cancellingId: 'other' })
    expect(wrapper.get('[data-test="cancel-leave"]').attributes('disabled')).toBeDefined()
  })

  it('keeps cancelled, ended and permission-less rows read-only and highlights the deep-linked row', () => {
    const wrapper = mountTable({
      leaves: [
        { ...base, id: 'cancelled', status: 'cancelled' },
        { ...base, id: 'ended', start_date: '2026-09-28', end_date: '2026-10-01' }
      ],
      highlightId: 'ended'
    })
    const rows = wrapper.findAll('[data-test="coach-leave-row"]')
    expect(rows[0]!.text()).toContain('已取消假單保留紀錄，不能恢復')
    expect(rows[1]!.text()).toContain('已結束的歷史假單為唯讀')
    expect(rows[1]!.classes()).toContain('bg-primary/5')
    expect(wrapper.find('[data-test="edit-leave"]').exists()).toBe(false)
    const viewOnly = mountTable({ canEdit: false, canCancel: false })
    expect(viewOnly.find('[data-test="cancel-leave"]').exists()).toBe(false)
    expect(viewOnly.text()).toContain('目前為唯讀模式')
  })
})
