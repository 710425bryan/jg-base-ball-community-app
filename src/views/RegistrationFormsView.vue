<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox, type UploadFile, type UploadFiles } from 'element-plus'
import { Calendar, Delete, Document, Download, EditPen, MagicStick, Plus, Trophy, UploadFilled } from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import RegistrationEventDialog from '@/components/registration-forms/RegistrationEventDialog.vue'
import RegistrationFormWizard from '@/components/registration-forms/RegistrationFormWizard.vue'
import {
  deleteRegistrationFormEvent,
  deleteRegistrationFormTemplate,
  downloadRegistrationFormTemplate,
  fetchRegistrationFormEvents,
  fetchRegistrationFormGenerationLogs,
  fetchRegistrationFormTemplates,
  generateRegistrationFormDocument,
  saveRegistrationFormEvent,
  uploadRegistrationFormTemplate
} from '@/services/registrationFormsApi'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { usePlayerRosterStore } from '@/stores/playerRoster'
import type {
  RegistrationFormEvent,
  RegistrationFormEventInput,
  RegistrationFormEventStatus,
  RegistrationFormGenerationLog,
  RegistrationFormTemplate,
  RegistrationWizardPayload
} from '@/types/registrationForm'
import { REGISTRATION_FORM_PROFILES } from '@/utils/registrationForms'

const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const rosterStore = usePlayerRosterStore()
const events = ref<RegistrationFormEvent[]>([])
const templates = ref<RegistrationFormTemplate[]>([])
const generationLogs = ref<RegistrationFormGenerationLog[]>([])
const loading = ref(true)
const uploading = ref(false)
const savingEvent = ref(false)
const generating = ref(false)
const activeTab = ref<'events' | 'templates'>('events')
const editingEvent = ref<RegistrationFormEvent | null>(null)
const activeEvent = ref<RegistrationFormEvent | null>(null)
const activeTemplate = ref<RegistrationFormTemplate | null>(null)
const eventDialogOpen = ref(false)
const wizardOpen = ref(false)

const canCreate = computed(() => permissionsStore.can('registration_forms', 'CREATE'))
const canEdit = computed(() => permissionsStore.can('registration_forms', 'EDIT'))
const canDelete = computed(() => permissionsStore.can('registration_forms', 'DELETE'))
const canReadPrivateRoster = computed(() => permissionsStore.can('players', 'EDIT'))
const canGenerate = computed(() => canCreate.value && canReadPrivateRoster.value)

const eventStatusMeta: Record<RegistrationFormEventStatus, { label: string; type: 'info' | 'warning' | 'success' | 'danger' }> = {
  draft: { label: '草稿', type: 'info' },
  in_progress: { label: '準備中', type: 'warning' },
  submitted: { label: '已送出', type: 'success' },
  closed: { label: '已截止', type: 'danger' }
}

const templateMap = computed(() => new Map(templates.value.map((template) => [template.id, template])))
const latestLogByEvent = computed(() => {
  const result = new Map<string, RegistrationFormGenerationLog>()
  generationLogs.value.forEach((log) => {
    if (log.event_id && !result.has(log.event_id)) result.set(log.event_id, log)
  })
  return result
})

const formatDate = (value: string | null) => {
  if (!value) return '未設定'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '－' : new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date)
}

const profileLabel = (template: RegistrationFormTemplate) =>
  REGISTRATION_FORM_PROFILES[template.profile_key]?.label || template.profile_key

const templatesForEvent = (event: RegistrationFormEvent) => event.template_ids
  .map((id) => templateMap.value.get(id))
  .filter((template): template is RegistrationFormTemplate => Boolean(template))

const isOverdue = (event: RegistrationFormEvent) => Boolean(
  event.registration_deadline
  && event.registration_deadline < new Date().toISOString().slice(0, 10)
  && !['submitted', 'closed'].includes(event.status)
)

const loadData = async () => {
  loading.value = true
  try {
    const [eventRows, templateRows, logRows] = await Promise.all([
      fetchRegistrationFormEvents(),
      fetchRegistrationFormTemplates(),
      fetchRegistrationFormGenerationLogs()
    ])
    events.value = eventRows
    templates.value = templateRows
    generationLogs.value = logRows
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入賽事報名資料')
  } finally {
    loading.value = false
  }
}

