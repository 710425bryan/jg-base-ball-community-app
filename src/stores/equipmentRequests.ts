import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  approveEquipmentRequest,
  cancelEquipmentRequest,
  createEquipmentPurchaseRequest,
  deleteEquipmentPurchaseRequestWithRollback,
  fetchMyEquipmentRequests,
  fetchReviewEquipmentRequests,
  listMyEquipmentManualPurchaseRecords,
  markEquipmentRequestPickedUp,
  markEquipmentRequestReady,
  rejectEquipmentRequest
} from '@/services/equipmentApi'
import { useAuthStore } from '@/stores/auth'
import type {
  CreateEquipmentPurchaseRequestPayload,
  EquipmentManualPurchaseRecord,
  EquipmentPurchaseRequest
} from '@/types/equipment'

const sortRequests = (requests: EquipmentPurchaseRequest[]) => {
  return [...requests].sort((left, right) => {
    const rightTime = String(right.updated_at || right.created_at || '')
    const leftTime = String(left.updated_at || left.created_at || '')
    return rightTime.localeCompare(leftTime)
  })
}

export const useEquipmentRequestsStore = defineStore('equipmentRequests', () => {
  const authStore = useAuthStore()
  const myRequests = ref<EquipmentPurchaseRequest[]>([])
  const reviewRequests = ref<EquipmentPurchaseRequest[]>([])
  const manualPurchaseRecords = ref<EquipmentManualPurchaseRecord[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)

  const upsertLocalRequest = (request: EquipmentPurchaseRequest | null) => {
    if (!request) return

    const upsert = (rows: EquipmentPurchaseRequest[]) => {
      const index = rows.findIndex((row) => row.id === request.id)
      if (index === -1) return sortRequests([request, ...rows])
      const next = [...rows]
      next[index] = request
      return sortRequests(next)
    }

    myRequests.value = upsert(myRequests.value)
    reviewRequests.value = upsert(reviewRequests.value)
  }

  const loadMyRequests = async (linkedMemberIdsOverride?: string[]) => {
    const userId = authStore.user?.id
    if (!userId) {
      myRequests.value = []
      return []
    }

    isLoading.value = true
    error.value = null

    try {
      let linkedMemberIds: string[] = []

      if (Array.isArray(linkedMemberIdsOverride)) {
        linkedMemberIds = linkedMemberIdsOverride
      } else if (Array.isArray(authStore.profile?.linked_team_member_ids)) {
        linkedMemberIds = authStore.profile.linked_team_member_ids
      }

      myRequests.value = await fetchMyEquipmentRequests(userId, linkedMemberIds)
      return myRequests.value
    } catch (err: any) {
      error.value = err?.message || '無法載入裝備加購申請'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadReviewRequests = async () => {
    isLoading.value = true
    error.value = null

    try {
      reviewRequests.value = await fetchReviewEquipmentRequests()
      return reviewRequests.value
    } catch (err: any) {
      error.value = err?.message || '無法載入裝備請購審核'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadManualPurchaseRecords = async (memberId?: string | null) => {
    isLoading.value = true
    error.value = null

    try {
      manualPurchaseRecords.value = await listMyEquipmentManualPurchaseRecords(memberId || null)
      return manualPurchaseRecords.value
    } catch (err: any) {
      error.value = err?.message || '無法載入管理員新增的裝備購買紀錄'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const createRequest = async (payload: CreateEquipmentPurchaseRequestPayload) => {
    const userId = authStore.user?.id
    if (!userId) throw new Error('尚未登入')

    isSaving.value = true
    try {
      const request = await createEquipmentPurchaseRequest(payload, userId)
      upsertLocalRequest(request)
      return request
    } finally {
      isSaving.value = false
    }
  }

  const approveRequest = async (requestId: string) => {
    const userId = authStore.user?.id
    if (!userId) throw new Error('尚未登入')
    const request = await approveEquipmentRequest(requestId, userId)
    upsertLocalRequest(request)
    return request
  }

  const markReady = async (requestId: string, note?: string | null, imageFile?: File | null) => {
    const userId = authStore.user?.id
    if (!userId) throw new Error('尚未登入')
    const request = await markEquipmentRequestReady(requestId, userId, note, imageFile)
    upsertLocalRequest(request)
    return request
  }

  const markPickedUp = async (requestId: string, note?: string | null, imageFile?: File | null) => {
    const userId = authStore.user?.id
    if (!userId) throw new Error('尚未登入')
    const request = await markEquipmentRequestPickedUp(requestId, userId, note, imageFile)
    upsertLocalRequest(request)
    return request
  }

  const rejectRequest = async (requestId: string, reason?: string | null) => {
    const userId = authStore.user?.id
    if (!userId) throw new Error('尚未登入')
    const request = await rejectEquipmentRequest(requestId, userId, reason)
    upsertLocalRequest(request)
    return request
  }

  const cancelRequest = async (requestId: string, reason?: string | null) => {
    const userId = authStore.user?.id
    if (!userId) throw new Error('尚未登入')
    const request = await cancelEquipmentRequest(requestId, userId, reason)
    upsertLocalRequest(request)
    return request
  }

  const deleteRequest = async (requestId: string) => {
    await deleteEquipmentPurchaseRequestWithRollback(requestId)
    myRequests.value = myRequests.value.filter((request) => request.id !== requestId)
    reviewRequests.value = reviewRequests.value.filter((request) => request.id !== requestId)
  }

  return {
    myRequests,
    reviewRequests,
    manualPurchaseRecords,
    isLoading,
    isSaving,
    error,
    loadMyRequests,
    loadReviewRequests,
    loadManualPurchaseRecords,
    createRequest,
    approveRequest,
    markReady,
    markPickedUp,
    rejectRequest,
    cancelRequest,
    deleteRequest
  }
})
