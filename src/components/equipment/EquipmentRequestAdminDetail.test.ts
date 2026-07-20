// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EquipmentRequestAdminDetail from './EquipmentRequestAdminDetail.vue'
import type { EquipmentRequestAdminRecord } from '@/utils/equipmentPurchaseAdmin'

const requestStoreMock = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
  markReady: vi.fn(),
  markPickedUp: vi.fn(),
  markItemReady: vi.fn(),
  markItemPickedUp: vi.fn(),
  deleteRequest: vi.fn(),
  deleteRequestItem: vi.fn()
}))

vi.mock('@/stores/equipmentRequests', () => ({ useEquipmentRequestsStore: () => requestStoreMock }))
vi.mock('@/stores/equipment', () => ({ useEquipmentStore: () => ({ loadEquipments: vi.fn() }) }))
vi.mock('@/utils/pushNotifications', () => ({
  buildPushEventKey: vi.fn(() => 'event-key'),
  dispatchPushNotification: vi.fn()
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() }
}))

const sourceRequest = {
  id: 'request-1', member_id: 'member-1', requester_user_id: 'profile-1', status: 'pending', notes: null,
  ready_note: null, ready_image_url: null, ready_image_urls: [], pickup_note: null, pickup_image_url: null,
  pickup_image_urls: [], rejection_reason: null, cancel_reason: null, requested_at: '2026-07-15T10:00:00Z',
  requested_by: null, approved_at: null, approved_by: null, ready_at: null, ready_by: null, picked_up_at: null,
  picked_up_by: null, rejected_at: null, rejected_by: null, cancelled_at: null, cancelled_by: null,
  created_at: '2026-07-15T10:00:00Z', updated_at: '2026-07-15T10:00:00Z',
  member: { id: 'member-1', name: '王小明', role: '球員', team_group: null }, requester_profile: null,
  items: [{ id: 'item-1', request_id: 'request-1', equipment_id: 'equipment-1', size: 'M', jersey_number: null,
    quantity: 1, equipment_name_snapshot: '球衣', unit_price_snapshot: 500, equipment_transaction_id: null,
    created_at: '2026-07-15T10:00:00Z', updated_at: '2026-07-15T10:00:00Z' }]
}

const record = {
  key: 'request:request-1', id: 'request-1', area: 'requests', recordType: 'request', status: 'pending',
  statusLabel: '待審核', memberName: '王小明', equipmentSummary: '球衣', amount: 500,
  date: '2026-07-15T10:00:00Z', searchText: '王小明 球衣', subtype: 'pending', source: sourceRequest
} as EquipmentRequestAdminRecord