const refreshEvents = async () => {
  const [eventRows, logRows] = await Promise.all([
    fetchRegistrationFormEvents(),
    fetchRegistrationFormGenerationLogs()
  ])
  events.value = eventRows
  generationLogs.value = logRows
}

const openCreateEvent = () => {
  editingEvent.value = null
  eventDialogOpen.value = true
}

const openEditEvent = (event: RegistrationFormEvent) => {
  editingEvent.value = event
  eventDialogOpen.value = true
}

const saveEvent = async (input: RegistrationFormEventInput) => {
  savingEvent.value = true
  try {
    await saveRegistrationFormEvent(input)
    await refreshEvents()
    eventDialogOpen.value = false
    ElMessage.success(input.id ? '賽事報名已更新' : '賽事報名已建立')
  } catch (error: any) {
    ElMessage.error(error?.message || '賽事報名儲存失敗')
  } finally {
    savingEvent.value = false
  }
}

const removeEvent = async (event: RegistrationFormEvent) => {
  try {
    await ElMessageBox.confirm(
      `刪除「${event.name}」後會移除範本關聯，但不會刪除範本與既有產生紀錄，確定要繼續嗎？`,
      '刪除賽事報名',
      { type: 'warning', confirmButtonText: '確定刪除', cancelButtonText: '取消' }
    )
    await deleteRegistrationFormEvent(event.id)
    events.value = events.value.filter((item) => item.id !== event.id)
    ElMessage.success('賽事報名已刪除')
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '賽事報名刪除失敗')
  }
}

const uploadTemplate = async (uploadFile: UploadFile, _uploadFiles: UploadFiles) => {
  const file = uploadFile.raw
  if (!file || uploading.value) return
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'docx'].includes(extension || '')) {
    ElMessage.error('只接受 .xlsx 或 .docx 範本')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('範本檔案不可超過 10 MB')
    return
  }

  uploading.value = true
  try {
    const created = await uploadRegistrationFormTemplate(file)
    templates.value = [created, ...templates.value]
    ElMessage.success(`已上傳「${created.name}」，可在賽事編輯中掛上此範本`)
  } catch (error: any) {
    ElMessage.error(error?.message || '範本上傳失敗')
  } finally {
    uploading.value = false
  }
}

const downloadOriginal = async (template: RegistrationFormTemplate) => {
  try {
    await downloadRegistrationFormTemplate(template)
  } catch (error: any) {
    ElMessage.error(error?.message || '原始範本下載失敗')
  }
}

const removeTemplate = async (template: RegistrationFormTemplate) => {
  try {
    await ElMessageBox.confirm(
      `刪除「${template.name}」後會從所有賽事移除，且無法再下載或產生文件，確定要繼續嗎？`,
      '刪除報名表範本',
      { type: 'warning', confirmButtonText: '確定刪除', cancelButtonText: '取消' }
    )
    await deleteRegistrationFormTemplate(template.id)
    templates.value = templates.value.filter((item) => item.id !== template.id)
    events.value = events.value.map((event) => ({
      ...event,
      template_ids: event.template_ids.filter((id) => id !== template.id)
    }))
    ElMessage.success('範本已刪除')
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '刪除範本失敗')
  }
}

const openWizard = async (event: RegistrationFormEvent, template: RegistrationFormTemplate) => {
  if (!canGenerate.value) {
    ElMessage.error('產生含完整個資的報名表需要報名表新增與球員編輯權限')
    return
  }
  try {
    await rosterStore.loadRoster({ userId: authStore.user?.id, canEditPlayers: true })
    activeEvent.value = event
    activeTemplate.value = template
    wizardOpen.value = true
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入完整球員名單')
  }
}

