<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Delete, Medal, Plus, Refresh, Select, Setting, Tickets, Timer } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import { supabase } from '@/services/supabase'
import { trainingApi } from '@/services/trainingApi'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { useTeamGroupsStore } from '@/stores/teamGroups'
import type {
  TrainingAdminRegistration,
  TrainingManualStatus,
  TrainingMember,
  TrainingPointTransaction,
  TrainingRegistrationNotificationDiagnostics,
  TrainingRegistrationNotificationInvokeResult,
  TrainingRegistrationStatus,
  TrainingSession
} from '@/types/training'
import {
  canSubmitTrainingRegistration,
  getTrainingManualStatusLabel,
  getTrainingPointStatusLabel,
  getTrainingRegistrationBlockReason,
  getTrainingRegistrationStatusLabel,
  isActiveTrainingRegistrationStatus
} from '@/utils/training'
import { getUniqueTeamGroupOptions, normalizeTeamGroup } from '@/utils/teamGroups'

type TeamMemberOption = {
  id: string
  name: string
  role: string | null
  team_group: string | null
}

type TrainingTimeRange = [string, string]

type NewTrainingSessionForm = {
  match_name: string
  match_date: string
  match_time_range: TrainingTimeRange
  location: string
  category_group: string
  manual_status: TrainingManualStatus
  registration_start_at: string
  registration_end_at: string
  capacity: number | null
  point_cost: number
}

type PointGrantPreset = {
  label: string
  delta: number
  reason: string
}

const DEFAULT_TRAINING_TIME_RANGE: TrainingTimeRange = ['09:00', '12:00']
const DEFAULT_TRAINING_LOCATION = '中港國小'
const createDefaultTrainingTimeRange = (): TrainingTimeRange => [...DEFAULT_TRAINING_TIME_RANGE]

const router = useRouter()
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const teamGroupsStore = useTeamGroupsStore()

const isLoading = ref(true)
const isRefreshing = ref(false)
const activeTab = ref<'register' | 'manage' | 'points'>('register')
const members = ref<TrainingMember[]>([])
const sessions = ref<TrainingSession[]>([])
const selectedMemberId = ref('')
const selectedAdminSessionId = ref('')
const adminRegistrations = ref<TrainingAdminRegistration[]>([])
const memberPointTransactions = ref<TrainingPointTransaction[]>([])
const managementPointTransactions = ref<TrainingPointTransaction[]>([])
const rosterOptions = ref<TeamMemberOption[]>([])
const isSavingSettings = ref(false)
const isGrantingPoints = ref(false)
const deletingPointTransactionId = ref<string | null>(null)
const isReviewing = ref(false)
const isCreatingAttendance = ref(false)
const isCreateSessionDialogOpen = ref(false)
const isCreatingSession = ref(false)
const isNotificationDiagnosticsDialogOpen = ref(false)
const isLoadingNotificationDiagnostics = ref(false)
const isInvokingNotificationOnce = ref(false)
const notificationDiagnostics = ref<TrainingRegistrationNotificationDiagnostics | null>(null)
const notificationInvokeResult = ref<TrainingRegistrationNotificationInvokeResult | null>(null)

const settingsForm = reactive({
  match_id: '',
  manual_status: 'draft' as TrainingManualStatus,
  registration_start_at: '',
  registration_end_at: '',
  capacity: null as number | null,
  point_cost: 1
})

const newSessionForm = reactive<NewTrainingSessionForm>({
  match_name: '特訓課',
  match_date: dayjs().format('YYYY-MM-DD'),
  match_time_range: createDefaultTrainingTimeRange(),
  location: DEFAULT_TRAINING_LOCATION,
  category_group: '',
  manual_status: 'draft' as TrainingManualStatus,
  registration_start_at: '',
  registration_end_at: '',
  capacity: null as number | null,
  point_cost: 1
})

const pointForm = reactive({
  member_ids: [] as string[],
  delta: 1,
  reason: ''
})

const trainingManageActions = ['CREATE', 'EDIT', 'DELETE'] as const
const canManageTraining = computed(() =>
  trainingManageActions.some((action) => permissionsStore.can('training', action))
)
const canEditTraining = computed(() => permissionsStore.can('training', 'EDIT'))
const canCreateTraining = computed(() => permissionsStore.can('training', 'CREATE'))
const canDeletePoints = computed(() => permissionsStore.can('training', 'DELETE'))
const canGrantPoints = computed(() => canCreateTraining.value || canEditTraining.value)
const canManagePoints = computed(() => canGrantPoints.value || canDeletePoints.value)
const pageSubtitle = computed(() =>
  canManageTraining.value
    ? '球員點數、特訓報名與教練錄取管理'
    : '查看球員點數、特訓報名與錄取狀態'
)
const selectedMember = computed(() => members.value.find((member) => member.member_id === selectedMemberId.value) || null)
const selectedAdminSession = computed(() =>
  sessions.value.find((session) =>
    session.session_id === selectedAdminSessionId.value || session.match_id === selectedAdminSessionId.value
  ) || null
)
const upcomingSessions = computed(() => sessions.value.filter((session) => !dayjs(session.match_date).isBefore(dayjs().startOf('day'))))
const pastSessions = computed(() => sessions.value.filter((session) => dayjs(session.match_date).isBefore(dayjs().startOf('day'))))

const memberAvailablePoints = computed(() => selectedMember.value?.available_points ?? 0)

const statusOptions: Array<{ label: string; value: TrainingManualStatus }> = [
  { label: '草稿', value: 'draft' },
  { label: '開放報名', value: 'open' },
  { label: '暫停報名', value: 'paused' },
  { label: '關閉報名', value: 'closed' },
  { label: '結案', value: 'finalized' }
]

const pointGrantPresets: PointGrantPreset[] = [
  { label: '+1 基本發放', delta: 1, reason: '特訓點數發放' },
  { label: '+2 表現佳', delta: 2, reason: '訓練表現佳' },
  { label: '+3 特別獎勵', delta: 3, reason: '特訓特別獎勵' },
  { label: '-1 點數調整', delta: -1, reason: '點數調整' }
]

const pointGroupOptions = computed(() =>
  getUniqueTeamGroupOptions(
    rosterOptions.value.map((member) => member.team_group),
    teamGroupsStore.options
  ).map((option) => option.value)
)

const selectedPointMemberCount = computed(() => pointForm.member_ids.length)

const formatDateTime = (value?: string | null) => {
  if (!value) return '未設定'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '未設定'
}

