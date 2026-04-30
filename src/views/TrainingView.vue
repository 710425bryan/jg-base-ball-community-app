<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Medal, Plus, Refresh, Select, Setting, Tickets, Timer } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import { supabase } from '@/services/supabase'
import { trainingApi } from '@/services/trainingApi'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import type {
  TrainingAdminRegistration,
  TrainingManualStatus,
  TrainingMember,
  TrainingPointTransaction,
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

const DEFAULT_TRAINING_TIME_RANGE: TrainingTimeRange = ['09:00', '11:00']
const DEFAULT_TRAINING_LOCATION = '中港國小'
const createDefaultTrainingTimeRange = (): TrainingTimeRange => [...DEFAULT_TRAINING_TIME_RANGE]

const router = useRouter()
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()

const isLoading = ref(true)
const isRefreshing = ref(false)
const activeTab = ref<'register' | 'manage' | 'points'>('register')
const members = ref<TrainingMember[]>([])
const sessions = ref<TrainingSession[]>([])
const selectedMemberId = ref('')
const selectedAdminSessionId = ref('')
const adminRegistrations = ref<TrainingAdminRegistration[]>([])
const pointTransactions = ref<TrainingPointTransaction[]>([])
const rosterOptions = ref<TeamMemberOption[]>([])
const isSavingSettings = ref(false)
const isGrantingPoints = ref(false)
const isReviewing = ref(false)
const isCreatingAttendance = ref(false)
const isCreateSessionDialogOpen = ref(false)
const isCreatingSession = ref(false)

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
const canGrantPoints = computed(() => canCreateTraining.value || canEditTraining.value)
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
  Array.from(new Set(rosterOptions.value.map((member) => member.team_group).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
)

const selectedPointMemberCount = computed(() => pointForm.member_ids.length)

const formatDateTime = (value?: string | null) => {
  if (!value) return '未設定'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '未設定'
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
  rosterOptions.value = (data || []) as TeamMemberOption[]
}

const refreshAdminRegistrations = async () => {
  if (!selectedAdminSession.value?.session_id || !canManageTraining.value) {
    adminRegistrations.value = []
    return
  }

  adminRegistrations.value = await trainingApi.listAdminRegistrations(selectedAdminSession.value.session_id)
}

const refreshPointTransactions = async () => {
  pointTransactions.value = await trainingApi.listPointTransactions(canManageTraining.value ? null : selectedMemberId.value)
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
      refreshPointTransactions(),
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
  await refreshPointTransactions()
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
    ElMessage.success('已儲存特訓報名設定')
    await refreshData()
  } catch (error: any) {
    ElMessage.error(error?.message || '儲存設定失敗')
  } finally {
    isSavingSettings.value = false
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

onMounted(() => {
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
  <div class="h-full flex flex-col animate-fade-in bg-background text-text overflow-hidden">
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

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <AppLoadingState v-if="isLoading" text="讀取特訓資料中..." min-height="50vh" />

      <div v-else class="max-w-7xl mx-auto flex flex-col gap-5">
        <section class="rounded-3xl border border-gray-100 bg-white p-4 md:p-5 shadow-sm">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="w-full lg:max-w-md">
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

            <div class="grid grid-cols-3 gap-2 text-center sm:min-w-[420px]">
              <div class="rounded-2xl border border-primary/15 bg-primary/5 px-3 py-3">
                <div class="text-xs font-bold text-primary">可用點數</div>
                <div class="mt-1 text-2xl font-black text-slate-900">{{ selectedMember?.available_points ?? 0 }}</div>
              </div>
              <div class="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                <div class="text-xs font-bold text-gray-400">總點數</div>
                <div class="mt-1 text-2xl font-black text-slate-800">{{ selectedMember?.point_balance ?? 0 }}</div>
              </div>
              <div class="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3">
                <div class="text-xs font-bold text-amber-700">已保留</div>
                <div class="mt-1 text-2xl font-black text-amber-800">{{ selectedMember?.reserved_points ?? 0 }}</div>
              </div>
            </div>
          </div>
        </section>

        <el-tabs v-model="activeTab" class="training-tabs">
          <el-tab-pane label="我要報名" name="register">
            <div v-if="members.length === 0" class="rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
              <div class="text-lg font-black text-slate-800">目前沒有可報名的關聯成員</div>
              <p class="mt-2 text-sm text-gray-500">請先請管理員在使用者名單完成成員綁定。</p>
            </div>

            <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section class="grid gap-4">
                <article
                  v-for="session in upcomingSessions"
                  :key="session.match_id"
                  class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
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
                      <h3 class="mt-3 text-xl font-black text-slate-900">{{ session.match_name }}</h3>
                      <div class="mt-2 flex flex-wrap gap-3 text-sm font-bold text-gray-500">
                        <span>{{ formatSessionDate(session) }} {{ session.match_time || '時間待確認' }}</span>
                        <span v-if="session.location">{{ session.location }}</span>
                        <span v-if="session.category_group">{{ session.category_group }}</span>
                      </div>
                      <div class="mt-3 text-xs font-bold text-gray-400">
                        報名時間：{{ formatDateTime(session.registration_start_at) }} - {{ formatDateTime(session.registration_end_at) }}
                      </div>
                    </div>

                    <div class="flex shrink-0 flex-col gap-2 md:min-w-[150px]">
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
                        class="min-h-11 rounded-2xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover"
                        @click="submitRegistration(session)"
                      >
                        送出報名
                      </button>
                      <button
                        v-else-if="canCancelTrainingRegistration(session)"
                        type="button"
                        class="min-h-11 rounded-2xl border border-gray-200 px-4 text-sm font-black text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
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
                        class="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700 shadow-sm"
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

              <aside class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm h-fit">
                <div class="flex items-center gap-2 text-lg font-black text-slate-800">
                  <el-icon class="text-primary"><Tickets /></el-icon>
                  點數紀錄
                </div>
                <div class="mt-4 space-y-3">
                  <div
                    v-for="tx in pointTransactions.slice(0, 8)"
                    :key="tx.id"
                    class="rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span class="text-sm font-black text-slate-800">{{ tx.reason || '點數異動' }}</span>
                      <span class="text-base font-black" :class="tx.delta > 0 ? 'text-emerald-600' : 'text-red-500'">
                        {{ tx.delta > 0 ? '+' : '' }}{{ tx.delta }}
                      </span>
                    </div>
                    <div class="mt-1 text-xs font-bold text-gray-400">{{ formatDateTime(tx.created_at) }}</div>
                  </div>
                  <div v-if="pointTransactions.length === 0" class="text-sm font-bold text-gray-400">尚無點數紀錄。</div>
                </div>
              </aside>
            </div>
          </el-tab-pane>

          <el-tab-pane v-if="canManageTraining" label="教練管理" name="manage">
            <div class="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <section class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm h-fit">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 text-lg font-black text-slate-800">
                    <el-icon class="text-primary"><Setting /></el-icon>
                    報名設定
                  </div>
                  <button
                    v-if="canCreateTraining"
                    type="button"
                    class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 text-xs font-black text-primary transition-colors hover:bg-primary hover:text-white"
                    @click="openCreateSessionDialog"
                  >
                    <el-icon><Plus /></el-icon>
                    新增
                  </button>
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
                    <div class="grid grid-cols-2 gap-3">
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

              <section class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
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

                <el-table :data="adminRegistrations" class="mt-4" empty-text="尚無報名資料" stripe>
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
              </section>
            </div>
          </el-tab-pane>

          <el-tab-pane v-if="canGrantPoints" label="點數管理" name="points">
            <div class="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
              <section class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm h-fit">
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
                    <div class="grid grid-cols-2 gap-2">
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

              <section class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 class="text-lg font-black text-slate-800">點數流水帳</h3>
                <el-table :data="pointTransactions" class="mt-4" empty-text="尚無點數紀錄" stripe>
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
                </el-table>
              </section>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

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

        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="錄取名額" class="font-bold">
            <el-input-number v-model="newSessionForm.capacity" :min="1" :step="1" class="!w-full" controls-position="right" />
          </el-form-item>
          <el-form-item label="扣點" class="font-bold">
            <el-input-number v-model="newSessionForm.point_cost" :min="0" :step="1" class="!w-full" controls-position="right" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button :disabled="isCreatingSession" @click="isCreateSessionDialogOpen = false">取消</el-button>
          <el-button type="primary" :loading="isCreatingSession" @click="createSessionWithMatch">
            新增特訓課
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.training-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}

.training-tabs :deep(.el-tabs__item) {
  font-weight: 900;
}
</style>
