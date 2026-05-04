<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Bell,
  Calendar,
  Check,
  Delete,
  Location,
  Plus,
  Refresh,
  UserFilled
} from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import { TrainingLocationAuthError, trainingLocationsApi } from '@/services/trainingLocationsApi'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { useTeamGroupsStore } from '@/stores/teamGroups'
import { getUniqueTeamGroupOptions, normalizeTeamGroup } from '@/utils/teamGroups'
import type {
  TrainingLocationRosterMember,
  TrainingLocationSession,
  TrainingLocationSessionStatus,
  TrainingLocationSessionVenue,
  TrainingVenue
} from '@/types/trainingLocation'

type EditableVenue = TrainingLocationSessionVenue & {
  clientKey: string
}

const DEFAULT_START_TIME = '09:00'
const DEFAULT_END_TIME = '12:00'

const router = useRouter()
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const teamGroupsStore = useTeamGroupsStore()
const canCreate = computed(() => permissionsStore.can('training_locations', 'CREATE'))
const canEdit = computed(() => permissionsStore.can('training_locations', 'EDIT'))
const canDelete = computed(() => permissionsStore.can('training_locations', 'DELETE'))
const canSave = computed(() => (form.session_id ? canEdit.value : canCreate.value))

const sessions = ref<TrainingLocationSession[]>([])
const venues = ref<TrainingVenue[]>([])
const roster = ref<TrainingLocationRosterMember[]>([])
const selectedSessionId = ref<string | null>(null)
const selectedVenueIndex = ref(0)
const selectedPoolMemberIds = ref<string[]>([])
const draggedMemberId = ref<string | null>(null)
const searchQuery = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const isDispatching = ref(false)

