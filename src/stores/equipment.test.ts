import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptHMRUpdate, createPinia, defineStore, setActivePinia } from 'pinia'
import { ref } from 'vue'

const apiMocks = vi.hoisted(() => ({
  saveEquipmentOrder: vi.fn(),
  saveEquipmentAvailableStock: vi.fn(),
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
vi.mock('@/services/equipmentAvailableStockApi', () => ({ saveEquipmentAvailableStock: apiMocks.saveEquipmentAvailableStock }))

describe('equipment store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('updates an existing legacy store with the new save action while preserving loaded data', async () => {
    const useLegacyEquipmentStore = defineStore('equipment', () => ({
      equipments: ref([{id:'hat',name:'已載入的帽子',total_quantity:70}]),
      members: ref([]), isLoading: ref(false), isSaving: ref(false), error: ref(null)
    }))
    const legacyStore = useLegacyEquipmentStore()
    const { useEquipmentStore } = await import('./equipment')

    // Re-evaluating a store module alone reuses the old instance and misses new actions.
    expect(useEquipmentStore()).toBe(legacyStore)
    expect(useEquipmentStore().saveAvailableEquipment).toBeUndefined()
    const hot = { data: {}, invalidate: vi.fn() } as unknown as Parameters<typeof acceptHMRUpdate>[1]
    acceptHMRUpdate(useLegacyEquipmentStore, hot)({useEquipmentStore})

    const store = useEquipmentStore()
    expect(store).toBe(legacyStore)
    expect(store.equipments[0].name).toBe('已載入的帽子')
    expect(typeof store.saveAvailableEquipment).toBe('function')
    apiMocks.saveEquipmentAvailableStock.mockResolvedValueOnce('hat')
    apiMocks.fetchEquipments.mockResolvedValueOnce([{id:'hat',name:'帽子',total_quantity:89}])
    const payload = {name:'帽子',stock:null,stock_reason:null} as any
    await store.saveAvailableEquipment(payload,{id:'hat',expectedUpdatedAt:'revision'})
    expect(apiMocks.saveEquipmentAvailableStock).toHaveBeenCalledWith(payload,{id:'hat',expectedUpdatedAt:'revision'})
    expect(legacyStore.equipments[0].total_quantity).toBe(89)
    expect(legacyStore.isSaving).toBe(false)
    expect(hot.invalidate).not.toHaveBeenCalled()
  })

  it('reloads the authoritative inventory after setting availability and clears saving state on failure', async () => {
    const { useEquipmentStore } = await import('./equipment')
    const store = useEquipmentStore()
    apiMocks.saveEquipmentAvailableStock.mockResolvedValueOnce('hat')
    apiMocks.fetchEquipments.mockResolvedValueOnce([{id:'hat',total_quantity:1,inventory_snapshot:[{size:'S',used_quantity:1,reserved_quantity:0}]}])
    await store.saveAvailableEquipment({stock:{available_quantity:0,sizes:[{size:'S',quantity:0}]}} as any,{id:'hat',expectedUpdatedAt:'old'})
    expect(store.equipments[0].total_quantity).toBe(1)
    expect(store.isSaving).toBe(false)
    apiMocks.saveEquipmentAvailableStock.mockRejectedValueOnce(new Error('庫存已變更'))
    await expect(store.saveAvailableEquipment({} as any)).rejects.toThrow('已變更')
    expect(store.isSaving).toBe(false)
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