const notificationDiagnosticSettingItems = computed(() => {
  const settings = notificationDiagnostics.value?.settings
  return [
    {
      key: 'function-url',
      label: 'Function URL',
      ok: Boolean(settings?.function_url_configured),
      hint: 'app.training_registration_notification_function_url'
    },
    {
      key: 'authorization',
      label: 'Authorization',
      ok: Boolean(settings?.authorization_configured),
      hint: 'app.training_registration_notification_authorization'
    },
    {
      key: 'secret',
      label: 'Secret',
      ok: Boolean(settings?.secret_configured),
      hint: 'app.training_registration_notification_secret'
    }
  ]
})

const notificationBlockerLabels: Record<string, string> = {
  not_training_match: '不是特訓課',
  manual_status_not_open: '手動狀態不是開放報名',
  registration_start_missing: '沒有報名開始時間',
  registration_start_future: '報名開始尚未到',
  registration_end_expired: '報名截止已過'
}

const getNotificationBlockerLabel = (blocker: string) => notificationBlockerLabels[blocker] || blocker

const getNotificationDiagnosticStateLabel = (state: string) => {
  if (state === 'ready') return '可觸發'
  if (state === 'duplicate') return '已建立事件'
  return '條件未滿足'
}

const getNotificationDiagnosticStateType = (state: string) => {
  if (state === 'ready') return 'success'
  if (state === 'duplicate') return 'warning'
  return 'danger'
}

const getCronRunStatusType = (status?: string | null) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('succeed') || normalized === 'success') return 'success'
  if (normalized.includes('fail') || normalized.includes('error')) return 'danger'
  return 'info'
}

const formatSessionDate = (session: TrainingSession) => {
  const date = dayjs(session.match_date)
  if (!date.isValid()) return session.match_date || '未設定日期'
  return `${date.format('MM/DD')} 週${'日一二三四五六'[date.day()]}`
}

const formatTrainingTimeRange = (range: TrainingTimeRange | null | undefined) => {
  const [startTime, endTime] = Array.isArray(range) ? range : []
  return startTime && endTime ? `${startTime} - ${endTime}` : null
}

const toDateTimeInput = (value?: string | null) => {
  if (!value) return ''
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : ''
}

const getSessionStatusClass = (session: TrainingSession) => {
  if (session.manual_status === 'open' && session.is_registration_open) return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  if (session.manual_status === 'paused') return 'bg-amber-50 text-amber-700 border-amber-100'
  if (session.manual_status === 'closed') return 'bg-slate-100 text-slate-600 border-slate-200'
  if (session.manual_status === 'finalized') return 'bg-gray-100 text-gray-500 border-gray-200'
  return 'bg-blue-50 text-blue-600 border-blue-100'
}

const getRegistrationStatusType = (status?: string | null) => {
  if (status === 'selected') return 'success'
  if (status === 'waitlisted') return 'warning'
  if (status === 'rejected' || status === 'cancelled') return 'danger'
  if (status === 'applied') return 'primary'
  return 'info'
}

const canRegister = (session: TrainingSession) =>
  canSubmitTrainingRegistration(session, memberAvailablePoints.value)

const canCancelTrainingRegistration = (session: TrainingSession) =>
  Boolean(
    session.registration_id
    && isActiveTrainingRegistrationStatus(session.registration_status)
    && session.point_status !== 'spent'
  )

const getRegisterDisabledReason = (session: TrainingSession) =>
  getTrainingRegistrationBlockReason(session, memberAvailablePoints.value)

const hydrateSettingsForm = (session: TrainingSession) => {
  settingsForm.match_id = session.match_id
  settingsForm.manual_status = session.manual_status || 'draft'
  settingsForm.registration_start_at = toDateTimeInput(session.registration_start_at)
  settingsForm.registration_end_at = toDateTimeInput(session.registration_end_at)
  settingsForm.capacity = session.capacity
  settingsForm.point_cost = session.point_cost || 1
}

const loadRosterOptions = async () => {
  if (!canGrantPoints.value && !canEditTraining.value) return

  const { data, error } = await supabase
    .from('team_members_safe')
    .select('id, name, role, team_group')
    .in('role', ['球員', '校隊'])
    .neq('status', '退隊')
    .order('role')
    .order('name')

  if (error) throw error
  rosterOptions.value = (data || []).map((member: TeamMemberOption) => ({
    ...member,
    team_group: normalizeTeamGroup(member.team_group) || null
  })) as TeamMemberOption[]
}

const refreshAdminRegistrations = async () => {
  if (!selectedAdminSession.value?.session_id || !canManageTraining.value) {
    adminRegistrations.value = []
    return
  }

  adminRegistrations.value = await trainingApi.listAdminRegistrations(selectedAdminSession.value.session_id)
}

const refreshMemberPointTransactions = async () => {
  if (!selectedMemberId.value) {
    memberPointTransactions.value = []
    return
  }

  memberPointTransactions.value = await trainingApi.listPointTransactions(selectedMemberId.value)
}

const refreshManagementPointTransactions = async () => {
  if (!canManagePoints.value) {
    managementPointTransactions.value = []
    return
  }

  managementPointTransactions.value = await trainingApi.listPointTransactions(null)
}

const refreshData = async () => {
  isRefreshing.value = true

  try {
    const nextMembers = await trainingApi.listMyTrainingMembers()
    members.value = nextMembers

    if (!selectedMemberId.value && nextMembers.length > 0) {
      selectedMemberId.value = nextMembers[0].member_id
    }

    const nextSessions = await trainingApi.listTrainingSessions(selectedMemberId.value || null)
    sessions.value = nextSessions

    const firstManageableSession = nextSessions[0] || null
    if (!selectedAdminSessionId.value && firstManageableSession) {
      selectedAdminSessionId.value = firstManageableSession.session_id || firstManageableSession.match_id
      hydrateSettingsForm(firstManageableSession)
    }

    await Promise.all([
      refreshAdminRegistrations(),
      refreshMemberPointTransactions(),
      refreshManagementPointTransactions(),
      loadRosterOptions()
    ])
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取特訓資料失敗')
  } finally {
    isRefreshing.value = false
    isLoading.value = false
  }
}

const handleMemberChange = async () => {
  sessions.value = await trainingApi.listTrainingSessions(selectedMemberId.value || null)
  await refreshMemberPointTransactions()
}

const handleAdminSessionChange = async () => {
  const session = selectedAdminSession.value
  if (session) hydrateSettingsForm(session)
  await refreshAdminRegistrations()
}

const resetNewSessionForm = () => {
  newSessionForm.match_name = '特訓課'
  newSessionForm.match_date = dayjs().format('YYYY-MM-DD')
  newSessionForm.match_time_range = createDefaultTrainingTimeRange()
  newSessionForm.location = DEFAULT_TRAINING_LOCATION
  newSessionForm.category_group = ''
  newSessionForm.manual_status = 'draft'
  newSessionForm.registration_start_at = ''
  newSessionForm.registration_end_at = ''
  newSessionForm.capacity = null
  newSessionForm.point_cost = 1
}

