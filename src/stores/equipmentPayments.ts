import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createEquipmentPaymentSubmission,
  listEquipmentPaymentSubmissions,
  listMyEquipmentPaymentItems,
  reviewEquipmentPaymentSubmission
} from '@/services/equipmentApi'
import type {
  CreateEquipmentPaymentSubmissionPayload,
  EquipmentPaymentItem,
  EquipmentPaymentSubmission
} from '@/types/equipment'

export const useEquipmentPaymentsStore = defineStore('equipmentPayments', () => {
  const myItems = ref<EquipmentPaymentItem[]>([])
  const reviewSubmissions = ref<EquipmentPaymentSubmission[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)

  const loadMyItems = async (memberId?: string | null) => {
    isLoading.value = true
    error.value = null

    try {
      myItems.value = await listMyEquipmentPaymentItems(memberId)
      return myItems.value
    } catch (err: any) {
      error.value = err?.message || '無法載入裝備付款資料'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const submitPayment = async (payload: CreateEquipmentPaymentSubmissionPayload) => {
    isSaving.value = true

    try {
      const submission = await createEquipmentPaymentSubmission(payload)
      await loadMyItems()
      return submission
    } finally {
      isSaving.value = false
    }
  }

  const loadReviewSubmissions = async () => {
    isLoading.value = true
    error.value = null

    try {
      reviewSubmissions.value = await listEquipmentPaymentSubmissions()
      return reviewSubmissions.value
    } catch (err: any) {
      error.value = err?.message || '無法載入裝備付款回報'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const reviewSubmission = async (submissionId: string, status: 'approved' | 'rejected') => {
    const updated = await reviewEquipmentPaymentSubmission(submissionId, status)
    reviewSubmissions.value = reviewSubmissions.value.map((submission) =>
      submission.id === updated.id ? updated : submission
    )
    return updated
  }

  return {
    myItems,
    reviewSubmissions,
    isLoading,
    isSaving,
    error,
    loadMyItems,
    submitPayment,
    loadReviewSubmissions,
    reviewSubmission
  }
})
