import { computed } from 'vue'
import type { MyPaymentMember } from '@/types/payments'
import { isProfileAccessAllowed, type ProfileAccessInput } from '@/utils/profileAccess'

type PaymentProfile = ProfileAccessInput & { role?: string }

export function usePaymentSubmissionAccess(
  profile: () => PaymentProfile | null | undefined,
  members: () => MyPaymentMember[],
  selectedMember: () => MyPaymentMember | null
) {
  const hasActiveProfile = computed(() => Boolean(profile()) && isProfileAccessAllowed(profile()))
  const isPaymentAdmin = computed(() => hasActiveProfile.value && profile()?.role === 'ADMIN')
  const linkedMembers = computed(() => members().filter((member) => member.is_linked !== false))
  const submissionMembers = computed(() => !hasActiveProfile.value
    ? []
    : isPaymentAdmin.value ? members() : linkedMembers.value)
  const canCreateSubmissionForSelectedMember = computed(() =>
    submissionMembers.value.some((member) => member.member_id === selectedMember()?.member_id)
  )
  const defaultSubmissionMember = computed(() =>
    submissionMembers.value.find((member) => member.member_id === selectedMember()?.member_id)
      || submissionMembers.value[0] || null
  )
  // Keep the linked-family flow. For an admin viewing another player, load
  // that player's fees instead of querying every member in the roster.
  const quarterlySubmissionMembers = computed(() =>
    isPaymentAdmin.value && selectedMember()?.is_linked === false
      ? submissionMembers.value.filter((member) => member.member_id === selectedMember()?.member_id)
      : submissionMembers.value.filter((member) => member.is_linked !== false)
  )
  const memberSelectorHelperText = computed(() => isPaymentAdmin.value
    ? '管理員可切換球員查看紀錄與新增付款回報，不需要綁定球員。'
    : '切換不同綁定成員時，頁面會同步改成對應的月繳、季繳或不收費模式。')
  const createSubmissionAccessHint = computed(() =>
    selectedMember() && !canCreateSubmissionForSelectedMember.value
      ? '新增付款回報僅限自己的綁定成員；系統管理員可替其他球員回報付款。'
      : '')

  return {
    linkedMembers, submissionMembers, quarterlySubmissionMembers, defaultSubmissionMember,
    canCreateSubmissionForSelectedMember, memberSelectorHelperText, createSubmissionAccessHint
  }
}