const openCreateSessionDialog = () => {
  resetNewSessionForm()
  isCreateSessionDialogOpen.value = true
}

const createSessionWithMatch = async () => {
  if (!newSessionForm.match_name.trim()) {
    ElMessage.warning('請填寫特訓課名稱')
    return
  }

  if (!newSessionForm.match_date) {
    ElMessage.warning('請選擇上課日期')
    return
  }

  isCreatingSession.value = true
  try {
    const savedSettings: any = await trainingApi.createSessionWithMatch({
      match_name: newSessionForm.match_name.trim(),
      match_date: newSessionForm.match_date,
      match_time: formatTrainingTimeRange(newSessionForm.match_time_range),
      location: newSessionForm.location || null,
      category_group: newSessionForm.category_group || null,
      manual_status: newSessionForm.manual_status,
      registration_start_at: newSessionForm.registration_start_at || null,
      registration_end_at: newSessionForm.registration_end_at || null,
      capacity: newSessionForm.capacity,
      point_cost: newSessionForm.point_cost
    })

    if (savedSettings?.id) {
      selectedAdminSessionId.value = savedSettings.id
    }

    isCreateSessionDialogOpen.value = false
    ElMessage.success('已新增特訓課與報名設定')
    await refreshData()
  } catch (error: any) {
    ElMessage.error(error?.message || '新增特訓課失敗')
  } finally {
    isCreatingSession.value = false
  }
}

const submitRegistration = async (session: TrainingSession) => {
  if (!selectedMember.value || !session.session_id) return

  try {
    await trainingApi.createRegistration(session.session_id, selectedMember.value.member_id)
    ElMessage.success('已送出特訓報名，等待教練確認')
    await refreshData()
  } catch (error: any) {
    ElMessage.error(error?.message || '特訓報名失敗')
  }
}

const cancelRegistration = async (session: TrainingSession) => {
  if (!session.registration_id) return

  try {
    await ElMessageBox.confirm('確定要取消這場特訓報名嗎？', '取消報名', {
      confirmButtonText: '取消報名',
      cancelButtonText: '保留報名',
      type: 'warning'
    })
    await trainingApi.cancelRegistration(session.registration_id)
    ElMessage.success('已取消報名')
    await refreshData()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '取消報名失敗')
    }
  }
}

const saveSettings = async () => {
  if (!settingsForm.match_id) return

  isSavingSettings.value = true
  try {
    const savedSettings: any = await trainingApi.saveSessionSettings({
      match_id: settingsForm.match_id,
      manual_status: settingsForm.manual_status,
      registration_start_at: settingsForm.registration_start_at || null,
      registration_end_at: settingsForm.registration_end_at || null,
      capacity: settingsForm.capacity,
      point_cost: settingsForm.point_cost
    })
    if (savedSettings?.id) {
      selectedAdminSessionId.value = savedSettings.id
    }
    ElMessage.success('已儲存特訓報名設定，通知會由排程檢查送出')
    await refreshData()
  } catch (error: any) {
    ElMessage.error(error?.message || '儲存設定失敗')
  } finally {
    isSavingSettings.value = false
  }
}

const loadNotificationDiagnostics = async () => {
  isLoadingNotificationDiagnostics.value = true
  try {
    notificationDiagnostics.value = await trainingApi.getRegistrationNotificationDiagnostics(5)
    isNotificationDiagnosticsDialogOpen.value = true
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取通知診斷失敗')
  } finally {
    isLoadingNotificationDiagnostics.value = false
  }
}

const invokeNotificationOnce = async () => {
  if (!canEditTraining.value) {
    ElMessage.warning('需要 training:EDIT 權限才能手動觸發通知')
    return
  }

  isInvokingNotificationOnce.value = true
  try {
    notificationInvokeResult.value = await trainingApi.invokeRegistrationNotificationOnce({
      dryRun: false,
      limit: 20
    })
    ElMessage.success('已觸發一次特訓報名通知檢查，Edge Function 會在背景送出')

    window.setTimeout(() => {
      void loadNotificationDiagnostics()
    }, 4000)
  } catch (error: any) {
    ElMessage.error(error?.message || '手動觸發通知失敗')
  } finally {
    isInvokingNotificationOnce.value = false
  }
}

const reviewRegistration = async (
  registration: TrainingAdminRegistration,
  status: TrainingRegistrationStatus
) => {
  isReviewing.value = true
  try {
    await trainingApi.reviewRegistration(registration.registration_id, status)
    ElMessage.success(`已更新 ${registration.member_name}：${getTrainingRegistrationStatusLabel(status)}`)
    await refreshData()
  } catch (error: any) {
    ElMessage.error(error?.message || '更新報名狀態失敗')
  } finally {
    isReviewing.value = false
  }
}

const publishSelection = async () => {
  if (!selectedAdminSession.value?.session_id) return

  try {
    await trainingApi.publishSelection(selectedAdminSession.value.session_id)
    ElMessage.success('已公布特訓錄取名單')
    await refreshData()
  } catch (error: any) {
    ElMessage.error(error?.message || '公布名單失敗')
  }
}

const createAttendanceEvent = async () => {
  if (!selectedAdminSession.value?.session_id) return

  isCreatingAttendance.value = true
  try {
    const eventId = await trainingApi.createAttendanceEvent(selectedAdminSession.value.session_id)
    ElMessage.success('已建立特訓點名單')
    router.push(`/attendance/${eventId}`)
  } catch (error: any) {
    ElMessage.error(error?.message || '建立點名單失敗')
  } finally {
    isCreatingAttendance.value = false
  }
}

const setPointMembers = (nextMembers: TeamMemberOption[]) => {
  pointForm.member_ids = Array.from(new Set(nextMembers.map((member) => member.id)))
}

const selectAllPointMembers = () => {
  setPointMembers(rosterOptions.value)
}

const selectPointMembersByRole = (role: string) => {
  setPointMembers(rosterOptions.value.filter((member) => member.role === role))
}

const selectPointMembersByGroup = (group: string) => {
  setPointMembers(rosterOptions.value.filter((member) => member.team_group === group))
}

const clearPointMembers = () => {
  pointForm.member_ids = []
}

const countPointMembersByRole = (role: string) =>
  rosterOptions.value.filter((member) => member.role === role).length

const countPointMembersByGroup = (group: string) =>
  rosterOptions.value.filter((member) => member.team_group === group).length

const applyPointGrantPreset = (preset: PointGrantPreset) => {
  pointForm.delta = preset.delta
  pointForm.reason = preset.reason
}

