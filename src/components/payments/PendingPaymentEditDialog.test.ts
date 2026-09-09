// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingPaymentSubmission } from '@/types/pendingPayments'

const { update, confirm, warning } = vi.hoisted(() => ({ update: vi.fn(), confirm: vi.fn(), warning: vi.fn() }))
vi.mock('@/services/pendingPayments', async (original) => ({ ...await original<object>(), updateMyPendingPaymentSubmission: update }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), warning }, ElMessageBox: { confirm } }))
import PendingPaymentEditDialog from './PendingPaymentEditDialog.vue'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'

const Input = defineComponent({ props: ['modelValue', 'disabled', 'size'], emits: ['update:modelValue'], template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
const NumberInput = defineComponent({ props: ['modelValue', 'disabled', 'size'], emits: ['update:modelValue'], template: '<input type="number" :value="modelValue" :disabled="disabled" />' })
const submission = (kind: PendingPaymentSubmission['kind'] = 'membership'): PendingPaymentSubmission => ({
  id:'s1', kind, label:'月／季費', updated_at:'2026-09-07T00:00:00.000001Z', payment_method:'銀行轉帳', account_last_5:'12345', remittance_date:'2026-09-06', note:'原備註', amount_mismatch_reason:null,
  items:[{id:'line1', member_id:'member1', label:'小明｜2026-08', expected_amount:1000, balance_amount:200, reported_external_amount:800, available_balance:500}]
})
const create = (value = submission()) => mount(PendingPaymentEditDialog, { props: { submission: value }, global: { stubs: {
  'el-dialog': { template:'<div><slot /><slot name="footer" /></div>' },
  'el-form': { template:'<form><slot /></form>' },
  'el-form-item': { props:['error','label'], template:'<div>{{label}}<slot /><span>{{error}}</span></div>' },
  'el-input': Input, 'el-input-number': NumberInput, 'el-date-picker': Input,
  'el-select': { template:'<select><slot /></select>' }, 'el-option': true,
  AppDialogFooter: true
} } })
const save = async (wrapper: ReturnType<typeof create>) => {
  wrapper.getComponent(AppDialogFooter).vm.$emit('confirm')
  await flushPromises()
}

describe('PendingPaymentEditDialog', () => {
  beforeEach(() => { vi.clearAllMocks(); update.mockResolvedValue(undefined); confirm.mockResolvedValue('confirm') })

  it('prefills and saves only report fields with the original version', async () => {
    const record = submission()
    const wrapper = create(record)
    expect(wrapper.get('input[aria-label="匯款帳號後五碼"]').element).toHaveProperty('value','12345')
    await wrapper.get('input[aria-label="備註"]').setValue('更新備註')
    await save(wrapper)
    expect(update).toHaveBeenCalledWith(record, expect.objectContaining({ note:'更新備註', items:[{id:'line1', balance_amount:200, reported_external_amount:800}] }))
    expect(update.mock.calls[0]![1]).not.toHaveProperty('expected_amount')
    expect(record.note).toBe('原備註')
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('requires a reason and second confirmation for changed reported money', async () => {
    const wrapper = create()
    wrapper.findAllComponents(NumberInput)[1]!.vm.$emit('update:modelValue',700)
    await save(wrapper)
    expect(update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('實付金額不同時，請填寫金額異常原因。')
    await wrapper.get('input[aria-label="金額異常原因"]').setValue('少匯 100 元')
    confirm.mockRejectedValueOnce('cancel')
    await save(wrapper)
    expect(update).not.toHaveBeenCalled()
    await save(wrapper)
    expect(update).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('validates available balance and transfer account before submitting', async () => {
    const wrapper = create()
    wrapper.findAllComponents(NumberInput)[0]!.vm.$emit('update:modelValue',600)
    await wrapper.get('input[aria-label="匯款帳號後五碼"]').setValue('12')
    await save(wrapper)
    expect(update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('球員可用餘額不足')
    expect(wrapper.text()).toContain('請輸入匯款帳號後五碼')
  })

  it.each(['equipment','match'] as const)('preserves system amount for %s and adjusts cash when balance changes', async (kind) => {
    const wrapper = create(submission(kind))
    expect(wrapper.findAllComponents(NumberInput)[1]!.props('disabled')).toBe(true)
    wrapper.findAllComponents(NumberInput)[0]!.vm.$emit('update:modelValue',300)
    await save(wrapper)
    expect(update.mock.calls[0]![1].items[0]).toEqual({id:'line1',balance_amount:300,reported_external_amount:700})
  })

  it('requests a fresh list and discards an editor after an approval/version conflict', async () => {
    update.mockRejectedValueOnce({code:'P0002'})
    const wrapper = create()
    await save(wrapper)
    expect(wrapper.emitted('conflict')).toHaveLength(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(warning).toHaveBeenCalled()
  })

  it('keeps user input available after a network failure', async () => {
    update.mockRejectedValueOnce({message:'網路連線失敗'})
    const wrapper = create()
    await save(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toBe('網路連線失敗')
    expect(wrapper.emitted('conflict')).toBeUndefined()
    expect(wrapper.get('input[aria-label="備註"]').element).toHaveProperty('value','原備註')
  })

  it('does not let a double click or close interrupt an in-flight save', async () => {
    let finish!: () => void
    update.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const wrapper = create()
    await save(wrapper)
    await save(wrapper)
    wrapper.getComponent(AppDialogFooter).vm.$emit('cancel')
    expect(update).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('close')).toBeUndefined()
    finish(); await flushPromises()
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('preserves all grouped quarter lines and disallows edits to missing snapshots', async () => {
    const record = submission()
    record.items.push({id:'line2',member_id:'member2',label:'小華｜2026-Q3',expected_amount:null,balance_amount:0,reported_external_amount:500,available_balance:0})
    const wrapper = create(record)
    expect(wrapper.findAllComponents(NumberInput)).toHaveLength(2)
    expect(wrapper.text()).toContain('舊回報缺少應收快照')
    await save(wrapper)
    expect(update.mock.calls[0]![1].items).toHaveLength(2)
    expect(update.mock.calls[0]![1].items[1]).toEqual({id:'line2',balance_amount:0,reported_external_amount:500})
  })
})
