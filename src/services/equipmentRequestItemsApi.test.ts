import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const rpcMock = vi.hoisted(() => vi.fn())
const equipmentApiMocks = vi.hoisted(() => ({
  fetchEquipmentRequestById: vi.fn(),
  uploadEquipmentImages: vi.fn()
}))

vi.mock('@/services/supabase', () => ({
  supabase: { rpc: rpcMock }
}))

vi.mock('@/services/equipmentApi', () => equipmentApiMocks)

describe('equipmentRequestItemsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    equipmentApiMocks.uploadEquipmentImages.mockResolvedValue(['https://example.com/photo.webp'])
    equipmentApiMocks.fetchEquipmentRequestById.mockResolvedValue({ id: 'request-1' })
    rpcMock.mockResolvedValue({ data: null, error: null })
  })

  it('marks only the selected request item ready and reloads its parent request', async () => {
    const { markEquipmentRequestItemReady } = await import('./equipmentRequestItemsApi')

    await expect(markEquipmentRequestItemReady(
      'request-1',
      'item-1',
      'user-1',
      '已備貨'
    )).resolves.toEqual({ id: 'request-1' })

    expect(equipmentApiMocks.uploadEquipmentImages).toHaveBeenCalledWith(
      [],
      'equipment_request_actions/items/item-1/ready'
    )
    expect(rpcMock).toHaveBeenCalledWith('mark_equipment_request_item_ready', {
      p_request_item_id: 'item-1',
      p_user_id: 'user-1',
      p_note: '已備貨',
      p_image_urls: ['https://example.com/photo.webp']
    })
    expect(equipmentApiMocks.fetchEquipmentRequestById).toHaveBeenCalledWith('request-1')
  })

  it('marks only the selected request item picked up and forwards its payment flag', async () => {
    const { markEquipmentRequestItemPickedUp } = await import('./equipmentRequestItemsApi')

    await markEquipmentRequestItemPickedUp(
      'request-1',
      'item-2',
      'user-1',
      '現場領取',
      [],
      true
    )

    expect(rpcMock).toHaveBeenCalledWith('mark_equipment_request_item_picked_up', {
      p_request_item_id: 'item-2',
      p_user_id: 'user-1',
      p_note: '現場領取',
      p_image_urls: ['https://example.com/photo.webp'],
      p_mark_paid: true
    })
  })

  it('returns null when deleting an item also deletes the now-empty request', async () => {
    rpcMock.mockResolvedValue({
      data: [{ request_id: 'request-1', request_deleted: true }],
      error: null
    })
    const { deleteEquipmentPurchaseRequestItem } = await import('./equipmentRequestItemsApi')

    await expect(deleteEquipmentPurchaseRequestItem(
      'request-1',
      'item-1',
      'user-1'
    )).resolves.toBeNull()

    expect(rpcMock).toHaveBeenCalledWith('delete_equipment_purchase_request_item', {
      p_request_item_id: 'item-1',
      p_user_id: 'user-1'
    })
    expect(equipmentApiMocks.fetchEquipmentRequestById).not.toHaveBeenCalled()
  })

  it('preserves database guard errors without attempting a stale reload', async () => {
    const guardError = new Error('已有付款回報或已確認付款的裝備交易不可直接刪除')
    rpcMock.mockResolvedValue({ data: null, error: guardError })
    const { deleteEquipmentPurchaseRequestItem } = await import('./equipmentRequestItemsApi')

    await expect(deleteEquipmentPurchaseRequestItem(
      'request-1',
      'item-1',
      'user-1'
    )).rejects.toBe(guardError)
    expect(equipmentApiMocks.fetchEquipmentRequestById).not.toHaveBeenCalled()
  })

  it('ships atomic item and whole-request RPCs without direct delete policies', () => {
    const migration = readFileSync(
      new URL('../../supabase_zzzzzzzzzzzzz_equipment_request_item_fulfillment_migration.sql', import.meta.url),
      'utf8'
    )

    expect(migration).toContain('create or replace function public.mark_equipment_request_item_ready')
    expect(migration).toContain('create or replace function public.mark_equipment_request_item_picked_up')
    expect(migration).toContain('create or replace function public.delete_equipment_purchase_request_item')
    expect(migration).toContain('create or replace function public.delete_equipment_purchase_request')
    expect(migration).toContain('perform public.delete_equipment_transactions(v_transaction_ids)')
    expect(migration).toContain('drop policy if exists "equipment_request_items_delete_managers"')
    expect(migration).toContain('drop policy if exists "equipment_requests_delete_managers"')
    expect(migration).toContain('and ri.picked_up_at is null')
  })

  it('ships payment RPCs that expose each linked item fulfillment state', () => {
    const migration = readFileSync(
      new URL('../../supabase_zzzzzzzzzzzzzz_equipment_payment_item_fulfillment_status_migration.sql', import.meta.url),
      'utf8'
    )

    expect(migration).toContain('create or replace function public.list_my_equipment_payment_items')
    expect(migration).toContain('create or replace function public.list_equipment_unpaid_payment_items')
    expect(migration).toContain('create or replace function public.list_equipment_refundable_direct_payment_items')
    expect(migration).toContain('create or replace function public.list_equipment_payment_submissions')
    expect(migration).toContain("when ri.picked_up_at is not null then 'picked_up'")
    expect(migration).toContain("when ri.ready_at is not null then 'ready_for_pickup'")
    expect(migration).toContain('coalesce(ri.picked_up_at, r.picked_up_at)')
  })
})