const grantPoints = async () => {
  if (pointForm.member_ids.length === 0) {
    ElMessage.warning('請先選擇球員')
    return
  }

  if (!Number.isFinite(Number(pointForm.delta)) || Number(pointForm.delta) === 0) {
    ElMessage.warning('點數異動不可為 0')
    return
  }

  isGrantingPoints.value = true
  try {
    await trainingApi.grantPoints(pointForm.member_ids, Number(pointForm.delta), pointForm.reason)
    ElMessage.success('點數已更新')
    pointForm.member_ids = []
    pointForm.delta = 1
    pointForm.reason = ''
    await refreshData()
  } catch (error: any) {
    ElMessage.error(error?.message || '發放點數失敗')
  } finally {
    isGrantingPoints.value = false
  }
}

const canDeletePointTransaction = (transaction: TrainingPointTransaction) =>
  transaction.source === 'manual'
  && !transaction.related_session_id
  && !transaction.related_registration_id

const deletePointTransaction = async (transaction: TrainingPointTransaction) => {
  if (!canDeletePoints.value || !canDeletePointTransaction(transaction)) return

  try {
    const signedDelta = `${transaction.delta > 0 ? '+' : ''}${transaction.delta}`
    await ElMessageBox.confirm(
      `確定要刪除「${transaction.member_name}」的 ${signedDelta} 點紀錄嗎？刪除後會重新計算點數餘額。`,
      '刪除點數紀錄',
      {
        confirmButtonText: '確定刪除',
        cancelButtonText: '取消',
        type: 'error',
        buttonSize: 'large'
      }
    )

    deletingPointTransactionId.value = transaction.id
    await trainingApi.deletePointTransaction(transaction.id)
    ElMessage.success('已刪除點數紀錄')
    await refreshData()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '刪除點數紀錄失敗')
    }
  } finally {
    if (deletingPointTransactionId.value === transaction.id) {
      deletingPointTransactionId.value = null
    }
  }
}

onMounted(() => {
  void teamGroupsStore.loadGroups().catch((error: any) => {
    console.warn('Failed to load team group settings:', error)
  })
  void refreshData()
})

watch(selectedMemberId, (next, prev) => {
  if (!next || next === prev || isLoading.value) return
  void handleMemberChange()
})

watch(selectedAdminSessionId, (next, prev) => {
  if (!next || next === prev || isLoading.value) return
  void handleAdminSessionChange()
})
</script>

