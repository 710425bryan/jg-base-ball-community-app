import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createBaseballAbilityRecord,
  createPhysicalTestRecord,
  deleteBaseballAbilityRecord,
  deletePhysicalTestRecord,
  fetchBaseballAbilityRecords,
  fetchPerformanceMemberOptions,
  fetchPhysicalTestRecords,
  updateBaseballAbilityRecord,
  updatePhysicalTestRecord
} from '@/services/performanceApi'
import type {
  BaseballAbilityPayload,
  BaseballAbilityRecord,
  PerformanceMemberOption,
  PerformanceRecordKind,
  PhysicalTestPayload,
  PhysicalTestRecord
} from '@/types/performance'

export const usePerformanceStore = defineStore('performance', () => {
  const members = ref<PerformanceMemberOption[]>([])
  const baseballAbilityRecords = ref<BaseballAbilityRecord[]>([])
  const physicalTestRecords = ref<PhysicalTestRecord[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)

  const loadMembers = async (feature?: PerformanceRecordKind | null) => {
    members.value = await fetchPerformanceMemberOptions(feature)
    return members.value
  }

  const loadBaseballAbilityRecords = async (teamMemberId?: string | null) => {
    isLoading.value = true
    error.value = null

    try {
      baseballAbilityRecords.value = await fetchBaseballAbilityRecords(teamMemberId)
      return baseballAbilityRecords.value
    } catch (err: any) {
      error.value = err?.message || '無法載入棒球能力數據'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadPhysicalTestRecords = async (teamMemberId?: string | null) => {
    isLoading.value = true
    error.value = null

    try {
      physicalTestRecords.value = await fetchPhysicalTestRecords(teamMemberId)
      return physicalTestRecords.value
    } catch (err: any) {
      error.value = err?.message || '無法載入體能測驗數據'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const saveBaseballAbilityRecord = async (
    payload: BaseballAbilityPayload,
    options: { id?: string | null; reloadMemberId?: string | null } = {}
  ) => {
    isSaving.value = true

    try {
      if (options.id) {
        await updateBaseballAbilityRecord(options.id, payload)
      } else {
        await createBaseballAbilityRecord(payload)
      }

      await loadBaseballAbilityRecords(options.reloadMemberId)
    } finally {
      isSaving.value = false
    }
  }

  const savePhysicalTestRecord = async (
    payload: PhysicalTestPayload,
    options: { id?: string | null; reloadMemberId?: string | null } = {}
  ) => {
    isSaving.value = true

    try {
      if (options.id) {
        await updatePhysicalTestRecord(options.id, payload)
      } else {
        await createPhysicalTestRecord(payload)
      }

      await loadPhysicalTestRecords(options.reloadMemberId)
    } finally {
      isSaving.value = false
    }
  }

  const removeBaseballAbilityRecord = async (id: string, reloadMemberId?: string | null) => {
    await deleteBaseballAbilityRecord(id)
    await loadBaseballAbilityRecords(reloadMemberId)
  }

  const removePhysicalTestRecord = async (id: string, reloadMemberId?: string | null) => {
    await deletePhysicalTestRecord(id)
    await loadPhysicalTestRecords(reloadMemberId)
  }

  return {
    members,
    baseballAbilityRecords,
    physicalTestRecords,
    isLoading,
    isSaving,
    error,
    loadMembers,
    loadBaseballAbilityRecords,
    loadPhysicalTestRecords,
    saveBaseballAbilityRecord,
    savePhysicalTestRecord,
    removeBaseballAbilityRecord,
    removePhysicalTestRecord
  }
})
