import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createEquipmentPaymentSubmission,
  listEquipmentRefundableDirectPaymentItems,
  listEquipmentUnpaidPaymentItems,
  listMyEquipmentPendingRequestPaymentItems,
  listEquipmentPaymentSubmissions,
  listMyEquipmentPaymentItems,
  markEquipmentTransactionsPaid,
  refundEquipmentPaymentSubmission,
  refundEquipmentTransactions,
  reviewEquipmentPaymentSubmission
} from '@/services/equipmentApi'
import type {
  CreateEquipmentPaymentSubmissionPayload,
  EquipmentPendingRequestPaymentItem,
  EquipmentPaymentItem,
  EquipmentPaymentSubmission
} from '@/types/equipment'

export const useEquipmentPaymentsStore = defineStore('equipmentPayments', () => {
  const myItems = ref<EquipmentPaymentItem[]>([])
  const myPendingRequestItems = ref<EquipmentPendingRequestPaymentItem[]>([])
  const reviewSubmissions = ref<EquipmentPaymentSubmission[]>([])
  const adminUnpaidItems = ref<EquipmentPaymentItem[]>([])
  const adminRefundableDirectItems = ref<EquipmentPaymentItem[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)

  const loadMyItems = async (memberId?: string | null) => {
    isLoading.value = true
    error.value = null

    try {
      const [paymentItems, pendingRequestItems] = await Promise.all([
        listMyEquipmentPaymentItems(memberId),
        listMyEquipmentPendingRequestPaymentItems(memberId)
      ])
      myItems.value = paymentItems
      myPendingRequestItems.value = pendingRequestItems
      return myItems.value
    } catch (err: any) {
      error.value = err?.message || '無法載入裝備付款資料'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const submitPayment = async (
    payload: CreateEquipmentPaymentSubmissionPayload,
    memberId?: string | null
  ) => {
    isSaving.value = true

    try {
      const submission = await createEquipmentPaymentSubmission(payload)
      const submittedIds = new Set(payload.transaction_ids)
      myItems.value = myItems.value.map((item) =>
        submittedIds.has(item.transaction_id)
          ? {
            ...item,
            payment_status: 'pending_review',
            payment_submission_id: submission.id
          }
          : item
      )
      await loadMyItems(memberId || null)
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

  const loadAdminUnpaidItems = async () => {
    isLoading.value = true
    error.value = null

    try {
      adminUnpaidItems.value = await listEquipmentUnpaidPaymentItems()
      return adminUnpaidItems.value
    } catch (err: any) {
      error.value = err?.message || '無法載入尚未付款裝備款項'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadAdminRefundableDirectItems = async () => {
    isLoading.value = true
    error.value = null

    try {
      adminRefundableDirectItems.value = await listEquipmentRefundableDirectPaymentItems()
      return adminRefundableDirectItems.value
    } catch (err: any) {
      error.value = err?.message || '無法載入可作廢收款裝備款項'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const reviewSubmission = async (
    submissionId: string,
    status: 'approved' | 'rejected',
    overpaymentAmount = 0
  ) => {
    const updated = await reviewEquipmentPaymentSubmission(submissionId, status, overpaymentAmount)
    reviewSubmissions.value = reviewSubmissions.value.map((submission) =>
      submission.id === updated.id ? updated : submission
    )
    return updated
  }

  const refundSubmission = async (submissionId: string, note?: string | null) => {
    const updated = await refundEquipmentPaymentSubmission(submissionId, note)
    reviewSubmissions.value = reviewSubmissions.value.map((submission) =>
      submission.id === updated.id ? updated : submission
    )
    return updated
  }

  const refundDirectTransactions = async (transactionIds: string[], note?: string | null) => {
    const updatedCount = await refundEquipmentTransactions(transactionIds, note)
    const updatedIds = new Set(transactionIds)
    adminRefundableDirectItems.value = adminRefundableDirectItems.value.filter((item) => !updatedIds.has(item.transaction_id))
    return updatedCount
  }

  const markPaid = async (transactionIds: string[]) => {
    const updatedCount = await markEquipmentTransactionsPaid(transactionIds)
    const updatedIds = new Set(transactionIds)
    adminUnpaidItems.value = adminUnpaidItems.value.filter((item) => !updatedIds.has(item.transaction_id))
    return updatedCount
  }

  return {
    myItems,
    myPendingRequestItems,
    reviewSubmissions,
    adminUnpaidItems,
    adminRefundableDirectItems,
    isLoading,
    isSaving,
    error,
    loadMyItems,
    submitPayment,
    loadReviewSubmissions,
    loadAdminUnpaidItems,
    loadAdminRefundableDirectItems,
    reviewSubmission,
    refundSubmission,
    refundDirectTransactions,
    markPaid
  }
})
