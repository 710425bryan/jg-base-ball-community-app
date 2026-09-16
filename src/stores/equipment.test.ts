import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMocks = vi.hoisted(() => ({
  saveEquipmentOrder: vi.fn(),
  createEquipment: vi.fn(),
  createEquipmentInventoryAdjustment: vi.fn(),
  createEquipmentTransaction: vi.fn(),
  deleteEquipment: vi.fn(),
  deleteEquipmentTransaction: vi.fn(),
  fetchEquipmentInventoryAdjustments: vi.fn(),
  fetchEquipmentMembers: vi.fn(),
  fetchEquipmentTransactions: vi.fn(),
  fetchEquipments: vi.fn(),
  updateEquipment: vi.fn()
}))

vi.mock('@/services/equipmentApi', () => apiMocks)
vi.mock('@/services/equipmentOrderApi', () => ({ saveEquipmentOrder: apiMocks.saveEquipmentOrder }))

describe('equipment store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('applies the order only after saving and preserves the list when the RPC rejects', async () => {
    const { useEquipmentStore } = await import('./equipment')
    const store = useEquipmentStore()
    store.equipments = [{ id: 'a' }, { id: 'b' }] as any
    apiMocks.saveEquipmentOrder.mockRejectedValueOnce(new Error('stale order'))
    await expect(store.reorderEquipments(['b', 'a'], ['a', 'b'])).rejects.toThrow('stale order')
    expect(store.equipments.map(item => item.id)).toEqual(['a', 'b'])
    apiMocks.saveEquipmentOrder.mockResolvedValueOnce(undefined)
    await store.reorderEquipments(['b', 'a'], ['a', 'b'])
    expect(store.equipments.map(item => item.id)).toEqual(['b', 'a'])
  })

  it('loads equipments and exposes an id lookup map', async () => {
    apiMocks.fetchEquipments.mockResolvedValue([{ id: 'equipment-1', name: '球衣' }])

    const { useEquipmentStore } = await import('./equipment')
    const store = useEquipmentStore()

    await expect(store.loadEquipments()).resolves.toEqual([{ id: 'equipment-1', name: '球衣' }])
    expect(store.equipmentById.get('equipment-1')).toEqual({ id: 'equipment-1', name: '球衣' })
    expect(store.isLoading).toBe(false)
  })

  it('updates existing equipment while preserving loaded history arrays', async () => {
    apiMocks.fetchEquipments.mockResolvedValue([{
      id: 'equipment-1',
      name: '舊球衣',
      equipment_transactions: [{ id: 'tx-1' }],
      inventory_adjustments: [{ id: 'adj-1' }]
    }])
    apiMocks.updateEquipment.mockResolvedValue({ id: 'equipment-1', name: '新球衣' })

    const { useEquipmentStore } = await import('./equipment')
    const store = useEquipmentStore()

    await store.loadEquipments()
    await store.saveEquipment({ name: '新球衣' } as any, { id: 'equipment-1' })

    expect(apiMocks.updateEquipment).toHaveBeenCalledWith('equipment-1', { name: '新球衣' }, undefined)
    expect(store.equipments[0]).toMatchObject({
      id: 'equipment-1',
      name: '新球衣',
      equipment_transactions: [{ id: 'tx-1' }],
      inventory_adjustments: [{ id: 'adj-1' }]
    })
    expect(store.isSaving).toBe(false)
  })

  it('loads history and refreshes after transaction mutations', async () => {
    apiMocks.fetchEquipments.mockResolvedValueOnce([{ id: 'equipment-1', name: '球衣' }])
    apiMocks.fetchEquipmentTransactions.mockResolvedValue([{ id: 'tx-1' }])
    apiMocks.fetchEquipmentInventoryAdjustments.mockResolvedValue([{ id: 'adj-1' }])
    apiMocks.createEquipmentTransaction.mockResolvedValue({ id: 'tx-2' })
    apiMocks.fetchEquipments.mockResolvedValueOnce([{ id: 'equipment-1', name: '球衣更新' }])

    const { useEquipmentStore } = await import('./equipment')
    const store = useEquipmentStore()

    await store.loadEquipments()
    expect(await store.loadHistory('equipment-1')).toEqual({
      transactions: [{ id: 'tx-1' }],
      adjustments: [{ id: 'adj-1' }]
    })
    await store.addTransaction({ equipment_id: 'equipment-1' } as any)

    expect(apiMocks.createEquipmentTransaction).toHaveBeenCalled()
    expect(store.equipments[0]?.name).toBe('球衣更新')
  })
})
