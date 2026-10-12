// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, inject, provide } from 'vue'
import { describe, expect, it } from 'vitest'
import MatchesTable from './MatchesTable.vue'
const Table = defineComponent({ props: ['data'], setup(props) { provide('rows', props.data); return {} }, template: '<div><slot/></div>' })
const Column = defineComponent({ setup() { return { rows: inject('rows') } }, template: '<div><div v-for="row in rows"><slot :row="row"/></div></div>' })
const make = (cancelled = false, canEdit = true) => mount(MatchesTable, {
  props: { matches: [{ id: 'm1', match_name: '交流賽', match_date: '2099-10-17', match_time: '09:00', note: '集合時間：08:30', cancelled_at: cancelled ? '2026-10-12' : null }] as any, canEdit, canNotify: true, canDelete: false },
  global: { stubs: { ElTable: Table, ElTableColumn: Column, ElTag: { template: '<span><slot/></span>' }, ElButton: { template: '<button><slot/></button>' }, AppActionOverflow: { template: '<div><slot/></div>' }, ElDropdownItem: { template: '<button><slot/></button>' } } }
})
describe('MatchesTable cancellation', () => {
  it('shows explicit gathering time and emits cancellation from the menu', async () => {
    const wrapper = make()
    expect(wrapper.text()).toContain('集合 08:30')
    await wrapper.findAll('button').find(button => button.text() === '取消比賽')!.trigger('click')
    expect(wrapper.emitted('cancel')).toEqual([['m1']])
    wrapper.unmount()
  })
  it('shows cancellation without score, editing or reminders', () => {
    const wrapper = make(true)
    expect(wrapper.text()).toContain('已取消')
    expect(wrapper.text()).toContain('無須集合')
    expect(wrapper.text()).not.toContain('發送通知')
    expect(wrapper.text()).not.toContain('編輯賽事')
    expect(wrapper.text()).not.toContain('尚未開打')
    wrapper.unmount()
  })
  it('does not offer cancellation without edit permission', () => {
    const wrapper = make(false, false)
    expect(wrapper.text()).not.toContain('取消比賽')
    wrapper.unmount()
  })
  it('offers restoration only on cancelled games with edit permission', async () => {
    const cancelled = make(true)
    await cancelled.findAll('button').find(button => button.text() === '恢復比賽')!.trigger('click')
    expect(cancelled.emitted('restore')).toEqual([['m1']])
    expect(make().text()).not.toContain('恢復比賽')
    expect(make(true, false).text()).not.toContain('恢復比賽')
    await cancelled.setProps({ matches: [{ id: 'm1', match_name: '特訓', match_date: '2099-10-17', match_level: '特訓課', cancelled_at: '2026-10-12' }] as any })
    // The real table is reactive; this fixture checks the eligibility separately.
    const training = mount(MatchesTable, {
      props: { matches: [{ id: 'training', match_name: '特訓', match_date: '2099-10-17', match_level: '特訓課', cancelled_at: '2026-10-12' }] as any, canEdit: true },
      global: { stubs: { ElTable: Table, ElTableColumn: Column, ElTag: { template: '<span><slot/></span>' }, ElButton: true, AppActionOverflow: { template: '<div><slot/></div>' }, ElDropdownItem: { template: '<button><slot/></button>' } } }
    })
    expect(training.text()).not.toContain('恢復比賽')
    cancelled.unmount()
    training.unmount()
  })
})
