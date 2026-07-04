<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Plus, Refresh, Setting } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import { trainingProgramsApi } from '@/services/trainingProgramsApi'
import { usePermissionsStore } from '@/stores/permissions'
import type { TrainingProgramSetting } from '@/types/trainingProgram'
import {
  getTrainingProgramFallbackSettings,
  normalizeTrainingProgramKey,
  normalizeTrainingProgramWeekdays,
  sortTrainingProgramSettings
} from '@/utils/trainingPrograms'

const permissionsStore = usePermissionsStore()
const canEdit = computed(() => permissionsStore.can('training_dates', 'EDIT'))

const settings = ref<TrainingProgramSetting[]>([])
const isLoading = ref(false)
const savingKeys = ref<Record<string, boolean>>({})

const weekdayOptions = [
  { label: '日', value: 0 },
  { label: '一', value: 1 },
  { label: '二', value: 2 },
  { label: '三', value: 3 },
  { label: '四', value: 4 },
  { label: '五', value: 5 },
  { label: '六', value: 6 }
]

const cloneSetting = (setting: TrainingProgramSetting): TrainingProgramSetting => ({
  ...setting,
  default_weekdays: [...setting.default_weekdays]
})

const loadSettings = async () => {
  isLoading.value = true
  try {
    settings.value = (await trainingProgramsApi.listSettings()).map(cloneSetting)
  } catch (error: any) {
    console.error('Error loading training program settings:', error)
    settings.value = getTrainingProgramFallbackSettings()
    ElMessage.error(error?.message || '無法載入訓練項目設定')
  } finally {
    isLoading.value = false
  }
}

const addSetting = () => {
  const index = settings.value.length + 1
  const programKey = `custom_program_${index}`
  settings.value.push({
    program_key: programKey,
    label: `訓練項目 ${index}`,
    team_group: null,
    default_weekdays: [6],
    default_start_time: '09:00',
    default_end_time: '12:00',
    default_venue_name: null,
    default_venue_address: null,
    default_venue_maps_url: null,
    sort_order: (index + 2) * 10,
    is_active: true,
    created_at: null,
    updated_at: null
  })
}

const validateSetting = (setting: TrainingProgramSetting) => {
  setting.program_key = normalizeTrainingProgramKey(setting.program_key)
  setting.default_weekdays = normalizeTrainingProgramWeekdays(setting.default_weekdays)

  if (!setting.label.trim()) {
    ElMessage.warning('請填寫訓練項目名稱')
    return false
  }

  if (!setting.program_key.trim()) {
    ElMessage.warning('請填寫項目代碼')
    return false
  }

  return true
}

const saveSetting = async (setting: TrainingProgramSetting) => {
  if (!canEdit.value || !validateSetting(setting)) return

  savingKeys.value[setting.program_key] = true
  try {
    const saved = await trainingProgramsApi.saveSetting({
      program_key: setting.program_key,
      label: setting.label,
      team_group: setting.team_group,
      default_weekdays: setting.default_weekdays,
      default_start_time: setting.default_start_time,
      default_end_time: setting.default_end_time,
      default_venue_name: setting.default_venue_name,
      default_venue_address: setting.default_venue_address,
      default_venue_maps_url: setting.default_venue_maps_url,
      sort_order: setting.sort_order,
      is_active: setting.is_active
    })

    const index = settings.value.findIndex((item) => item.program_key === setting.program_key)
    if (index >= 0) {
      settings.value[index] = cloneSetting(saved)
    }
    settings.value = sortTrainingProgramSettings(settings.value)
    ElMessage.success('訓練項目設定已儲存')
  } catch (error: any) {
    console.error('Error saving training program setting:', error)
    ElMessage.error(error?.message || '儲存訓練項目設定失敗')
  } finally {
    savingKeys.value[setting.program_key] = false
  }
}

onMounted(() => {
  void loadSettings()
})
</script>