describe('EquipmentRequestAdminDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestStoreMock.approveRequest.mockResolvedValue(sourceRequest)
    requestStoreMock.markItemReady.mockResolvedValue(sourceRequest)
    requestStoreMock.markItemPickedUp.mockResolvedValue(sourceRequest)
  })

  const mountDetail = (
    canEdit: boolean,
    canDelete = false,
    targetRecord: EquipmentRequestAdminRecord = record
  ) => mount(EquipmentRequestAdminDetail, {
    props: { record: targetRecord, canEdit, canDelete },
    global: {
      stubs: {
        ElTag: { template: '<span><slot /></span>' },
        ElIcon: true,
        AppActionOverflow: { template: '<span><slot /></span>' },
        ElDropdownItem: true,
        EquipmentRequestActionDialog: true
      }
    }
  })

  it('does not expose mutations to fees view-only users', () => {
    const wrapper = mountDetail(false)
    expect(wrapper.text()).not.toContain('核准請購')
    expect(wrapper.find('button[title="刪除請購"]').exists()).toBe(false)
  })

  it('renders delete request as a standalone danger action instead of an overflow item', () => {
    const deleteOnlyWrapper = mountDetail(false, true)
    const deleteButton = deleteOnlyWrapper.get('button[title="刪除請購"]')

    expect(deleteButton.text()).toContain('刪除請購')
    expect(deleteButton.classes()).toContain('text-red-600')
    expect(deleteOnlyWrapper.find('.app-icon-button').exists()).toBe(false)

    const pendingWrapper = mountDetail(true, true)
    expect(pendingWrapper.find('button[title="刪除請購"]').exists()).toBe(true)
    expect(pendingWrapper.find('[command="reject"]').exists()).toBe(true)
    expect(pendingWrapper.find('[command="delete"]').exists()).toBe(false)
  })

  it('approves a pending request and asks the workspace to refresh', async () => {
    const wrapper = mountDetail(true)
    const approveButton = wrapper.findAll('button').find((button) => button.text().includes('核准請購'))
    expect(approveButton).toBeTruthy()
    await approveButton!.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(requestStoreMock.approveRequest).toHaveBeenCalledWith('request-1')
    expect(wrapper.emitted('changed')?.[0]).toEqual([record.key])
  })

  it('keeps the legacy workflow colors for request actions', () => {
    const pendingWrapper = mountDetail(true)
    expect(pendingWrapper.findAll('button').find((button) => button.text().includes('核准請購'))?.classes())
      .toContain('bg-primary')

    const approvedRecord = {
      ...record,
      status: 'processing',
      statusLabel: '處理中',
      source: { ...sourceRequest, status: 'approved' }
    } as EquipmentRequestAdminRecord
    const approvedWrapper = mountDetail(true, false, approvedRecord)
    expect(approvedWrapper.findAll('button').find((button) => button.text().includes('標記備貨完成'))?.classes())
      .toContain('bg-blue-600')

    const readyRecord = {
      ...approvedRecord,
      source: { ...sourceRequest, status: 'ready_for_pickup' }
    } as EquipmentRequestAdminRecord
    const readyWrapper = mountDetail(true, false, readyRecord)
    expect(readyWrapper.findAll('button').find((button) => button.text().includes('完成領取'))?.classes())
      .toContain('bg-emerald-600')
  })

  it('shows independent actions for mixed-status items while retaining the batch footer action', () => {
    const mixedRecord = {
      ...record,
      status: 'processing',
      statusLabel: '處理中',
      source: {
        ...sourceRequest,
        status: 'approved',
        items: [
          sourceRequest.items[0],
          {
            ...sourceRequest.items[0],
            id: 'item-2',
            equipment_id: 'equipment-2',
            equipment_name_snapshot: '球帽',
            ready_at: '2026-07-20T01:00:00.000Z',
            ready_by: 'user-1'
          }
        ]
      }
    } as EquipmentRequestAdminRecord

    const wrapper = mountDetail(true, true, mixedRecord)

    expect(wrapper.get('[data-item-action="ready"][data-item-id="item-1"]').text())
      .toContain('標記備貨完成')
    expect(wrapper.get('[data-item-action="picked_up"][data-item-id="item-2"]').text())
      .toContain('完成領取')
    expect(wrapper.findAll('[data-item-action="delete"]')).toHaveLength(2)
    expect(wrapper.findAll('button').some((button) => (
      !button.attributes('data-item-action') && button.text().includes('標記備貨完成')
    ))).toBe(true)

    const readOnlyWrapper = mountDetail(false, false, mixedRecord)
    expect(readOnlyWrapper.findAll('[data-item-action]')).toHaveLength(0)
  })

  it('submits the selected item without changing the batch action contract', async () => {
    const multiRecord = {
      ...record,
      status: 'processing',
      source: {
        ...sourceRequest,
        status: 'approved',
        items: [
          sourceRequest.items[0],
          { ...sourceRequest.items[0], id: 'item-2', equipment_name_snapshot: '球帽' }
        ]
      }
    } as EquipmentRequestAdminRecord
    const wrapper = mountDetail(true, false, multiRecord)

    await wrapper.get('[data-item-action="ready"][data-item-id="item-1"]').trigger('click')
    const dialog = wrapper.getComponent({ name: 'EquipmentRequestActionDialog' })
    dialog.vm.$emit('confirm', { note: '第一項完成', imageFiles: [] })
    await Promise.resolve()
    await Promise.resolve()

    expect(requestStoreMock.markItemReady).toHaveBeenCalledWith(
      'request-1',
      'item-1',
      '第一項完成',
      []
    )
    expect(requestStoreMock.markReady).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(wrapper.emitted('changed')?.[0]).toEqual([record.key])
    })
  })

  it('deletes only the selected item and leaves the whole-request delete button available', async () => {
    const multiRecord = {
      ...record,
      source: {
        ...sourceRequest,
        items: [
          sourceRequest.items[0],
          { ...sourceRequest.items[0], id: 'item-2', equipment_name_snapshot: '球帽' }
        ]
      }
    } as EquipmentRequestAdminRecord
    const wrapper = mountDetail(false, true, multiRecord)

    await wrapper.get('[data-item-action="delete"][data-item-id="item-2"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(requestStoreMock.deleteRequestItem).toHaveBeenCalledWith('request-1', 'item-2')
    expect(requestStoreMock.deleteRequest).not.toHaveBeenCalled()
    expect(wrapper.find('button[title="刪除請購"]').exists()).toBe(true)
  })
})
