import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { saveEquipmentOrder } from '@/services/equipmentOrderApi'
import { saveEquipmentAvailableStock } from '@/services/equipmentAvailableStockApi'
import { sortEquipments } from '@/utils/equipmentOrder'
import {
  createEquipment,
  createEquipmentInventoryAdjustment,
  createEquipmentTransaction,
  deleteEquipment,
  deleteEquipmentTransaction,
  fetchEquipmentInventoryAdjustments,
  fetchEquipmentMembers,
  fetchEquipmentTransactions,
  fetchEquipments,
  updateEquipment
} from '@/services/equipmentApi'
import type {
  Equipment,
  EquipmentAvailableFormPayload,
  EquipmentFormPayload,
  EquipmentInventoryAdjustmentPayload,
  EquipmentMemberSummary,
  EquipmentTransactionPayload
} from '@/types/equipment'

export const useEquipmentStore = defineStore('equipment', () => {
  const equipments = ref<Equipment[]>([])
  const members = ref<EquipmentMemberSummary[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)

  const equipmentById = computed(() => new Map(equipments.value.map((equipment) => [equipment.id, equipment])))

  const loadEquipments = async () => {
    isLoading.value = true
    error.value = null

    try {
      equipments.value = await fetchEquipments()
      return equipments.value
    } catch (err: any) {
      error.value = err?.message || '無法載入裝備資料'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadMembers = async () => {
    members.value = await fetchEquipmentMembers()
    return members.value
  }

  const saveEquipment = async (
    payload: EquipmentFormPayload,
    options: { id?: string | null; imageFiles?: File[] } = {}
  ) => {
    isSaving.value = true

    try {
      const saved = options.id
        ? await updateEquipment(options.id, payload, options.imageFiles)
        : await createEquipment(payload, options.imageFiles)

      const index = equipments.value.findIndex((equipment) => equipment.id === saved.id)
      if (index === -1) {
        equipments.value = [saved, ...equipments.value]
      } else {
        const next = [...equipments.value]
        next[index] = {
          ...saved,
          equipment_transactions: next[index].equipment_transactions || saved.equipment_transactions || [],
          inventory_adjustments: next[index].inventory_adjustments || saved.inventory_adjustments || [],
          reserved_request_items: next[index].reserved_request_items || saved.reserved_request_items || [],
          ...(
            Array.isArray(next[index].inventory_snapshot) || Array.isArray(saved.inventory_snapshot)
              ? { inventory_snapshot: next[index].inventory_snapshot || saved.inventory_snapshot || [] }
              : {}
          )
        }
        equipments.value = next
      }

      return saved
    } finally {
      isSaving.value = false
    }
  }

  const removeEquipment = async (equipmentId: string) => {
    await deleteEquipment(equipmentId)
    equipments.value = equipments.value.filter((equipment) => equipment.id !== equipmentId)
  }

  const saveAvailableEquipment = async (
    payload: EquipmentAvailableFormPayload,
    options: { id?: string | null; expectedUpdatedAt?: string | null; imageFiles?: File[] } = {}
  ) => {
    if (isSaving.value) return
    isSaving.value = true
    try {
      const id = await saveEquipmentAvailableStock(payload, options)
      await loadEquipments()
      return equipmentById.value.get(id)
    } finally {
      isSaving.value = false
    }
  }

  const reorderEquipments = async (equipmentIds: string[], expectedIds: string[]) => {
    await saveEquipmentOrder(equipmentIds, expectedIds)
    equipments.value = sortEquipments(equipments.value, equipmentIds)
  }

  const loadTransactions = async (equipmentId: string) => {
    const transactions = await fetchEquipmentTransactions(equipmentId)
    equipments.value = equipments.value.map((equipment) => {
      if (equipment.id !== equipmentId) return equipment
      return { ...equipment, equipment_transactions: transactions }
    })
    return transactions
  }

  const loadInventoryAdjustments = async (equipmentId: string) => {
    const adjustments = await fetchEquipmentInventoryAdjustments(equipmentId)
    equipments.value = equipments.value.map((equipment) => {
      if (equipment.id !== equipmentId) return equipment
      return { ...equipment, inventory_adjustments: adjustments }
    })
    return adjustments
  }

  const loadHistory = async (equipmentId: string) => {
    const [transactions, adjustments] = await Promise.all([
      fetchEquipmentTransactions(equipmentId),
      fetchEquipmentInventoryAdjustments(equipmentId)
    ])

    equipments.value = equipments.value.map((equipment) => {
      if (equipment.id !== equipmentId) return equipment
      return {
        ...equipment,
        equipment_transactions: transactions,
        inventory_adjustments: adjustments
      }
    })

    return { transactions, adjustments }
  }

  const addTransaction = async (payload: EquipmentTransactionPayload) => {
    const transaction = await createEquipmentTransaction(payload)
    await loadEquipments()
    return transaction
  }

  const addInventoryAdjustment = async (payload: EquipmentInventoryAdjustmentPayload) => {
    isSaving.value = true

    try {
      const adjustment = await createEquipmentInventoryAdjustment(payload)
      await loadEquipments()
      return adjustment
    } finally {
      isSaving.value = false
    }
  }

  const removeTransaction = async (transactionId: string) => {
    await deleteEquipmentTransaction(transactionId)
    await loadEquipments()
  }

  return {
    equipments,
    members,
    equipmentById,
    isLoading,
    isSaving,
    error,
    loadEquipments,
    loadMembers,
    saveEquipment,
    saveAvailableEquipment,
    removeEquipment,
    reorderEquipments,
    loadTransactions,
    loadInventoryAdjustments,
    loadHistory,
    addTransaction,
    addInventoryAdjustment,
    removeTransaction
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useEquipmentStore, import.meta.hot))
}
