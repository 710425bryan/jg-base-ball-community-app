import { ref } from 'vue'

export interface PlayerSoftDeleteTarget {
  id: string
  name: string
}

interface PlayerSoftDeleteOptions {
  getMember: () => PlayerSoftDeleteTarget | null
  canDelete: () => boolean
  isBusy: () => boolean
  confirm: (member: PlayerSoftDeleteTarget) => Promise<unknown>
  softDeleteMember: (memberId: string) => Promise<void>
  invalidateRoster: () => void
  onRemoved: () => void
  refreshRoster: () => Promise<unknown>
  notifySuccess: (message: string) => void
  notifyError: (message: string) => void
  notifyWarning: (message: string) => void
}

const errorText = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message || '請稍後再試。')
  }
  return '請稍後再試。'
}

export const usePlayerSoftDelete = (options: PlayerSoftDeleteOptions) => {
  const isRemoving = ref(false)
  const removalError = ref('')
  const clearRemovalError = () => { removalError.value = '' }
  const showError = (message: string) => {
    removalError.value = message
    options.notifyError(message)
  }

  const confirmSoftDelete = async () => {
    if (isRemoving.value || options.isBusy()) return
    const currentMember = options.getMember()
    if (!currentMember?.id || !options.canDelete()) return

    // Keep the confirmation tied to its original member while awaiting user input.
    const member = { ...currentMember }
    const isCurrentMember = () => options.getMember()?.id === member.id
    clearRemovalError()
    isRemoving.value = true
    try {
      try {
        await options.confirm(member)
      } catch (error) {
        if (error !== 'cancel' && error !== 'close' && isCurrentMember()) {
          showError(`無法開啟刪除確認：${errorText(error)}`)
        }
        return
      }

      if (!isCurrentMember() || options.isBusy()) return
      if (!options.canDelete()) {
        showError('權限已變更，刪除需要隊職員刪除權限，請聯絡管理員協助。')
        return
      }

      try {
        await options.softDeleteMember(member.id)
      } catch (error) {
        if (isCurrentMember()) showError(`刪除失敗：${errorText(error)}`)
        return
      }

      options.invalidateRoster()
      if (isCurrentMember()) options.onRemoved()
      options.notifySuccess(`已刪除「${member.name}」，所有名單均已隱藏，付款與歷史紀錄仍保留。`)
      try {
        await options.refreshRoster()
      } catch {
        options.notifyWarning('已完成刪除，但名單更新失敗，請重新整理頁面。')
      }
    } finally {
      isRemoving.value = false
    }
  }

  return { isRemoving, removalError, clearRemovalError, confirmSoftDelete }
}