const createEmptyVenue = (): EditableVenue => ({
  clientKey: `venue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  id: null,
  venue_id: null,
  venue_name: '',
  venue_address: null,
  venue_maps_url: null,
  sort_order: 0,
  note: null,
  member_ids: [],
  assignments: []
})

const form = reactive({
  session_id: null as string | null,
  title: '週六訓練',
  training_date: dayjs().format('YYYY-MM-DD'),
  start_time: DEFAULT_START_TIME,
  end_time: DEFAULT_END_TIME,
  status: 'draft' as TrainingLocationSessionStatus,
  note: '',
  venues: [createEmptyVenue()] as EditableVenue[]
})

const statusOptions: Array<{ label: string; value: TrainingLocationSessionStatus; className: string }> = [
  { label: '草稿', value: 'draft', className: 'bg-slate-100 text-slate-600' },
  { label: '已發布', value: 'published', className: 'bg-emerald-50 text-emerald-700' },
  { label: '封存', value: 'archived', className: 'bg-gray-100 text-gray-500' }
]

const rosterById = computed(() =>
  new Map(roster.value.map((member) => [member.member_id, member]))
)

const assignedMemberIds = computed(() =>
  new Set(form.venues.flatMap((venue) => venue.member_ids))
)

const teamGroupOptions = computed(() =>
  getUniqueTeamGroupOptions(
    roster.value.map((member) => member.team_group),
    teamGroupsStore.options
  ).map((option) => option.value)
)

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase())

const filteredRoster = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) return roster.value

  return roster.value.filter((member) =>
    [
      member.name,
      member.role,
      member.team_group,
      member.jersey_number
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
  )
})

const unassignedRoster = computed(() =>
  filteredRoster.value.filter((member) => !assignedMemberIds.value.has(member.member_id))
)

const selectedVenue = computed(() => form.venues[selectedVenueIndex.value] || form.venues[0] || null)

const getStatusMeta = (status: TrainingLocationSessionStatus) =>
  statusOptions.find((option) => option.value === status) || statusOptions[0]

const formatSessionTime = (session: Pick<TrainingLocationSession, 'start_time' | 'end_time'>) => {
  if (session.start_time && session.end_time) return `${session.start_time}-${session.end_time}`
  return session.start_time || session.end_time || '時間未設定'
}

const formatSessionDate = (date: string) => {
  const parsed = dayjs(date)
  if (!parsed.isValid()) return date || '未設定日期'
  return `${parsed.format('MM/DD')} 週${'日一二三四五六'[parsed.day()]}`
}

const getVenueMembers = (venue: EditableVenue) =>
  venue.member_ids
    .map((memberId) => rosterById.value.get(memberId))
    .filter((member): member is TrainingLocationRosterMember => Boolean(member))

const getMemberMeta = (member: TrainingLocationRosterMember) =>
  [
    member.role || '球員',
    member.team_group,
    member.jersey_number ? `#${member.jersey_number}` : null
  ].filter(Boolean).join('｜')

const getMapsHref = (venue: Pick<EditableVenue, 'venue_name' | 'venue_address' | 'venue_maps_url'>) => {
  if (venue.venue_maps_url) return venue.venue_maps_url
  const query = venue.venue_address || venue.venue_name
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null
}

const loadVenues = async () => {
  venues.value = await trainingLocationsApi.listVenues()
}

const loadSessions = async () => {
  const from = dayjs().subtract(14, 'day').format('YYYY-MM-DD')
  const to = dayjs().add(45, 'day').format('YYYY-MM-DD')
  sessions.value = await trainingLocationsApi.listSessions(from, to)
}

const loadRoster = async () => {
  roster.value = (await trainingLocationsApi.listRoster(form.training_date)).map((member) => ({
    ...member,
    team_group: normalizeTeamGroup(member.team_group) || null
  }))
  selectedPoolMemberIds.value = selectedPoolMemberIds.value.filter((memberId) =>
    rosterById.value.has(memberId)
  )
}

const handleTrainingLocationError = async (error: any, fallbackMessage: string) => {
  if (error instanceof TrainingLocationAuthError || error?.code === 'AUTH_REQUIRED') {
    ElMessage.warning('登入狀態已過期，請重新登入後再試。')
    await authStore.signOut().catch(() => undefined)
    await router.replace('/')
    return
  }

  ElMessage.error(error?.message || fallbackMessage)
}

const loadAll = async () => {
  isLoading.value = true
  try {
    await authStore.ensureInitialized()
    await Promise.all([loadVenues(), loadSessions(), loadRoster()])
  } catch (error: any) {
    await handleTrainingLocationError(error, '無法載入場地配置資料')
  } finally {
    isLoading.value = false
  }
}

const resetForm = () => {
  selectedSessionId.value = null
  selectedVenueIndex.value = 0
  selectedPoolMemberIds.value = []
  Object.assign(form, {
    session_id: null,
    title: '週六訓練',
    training_date: dayjs().format('YYYY-MM-DD'),
    start_time: DEFAULT_START_TIME,
    end_time: DEFAULT_END_TIME,
    status: 'draft',
    note: '',
    venues: [createEmptyVenue()]
  })
}

const hydrateSession = async (session: TrainingLocationSession) => {
  selectedSessionId.value = session.session_id
  selectedVenueIndex.value = 0
  selectedPoolMemberIds.value = []
  Object.assign(form, {
    session_id: session.session_id,
    title: session.title,
    training_date: session.training_date,
    start_time: session.start_time || '',
    end_time: session.end_time || '',
    status: session.status,
    note: session.note || '',
    venues: (session.venues.length > 0 ? session.venues : [createEmptyVenue()]).map((venue, index) => ({
      ...venue,
      clientKey: venue.id || `venue-${session.session_id}-${index}`,
      member_ids: [...venue.member_ids]
    }))
  })
  await loadRoster()
}

const startCreate = async () => {
  resetForm()
  await loadRoster()
}

const addVenue = () => {
  form.venues.push(createEmptyVenue())
  selectedVenueIndex.value = form.venues.length - 1
}

const removeVenue = (index: number) => {
  if (form.venues.length === 1) {
    ElMessage.warning('至少保留一個場地區塊')
    return
  }

  form.venues.splice(index, 1)
  selectedVenueIndex.value = Math.min(selectedVenueIndex.value, form.venues.length - 1)
}

const applyVenuePreset = (venueIndex: number, preset: TrainingVenue) => {
  const target = form.venues[venueIndex]
  if (!target) return

  target.venue_id = preset.id
  target.venue_name = preset.name
  target.venue_address = preset.address
  target.venue_maps_url = preset.maps_url
}

const moveMemberToVenue = (memberId: string, venueIndex: number) => {
  const target = form.venues[venueIndex]
  if (!target || !rosterById.value.has(memberId)) return

  form.venues.forEach((venue) => {
    venue.member_ids = venue.member_ids.filter((id) => id !== memberId)
  })

  target.member_ids.push(memberId)
  selectedPoolMemberIds.value = selectedPoolMemberIds.value.filter((id) => id !== memberId)
}

const removeMemberFromVenue = (memberId: string, venueIndex: number) => {
  const target = form.venues[venueIndex]
  if (!target) return
  target.member_ids = target.member_ids.filter((id) => id !== memberId)
}

const isPoolMemberSelected = (memberId: string) =>
  selectedPoolMemberIds.value.includes(memberId)

const setPoolMemberSelected = (memberId: string, checked: unknown) => {
  const shouldSelect = checked === true

  if (shouldSelect) {
    if (!selectedPoolMemberIds.value.includes(memberId)) {
      selectedPoolMemberIds.value = [...selectedPoolMemberIds.value, memberId]
    }
    return
  }

  selectedPoolMemberIds.value = selectedPoolMemberIds.value.filter((id) => id !== memberId)
}

const togglePoolMemberSelection = (memberId: string) => {
  setPoolMemberSelected(memberId, !isPoolMemberSelected(memberId))
}

const moveSelectedMembersToVenue = (venueIndex: number) => {
  if (selectedPoolMemberIds.value.length === 0) {
    ElMessage.warning('請先勾選球員')
    return
  }

  selectedVenueIndex.value = venueIndex
  const memberIds = [...selectedPoolMemberIds.value]
  memberIds.forEach((memberId) => moveMemberToVenue(memberId, venueIndex))
}

const moveMembersByFilter = (filter: (member: TrainingLocationRosterMember) => boolean) => {
  const targetIndex = selectedVenueIndex.value
  const members = roster.value.filter(filter)

  if (members.length === 0) {
    ElMessage.warning('沒有符合條件的球員')
    return
  }

  members.forEach((member) => moveMemberToVenue(member.member_id, targetIndex))
}

const onDragStart = (memberId: string) => {
  draggedMemberId.value = memberId
}

const onDropOnVenue = (venueIndex: number) => {
  if (!draggedMemberId.value) return
  moveMemberToVenue(draggedMemberId.value, venueIndex)
  draggedMemberId.value = null
}

const buildSavePayload = (status: TrainingLocationSessionStatus = form.status) => ({
  session_id: form.session_id,
  title: form.title,
  training_date: form.training_date,
  start_time: form.start_time || null,
  end_time: form.end_time || null,
  status,
  note: form.note || null,
  venues: form.venues.map((venue, index) => ({
    venue_id: venue.venue_id,
    venue_name: venue.venue_name,
    venue_address: venue.venue_address,
    venue_maps_url: venue.venue_maps_url,
    note: venue.note,
    sort_order: (index + 1) * 10,
    member_ids: venue.member_ids
  }))
})

const validateForm = (nextStatus: TrainingLocationSessionStatus) => {
  if (!form.title.trim()) {
    ElMessage.warning('請填寫訓練標題')
    return false
  }

  if (!form.training_date) {
    ElMessage.warning('請選擇訓練日期')
    return false
  }

  if (form.venues.some((venue) => !venue.venue_name.trim())) {
    ElMessage.warning('請確認每個場地都有名稱')
    return false
  }

  if (nextStatus === 'published' && form.venues.length === 0) {
    ElMessage.warning('發布前至少需要一個場地')
    return false
  }

  return true
}

const saveSession = async (status: TrainingLocationSessionStatus = form.status) => {
  if (!validateForm(status)) return null

  isSaving.value = true
  try {
    const sessionId = await trainingLocationsApi.saveSession(buildSavePayload(status))
    form.session_id = sessionId
    form.status = status
    await Promise.all([loadSessions(), loadVenues()])
    const saved = sessions.value.find((session) => session.session_id === sessionId)
    if (saved) await hydrateSession(saved)
    ElMessage.success(status === 'published' ? '場地配置已發布' : '場地配置已儲存')
    return sessionId
  } catch (error: any) {
    await handleTrainingLocationError(error, '儲存場地配置失敗')
    return null
  } finally {
    isSaving.value = false
  }
}

const deleteSession = async (session: TrainingLocationSession) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${session.title}」的場地配置嗎？`,
      '刪除場地配置',
      { confirmButtonText: '刪除', cancelButtonText: '取消', type: 'warning' }
    )

    await trainingLocationsApi.deleteSession(session.session_id)
    ElMessage.success('場地配置已刪除')
    if (form.session_id === session.session_id) resetForm()
    await loadSessions()
  } catch (error: any) {
    if (error !== 'cancel') {
      await handleTrainingLocationError(error, '刪除場地配置失敗')
    }
  }
}

const dispatchNotifications = async () => {
  if (form.status !== 'published') {
    ElMessage.warning('請先發布配置後再發送通知')
    return
  }

  const sessionId = form.session_id || await saveSession('published')
  if (!sessionId) return

  isDispatching.value = true
  try {
    const result = await trainingLocationsApi.dispatchNotifications({
      targetDate: form.training_date,
      sessionId
    })
    if (result?.error) throw new Error(result.error)

    ElMessage.success(
      `通知處理完成：新增 ${result?.created_count ?? 0} 筆，重複略過 ${result?.duplicate_count ?? 0} 筆，推播 ${result?.dispatched_count ?? 0} 台裝置`
    )
  } catch (error: any) {
    await handleTrainingLocationError(error, '發送場地通知失敗')
  } finally {
    isDispatching.value = false
  }
}

watch(() => form.training_date, () => {
  void loadRoster()
})

onMounted(() => {
  void teamGroupsStore.loadGroups().catch((error: any) => {
    console.warn('Failed to load team group settings:', error)
  })
  void loadAll()
})
</script>

<template>
  <div class="h-full min-w-0 overflow-hidden bg-background p-2 text-text md:p-6">
    <div class="flex h-full min-h-0 flex-col gap-4">
      <AppPageHeader
        title="場地與人員配置"
        subtitle="依訓練日安排多場地分組，發布後可通知球員與家長。"
        :icon="Location"
        as="h2"
      >
        <template #actions>
          <button
            type="button"
            class="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition-colors hover:border-primary hover:text-primary"
            :disabled="isLoading"
            @click="loadAll"
          >
            <el-icon :class="{ 'is-loading': isLoading }"><Refresh /></el-icon>
            重新整理
          </button>
          <button
            v-if="canCreate"
            type="button"
            class="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-white shadow-md transition-colors hover:bg-primary-hover"
            @click="startCreate"
          >
            <el-icon><Plus /></el-icon>
            新增配置
          </button>
        </template>
      </AppPageHeader>

      <AppLoadingState v-if="isLoading" text="讀取場地配置中..." min-height="50vh" />

      <div v-else class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside class="min-h-0 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-4 shadow-sm custom-scrollbar">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="font-black text-slate-800">近期訓練</div>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{{ sessions.length }} 筆</span>
          </div>

          <div v-if="sessions.length === 0" class="rounded-xl border border-dashed border-slate-200 p-5 text-sm font-bold text-slate-400">
            尚未建立場地配置。
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="session in sessions"
              :key="session.session_id"
              type="button"
              class="w-full rounded-xl border p-3 text-left transition-colors"
              :class="selectedSessionId === session.session_id ? 'border-primary bg-primary/5' : 'border-slate-100 bg-white hover:border-primary/30'"
              @click="hydrateSession(session)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-base font-black text-slate-900">{{ session.title }}</div>
                  <div class="mt-1 text-xs font-bold text-slate-500">{{ formatSessionDate(session.training_date) }}｜{{ formatSessionTime(session) }}</div>
                </div>
                <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" :class="getStatusMeta(session.status).className">
                  {{ getStatusMeta(session.status).label }}
                </span>
              </div>
              <div class="mt-3 flex items-center justify-between text-xs font-bold text-slate-400">
                <span>{{ session.venue_count }} 場地｜{{ session.assignment_count }} 人</span>
                <button
                  v-if="canDelete"
                  type="button"
                  class="rounded-lg p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="刪除"
                  @click.stop="deleteSession(session)"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </button>
          </div>
        </aside>

        <main class="min-h-0 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-4 shadow-sm custom-scrollbar md:p-5">
          <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div class="grid gap-4">
              <section class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <el-form-item label="訓練標題" class="mb-0 font-bold xl:col-span-2">
                    <el-input v-model="form.title" size="large" placeholder="例如：週六訓練" />
                  </el-form-item>
                  <el-form-item label="訓練日期" class="mb-0 font-bold">
                    <el-date-picker v-model="form.training_date" type="date" value-format="YYYY-MM-DD" format="YYYY-MM-DD" class="!w-full" size="large" />
                  </el-form-item>
                  <el-form-item label="狀態" class="mb-0 font-bold">
                    <el-select v-model="form.status" class="w-full" size="large">
                      <el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="開始時間" class="mb-0 font-bold">
                    <el-time-picker v-model="form.start_time" value-format="HH:mm" format="HH:mm" placeholder="開始" class="!w-full" size="large" />
                  </el-form-item>
                  <el-form-item label="結束時間" class="mb-0 font-bold">
                    <el-time-picker v-model="form.end_time" value-format="HH:mm" format="HH:mm" placeholder="結束" class="!w-full" size="large" />
                  </el-form-item>
                  <el-form-item label="備註" class="mb-0 font-bold md:col-span-2">
                    <el-input v-model="form.note" size="large" placeholder="選填，例如集合提醒" />
                  </el-form-item>
                </div>

                <div class="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    class="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                    :disabled="isSaving || !canSave"
                    @click="saveSession()"
                  >
                    <el-icon><Check /></el-icon>
                    儲存
                  </button>
                  <button
                    type="button"
                    class="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                    :disabled="isSaving || !canSave"
                    @click="saveSession('published')"
                  >
                    <el-icon><Check /></el-icon>
                    儲存並發布
                  </button>
                  <button
                    type="button"
                    class="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                    :disabled="isDispatching || !form.session_id"
                    @click="dispatchNotifications"
                  >
                    <el-icon :class="{ 'is-loading': isDispatching }"><Bell /></el-icon>
                    手動通知
                  </button>
                </div>
              </section>

              <section class="grid gap-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-lg font-black text-slate-900">場地區塊</div>
                    <p class="text-sm font-bold text-slate-400">把球員拖曳到場地，或在球員池勾選後移入。</p>
                  </div>
                  <button
                    type="button"
                    class="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 text-sm font-black text-primary transition-colors hover:bg-primary hover:text-white"
                    @click="addVenue"
                  >
                    <el-icon><Plus /></el-icon>
                    新增場地
                  </button>
                </div>

                <article
                  v-for="(venue, venueIndex) in form.venues"
                  :key="venue.clientKey"
                  class="rounded-2xl border bg-white p-4 transition-colors"
                  :class="selectedVenueIndex === venueIndex ? 'border-primary/40 shadow-sm' : 'border-slate-100'"
                  @dragover.prevent
                  @drop.prevent="onDropOnVenue(venueIndex)"
                >
                  <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          class="rounded-full px-3 py-1 text-xs font-black"
                          :class="selectedVenueIndex === venueIndex ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'"
                          @click="selectedVenueIndex = venueIndex"
                        >
                          場地 {{ venueIndex + 1 }}
                        </button>
                        <a
                          v-if="getMapsHref(venue)"
                          :href="getMapsHref(venue) || undefined"
                          target="_blank"
                          rel="noreferrer"
                          class="text-xs font-black text-primary hover:underline"
                        >
                          開啟導航
                        </a>
                      </div>

                      <div class="mt-3 grid gap-3 md:grid-cols-2">
                        <el-input v-model="venue.venue_name" size="large" placeholder="場地名稱，例如中港國小" />
                        <el-input v-model="venue.venue_address" size="large" placeholder="地址或導航關鍵字" />
                      </div>

                      <div v-if="venues.length > 0" class="mt-3 flex flex-wrap gap-2">
                        <button
                          v-for="preset in venues"
                          :key="preset.id"
                          type="button"
                          class="min-h-8 rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs font-black text-slate-600 transition-colors hover:border-primary/30 hover:text-primary"
                          @click="applyVenuePreset(venueIndex, preset)"
                        >
                          {{ preset.name }}
                        </button>
                      </div>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="min-h-9 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 transition-colors hover:border-primary hover:text-primary"
                        @click="moveSelectedMembersToVenue(venueIndex)"
                      >
                        移入勾選
                      </button>
                      <button
                        type="button"
                        class="min-h-9 rounded-xl border border-red-100 px-3 text-xs font-black text-red-500 transition-colors hover:bg-red-50"
                        @click="removeVenue(venueIndex)"
                      >
                        刪除場地
                      </button>
                    </div>
                  </div>

                  <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <div
                      v-for="member in getVenueMembers(venue)"
                      :key="member.member_id"
                      class="flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2"
                      :class="member.is_on_leave ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-slate-100 bg-slate-50 text-slate-700'"
                    >
                      <div class="min-w-0">
                        <div class="truncate text-sm font-black">{{ member.name }}</div>
                        <div class="truncate text-xs font-bold opacity-70">{{ getMemberMeta(member) }}<span v-if="member.is_on_leave">｜已請假</span></div>
                      </div>
                      <button
                        type="button"
                        class="shrink-0 rounded-lg p-1 text-slate-300 transition-colors hover:bg-white hover:text-red-500"
                        @click="removeMemberFromVenue(member.member_id, venueIndex)"
                      >
                        <el-icon><Delete /></el-icon>
                      </button>
                    </div>

                    <div v-if="venue.member_ids.length === 0" class="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-sm font-bold text-slate-400 sm:col-span-2 xl:col-span-3">
                      拖曳或移入球員到這個場地。
                    </div>
                  </div>
                </article>
              </section>
            </div>

            <aside class="h-fit rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-lg font-black text-slate-900">球員池</div>
                  <p class="text-xs font-bold text-slate-400">目前場地：{{ selectedVenue?.venue_name || `場地 ${selectedVenueIndex + 1}` }}</p>
                </div>
                <span class="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">{{ unassignedRoster.length }} 未配置</span>
              </div>

              <el-input v-model="searchQuery" class="mt-3" size="large" placeholder="搜尋姓名、組別、背號" clearable />

              <button
                type="button"
                class="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                :disabled="selectedPoolMemberIds.length === 0 || !selectedVenue"
                @click="moveSelectedMembersToVenue(selectedVenueIndex)"
              >
                移入目前場地 {{ selectedPoolMemberIds.length > 0 ? `(${selectedPoolMemberIds.length})` : '' }}
              </button>

              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="min-h-8 rounded-xl bg-primary px-3 text-xs font-black text-white transition-colors hover:bg-primary-hover"
                  @click="moveMembersByFilter(() => true)"
                >
                  全隊 {{ roster.length }}
                </button>
                <button
                  type="button"
                  class="min-h-8 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition-colors hover:border-primary hover:text-primary"
                  @click="moveMembersByFilter((member) => member.role === '校隊')"
                >
                  校隊
                </button>
                <button
                  type="button"
                  class="min-h-8 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition-colors hover:border-primary hover:text-primary"
                  @click="moveMembersByFilter((member) => member.role === '球員')"
                >
                  球員
                </button>
              </div>

              <div v-if="teamGroupOptions.length > 0" class="mt-3 flex flex-wrap gap-2">
                <button
                  v-for="group in teamGroupOptions"
                  :key="group"
                  type="button"
                  class="min-h-8 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition-colors hover:border-primary hover:text-primary"
                  @click="moveMembersByFilter((member) => member.team_group === group)"
                >
                  {{ group }}
                </button>
              </div>

              <div class="mt-4 max-h-[52vh] overflow-y-auto pr-1 custom-scrollbar">
                <div class="grid gap-2">
                  <div
                    v-for="member in unassignedRoster"
                    :key="member.member_id"
                    draggable="true"
                    class="flex cursor-grab items-center gap-2 rounded-xl border bg-white px-3 py-2 transition-colors active:cursor-grabbing"
                    :class="[
                      member.is_on_leave ? 'border-amber-100 text-amber-800' : 'border-slate-100 text-slate-700',
                      isPoolMemberSelected(member.member_id) ? 'bg-primary/5 ring-2 ring-primary/30' : ''
                    ]"
                    @dragstart="onDragStart(member.member_id)"
                    @click="togglePoolMemberSelection(member.member_id)"
                  >
                    <el-checkbox
                      :model-value="isPoolMemberSelected(member.member_id)"
                      @click.stop
                      @change="(checked: unknown) => setPoolMemberSelected(member.member_id, checked)"
                    />
                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <el-icon><UserFilled /></el-icon>
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-black">{{ member.name }}</div>
                      <div class="truncate text-xs font-bold opacity-70">{{ getMemberMeta(member) }}<span v-if="member.is_on_leave">｜已請假</span></div>
                    </div>
                  </div>
                </div>

                <div v-if="unassignedRoster.length === 0" class="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm font-bold text-slate-400">
                  目前沒有未配置球員。
                </div>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>
