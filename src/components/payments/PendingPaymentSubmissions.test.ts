// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingPaymentSubmission } from '@/types/pendingPayments'

const { list, remove, confirm } = vi.hoisted(() => ({ list:vi.fn(), remove:vi.fn(), confirm:vi.fn() }))
vi.mock('@/services/pendingPayments', async (original) => ({ ...await original<object>(), listMyPendingPaymentSubmissions:list, deleteMyPendingPaymentSubmission:remove }))
vi.mock('element-plus', () => ({ ElMessage:{success:vi.fn(),error:vi.fn()}, ElMessageBox:{confirm} }))
import PendingPaymentSubmissions from './PendingPaymentSubmissions.vue'
import PendingPaymentEditDialog from './PendingPaymentEditDialog.vue'

const record: PendingPaymentSubmission = { id:'s1',kind:'equipment',label:'裝備款',payment_method:'現金',account_last_5:null,remittance_date:'2026-09-07',updated_at:'2026-09-07T00:00:00Z',note:null,amount_mismatch_reason:null,items:[{id:'s1',member_id:'member1',label:'球衣 L × 2',expected_amount:500,balance_amount:0,reported_external_amount:500,available_balance:0}] }
const create = () => mount(PendingPaymentSubmissions, {props:{memberId:'member1'},global:{stubs:{'el-button':{template:'<button><slot /></button>'}, PendingPaymentEditDialog:true}}})
const button = (wrapper:ReturnType<typeof create>, text:string) => wrapper.findAll('button').find((item) => item.text() === text)!

describe('PendingPaymentSubmissions', () => {
  beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue([record]); remove.mockResolvedValue(undefined); confirm.mockResolvedValue('confirm') })
  it('opens an editor with all items of the selected report', async () => {
    const wrapper = create(); await flushPromises()
    await button(wrapper,'修改回報').trigger('click')
    expect(wrapper.getComponent(PendingPaymentEditDialog).props('submission')).toEqual(record)
  })
  it('deletes only after confirmation and refreshes both list and payment sources', async () => {
    const wrapper = create(); await flushPromises()
    confirm.mockRejectedValueOnce('cancel')
    await button(wrapper,'刪除回報').trigger('click'); await flushPromises()
    expect(remove).not.toHaveBeenCalled()
    list.mockResolvedValueOnce([])
    await button(wrapper,'刪除回報').trigger('click'); await flushPromises()
    expect(remove).toHaveBeenCalledWith(record)
    expect(wrapper.text()).toContain('目前沒有自己送出的待確認回報')
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })
  it('closes stale editing and reloads after a concurrent review', async () => {
    const wrapper = create(); await flushPromises()
    await button(wrapper,'修改回報').trigger('click')
    list.mockResolvedValueOnce([])
    wrapper.getComponent(PendingPaymentEditDialog).vm.$emit('conflict')
    await flushPromises()
    expect(wrapper.getComponent(PendingPaymentEditDialog).props('submission')).toBeNull()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })
  it('ignores a previous member request that finishes after a member switch', async () => {
    let finish!: (value:PendingPaymentSubmission[]) => void
    list.mockImplementationOnce(() => new Promise((resolve) => {finish=resolve}))
    const wrapper = create()
    list.mockResolvedValueOnce([])
    await wrapper.setProps({memberId:'member2'}); await flushPromises()
    finish([record]); await flushPromises()
    expect(wrapper.text()).not.toContain('球衣 L')
    expect(list).toHaveBeenLastCalledWith('member2')
  })
  it('reports loading failures and provides a retry without showing stale actions', async () => {
    list.mockRejectedValueOnce({message:'連線失敗'})
    const wrapper = create(); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('連線失敗')
    expect(wrapper.text()).not.toContain('刪除回報')
    await button(wrapper,'重新載入').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('球衣 L')
  })
})
