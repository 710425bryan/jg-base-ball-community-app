<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Bell, Delete, Plus, RefreshLeft } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  getMatchReminderScheduleConfig,
  saveMatchReminderScheduleConfig
} from '@/services/matchReminderNotifications'
import {
  MAX_MATCH_REMINDER_RULES,
  createDefaultMatchReminderScheduleConfig,
  validateMatchReminderScheduleConfig,
  type MatchReminderScheduleConfig,
  type MatchReminderScheduleRule
} from '@/utils/matchReminderSchedule'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const isLoading = ref(false)
const isSaving = ref(false)
const showValidation = ref(false)
const draftConfig = ref<MatchReminderScheduleConfig>(createDefaultMatchReminderScheduleConfig())

const cloneConfig = (config: MatchReminderScheduleConfig): MatchReminderScheduleConfig => ({
  version: 1,
  enabled: config.enabled,
  rules: config.rules.map((rule) => ({ ...rule }))
})

const validationErrors = computed(() =>
  validateMatchReminderScheduleConfig(draftConfig.value)
)

const loadConfig = async () => {
  isLoading.value = true
  showValidation.value = false
  try {
    draftConfig.value = cloneConfig(await getMatchReminderScheduleConfig())
  } catch (error: any) {
    draftConfig.value = createDefaultMatchReminderScheduleConfig()
    ElMessage.error(`讀取提醒排程失敗：${error?.message || '請稍後再試'}`)
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.modelValue,
  (nextVisible) => {
    if (nextVisible) {
      void loadConfig()
    }
  }
)

const createRuleId = () => `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const findNextRuleDraft = (): MatchReminderScheduleRule => {
  const existingKeys = new Set(draftConfig.value.rules.map((rule) => `${rule.days_before}:${rule.time}`))
  const preferredDays = [1, 3, 7, 0, 2, 5, 10, 14, 21, 30]
  const daysBefore = preferredDays.find((days) => !existingKeys.has(`${days}:20:00`)) ?? 1

  return {
    id: createRuleId(),
    days_before: daysBefore,
    time: '20:00',
    enabled: true
  }
}

const handleAddRule = () => {
  if (draftConfig.value.rules.length >= MAX_MATCH_REMINDER_RULES) {
    ElMessage.warning(`提醒規則最多只能設定 ${MAX_MATCH_REMINDER_RULES} 組`)
    return
  }

  draftConfig.value.rules.push(findNextRuleDraft())
  showValidation.value = false
}

const handleRemoveRule = (index: number) => {
  if (draftConfig.value.rules.length <= 1) {
    ElMessage.warning('至少需要保留一組提醒規則')
    return
  }

  draftConfig.value.rules.splice(index, 1)
}

const handleResetDefault = () => {
  draftConfig.value = createDefaultMatchReminderScheduleConfig()
  showValidation.value = false
}

const handleSave = async () => {
  showValidation.value = true
  if (validationErrors.value.length > 0) {
    ElMessage.warning(validationErrors.value[0])
    return
  }

  isSaving.value = true
  try {
    draftConfig.value = cloneConfig(await saveMatchReminderScheduleConfig(draftConfig.value))
    ElMessage.success('已儲存提醒排程')
    visible.value = false
  } catch (error: any) {
    ElMessage.error(`儲存提醒排程失敗：${error?.message || '請稍後再試'}`)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="提醒排程"
    width="640px"
    destroy-on-close
    class="match-reminder-schedule-dialog"
  >
    <div v-loading="isLoading" class="space-y-4">
      <div class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-2 text-base font-bold text-gray-800">
            <el-icon class="text-primary"><Bell /></el-icon>
            <span>全站排程</span>
          </div>
          <p class="mt-1 text-sm text-gray-500">所有比賽共用以下提醒規則。</p>
        </div>
        <el-switch
          v-model="draftConfig.enabled"
          active-text="啟用"
          inactive-text="停用"
        />
      </div>

      <el-alert
        v-if="showValidation && validationErrors.length > 0"
        type="warning"
        :closable="false"
        show-icon
      >
        <ul class="m-0 list-disc pl-4">
          <li v-for="error in validationErrors.slice(0, 3)" :key="error">{{ error }}</li>
        </ul>
      </el-alert>

      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-black text-gray-700">排程規則</h3>
          <el-button plain @click="handleAddRule">
            <el-icon class="mr-1.5"><Plus /></el-icon>
            新增規則
          </el-button>
        </div>

        <div
          v-for="(rule, index) in draftConfig.rules"
          :key="rule.id"
          class="rounded-lg border border-gray-200 bg-gray-50/70 p-4"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <el-switch
              v-model="rule.enabled"
              active-text="啟用"
              inactive-text="停用"
            />
            <el-button
              plain
              circle
              type="danger"
              :icon="Delete"
              :disabled="draftConfig.rules.length <= 1"
              @click="handleRemoveRule(index)"
            />
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-xs font-bold text-gray-500">賽前天數</span>
              <el-input-number
                v-model="rule.days_before"
                :min="0"
                :max="30"
                :step="1"
                controls-position="right"
                class="!w-full"
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-bold text-gray-500">發送時間</span>
              <el-time-picker
                v-model="rule.time"
                format="HH:mm"
                value-format="HH:mm"
                :clearable="false"
                class="!w-full"
              />
            </label>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <el-button plain @click="handleResetDefault">
          <el-icon class="mr-1.5"><RefreshLeft /></el-icon>
          還原預設
        </el-button>
        <div class="flex flex-col-reverse gap-2 sm:flex-row">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" :loading="isSaving" @click="handleSave">儲存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>