<template>
  <div class="h-full min-w-0 overflow-y-auto bg-background p-2 text-text md:p-6">
    <div class="mx-auto flex max-w-6xl flex-col gap-4">
      <AppPageHeader
        title="訓練項目設定"
        subtitle="管理中港校隊、國中校隊等訓練項目的預設星期、時間與場地。"
        :icon="Setting"
        as="h2"
      >
        <template #actions>
          <button
            type="button"
            class="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition-colors hover:border-primary hover:text-primary"
            :disabled="isLoading"
            @click="loadSettings"
          >
            <el-icon :class="{ 'is-loading': isLoading }"><Refresh /></el-icon>
            重新整理
          </button>
          <button
            v-if="canEdit"
            type="button"
            class="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-white shadow-md transition-colors hover:bg-primary-hover"
            @click="addSetting"
          >
            <el-icon><Plus /></el-icon>
            新增項目
          </button>
        </template>
      </AppPageHeader>

      <AppLoadingState v-if="isLoading" text="讀取訓練項目中..." min-height="45vh" />

      <div v-else class="grid gap-4">
        <section
          v-for="setting in settings"
          :key="setting.program_key"
          class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5"
        >
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div class="text-lg font-black text-slate-900">{{ setting.label || '未命名訓練項目' }}</div>
              <p class="mt-1 text-sm font-bold text-slate-400">
                {{ setting.team_group || '未指定組別' }}｜{{ setting.program_key }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <el-switch
                v-model="setting.is_active"
                :disabled="!canEdit"
                inline-prompt
                active-text="啟用"
                inactive-text="停用"
              />
              <button
                v-if="canEdit"
                type="button"
                class="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                :disabled="savingKeys[setting.program_key]"
                @click="saveSetting(setting)"
              >
                <el-icon><Check /></el-icon>
                {{ savingKeys[setting.program_key] ? '儲存中' : '儲存' }}
              </button>
            </div>
          </div>

          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <el-form-item label="項目名稱" class="mb-0 font-bold">
              <el-input v-model="setting.label" :disabled="!canEdit" size="large" placeholder="例如：國中校隊" />
            </el-form-item>
            <el-form-item label="項目代碼" class="mb-0 font-bold">
              <el-input v-model="setting.program_key" :disabled="!canEdit || Boolean(setting.created_at)" size="large" placeholder="例如：junior_high_school_team" />
            </el-form-item>
            <el-form-item label="對應球員組別" class="mb-0 font-bold">
              <el-input v-model="setting.team_group" :disabled="!canEdit" size="large" placeholder="例如：國中校隊" />
            </el-form-item>
            <el-form-item label="排序" class="mb-0 font-bold">
              <el-input-number v-model="setting.sort_order" :disabled="!canEdit" :step="10" class="!w-full" size="large" />
            </el-form-item>
            <el-form-item label="預設訓練星期" class="mb-0 font-bold md:col-span-2">
              <el-checkbox-group v-model="setting.default_weekdays" :disabled="!canEdit">
                <el-checkbox-button
                  v-for="option in weekdayOptions"
                  :key="option.value"
                  :label="option.value"
                >
                  週{{ option.label }}
                </el-checkbox-button>
              </el-checkbox-group>
            </el-form-item>
            <el-form-item label="預設開始時間" class="mb-0 font-bold">
              <el-time-picker v-model="setting.default_start_time" :disabled="!canEdit" value-format="HH:mm" format="HH:mm" class="!w-full" size="large" />
            </el-form-item>
            <el-form-item label="預設結束時間" class="mb-0 font-bold">
              <el-time-picker v-model="setting.default_end_time" :disabled="!canEdit" value-format="HH:mm" format="HH:mm" class="!w-full" size="large" />
            </el-form-item>
            <el-form-item label="預設場地" class="mb-0 font-bold">
              <el-input v-model="setting.default_venue_name" :disabled="!canEdit" size="large" placeholder="例如：新泰國中" />
            </el-form-item>
            <el-form-item label="地址 / 導航關鍵字" class="mb-0 font-bold">
              <el-input v-model="setting.default_venue_address" :disabled="!canEdit" size="large" placeholder="選填" />
            </el-form-item>
            <el-form-item label="Google Maps 連結" class="mb-0 font-bold md:col-span-2">
              <el-input v-model="setting.default_venue_maps_url" :disabled="!canEdit" size="large" placeholder="選填" />
            </el-form-item>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
