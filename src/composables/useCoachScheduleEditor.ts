import { computed, onBeforeUnmount, onMounted, reactive, ref, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { coachSchedulesApi } from '@/services/coachSchedulesApi'
import type { CoachScheduleEvent, CoachScheduleSaveInput, CoachScheduleStatus, SchedulableCoach } from '@/types/coachSchedule'
import { getCoachScheduleEventKey } from '@/utils/coachSchedules'

export type CoachScheduleFormState = { coachProfileIds: string[]; status: CoachScheduleStatus; note: string }

const initialForm = (event: CoachScheduleEvent): CoachScheduleFormState => ({
  coachProfileIds: [...event.coach_profile_ids], status: event.status, note: event.note || ''
})
const signature = (form: CoachScheduleFormState) => JSON.stringify({
  ...form, coachProfileIds: [...form.coachProfileIds].sort()
})

export const useCoachScheduleEditor = (
  month: Ref<string>, permissions: { canCreate: Ref<boolean>; canEdit: Ref<boolean>; canDelete: Ref<boolean> },
  hasOpenDialog: () => boolean
) => {
  const coaches = ref<SchedulableCoach[]>([])
  const events = ref<CoachScheduleEvent[]>([])
  const eventForms = reactive<Record<string, CoachScheduleFormState>>({})
  const savingKeys = reactive(new Set<string>())
  const deletingIds = reactive(new Set<string>())
  const isLoading = ref(false)
  const isCoachLoading = ref(false)
  let loadGeneration = 0

  const getEventForm = (event: CoachScheduleEvent) => eventForms[getCoachScheduleEventKey(event)] ||= initialForm(event)
  const isEventDirty = (event: CoachScheduleEvent) => signature(getEventForm(event)) !== signature(initialForm(event))
  const isDirty = computed(() => events.value.some(isEventDirty))
  const confirmDiscard = async () => {
    if (!isDirty.value) return true
    try {
      await ElMessageBox.confirm('尚有未儲存的排班變更，是否捨棄並重新載入？', '未儲存的變更', {
        confirmButtonText: '捨棄變更', cancelButtonText: '繼續編輯', type: 'warning'
      })
      return true
    } catch { return false }
  }

  const applyEvents = (incoming: CoachScheduleEvent[], preserveDirty = false, savedKey?: string) => {
    const kept = new Map(events.value.filter((event) => preserveDirty && isEventDirty(event)
      && getCoachScheduleEventKey(event) !== savedKey).map((event) => [getCoachScheduleEventKey(event), event]))
    const next = incoming.map((event) => kept.get(getCoachScheduleEventKey(event)) || event)
    for (const [key, event] of kept) {
      if (!next.some((row) => getCoachScheduleEventKey(row) === key)) next.push(event)
    }
    for (const key of Object.keys(eventForms)) if (!kept.has(key)) delete eventForms[key]
    events.value = next
    for (const event of next) getEventForm(event)
  }

  const loadMonth = async (preserveDirty = false, savedKey?: string) => {
    const generation = ++loadGeneration
    const requestedMonth = month.value
    isLoading.value = true
    try {
      const payload = await coachSchedulesApi.listAdminMonth(requestedMonth)
      if (generation === loadGeneration && requestedMonth === month.value) applyEvents(payload.events, preserveDirty, savedKey)
    } catch (error: any) {
      if (generation === loadGeneration) ElMessage.error(error?.message || '無法載入教練排班')
    } finally {
      if (generation === loadGeneration) isLoading.value = false
    }
  }

  const loadCoaches = async () => {
    isCoachLoading.value = true
    try { coaches.value = await coachSchedulesApi.listSchedulableCoaches() }
    catch (error: any) { ElMessage.error(error?.message || '無法載入可排班教練') }
    finally { isCoachLoading.value = false }
  }

  const buildSaveInput = (event: CoachScheduleEvent): CoachScheduleSaveInput => {
    const form = getEventForm(event)
    return {
      ...event, status: form.status, note: form.note,
      coach_profile_ids: [...form.coachProfileIds]
    }
  }

  const saveEvent = async (event: CoachScheduleEvent) => {
    if (event.is_persisted ? !permissions.canEdit.value : !permissions.canCreate.value) return
    const key = getCoachScheduleEventKey(event)
    if (savingKeys.has(key)) return
    savingKeys.add(key)
    try {
      const fresh = await coachSchedulesApi.listAdminMonth(month.value)
      const latest = fresh.events.find((row) => getCoachScheduleEventKey(row) === key)
      if (!latest || latest.id !== event.id || latest.updated_at !== event.updated_at
        || signature(initialForm(latest)) !== signature(initialForm(event))) {
        throw new Error('排班已因請假或其他操作更新，請重新整理後再編輯。')
      }
      if (getEventForm(event).coachProfileIds.some((id) => latest.unavailable_coach_profile_ids?.includes(id))) {
        throw new Error('選取的教練已請假，請重新整理後改選可排班教練。')
      }
      await coachSchedulesApi.saveEvent(buildSaveInput(event))
      ElMessage.success('教練排班已儲存')
      await loadMonth(true, key)
    } catch (error: any) { ElMessage.error(error?.message || '儲存教練排班失敗') }
    finally { savingKeys.delete(key) }
  }

  const deleteEvent = async (event: CoachScheduleEvent) => {
    if (!event.id || !permissions.canDelete.value || deletingIds.has(event.id)) return
    try {
      await ElMessageBox.confirm(`確定刪除「${event.title}」的教練排班？候選活動仍會保留，可重新指定教練。`, '刪除教練排班', {
        type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消'
      })
    } catch { return }
    deletingIds.add(event.id)
    try {
      await coachSchedulesApi.deleteEvent(event.id)
      ElMessage.success('教練排班已刪除')
      await loadMonth(true, getCoachScheduleEventKey(event))
    } catch (error: any) { ElMessage.error(error?.message || '刪除教練排班失敗') }
    finally { deletingIds.delete(event.id) }
  }

  const reload = async () => { if (await confirmDiscard()) await Promise.all([loadMonth(), loadCoaches()]) }
  const refreshVisible = () => {
    if (document.visibilityState !== 'hidden' && !isDirty.value && !hasOpenDialog()
      && !isLoading.value && !savingKeys.size && !deletingIds.size) void Promise.all([loadMonth(), loadCoaches()])
  }
  onMounted(() => {
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
  })
  onBeforeUnmount(() => {
    loadGeneration += 1
    window.removeEventListener('focus', refreshVisible)
    document.removeEventListener('visibilitychange', refreshVisible)
  })
  return { coaches, events, eventForms, savingKeys, deletingIds, isLoading, isCoachLoading,
    getEventForm, buildSaveInput, isDirty, confirmDiscard, loadMonth, loadCoaches, saveEvent, deleteEvent, reload }
}