<template>
  <div class="training-view-page h-full min-w-0 flex flex-col animate-fade-in bg-background text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0">
      <div class="max-w-7xl mx-auto">
        <AppPageHeader
          title="特訓報名"
          :subtitle="pageSubtitle"
          :icon="Medal"
          as="h2"
        >
          <template #actions>
            <button
              type="button"
              class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
              :disabled="isRefreshing"
              @click="refreshData"
            >
              <el-icon :class="{ 'is-loading': isRefreshing }"><Refresh /></el-icon>
              重新整理
            </button>
          </template>
        </AppPageHeader>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <AppLoadingState v-if="isLoading" text="讀取特訓資料中..." min-height="50vh" />

      <div v-else class="max-w-7xl mx-auto flex w-full min-w-0 flex-col gap-5">
        <section class="min-w-0 overflow-hidden rounded-3xl border border-gray-100 bg-white p-4 md:p-5 shadow-sm">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="w-full min-w-0 lg:max-w-md">
              <label class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">報名成員</label>
              <el-select
                v-model="selectedMemberId"
                class="w-full mt-2"
                size="large"
                placeholder="請選擇綁定成員"
                :disabled="members.length === 0"
              >
                <el-option
                  v-for="member in members"
                  :key="member.member_id"
                  :label="`${member.name}｜${member.role || '成員'}`"
                  :value="member.member_id"
                />
              </el-select>
            </div>

            <div class="grid min-w-0 grid-cols-3 gap-2 text-center sm:min-w-[420px]">
              <div class="min-w-0 rounded-2xl border border-primary/15 bg-primary/5 px-2 py-3 sm:px-3">
                <div class="text-xs font-bold leading-tight text-primary">可用點數</div>
                <div class="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{{ selectedMember?.available_points ?? 0 }}</div>
              </div>
              <div class="min-w-0 rounded-2xl border border-gray-100 bg-gray-50 px-2 py-3 sm:px-3">
                <div class="text-xs font-bold leading-tight text-gray-400">總點數</div>
                <div class="mt-1 text-xl font-black text-slate-800 sm:text-2xl">{{ selectedMember?.point_balance ?? 0 }}</div>
              </div>
              <div class="min-w-0 rounded-2xl border border-amber-100 bg-amber-50 px-2 py-3 sm:px-3">
                <div class="text-xs font-bold leading-tight text-amber-700">已保留</div>
                <div class="mt-1 text-xl font-black text-amber-800 sm:text-2xl">{{ selectedMember?.reserved_points ?? 0 }}</div>
              </div>
            </div>
          </div>
        </section>

        <el-tabs v-model="activeTab" class="training-tabs w-full min-w-0">
          <el-tab-pane label="我要報名" name="register">
            <div v-if="members.length === 0" class="rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
              <div class="text-lg font-black text-slate-800">目前沒有可報名的關聯成員</div>
              <p class="mt-2 text-sm text-gray-500">請先請管理員在使用者名單完成成員綁定。</p>
            </div>

            <div v-else class="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section class="grid min-w-0 gap-4">
                <article
                  v-for="session in upcomingSessions"
                  :key="session.match_id"
                  class="min-w-0 overflow-hidden rounded-3xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5"
                >
                  <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="inline-flex rounded-full border px-3 py-1 text-xs font-black" :class="getSessionStatusClass(session)">
                          {{ session.is_registration_open ? '可報名' : getTrainingManualStatusLabel(session.manual_status) }}
                        </span>
                        <span class="inline-flex rounded-full border border-gray-100 bg-gray-50 px-3 py-1 text-xs font-black text-gray-500">
                          扣 {{ session.point_cost }} 點
                        </span>
                        <span v-if="session.capacity" class="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-600">
                          名額 {{ session.selected_count }}/{{ session.capacity }}
                        </span>
                      </div>
                      <h3 class="mt-3 break-words text-xl font-black leading-snug text-slate-900">{{ session.match_name }}</h3>
                      <div class="mt-2 flex min-w-0 flex-wrap gap-3 text-sm font-bold text-gray-500">
                        <span class="min-w-0 break-words">{{ formatSessionDate(session) }} {{ session.match_time || '時間待確認' }}</span>
                        <span v-if="session.location" class="min-w-0 break-words">{{ session.location }}</span>
                        <span v-if="session.category_group" class="min-w-0 break-words">{{ session.category_group }}</span>
                      </div>
                      <div class="mt-3 break-words text-xs font-bold leading-relaxed text-gray-400">
                        報名時間：{{ formatDateTime(session.registration_start_at) }} - {{ formatDateTime(session.registration_end_at) }}
                      </div>
                    </div>

                    <div class="flex w-full shrink-0 flex-col gap-2 md:w-auto md:min-w-[150px]">
                      <el-tag
                        v-if="session.registration_status"
                        :type="getRegistrationStatusType(session.registration_status)"
                        effect="plain"
                        class="!h-9 justify-center !rounded-xl !px-3 !text-sm !font-black"
                      >
                        {{ getTrainingRegistrationStatusLabel(session.registration_status) }}
                      </el-tag>
                      <button
                        v-if="canRegister(session)"
                        type="button"
                        class="min-h-11 w-full rounded-2xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover md:w-auto"
                        @click="submitRegistration(session)"
                      >
                        送出報名
                      </button>
                      <button
                        v-else-if="canCancelTrainingRegistration(session)"
                        type="button"
                        class="min-h-11 w-full rounded-2xl border border-gray-200 px-4 text-sm font-black text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 md:w-auto"
                        @click="cancelRegistration(session)"
                      >
                        取消報名
                      </button>
                      <div v-else class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-center text-xs font-bold text-gray-400">
                        {{ getRegisterDisabledReason(session) }}
                      </div>
                    </div>
                  </div>

                  <div v-if="session.selected_members.length > 0" class="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <div class="mb-2 text-sm font-black text-emerald-700">已公布錄取名單</div>
                    <div class="flex flex-wrap gap-2">
                      <span
                        v-for="member in session.selected_members"
                        :key="member.member_id"
                        class="max-w-full break-words rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700 shadow-sm"
                      >
                        {{ member.name }}{{ member.team_group ? `・${member.team_group}` : '' }}
                      </span>
                    </div>
                  </div>
                </article>

                <div v-if="upcomingSessions.length === 0" class="rounded-3xl border border-gray-100 bg-white p-8 text-center text-sm font-bold text-gray-400 shadow-sm">
                  目前沒有即將到來的特訓課。
                </div>
              </section>

              <aside class="min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm h-fit">
                <div class="flex items-center gap-2 text-lg font-black text-slate-800">
                  <el-icon class="text-primary"><Tickets /></el-icon>
                  點數紀錄
                </div>
                <div class="mt-4 space-y-3">
                  <div
                    v-for="tx in memberPointTransactions.slice(0, 8)"
                    :key="tx.id"
                    class="rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span class="min-w-0 truncate text-sm font-black text-slate-800">{{ tx.reason || '點數異動' }}</span>
                      <span class="text-base font-black" :class="tx.delta > 0 ? 'text-emerald-600' : 'text-red-500'">
                        {{ tx.delta > 0 ? '+' : '' }}{{ tx.delta }}
                      </span>
                    </div>
                    <div class="mt-1 text-xs font-bold text-gray-400">{{ formatDateTime(tx.created_at) }}</div>
                  </div>
                  <div v-if="memberPointTransactions.length === 0" class="text-sm font-bold text-gray-400">尚無點數紀錄。</div>
                </div>
              </aside>
            </div>
          </el-tab-pane>

          <el-tab-pane v-if="canManageTraining" label="教練管理" name="manage">
            <div class="grid min-w-0 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <section class="min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm h-fit">
                <div class="flex flex-col gap-3">
                  <div class="flex items-center gap-2 whitespace-nowrap text-lg font-black text-slate-800">
                    <el-icon class="text-primary"><Setting /></el-icon>
                    報名設定
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-if="canEditTraining"
                      type="button"
                      class="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-900 px-3 text-xs font-black text-white transition-colors hover:bg-black disabled:opacity-60"
                      :disabled="isInvokingNotificationOnce"
                      @click="invokeNotificationOnce"
                    >
                      <el-icon :class="{ 'is-loading': isInvokingNotificationOnce }"><Select /></el-icon>
                      發送一次
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                      :disabled="isLoadingNotificationDiagnostics"
                      @click="loadNotificationDiagnostics"
                    >
                      <el-icon :class="{ 'is-loading': isLoadingNotificationDiagnostics }"><Refresh /></el-icon>
                      檢查通知
                    </button>
                    <button
                      v-if="canCreateTraining"
                      type="button"
                      class="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-primary/20 bg-primary/5 px-3 text-xs font-black text-primary transition-colors hover:bg-primary hover:text-white"
                      @click="openCreateSessionDialog"
                    >
                      <el-icon><Plus /></el-icon>
                      新增
                    </button>
                  </div>
                </div>

                <div class="mt-4 space-y-4">
                  <div v-if="sessions.length === 0" class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center">
                    <div class="text-sm font-black text-slate-700">尚未建立特訓課</div>
                    <p class="mt-1 text-xs font-bold text-gray-400">先新增一筆特訓課，再設定報名時間與錄取名額。</p>
                    <button
                      v-if="canCreateTraining"
                      type="button"
                      class="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover"
                      @click="openCreateSessionDialog"
                    >
                      <el-icon><Plus /></el-icon>
                      新增特訓課
                    </button>
                  </div>

                  <el-select
                    v-model="selectedAdminSessionId"
                    class="w-full"
                    size="large"
                    placeholder="選擇特訓課"
                    :disabled="sessions.length === 0"
                  >
                    <el-option
                      v-for="session in sessions"
                      :key="session.match_id"
                      :label="`${session.match_date}｜${session.match_name}`"
                      :value="session.session_id || session.match_id"
                    />
                  </el-select>

                  <el-form label-position="top" class="space-y-3">
                    <el-form-item label="手動狀態" class="font-bold">
                      <el-select v-model="settingsForm.manual_status" class="w-full" size="large">
                        <el-option
                          v-for="option in statusOptions"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="報名開始" class="font-bold">
                      <el-date-picker
                        v-model="settingsForm.registration_start_at"
                        type="datetime"
                        format="YYYY-MM-DD HH:mm"
                        value-format="YYYY-MM-DD HH:mm:ss"
                        class="!w-full"
                        size="large"
                      />
                    </el-form-item>
                    <el-form-item label="報名截止" class="font-bold">
                      <el-date-picker
                        v-model="settingsForm.registration_end_at"
                        type="datetime"
                        format="YYYY-MM-DD HH:mm"
                        value-format="YYYY-MM-DD HH:mm:ss"
                        class="!w-full"
                        size="large"
                      />
                    </el-form-item>
                    <div class="grid gap-3 sm:grid-cols-2">
                      <el-form-item label="錄取名額" class="font-bold">
                        <el-input-number v-model="settingsForm.capacity" :min="1" :step="1" class="!w-full" controls-position="right" />
                      </el-form-item>
                      <el-form-item label="扣點" class="font-bold">
                        <el-input-number v-model="settingsForm.point_cost" :min="0" :step="1" class="!w-full" controls-position="right" />
                      </el-form-item>
                    </div>
                  </el-form>

                  <button
                    type="button"
                    class="w-full min-h-11 rounded-2xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                    :disabled="isSavingSettings || !settingsForm.match_id"
                    @click="saveSettings"
                  >
                    {{ isSavingSettings ? '儲存中...' : '儲存報名設定' }}
                  </button>
                </div>
              </section>

              <section class="min-w-0 overflow-hidden rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 class="text-lg font-black text-slate-800">報名審核</h3>
                    <p class="mt-1 text-sm font-bold text-gray-400">錄取時會保留點數，上課當天由排程正式扣點。</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="min-h-10 rounded-2xl border border-gray-200 px-4 text-sm font-black text-gray-600 transition-colors hover:border-primary hover:text-primary"
                      :disabled="!selectedAdminSession?.session_id"
                      @click="publishSelection"
                    >
                      公布名單
                    </button>
                    <button
                      type="button"
                      class="min-h-10 rounded-2xl bg-slate-900 px-4 text-sm font-black text-white transition-colors hover:bg-black disabled:opacity-60"
                      :disabled="isCreatingAttendance || !selectedAdminSession?.session_id"
                      @click="createAttendanceEvent"
                    >
                      建立點名單
                    </button>
                  </div>
                </div>

                <div class="training-table-scroll mt-4 min-w-0 overflow-x-auto custom-scrollbar">
                  <el-table :data="adminRegistrations" class="training-table" empty-text="尚無報名資料" stripe>
                    <el-table-column prop="member_name" label="球員" min-width="130">
                      <template #default="{ row }">
                        <div class="font-black text-slate-800">{{ row.member_name }}</div>
                        <div class="text-xs font-bold text-gray-400">{{ row.member_role || '-' }} {{ row.team_group || '' }}</div>
                      </template>
                    </el-table-column>
                    <el-table-column label="點數" width="120" align="center">
                      <template #default="{ row }">
                        <div class="font-black text-slate-800">{{ row.available_points }}</div>
                        <div class="text-xs font-bold text-gray-400">可用</div>
                      </template>
                    </el-table-column>
                    <el-table-column label="狀態" width="150" align="center">
                      <template #default="{ row }">
                        <el-tag :type="getRegistrationStatusType(row.status)" effect="plain" class="!font-black">
                          {{ getTrainingRegistrationStatusLabel(row.status) }}
                        </el-tag>
                        <div class="mt-1 text-[11px] font-bold text-gray-400">{{ getTrainingPointStatusLabel(row.point_status) }}</div>
                      </template>
                    </el-table-column>
                    <el-table-column label="操作" min-width="220" align="right">
                      <template #default="{ row }">
                        <div class="flex flex-wrap justify-end gap-2">
                          <el-button size="small" type="success" plain :loading="isReviewing" @click="reviewRegistration(row, 'selected')">
                            <el-icon><Check /></el-icon>
                            錄取
                          </el-button>
                          <el-button size="small" type="warning" plain :loading="isReviewing" @click="reviewRegistration(row, 'waitlisted')">
                            <el-icon><Timer /></el-icon>
                            候補
                          </el-button>
                          <el-button size="small" type="danger" plain :loading="isReviewing" @click="reviewRegistration(row, 'rejected')">
                            <el-icon><Close /></el-icon>
                            未錄取
                          </el-button>
                        </div>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </section>
            </div>
          </el-tab-pane>

          <el-tab-pane v-if="canManagePoints" label="點數管理" name="points">
            <div class="grid min-w-0 gap-4" :class="{ 'lg:grid-cols-[420px_minmax(0,1fr)]': canGrantPoints }">
              <section v-if="canGrantPoints" class="min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm h-fit">
                <div class="flex items-center gap-2 text-lg font-black text-slate-800">
                  <el-icon class="text-primary"><Plus /></el-icon>
                  手動發放點數
                </div>
                <div class="mt-4 space-y-4">
                  <div class="space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <span class="text-sm font-black text-slate-700">快速選取</span>
                      <span class="text-xs font-bold text-gray-400">已選 {{ selectedPointMemberCount }} 人</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="min-h-9 rounded-xl border border-primary/20 bg-primary/5 px-3 text-xs font-black text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        :disabled="rosterOptions.length === 0"
                        @click="selectAllPointMembers"
                      >
                        全隊 {{ rosterOptions.length }}
                      </button>
                      <button
                        type="button"
                        class="min-h-9 rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        :disabled="countPointMembersByRole('校隊') === 0"
                        @click="selectPointMembersByRole('校隊')"
                      >
                        校隊 {{ countPointMembersByRole('校隊') }}
                      </button>
                      <button
                        type="button"
                        class="min-h-9 rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        :disabled="countPointMembersByRole('球員') === 0"
                        @click="selectPointMembersByRole('球員')"
                      >
                        球員 {{ countPointMembersByRole('球員') }}
                      </button>
                      <button
                        type="button"
                        class="min-h-9 rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-500 transition-colors hover:border-red-200 hover:text-red-500"
                        @click="clearPointMembers"
                      >
                        清空
                      </button>
                    </div>
                    <div v-if="pointGroupOptions.length > 0" class="space-y-2">
                      <div class="text-xs font-black text-gray-400">依所屬群組</div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          v-for="group in pointGroupOptions"
                          :key="group"
                          type="button"
                          class="min-h-8 rounded-xl border border-gray-100 bg-gray-50 px-3 text-xs font-black text-gray-600 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                          @click="selectPointMembersByGroup(group)"
                        >
                          {{ group }} {{ countPointMembersByGroup(group) }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <el-select
                    v-model="pointForm.member_ids"
                    multiple
                    filterable
                    collapse-tags
                    collapse-tags-tooltip
                    class="w-full"
                    size="large"
                    placeholder="選擇球員"
                  >
                    <el-option
                      v-for="member in rosterOptions"
                      :key="member.id"
                      :label="`${member.name}｜${member.role || '球員'}${member.team_group ? `｜${member.team_group}` : ''}`"
                      :value="member.id"
                    />
                  </el-select>

                  <div class="space-y-2">
                    <div class="text-sm font-black text-slate-700">快速點數</div>
                    <div class="grid gap-2 min-[360px]:grid-cols-2">
                      <button
                        v-for="preset in pointGrantPresets"
                        :key="preset.label"
                        type="button"
                        class="min-h-9 rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-600 transition-colors hover:border-primary hover:text-primary"
                        @click="applyPointGrantPreset(preset)"
                      >
                        {{ preset.label }}
                      </button>
                    </div>
                  </div>

                  <el-input-number v-model="pointForm.delta" :step="1" class="!w-full" controls-position="right" />
                  <el-input v-model="pointForm.reason" type="textarea" :rows="3" placeholder="發放原因，例如：訓練表現佳、比賽態度積極" />
                  <button
                    type="button"
                    class="w-full min-h-11 rounded-2xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                    :disabled="isGrantingPoints"
                    @click="grantPoints"
                  >
                    {{ isGrantingPoints ? '處理中...' : '送出點數異動' }}
                  </button>
                </div>
              </section>

              <section class="min-w-0 overflow-hidden rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 class="text-lg font-black text-slate-800">點數流水帳</h3>
                <div class="training-table-scroll mt-4 min-w-0 overflow-x-auto custom-scrollbar">
                  <el-table :data="managementPointTransactions" class="training-table" empty-text="尚無點數紀錄" stripe>
                    <el-table-column prop="member_name" label="球員" min-width="130" />
                    <el-table-column label="異動" width="100" align="center">
                      <template #default="{ row }">
                        <span class="font-black" :class="row.delta > 0 ? 'text-emerald-600' : 'text-red-500'">
                          {{ row.delta > 0 ? '+' : '' }}{{ row.delta }}
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip />
                    <el-table-column label="建立時間" width="170">
                      <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
                    </el-table-column>
                    <el-table-column prop="created_by_name" label="操作人" width="120" />
                    <el-table-column v-if="canDeletePoints" label="操作" width="88" align="center">
                      <template #default="{ row }">
                        <button
                          type="button"
                          class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300"
                          :disabled="deletingPointTransactionId === row.id || !canDeletePointTransaction(row)"
                          :title="canDeletePointTransaction(row) ? '刪除' : '系統扣點不可刪除'"
                          @click="deletePointTransaction(row)"
                        >
                          <el-icon><Delete /></el-icon>
                        </button>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </section>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <el-dialog
      v-model="isNotificationDiagnosticsDialogOpen"
      title="報名開始通知診斷"
      width="min(92vw, 760px)"
      align-center
      destroy-on-close
    >
      <div v-if="notificationDiagnostics" class="space-y-5">
        <section class="space-y-3">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 class="text-base font-black text-slate-800">排程設定</h3>
              <p class="text-xs font-bold text-gray-400">產生時間：{{ formatDateTime(notificationDiagnostics.generated_at) }}</p>
            </div>
            <el-tag :type="notificationDiagnostics.cron.job_exists ? 'success' : 'danger'" effect="plain" class="!font-black">
              {{ notificationDiagnostics.cron.job_exists ? 'Cron 已建立' : 'Cron 不存在' }}
            </el-tag>
          </div>

          <div class="grid gap-2 sm:grid-cols-3">
            <div
              v-for="item in notificationDiagnosticSettingItems"
              :key="item.key"
              class="rounded-lg border border-gray-100 bg-gray-50 p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-black text-slate-700">{{ item.label }}</span>
                <el-tag :type="item.ok ? 'success' : 'danger'" effect="plain" class="!font-black">
                  {{ item.ok ? '已設定' : '缺少' }}
                </el-tag>
              </div>
              <div class="mt-2 break-words text-[11px] font-bold text-gray-400">{{ item.hint }}</div>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="text-base font-black text-slate-800">Cron 最近執行</h3>
          <div v-if="notificationDiagnostics.cron.recent_runs.length === 0" class="rounded-lg border border-dashed border-gray-200 p-4 text-sm font-bold text-gray-400">
            尚無 cron 執行紀錄。若 job 已建立，請等下一個 5 分鐘週期後再檢查。
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="run in notificationDiagnostics.cron.recent_runs"
              :key="run.runid"
              class="rounded-lg border border-gray-100 p-3"
            >
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <el-tag :type="getCronRunStatusType(run.status)" effect="plain" class="!w-fit !font-black">
                  {{ run.status || 'unknown' }}
                </el-tag>
                <span class="text-xs font-bold text-gray-400">{{ formatDateTime(run.start_time) }}</span>
              </div>
              <div class="mt-2 whitespace-pre-wrap break-words text-xs font-bold text-gray-500">
                {{ run.return_message || '-' }}
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="text-base font-black text-slate-800">最近特訓課觸發條件</h3>
          <div v-if="notificationDiagnostics.recent_sessions.length === 0" class="rounded-lg border border-dashed border-gray-200 p-4 text-sm font-bold text-gray-400">
            找不到近期特訓報名設定。
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="session in notificationDiagnostics.recent_sessions"
              :key="session.session_id"
              class="rounded-lg border border-gray-100 p-3"
            >
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <div class="truncate text-sm font-black text-slate-800">{{ session.match_name || '未命名特訓課' }}</div>
                  <div class="mt-1 text-xs font-bold text-gray-400">
                    {{ session.match_date || '未設定日期' }}｜{{ session.match_time || '未設定時間' }}｜{{ session.location || '未設定地點' }}
                  </div>
                </div>
                <el-tag :type="getNotificationDiagnosticStateType(session.trigger_state)" effect="plain" class="!w-fit !font-black">
                  {{ getNotificationDiagnosticStateLabel(session.trigger_state) }}
                </el-tag>
              </div>

              <div class="mt-3 grid gap-2 text-xs font-bold text-gray-500 sm:grid-cols-2">
                <div>手動狀態：{{ getTrainingManualStatusLabel(session.manual_status) }}</div>
                <div>報名開始：{{ formatDateTime(session.registration_start_at) }}</div>
                <div>報名截止：{{ formatDateTime(session.registration_end_at) }}</div>
                <div>通知事件：{{ session.open_event_exists ? '已存在' : '尚未建立' }}</div>
              </div>

              <div v-if="session.blockers.length > 0" class="mt-3 flex flex-wrap gap-2">
                <el-tag
                  v-for="blocker in session.blockers"
                  :key="`${session.session_id}-${blocker}`"
                  type="danger"
                  effect="plain"
                  class="!font-black"
                >
                  {{ getNotificationBlockerLabel(blocker) }}
                </el-tag>
              </div>
              <div v-else-if="session.open_event_key" class="mt-3 break-words text-[11px] font-bold text-amber-600">
                {{ session.open_event_key }}
              </div>
              <div v-else class="mt-3 break-words text-[11px] font-bold text-emerald-600">
                下一輪排程應建立 {{ session.open_event_key_prefix }}...
              </div>
            </div>
          </div>
        </section>

        <section class="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <div class="rounded-lg border border-gray-100 p-3">
            <h3 class="text-base font-black text-slate-800">推播目標</h3>
            <div class="mt-3 space-y-2 text-sm font-bold text-gray-500">
              <div class="flex items-center justify-between gap-3">
                <span>可通知使用者</span>
                <span class="font-black text-slate-800">{{ notificationDiagnostics.push_targets.active_training_users }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span>有效瀏覽器訂閱</span>
                <span class="font-black text-slate-800">{{ notificationDiagnostics.push_targets.enabled_subscriptions }}</span>
              </div>
            </div>
            <div v-if="notificationInvokeResult" class="mt-3 rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">
              已排入一次手動觸發：request {{ notificationInvokeResult.request_id || '-' }}
            </div>
          </div>

          <div class="rounded-lg border border-gray-100 p-3">
            <h3 class="text-base font-black text-slate-800">最近通知事件</h3>
            <div v-if="notificationDiagnostics.recent_events.length === 0" class="mt-3 text-sm font-bold text-gray-400">
              尚無特訓報名通知事件。
            </div>
            <div v-else class="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
              <div
                v-for="event in notificationDiagnostics.recent_events"
                :key="event.event_key"
                class="rounded-lg bg-gray-50 p-2"
              >
                <div class="truncate text-xs font-black text-slate-700">{{ event.title || event.event_key }}</div>
                <div class="mt-1 break-words text-[11px] font-bold text-gray-400">{{ event.event_key }}</div>
                <div class="mt-1 text-[11px] font-bold text-gray-400">{{ formatDateTime(event.created_at) }}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div v-else class="py-8 text-center text-sm font-bold text-gray-400">
        尚未載入診斷資料
      </div>

      <template #footer>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <el-button class="!m-0" type="primary" @click="isNotificationDiagnosticsDialogOpen = false">關閉</el-button>
          <el-button
            v-if="canEditTraining"
            class="!m-0"
            type="success"
            :loading="isInvokingNotificationOnce"
            @click="invokeNotificationOnce"
          >
            發送一次
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="isCreateSessionDialogOpen"
      title="新增特訓課"
      width="min(92vw, 520px)"
      align-center
      destroy-on-close
    >
      <el-form label-position="top" class="space-y-3">
        <el-form-item label="特訓課名稱" class="font-bold">
          <el-input v-model="newSessionForm.match_name" placeholder="例如：週末守備特訓" size="large" />
        </el-form-item>

        <div class="grid gap-3 sm:grid-cols-2">
          <el-form-item label="上課日期" class="font-bold">
            <el-date-picker
              v-model="newSessionForm.match_date"
              type="date"
              value-format="YYYY-MM-DD"
              class="!w-full"
              size="large"
            />
          </el-form-item>
          <el-form-item label="上課時間" class="font-bold">
            <el-time-picker
              v-model="newSessionForm.match_time_range"
              is-range
              range-separator="至"
              start-placeholder="開始"
              end-placeholder="結束"
              format="HH:mm"
              value-format="HH:mm"
              class="!w-full"
              size="large"
            />
          </el-form-item>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <el-form-item label="地點" class="font-bold">
            <el-input v-model="newSessionForm.location" placeholder="例如：中港國小操場" size="large" />
          </el-form-item>
          <el-form-item label="組別" class="font-bold">
            <el-input v-model="newSessionForm.category_group" placeholder="例如：U12 / 校隊" size="large" />
          </el-form-item>
        </div>

        <el-form-item label="手動狀態" class="font-bold">
          <el-select v-model="newSessionForm.manual_status" class="w-full" size="large">
            <el-option
              v-for="option in statusOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <div class="grid gap-3 sm:grid-cols-2">
          <el-form-item label="報名開始" class="font-bold">
            <el-date-picker
              v-model="newSessionForm.registration_start_at"
              type="datetime"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm:ss"
              class="!w-full"
              size="large"
            />
          </el-form-item>
          <el-form-item label="報名截止" class="font-bold">
            <el-date-picker
              v-model="newSessionForm.registration_end_at"
              type="datetime"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm:ss"
              class="!w-full"
              size="large"
            />
          </el-form-item>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <el-form-item label="錄取名額" class="font-bold">
            <el-input-number v-model="newSessionForm.capacity" :min="1" :step="1" class="!w-full" controls-position="right" />
          </el-form-item>
          <el-form-item label="扣點" class="font-bold">
            <el-input-number v-model="newSessionForm.point_cost" :min="0" :step="1" class="!w-full" controls-position="right" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <el-button class="!m-0" :disabled="isCreatingSession" @click="isCreateSessionDialogOpen = false">取消</el-button>
          <el-button class="!m-0" type="primary" :loading="isCreatingSession" @click="createSessionWithMatch">
            新增特訓課
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.training-view-page :deep(.el-select),
.training-view-page :deep(.el-input),
.training-view-page :deep(.el-input-number),
.training-view-page :deep(.el-date-editor),
.training-view-page :deep(.el-textarea) {
  max-width: 100%;
  min-width: 0;
}

.training-view-page :deep(.el-select__wrapper),
.training-view-page :deep(.el-input__wrapper),
.training-view-page :deep(.el-textarea__inner) {
  min-width: 0;
}

.training-view-page :deep(.el-select__selection),
.training-view-page :deep(.el-select__selected-item) {
  min-width: 0;
}

.training-view-page :deep(.el-date-editor.el-input),
.training-view-page :deep(.el-date-editor.el-input__wrapper) {
  width: 100% !important;
}

.training-tabs {
  width: 100%;
  min-width: 0;
}

.training-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
  max-width: 100%;
  overflow: hidden;
}

.training-tabs :deep(.el-tabs__nav-wrap) {
  max-width: 100%;
}

.training-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background-color: #f3f4f6;
}

.training-tabs :deep(.el-tabs__nav-scroll) {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.training-tabs :deep(.el-tabs__nav-scroll::-webkit-scrollbar) {
  display: none;
}

.training-tabs :deep(.el-tabs__nav) {
  min-width: max-content;
}

.training-tabs :deep(.el-tabs__item) {
  font-weight: 900;
  padding: 0 16px;
}

.training-tabs :deep(.el-tabs__content),
.training-tabs :deep(.el-tab-pane) {
  min-width: 0;
}

.training-table-scroll {
  -webkit-overflow-scrolling: touch;
}

.training-table-scroll :deep(.training-table) {
  min-width: 640px;
  width: 100%;
}

@media (max-width: 639px) {
  .training-tabs :deep(.el-tabs__item) {
    height: 42px;
    padding: 0 12px;
    font-size: 0.95rem;
  }

  .training-table-scroll {
    margin-right: -0.25rem;
    margin-left: -0.25rem;
    padding-bottom: 0.25rem;
  }

  .training-table-scroll :deep(.training-table) {
    min-width: 620px;
  }
}
</style>
