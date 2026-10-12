import { ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMatchesStore } from '@/stores/matches'
import { usePermissionsStore } from '@/stores/permissions'
import { sendMatchReminderNotification } from '@/services/matchReminderNotifications'
import { describePushDispatchIssue } from '@/utils/pushNotifications'
import { isMatchCancelled } from '@/utils/matchPresentation'

export function useMatchReminderAction() {
  const matchesStore = useMatchesStore()
  const permissionsStore = usePermissionsStore()
  const notifyingMatchId = ref<string | null>(null)

  const handleNotifyMatch = async (id: string) => {
    if (notifyingMatchId.value) return
    if (!permissionsStore.can('matches', 'EDIT')) {
      ElMessage.warning('需要比賽紀錄編輯權限才能發送通知')
      return
    }
    const match = matchesStore.matches.find((item) => item.id === id)
    if (!match) { ElMessage.warning('找不到這筆比賽資料'); return }
    if (isMatchCancelled(match)) { ElMessage.warning('已取消賽事不可發送賽前提醒'); return }
    if (!match.match_date || !dayjs(match.match_date).isAfter(dayjs().startOf('day'), 'day')) {
      ElMessage.warning('只有未來賽事可以手動發送通知')
      return
    }
    notifyingMatchId.value = id
    try {
      await ElMessageBox.confirm(`確定要發送「${match.match_name}」的賽事通知嗎？`, '發送賽事通知', {
        type: 'warning', confirmButtonText: '發送', cancelButtonText: '取消'
      })
      const result = await sendMatchReminderNotification(id)
      const skipped = result?.matches?.find((item) => item.match_id === id && item.skipped === true)
      const issue = skipped?.reason === 'cancelled' ? '賽事已取消，已停止發送賽事通知。'
        : skipped?.reason === 'unavailable' ? '無法確認賽事最新狀態，已停止發送；請重新整理後再試。'
        : !result ? '通知派送結果不明，請稍後再確認接收裝置。'
        : (result.match_count ?? 0) === 0 ? '找不到可發送通知的賽事。'
          : (result.created_count ?? 0) === 0 && (result.duplicate_count ?? 0) > 0
            ? '這場賽事通知已發送過，系統略過重複推播。' : describePushDispatchIssue(result)
      if (issue) ElMessage.warning(issue)
      else ElMessage.success(`已發送賽事通知：${match.match_name}`)
    } catch (error: any) {
      if (error !== 'cancel' && error !== 'close') ElMessage.error(`通知發送失敗：${error?.message || '請稍後再試'}`)
    } finally {
      notifyingMatchId.value = null
    }
  }
  return { notifyingMatchId, handleNotifyMatch }
}
