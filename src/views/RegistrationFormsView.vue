<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox, type UploadFile, type UploadFiles } from 'element-plus'
import { Delete, Document, Download, MagicStick, UploadFilled } from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import RegistrationFormWizard from '@/components/registration-forms/RegistrationFormWizard.vue'
import {
  deleteRegistrationFormTemplate,
  downloadRegistrationFormTemplate,
  fetchRegistrationFormTemplates,
  generateRegistrationFormDocument,
  uploadRegistrationFormTemplate
} from '@/services/registrationFormsApi'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { usePlayerRosterStore } from '@/stores/playerRoster'
import type {
  RegistrationFormTemplate,
  RegistrationGeneratePayload
} from '@/types/registrationForm'
import { REGISTRATION_FORM_PROFILES } from '@/utils/registrationForms'

const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const rosterStore = usePlayerRosterStore()
const templates = ref<RegistrationFormTemplate[]>([])
const loading = ref(true)
const uploading = ref(false)
const generating = ref(false)
const activeTemplate = ref<RegistrationFormTemplate | null>(null)
const wizardOpen = ref(false)

const canCreate = computed(() => permissionsStore.can('registration_forms', 'CREATE'))
const canDelete = computed(() => permissionsStore.can('registration_forms', 'DELETE'))
const canReadPrivateRoster = computed(() => permissionsStore.can('players', 'EDIT'))
const canGenerate = computed(() => canCreate.value && canReadPrivateRoster.value)

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '－' : new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

const profileLabel = (template: RegistrationFormTemplate) =>
  REGISTRATION_FORM_PROFILES[template.profile_key]?.label || template.profile_key

const loadTemplates = async () => {
  loading.value = true
  try {
    templates.value = await fetchRegistrationFormTemplates()
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入報名表範本')
  } finally {
    loading.value = false
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
    ElMessage.success(`已上傳「${created.name}」`)
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
      `刪除「${template.name}」後將無法再下載或產生文件，確定要繼續嗎？`,
      '刪除報名表範本',
      { type: 'warning', confirmButtonText: '確認刪除', cancelButtonText: '取消' }
    )
    await deleteRegistrationFormTemplate(template.id)
    templates.value = templates.value.filter((item) => item.id !== template.id)
    ElMessage.success('範本已刪除')
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '刪除範本失敗')
  }
}

const openWizard = async (template: RegistrationFormTemplate) => {
  if (!canGenerate.value) {
    ElMessage.error('產生含完整個資的報名表需要報名表新增與球員編輯權限')
    return
  }
  try {
    await rosterStore.loadRoster({
      userId: authStore.user?.id,
      canEditPlayers: true
    })
    activeTemplate.value = template
    wizardOpen.value = true
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入完整球員名單')
  }
}

const generate = async (payload: RegistrationGeneratePayload) => {
  if (!activeTemplate.value) return
  generating.value = true
  try {
    const fallback = `${activeTemplate.value.name}_已填寫.${activeTemplate.value.file_type}`
    const fileName = await generateRegistrationFormDocument(payload, fallback)
    wizardOpen.value = false
    ElMessage.success(`已下載「${fileName}」`)
  } catch (error: any) {
    ElMessage.error(error?.message || '報名表產生失敗')
  } finally {
    generating.value = false
  }
}

onMounted(loadTemplates)
</script>

<template>
  <div class="min-h-full bg-slate-50 px-3 py-5 sm:px-4 md:px-6 md:py-7">
    <div class="mx-auto max-w-6xl">
      <AppPageHeader
        title="報名表管理"
        subtitle="上傳支援的原始範本，從有效球隊名單選人並自動產生可下載文件。"
        :icon="Document"
      >
        <template #actions>
          <el-upload
            v-if="canCreate"
            accept=".xlsx,.docx"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="uploadTemplate"
            :disabled="uploading"
          >
            <el-button type="primary" size="large" :icon="UploadFilled" :loading="uploading">
              上傳範本
            </el-button>
          </el-upload>
        </template>
      </AppPageHeader>

      <el-alert
        v-if="canCreate && !canReadPrivateRoster"
        title="目前可管理範本，但沒有球員編輯權限，因此不能產生含完整個資的報名表。"
        type="warning"
        :closable="false"
        show-icon
        class="mb-4"
      />

      <AppLoadingState v-if="loading" text="載入報名表範本..." />
      <el-empty v-else-if="!templates.length" description="尚未上傳報名表範本">
        <p class="mb-4 text-sm text-slate-500">第一版支援「就是棒臺北」Excel 與「主委盃 U9」Word。</p>
      </el-empty>
      <section v-else class="grid gap-4 md:grid-cols-2" aria-label="報名表範本清單">
        <article
          v-for="template in templates"
          :key="template.id"
          class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div class="flex items-start gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <el-icon class="text-2xl"><Document /></el-icon>
            </div>
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-lg font-black text-slate-900">{{ template.name }}</h2>
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
            <el-button
              type="primary"
              size="large"
              :icon="MagicStick"
              :disabled="!canGenerate"
              @click="openWizard(template)"
            >
              選球員並產生
            </el-button>
            <el-button size="large" :icon="Download" @click="downloadOriginal(template)">
              下載原檔
            </el-button>
            <el-button
              v-if="canDelete"
              size="large"
              type="danger"
              plain
              :icon="Delete"
              @click="removeTemplate(template)"
            >
              刪除
            </el-button>
          </div>
        </article>
      </section>
    </div>

    <RegistrationFormWizard
      v-model="wizardOpen"
      :template="activeTemplate"
      :members="rosterStore.members"
      :generating="generating"
      @generate="generate"
    />
  </div>
</template>