const generate = async (payload: RegistrationWizardPayload) => {
  if (!activeEvent.value || !activeTemplate.value) return
  generating.value = true
  try {
    const fallback = `${activeEvent.value.name}_${activeTemplate.value.name}_已填寫.${activeTemplate.value.file_type}`
    const fileName = await generateRegistrationFormDocument({ ...payload, event_id: activeEvent.value.id }, fallback)
    wizardOpen.value = false
    await refreshEvents()
    ElMessage.success(`已下載「${fileName}」`)
  } catch (error: any) {
    ElMessage.error(error?.message || '報名表產生失敗')
  } finally {
    generating.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="min-h-full bg-slate-50 px-3 py-5 sm:px-4 md:px-6 md:py-7">
    <div class="mx-auto max-w-6xl">
      <AppPageHeader
        title="賽事報名管理"
        subtitle="以賽事統一管理報名期限、範本與產檔狀態；範本可跨年度重複使用。"
        :icon="Trophy"
      >
        <template #actions>
          <el-button v-if="canCreate" type="primary" size="large" :icon="Plus" @click="openCreateEvent">新增賽事</el-button>
        </template>
      </AppPageHeader>

      <el-alert
        v-if="canCreate && !canReadPrivateRoster"
        title="目前可管理賽事與範本，但沒有球員編輯權限，因此不能產生含完整個資的報名表。"
        type="warning"
        :closable="false"
        show-icon
        class="mb-4"
      />

      <AppLoadingState v-if="loading" text="載入賽事報名資料..." />
      <el-tabs v-else v-model="activeTab" class="registration-management-tabs">
        <el-tab-pane label="賽事報名" name="events">
          <el-empty v-if="!events.length" description="尚未建立賽事報名">
            <el-button v-if="canCreate" type="primary" size="large" :icon="Plus" @click="openCreateEvent">新增第一場賽事</el-button>
          </el-empty>

          <section v-else class="grid gap-4" aria-label="賽事報名清單">
            <article v-for="event in events" :key="event.id" class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div class="flex min-w-0 flex-1 items-start gap-3">
                  <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <el-icon class="text-2xl"><Calendar /></el-icon>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="break-words text-lg font-black text-slate-900">{{ event.name }}</h2>
                      <el-tag :type="eventStatusMeta[event.status].type" effect="light">{{ eventStatusMeta[event.status].label }}</el-tag>
                      <el-tag v-if="isOverdue(event)" type="danger" effect="dark">已逾期</el-tag>
                    </div>
                    <p class="mt-1 text-sm text-slate-500">
                      {{ event.season_year }} 年<span v-if="event.category">・{{ event.category }}</span><span v-if="event.organizer">・{{ event.organizer }}</span>
                    </p>
                  </div>
                </div>
                <div class="flex flex-wrap gap-2 sm:justify-end">
                  <el-button v-if="canEdit" size="large" :icon="EditPen" @click="openEditEvent(event)">編輯</el-button>
                  <el-button v-if="canDelete" size="large" type="danger" plain :icon="Delete" @click="removeEvent(event)">刪除</el-button>
                </div>
              </div>

              <dl class="mt-4 grid gap-2 sm:grid-cols-3">
                <div class="rounded-xl bg-slate-50 p-3">
                  <dt class="text-xs font-bold text-slate-500">報名截止</dt>
                  <dd class="mt-1 font-bold text-slate-800">{{ formatDate(event.registration_deadline) }}</dd>
                </div>
                <div class="rounded-xl bg-slate-50 p-3">
                  <dt class="text-xs font-bold text-slate-500">報名表範本</dt>
                  <dd class="mt-1 font-bold text-slate-800">{{ templatesForEvent(event).length }} 份</dd>
                </div>
                <div class="rounded-xl bg-slate-50 p-3">
                  <dt class="text-xs font-bold text-slate-500">最近產生</dt>
                  <dd class="mt-1 truncate font-bold text-slate-800">
                    {{ latestLogByEvent.get(event.id) ? formatDate(latestLogByEvent.get(event.id)?.created_at || null) : '尚未產生' }}
                  </dd>
                </div>
              </dl>

              <p v-if="event.notes" class="mt-3 whitespace-pre-line rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{{ event.notes }}</p>

              <div class="mt-4 border-t border-slate-100 pt-4">
                <h3 class="text-sm font-black text-slate-700">報名文件</h3>
                <p v-if="!templatesForEvent(event).length" class="mt-2 text-sm text-slate-500">
                  尚未掛上範本，請編輯賽事或先到「範本庫」上傳。
                </p>
                <div v-else class="mt-2 grid gap-3 md:grid-cols-2">
                  <div v-for="template in templatesForEvent(event)" :key="template.id" class="rounded-xl border border-slate-200 p-3">
                    <div class="flex items-start gap-3">
                      <el-icon class="mt-0.5 shrink-0 text-xl text-amber-600"><Document /></el-icon>
                      <div class="min-w-0 flex-1">
                        <p class="break-words font-bold text-slate-900">{{ template.name }}</p>
                        <p class="mt-1 text-xs text-slate-500">
                          {{ profileLabel(template) }}・{{ template.file_type.toUpperCase() }}・最多 {{ template.max_players }} 人
                        </p>
                      </div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <el-button
                        type="primary"
                        size="large"
                        :icon="MagicStick"
                        :disabled="!canGenerate || event.status === 'closed'"
                        @click="openWizard(event, template)"
                      >
                        選球員並產生
                      </el-button>
                      <el-button size="large" :icon="Download" @click="downloadOriginal(template)">原檔</el-button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </el-tab-pane>

        <el-tab-pane label="範本庫" name="templates">
          <div class="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="font-black text-slate-900">可重用報名表範本</h2>
              <p class="mt-1 text-sm text-slate-500">檔名可以不同；系統依內部 OOXML 結構辨識支援版型。</p>
            </div>
            <el-upload
              v-if="canCreate"
              accept=".xlsx,.docx"
              :auto-upload="false"
              :show-file-list="false"
              :on-change="uploadTemplate"
              :disabled="uploading"
            >
              <el-button type="primary" size="large" :icon="UploadFilled" :loading="uploading">上傳範本</el-button>
            </el-upload>
          </div>

          <el-empty v-if="!templates.length" description="尚未上傳報名表範本">
            <p class="mb-4 text-sm text-slate-500">目前支援「就是棒臺北」Excel 與「主委盃 U9」Word。</p>
          </el-empty>
          <section v-else class="grid gap-4 md:grid-cols-2" aria-label="報名表範本庫">
            <article v-for="template in templates" :key="template.id" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div class="flex items-start gap-3">
                <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <el-icon class="text-2xl"><Document /></el-icon>
                </div>
                <div class="min-w-0 flex-1">
                  <h2 class="break-words text-lg font-black text-slate-900">{{ template.name }}</h2>
                  <p class="mt-1 break-all text-sm text-slate-500">{{ template.original_file_name }}</p>
                </div>
              </div>

              <dl class="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div class="rounded-xl bg-slate-50 p-3">
                  <dt class="text-xs font-bold text-slate-500">版型</dt>
                  <dd class="mt-1 font-bold text-slate-800">{{ profileLabel(template) }}</dd>
                </div>
                <div class="rounded-xl bg-slate-50 p-3">
                  <dt class="text-xs font-bold text-slate-500">容量</dt>
                  <dd class="mt-1 font-bold text-slate-800">{{ template.max_players }} 人</dd>
                </div>
                <div class="rounded-xl bg-slate-50 p-3">
                  <dt class="text-xs font-bold text-slate-500">上傳日</dt>
                  <dd class="mt-1 font-bold text-slate-800">{{ formatDate(template.created_at) }}</dd>
                </div>
              </dl>

              <div class="mt-5 flex flex-wrap gap-2">
                <el-button size="large" :icon="Download" @click="downloadOriginal(template)">下載原檔</el-button>
                <el-button v-if="canDelete" size="large" type="danger" plain :icon="Delete" @click="removeTemplate(template)">刪除</el-button>
              </div>
            </article>
          </section>
        </el-tab-pane>
      </el-tabs>
    </div>

    <RegistrationEventDialog
      v-model="eventDialogOpen"
      :event="editingEvent"
      :templates="templates"
      :saving="savingEvent"
      @save="saveEvent"
    />

    <RegistrationFormWizard
      v-model="wizardOpen"
      :template="activeTemplate"
      :members="rosterStore.members"
      :generating="generating"
      @generate="generate"
    />
  </div>
</template>

<style scoped>
:deep(.registration-management-tabs > .el-tabs__header) {
  margin-bottom: 1rem;
}

:deep(.registration-management-tabs .el-tabs__item) {
  min-height: 44px;
  font-weight: 800;
}
</style>
