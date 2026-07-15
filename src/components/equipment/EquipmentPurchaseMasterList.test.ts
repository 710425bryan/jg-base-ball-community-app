// @vitest-environment jsdom

import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import EquipmentPurchaseMasterList from './EquipmentPurchaseMasterList.vue'
import type { EquipmentAdminRecord } from '@/utils/equipmentPurchaseAdmin'

const records = Array.from({ length: 21 }, (_, index) => ({
  key: `transaction:${index + 1}`,
  id: String(index + 1),
  area: 'payments',
  recordType: 'transaction',
  status: 'unpaid',
  statusLabel: '尚未付款',
  memberName: `球員 ${index + 1}`,
  equipmentSummary: '球衣',
  amount: 500,
  date: '2026-07-15',
  searchText: '球員 球衣',
  subtype: 'transaction',
  source: {}
})) as EquipmentAdminRecord[]

describe('EquipmentPurchaseMasterList', () => {
  it('renders one client-side page and emits the selected record', async () => {
    const wrapper = mount(EquipmentPurchaseMasterList, {
      props: { area: 'payments', status: 'unpaid', records, page: 1 },
      global: {
        stubs: {
          ElIcon: { template: '<span><slot /></span>' },
          ElPagination: { template: '<div data-testid="pagination" />' }
        }
      }
    })

    const rows = wrapper.findAll('button[aria-pressed]')
    expect(rows).toHaveLength(10)
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(true)

    await rows[0].trigger('click')
    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual(records[0])
  })

  it('scrolls the new page first record into view after pagination changes', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    })

    let wrapper: VueWrapper
    wrapper = mount(EquipmentPurchaseMasterList, {
      props: {
        area: 'payments',
        status: 'unpaid',
        records,
        page: 1,
        'onUpdate:page': (page: number) => wrapper.setProps({ page })
      },
      global: {
        stubs: {
          ElIcon: true,
          ElPagination: {
            emits: ['current-change'],
            template: '<button data-testid="next-page" @click="$emit(\'current-change\', 2)">下一頁</button>'
          }
        }
      }
    })

    await wrapper.get('[data-testid="next-page"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-equipment-record-row]')[0].text()).toContain('球員 11')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('keeps the selected row accessible with aria-pressed', () => {
    const wrapper = mount(EquipmentPurchaseMasterList, {
      props: { area: 'payments', status: 'unpaid', records: records.slice(0, 2), selectedKey: records[1].key },
      global: { stubs: { ElIcon: true, ElPagination: true } }
    })

    const selectedRow = wrapper.findAll('button[aria-pressed]')[1]
    expect(selectedRow.attributes('aria-pressed')).toBe('true')
    expect(selectedRow.classes()).toEqual(expect.arrayContaining([
      'border-sky-300',
      'bg-sky-50',
      'ring-sky-200'
    ]))
    expect(selectedRow.classes()).not.toContain('bg-orange-50')
  })

  it('uses the original sky color treatment for unpaid payment badges', () => {
    const wrapper = mount(EquipmentPurchaseMasterList, {
      props: { area: 'payments', status: 'unpaid', records: records.slice(0, 1) },
      global: { stubs: { ElIcon: true, ElPagination: true } }
    })

    expect(wrapper.get('.rounded-full.border').classes()).toEqual(expect.arrayContaining([
      'border-sky-200',
      'bg-sky-50',
      'text-sky-700'
    ]))
    expect(wrapper.get('.rounded-full.border').text()).toBe('尚未付款')
  })

  it.each([
    ['payments', 'unpaid', 'border-sky-100', 'bg-sky-50/70'],
    ['payments', 'review', 'border-emerald-100', 'bg-emerald-50/70'],
    ['payments', 'refundable', 'border-orange-100', 'bg-orange-50/70'],
    ['requests', 'pending', 'border-amber-100', 'bg-amber-50/70'],
    ['requests', 'processing', 'border-blue-100', 'bg-blue-50/60']
  ] as const)('uses the %s/%s status border and background on the master list', (area, status, borderClass, backgroundClass) => {
    const wrapper = mount(EquipmentPurchaseMasterList, {
      props: { area, status, records: [] },
      global: { stubs: { ElIcon: true, ElPagination: true } }
    })

    const list = wrapper.get('section')
    expect(list.classes()).toEqual(expect.arrayContaining([borderClass, backgroundClass]))
    expect(list.attributes('aria-label')).toContain('裝備請購付款主清單')
  })
})
