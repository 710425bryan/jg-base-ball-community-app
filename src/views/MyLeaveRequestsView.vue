<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0">
      <div class="max-w-6xl mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <AppPageHeader
          title="我的假單"
          subtitle="查看關聯成員的假單紀錄，並可直接送出新的請假申請"
          :icon="Memo"
          as="h2"
        >
          <template #actions>
            <button
              type="button"
              class="flex-1 sm:flex-none rounded-2xl border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300 font-bold px-4 py-3 transition-colors"
              :disabled="isRefreshing"
              @click="refreshCurrentMemberData"
            >
              {{ isRefreshing ? '更新中...' : '重新整理' }}
            </button>

            <button
              type="button"
              class="flex-1 sm:flex-none rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold px-5 py-3 transition-colors disabled:opacity-70"
              :disabled="!canCreateLeaveRequest || isRefreshing"
              @click="openCreateDialog"
            >
              新增假單
            </button>
          </template>
        </AppPageHeader>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <AppLoadingState v-if="isBootstrapping" text="讀取假單資訊中..." min-height="50vh" />

      <div v-else class="max-w-6xl mx-auto flex flex-col gap-4">
        <section
          v-if="members.length === 0"
          class="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 md:p-10 text-center"
        >
          <div class="text-xl font-black text-slate-800">目前沒有可操作的關聯成員</div>
          <p class="mt-3 text-sm text-gray-500 leading-relaxed">
            你的帳號尚未綁定任何成員，若需要送出假單，請先請管理員在使用者名單完成成員綁定。
          </p>
        </section>

        <template v-else>
          <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div class="w-full lg:max-w-md">
                <label class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">送假成員</label>
                <el-select
                  v-model="selectedMemberId"
                  class="w-full mt-2"
                  size="large"
                  placeholder="請選擇成員"
                >
                  <el-option
                    v-for="member in members"
                    :key="member.member_id"
                    :label="buildMemberOptionLabel(member)"
                    :value="member.member_id"
                  />
                </el-select>
                <p class="mt-2 text-xs text-gray-400">
                  {{ memberSelectorHelperText }}
                </p>
              </div>

              <div
                v-if="selectedMember"
                class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-primary font-bold"
              >
                目前送假對象：{{ selectedMember.name }} / {{ selectedMember.training_program_label || selectedMember.role }}
              </div>
            </div>
          </section>

          <section class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <h3 class="text-lg font-black text-slate-800">假單紀錄</h3>
                <p class="text-xs text-gray-400 mt-1">
                  只顯示目前所選關聯成員的假單，送出後會通知具請假查看權限的人員
                </p>
              </div>

              <div v-if="selectedMember" class="text-sm font-bold text-gray-500">
                {{ selectedMember.name }}
              </div>
            </div>

            <div v-if="isRefreshing" class="p-6 text-sm text-gray-400 font-bold">
              讀取最新假單中...
            </div>

            <div v-else-if="leaveRequests.length === 0" class="p-6 text-sm text-gray-400 font-bold">
              目前沒有假單紀錄。
            </div>

            <div v-else class="p-4 md:p-5 grid gap-3 md:grid-cols-2">
              <article
                v-for="leave in leaveRequests"
                :key="leave.id"
                class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 shadow-sm"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-lg font-black text-slate-800">{{ formatLeaveDateRange(leave.start_date, leave.end_date) }}</div>
                    <div class="mt-1 text-xs font-bold text-primary">{{ formatLeaveTimeSegment(leave.leave_time_segment) }}</div>
                    <div class="text-xs text-gray-400 mt-1">{{ leave.member_name }} / {{ leave.member_role || '未分類' }}</div>
                  </div>

                  <div class="flex items-center gap-2">
                    <span :class="getLeaveBadgeClass(leave.leave_type)" class="inline-flex rounded-full px-3 py-1 text-xs font-bold border whitespace-nowrap">
                      {{ leave.leave_type }}
                    </span>
                    <button
                      type="button"
                      class="rounded-xl border border-red-100 bg-red-50 p-2 text-red-500 hover:bg-red-100 transition-colors"
                      title="刪除假單"
                      @click="confirmDelete(leave)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div class="mt-4 grid gap-2 text-sm text-gray-600">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-gray-400">建立時間</span>
                    <span class="font-medium text-right">{{ formatDateTime(leave.created_at) }}</span>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <span class="text-gray-400 shrink-0">原因</span>
                    <span class="font-medium text-right whitespace-pre-line break-words">{{ leave.reason || '無說明' }}</span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </template>
      </div>
    </div>

    <el-dialog
      v-model="isCreateDialogOpen"
      title="新增假單"
      width="90%"
      style="max-width: 500px; border-radius: 16px;"
      destroy-on-close
      class="custom-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top" class="mt-4 space-y-4">
        <div class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm font-bold text-primary">
          目前送假成員：{{ selectedMember?.name || '尚未選擇' }}
        </div>

        <div class="flex gap-4 w-full flex-col sm:flex-row">
          <el-form-item label="請假類別" prop="leave_type" class="font-bold flex-1 mb-0 sm:mb-4">
            <el-select v-model="form.leave_type" size="large" class="w-full">
              <el-option
                v-for="option in LEAVE_TYPE_OPTIONS"
                :key="option"
                :label="option"
                :value="option"
              />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="請假模式" prop="leave_mode" class="font-bold mb-5">
          <el-radio-group v-model="form.leave_mode" class="w-full flex custom-segmented leave-mode-selector" @change="handleLeaveDateSelectionChange">
            <el-radio-button
              v-for="option in MY_LEAVE_MODE_OPTIONS"
              :key="option"
              :label="option"
              class="flex-1"
            />
          </el-radio-group>
        </el-form-item>

        <template v-if="form.leave_mode === '上課日期快選'">
          <el-form-item label="上課日期" prop="selected_training_dates" class="font-bold">
            <section data-test="training-date-quick-select" class="w-full rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div class="text-sm font-black text-slate-800">
                    {{ selectedProgram.label }} 上課日期
                  </div>
                  <p class="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                    可直接多選要請假的上課日期，若要請未來月份可繼續載入下個月。
                  </p>
                </div>

                <button
                  type="button"
                  data-test="load-next-training-month"
                  class="shrink-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
                  :disabled="isTrainingDateQuickSelectLoading"
                  @click="loadNextTrainingMonth"
                >
                  載入下個月
                </button>
              </div>

              <div v-if="isTrainingDateQuickSelectLoading && trainingDateQuickSelectMonths.length === 0" class="mt-4 rounded-xl border border-dashed border-emerald-200 bg-white/70 px-4 py-5 text-center text-sm font-bold text-emerald-700">
                載入上課日期中...
              </div>

              <el-alert
                v-if="trainingDateQuickSelectError"
                type="warning"
                show-icon
                :closable="false"
                class="!mt-4 !rounded-xl"
              >
                <template #title>
                  {{ trainingDateQuickSelectError }}
                </template>
              </el-alert>

              <div v-if="trainingDateQuickSelectMonthItems.length > 0" class="mt-4 space-y-4">
                <div
                  v-for="monthItem in trainingDateQuickSelectMonthItems"
                  :key="monthItem.month"
                  class="rounded-xl border border-emerald-100 bg-white p-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="text-sm font-black text-slate-700">
                      {{ formatTrainingMonthLabel(monthItem.month) }}
                    </div>
                    <div class="text-xs font-bold text-slate-400">
                      {{ monthItem.dates.length }} 天
                    </div>
                  </div>

                  <div v-if="monthItem.dates.length === 0" class="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-400">
                    這個月目前沒有上課日期
                  </div>

                  <div v-else class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <button
                      v-for="date in monthItem.dates"
                      :key="date"
                      type="button"
                      data-test="training-date-option"
                      :data-date="date"
                      :disabled="isTrainingDateDisabled(date)"
                      :title="isTrainingDateDisabled(date) ? '已超過今天，不能選擇' : ''"
                      class="min-h-[44px] rounded-xl border px-3 py-2 text-sm font-black transition-all"
                      :class="isTrainingDateDisabled(date)
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70'
                        : isTrainingDateSelected(date)
                          ? 'border-primary bg-primary text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50 hover:text-primary'"
                      :aria-disabled="isTrainingDateDisabled(date)"
                      :aria-pressed="isTrainingDateSelected(date)"
                      @click="toggleTrainingDateSelection(date)"
                    >
                      {{ formatTrainingMonthDateLabel(date) }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="mt-4 rounded-xl border border-primary/10 bg-white px-4 py-3 text-sm font-bold text-slate-600">
                <span v-if="selectedTrainingDates.length > 0">
                  已選 {{ selectedTrainingDates.length }} 天：{{ selectedTrainingDatesSummary }}
                </span>
                <span v-else class="text-slate-400">
                  請至少選擇一個上課日期。
                </span>
              </div>
            </section>
          </el-form-item>
        </template>

        <template v-else-if="form.leave_mode === '單日請假'">
          <el-form-item label="請假時段" prop="leave_time_segment" class="font-bold">
            <el-radio-group v-model="form.leave_time_segment" class="w-full flex custom-segmented">
              <el-radio-button
                v-for="option in LEAVE_TIME_SEGMENT_OPTIONS"
                :key="option.value"
                :label="option.value"
                class="flex-1"
              >
                {{ option.label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="請假日期" prop="date_single" class="font-bold">
            <el-date-picker
              v-model="form.date_single"
              type="date"
              placeholder="選擇日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              size="large"
              class="!w-full"
              @change="handleLeaveDateSelectionChange"
            />
          </el-form-item>
        </template>

        <template v-else-if="form.leave_mode === '連續多日'">
          <el-form-item label="請假日期區間" prop="date_range" class="font-bold">
            <el-date-picker
              v-model="form.date_range"
              type="daterange"
              range-separator="至"
              start-placeholder="開始日期"
              end-placeholder="結束日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              size="large"
              class="!w-full"
              @change="handleLeaveDateSelectionChange"
            />
          </el-form-item>
        </template>

        <template v-else-if="form.leave_mode === '固定週期'">
          <div class="bg-purple-50/40 rounded-xl p-4 border border-purple-100 flex flex-col gap-4 mb-4">
            <el-form-item label="固定星期請假" class="font-bold text-primary mb-0 custom-week-selector">
              <el-checkbox-group
                v-model="form.recurring_days"
                size="default"
                class="w-full flex justify-between sm:justify-start gap-1 sm:gap-2"
                @change="handleLeaveDateSelectionChange"
              >
                <el-checkbox-button
                  v-for="option in LEAVE_WEEKDAY_OPTIONS"
                  :key="option.value"
                  :label="option.value"
                >
                  {{ option.label }}
                </el-checkbox-button>
              </el-checkbox-group>
            </el-form-item>

            <el-form-item label="生效期限 (必填)" class="font-bold text-primary mb-0">
              <el-date-picker
                v-model="form.recurring_range"
                type="daterange"
                range-separator="至"
                start-placeholder="開始日期"
                end-placeholder="結束日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                class="!w-full"
                @change="handleLeaveDateSelectionChange"
              />
            </el-form-item>
          </div>
        </template>

        <el-alert
          v-if="nonTrainingLeaveDates.length > 0"
          type="warning"
          show-icon
          :closable="false"
          class="!rounded-xl"
        >
          <template #title>
            請假日期不是上課日期
          </template>
          <p class="text-sm leading-relaxed">
            {{ nonTrainingLeaveDatesSummary }} 不是目前訓練日期設定中的上課日期，仍可送出假單。
          </p>
        </el-alert>

        <el-form-item label="請假原因說明" prop="reason" class="font-bold">
          <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="請簡述請假事由 (選填)" />
          <p class="text-sm text-gray-400 font-normal mt-1 w-full">
            假單送出後將自動生效，並同步通知具請假查看權限的相關人員。
          </p>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3 mt-4">
          <button
            type="button"
            class="rounded-2xl border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300 font-bold px-5 py-3 transition-colors"
            @click="isCreateDialogOpen = false"
          >
            取消
          </button>

          <button
            type="button"
            data-test="submit-leave-request"
            class="rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold px-6 py-3 transition-colors disabled:opacity-70"
            :disabled="isSubmitting"
            @click="submitLeaveRequest"
          >
            {{ isSubmitting ? '送出中...' : '送出假單' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Memo } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import {
  createMyLeaveRequests,
  deleteMyLeaveRequest,
  listMyLeaveMembers,
  listMyLeaveRequests
} from '@/services/myLeaveRequests'
import { trainingDatesApi } from '@/services/trainingDatesApi'
import { trainingProgramsApi } from '@/services/trainingProgramsApi'
import type {
  LeaveRequestFormState,
  MyLeaveMember,
  MyLeaveRequest
} from '@/types/leaveRequests'
import type { TrainingProgramSetting } from '@/types/trainingProgram'
import {
  buildLeaveNotificationDateLabel,
  buildLeaveRequestRecords,
  collectLeaveRequestDates,
  createDefaultLeaveRequestFormState,
  findNonTrainingLeaveDates,
  getLeaveTimeSegmentLabel,
  LEAVE_TIME_SEGMENT_OPTIONS,
  LEAVE_TYPE_OPTIONS,
  LEAVE_WEEKDAY_OPTIONS,
  MY_LEAVE_MODE_OPTIONS,
  leaveRequestBaseRules
} from '@/utils/leaveRequests'
import {
  buildGroupedPushEventKey,
  describePushDispatchIssue,
  dispatchPushNotification
} from '@/utils/pushNotifications'
import {
  formatTrainingMonthDateLabel,
  formatTrainingMonthLabel
} from '@/utils/trainingMonthDates'
import {
  DEFAULT_TRAINING_PROGRAM_KEY,
  getTrainingProgramFallbackSettings,
  getTrainingProgramForMember,
  getTrainingProgramSettingByKey
} from '@/utils/trainingPrograms'

const members = ref<MyLeaveMember[]>([])
const programSettings = ref<TrainingProgramSetting[]>(getTrainingProgramFallbackSettings())
const leaveRequests = ref<MyLeaveRequest[]>([])
const selectedMemberId = ref('')
const isBootstrapping = ref(true)
const isRefreshing = ref(false)
const isCreateDialogOpen = ref(false)
const isSubmitting = ref(false)
const nonTrainingLeaveDates = ref<string[]>([])
const trainingDateQuickSelectMonths = ref<string[]>([])
const trainingDateQuickSelectDatesByMonth = ref<Record<string, string[]>>({})
const isTrainingDateQuickSelectLoading = ref(false)
const trainingDateQuickSelectError = ref('')
const trainingDateCheckToken = ref(0)
const trainingDateQuickSelectToken = ref(0)
const lastTrainingDateWarningKey = ref('')
const formRef = ref()
const trainingDateCache = new Map<string, string[]>()

const form = reactive<LeaveRequestFormState>(createDefaultLeaveRequestFormState(dayjs(), {
  leaveMode: '上課日期快選'
}))
const formRules = leaveRequestBaseRules

const selectedMember = computed(() => {
  return members.value.find((member) => member.member_id === selectedMemberId.value) || null
})

const selectedProgram = computed(() =>
  selectedMember.value?.training_program
    ? getTrainingProgramSettingByKey(programSettings.value, selectedMember.value.training_program)
    : getTrainingProgramForMember(selectedMember.value, programSettings.value)
)

const canCreateLeaveRequest = computed(() => {
  return Boolean(selectedMember.value)
})

const memberSelectorHelperText = computed(() => {
  if (members.value.length <= 1) {
    return '系統會自動使用你目前綁定的成員。'
  }

  return '切換不同關聯成員時，頁面會同步顯示對應的假單紀錄。'
})

const nonTrainingLeaveDatesSummary = computed(() => {
  const previewDates = nonTrainingLeaveDates.value.slice(0, 5).map(formatTrainingMonthDateLabel)
  const suffix = nonTrainingLeaveDates.value.length > 5
    ? ` 等 ${nonTrainingLeaveDates.value.length} 天`
    : ''

  return `${previewDates.join('、')}${suffix}`
})

const selectedTrainingDates = computed(() => (
  [...new Set(form.selected_training_dates || [])].sort((left, right) => left.localeCompare(right))
))

const selectedTrainingDateSet = computed(() => new Set(selectedTrainingDates.value))

const selectedTrainingDatesSummary = computed(() => {
  const previewDates = selectedTrainingDates.value.slice(0, 5).map(formatTrainingMonthDateLabel)
  const suffix = selectedTrainingDates.value.length > 5
    ? ` 等 ${selectedTrainingDates.value.length} 天`
    : ''

  return `${previewDates.join('、')}${suffix}`
})

const trainingDateQuickSelectMonthItems = computed(() => (
  [...trainingDateQuickSelectMonths.value]
    .sort((left, right) => left.localeCompare(right))
    .map((month) => ({
      month,
      dates: trainingDateQuickSelectDatesByMonth.value[month] || []
    }))
))

const sortLeaveRequests = (rows: MyLeaveRequest[]) => {
  return [...rows].sort((left, right) => {
    const startDiff = new Date(right.start_date).getTime() - new Date(left.start_date).getTime()
    if (startDiff !== 0) {
      return startDiff
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  })
}

const buildMemberOptionLabel = (member: MyLeaveMember) => {
  return `${member.name}｜${member.training_program_label || member.team_group || member.role}`
}

const getLeaveBadgeClass = (type: string) => {
  switch (type) {
    case '事假':
      return 'bg-orange-50 border-orange-200 text-primary'
    case '病假':
      return 'bg-red-50 border-red-200 text-red-600'
    case '公假':
      return 'bg-blue-50 border-blue-200 text-blue-600'
    default:
      return 'bg-gray-50 border-gray-200 text-gray-600'
  }
}

const formatLeaveDateRange = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) {
    return '日期未設定'
  }

  if (startDate === endDate) {
    return startDate
  }

  return `${startDate} ~ ${endDate}`
}

const formatLeaveTimeSegment = (segment: unknown) => getLeaveTimeSegmentLabel(segment)

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '尚無資料'
  }

  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '尚無資料'
}

const hydrateFormDefaults = () => {
  Object.assign(form, createDefaultLeaveRequestFormState(dayjs(), {
    leaveMode: '上課日期快選'
  }))
  nonTrainingLeaveDates.value = []
  lastTrainingDateWarningKey.value = ''
  resetTrainingDateQuickSelect()
}

const enrichLeaveMembersWithPrograms = (rows: MyLeaveMember[]) =>
  rows.map((member) => {
    const program = member.training_program
      ? getTrainingProgramSettingByKey(programSettings.value, member.training_program)
      : getTrainingProgramForMember(member, programSettings.value)
    return {
      ...member,
      training_program: program.program_key,
      training_program_label: program.label
    }
  })

const getTrainingDatesForMonth = async (month: string, programKey = selectedProgram.value.program_key) => {
  const cacheKey = `${programKey || DEFAULT_TRAINING_PROGRAM_KEY}:${month}`
  const cachedDates = trainingDateCache.get(cacheKey)
  if (cachedDates) {
    return cachedDates
  }

  const program = getTrainingProgramSettingByKey(programSettings.value, programKey)
  const result = await trainingDatesApi.getMonthDates(month, {
    programKey: program.program_key,
    programLabel: program.label,
    defaultWeekdays: program.default_weekdays
  })
  trainingDateCache.set(cacheKey, result.training_dates)
  return result.training_dates
}

const getInitialTrainingDateQuickSelectMonths = () => {
  const currentMonth = dayjs().format('YYYY-MM')
  return [currentMonth, getAdjacentTrainingMonth(currentMonth, 1)]
}

const getAdjacentTrainingMonth = (month: string, amount: number) =>
  dayjs(`${month}-01`).add(amount, 'month').format('YYYY-MM')

const resetTrainingDateQuickSelect = () => {
  trainingDateQuickSelectMonths.value = []
  trainingDateQuickSelectDatesByMonth.value = {}
  trainingDateQuickSelectError.value = ''
  isTrainingDateQuickSelectLoading.value = false
  trainingDateQuickSelectToken.value += 1
}

const loadTrainingDateQuickSelectMonths = async (months: string[]) => {
  const currentMonth = dayjs().format('YYYY-MM')
  const nextMonths = [...new Set(months)]
    .filter((month) => dayjs(`${month}-01`).isValid())
    .filter((month) => month >= currentMonth)
    .filter((month) => !trainingDateQuickSelectDatesByMonth.value[month])
    .sort((left, right) => left.localeCompare(right))

  if (nextMonths.length === 0) {
    return
  }

  const currentToken = trainingDateQuickSelectToken.value + 1
  trainingDateQuickSelectToken.value = currentToken
  isTrainingDateQuickSelectLoading.value = true
  trainingDateQuickSelectError.value = ''
  const programKey = selectedProgram.value.program_key

  try {
    const entries = await Promise.all(nextMonths.map(async (month) => [
      month,
      await getTrainingDatesForMonth(month, programKey)
    ] as const))

    if (currentToken !== trainingDateQuickSelectToken.value) {
      return
    }

    trainingDateQuickSelectDatesByMonth.value = {
      ...trainingDateQuickSelectDatesByMonth.value,
      ...Object.fromEntries(entries)
    }
    trainingDateQuickSelectMonths.value = [...new Set([
      ...trainingDateQuickSelectMonths.value,
      ...entries.map(([month]) => month)
    ])].sort((left, right) => left.localeCompare(right))
  } catch (error) {
    console.warn('無法載入上課日期快選資料', error)
    if (currentToken === trainingDateQuickSelectToken.value) {
      trainingDateQuickSelectError.value = '上課日期載入失敗，請稍後再試。'
    }
  } finally {
    if (currentToken === trainingDateQuickSelectToken.value) {
      isTrainingDateQuickSelectLoading.value = false
    }
  }
}

const loadInitialTrainingDateQuickSelectMonths = () =>
  loadTrainingDateQuickSelectMonths(getInitialTrainingDateQuickSelectMonths())

const ensureTrainingDateQuickSelectMonths = () => {
  if (trainingDateQuickSelectMonths.value.length === 0) {
    void loadInitialTrainingDateQuickSelectMonths()
  }
}

const loadNextTrainingMonth = () => {
  const items = trainingDateQuickSelectMonthItems.value
  const lastMonth = items[items.length - 1]?.month || dayjs().format('YYYY-MM')
  void loadTrainingDateQuickSelectMonths([getAdjacentTrainingMonth(lastMonth, 1)])
}

const isTrainingDateSelected = (date: string) => selectedTrainingDateSet.value.has(date)

const getTodayDate = () => dayjs().format('YYYY-MM-DD')

const isTrainingDateDisabled = (date: string) => date < getTodayDate()

const toggleTrainingDateSelection = (date: string) => {
  if (isTrainingDateDisabled(date)) {
    return
  }

  const selected = new Set(selectedTrainingDates.value)
  if (selected.has(date)) {
    selected.delete(date)
  } else {
    selected.add(date)
  }

  form.selected_training_dates = [...selected].sort((left, right) => left.localeCompare(right))
}

const buildNonTrainingLeaveDatesMessage = (dates: string[]) => {
  const previewDates = dates.slice(0, 5).map(formatTrainingMonthDateLabel)
  const suffix = dates.length > 5 ? ` 等 ${dates.length} 天` : ''
  return `提醒：${previewDates.join('、')}${suffix} 不是上課日期，假單仍可送出。`
}

const refreshTrainingDateWarning = async ({ notify = false }: { notify?: boolean } = {}) => {
  if (form.leave_mode === '上課日期快選') {
    nonTrainingLeaveDates.value = []
    lastTrainingDateWarningKey.value = ''
    return []
  }

  const leaveDates = collectLeaveRequestDates(form)
  const currentToken = trainingDateCheckToken.value + 1
  trainingDateCheckToken.value = currentToken

  if (leaveDates.length === 0) {
    nonTrainingLeaveDates.value = []
    lastTrainingDateWarningKey.value = ''
    return []
  }

  try {
    const months = [...new Set(leaveDates.map((date) => date.slice(0, 7)))]
    const trainingDatesByMonth = await Promise.all(months.map((month) =>
      getTrainingDatesForMonth(month, selectedProgram.value.program_key)
    ))
    const nextNonTrainingDates = findNonTrainingLeaveDates(leaveDates, trainingDatesByMonth.flat())

    if (currentToken !== trainingDateCheckToken.value) {
      return nextNonTrainingDates
    }

    nonTrainingLeaveDates.value = nextNonTrainingDates

    const warningKey = `${form.leave_mode}:${nextNonTrainingDates.join('|')}`
    if (nextNonTrainingDates.length === 0) {
      lastTrainingDateWarningKey.value = ''
    } else if (notify && warningKey !== lastTrainingDateWarningKey.value) {
      ElMessage.warning(buildNonTrainingLeaveDatesMessage(nextNonTrainingDates))
      lastTrainingDateWarningKey.value = warningKey
    }

    return nextNonTrainingDates
  } catch (error) {
    console.warn('無法檢查請假日期是否為上課日期', error)
    if (currentToken === trainingDateCheckToken.value) {
      nonTrainingLeaveDates.value = []
      lastTrainingDateWarningKey.value = ''
    }
    return []
  }
}

const handleLeaveDateSelectionChange = () => {
  if (form.leave_mode !== '單日請假') {
    form.leave_time_segment = 'full_day'
  }

  if (form.leave_mode === '上課日期快選') {
    nonTrainingLeaveDates.value = []
    lastTrainingDateWarningKey.value = ''
    ensureTrainingDateQuickSelectMonths()
    return
  }

  void nextTick().then(() => refreshTrainingDateWarning({ notify: true }))
}

const refreshCurrentMemberData = async () => {
  if (!selectedMemberId.value) {
    leaveRequests.value = []
    return
  }

  isRefreshing.value = true

  try {
    const nextLeaveRequests = await listMyLeaveRequests(selectedMemberId.value)
    leaveRequests.value = sortLeaveRequests(nextLeaveRequests)
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取假單資訊失敗')
  } finally {
    isRefreshing.value = false
  }
}

const openCreateDialog = async () => {
  if (!canCreateLeaveRequest.value) {
    return
  }

  hydrateFormDefaults()
  isCreateDialogOpen.value = true
  await nextTick()
  formRef.value?.clearValidate?.()
  void loadInitialTrainingDateQuickSelectMonths()
}

const submitLeaveRequest = async () => {
  if (!formRef.value || !selectedMember.value) {
    return
  }

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  isSubmitting.value = true

  try {
    const records = buildLeaveRequestRecords({
      memberId: selectedMember.value.member_id,
      form
    })

    const nextNonTrainingDates = await refreshTrainingDateWarning()
    if (nextNonTrainingDates.length > 0) {
      ElMessage.warning(buildNonTrainingLeaveDatesMessage(nextNonTrainingDates))
    }

    const createdRows = await createMyLeaveRequests({
      member_id: selectedMember.value.member_id,
      records: records.map((record) => ({
        leave_type: record.leave_type,
        leave_time_segment: record.leave_time_segment,
        start_date: record.start_date,
        end_date: record.end_date,
        reason: record.reason
      }))
    })

    await refreshCurrentMemberData()

    const firstCreatedRow = createdRows[0] || null
    let pushIssueMessage = ''
    if (firstCreatedRow) {
      try {
        const pushResult = await dispatchPushNotification({
          title: `[新增假單] ${selectedMember.value.name} 的${form.leave_type}`,
          body: `${buildLeaveNotificationDateLabel({
            leaveMode: form.leave_mode,
            form,
            recordCount: createdRows.length
          })}\n原因：${firstCreatedRow.reason || '無'}`,
          url: `/leave-requests?highlight_leave_id=${firstCreatedRow.id}`,
          feature: 'leave_requests',
          action: 'VIEW',
          eventKey: buildGroupedPushEventKey('leave_request', createdRows.map((row) => row.id))
        })

        pushIssueMessage = describePushDispatchIssue(pushResult) || ''
      } catch (pushError) {
        console.warn('我的假單通知發送失敗', pushError)
        pushIssueMessage = '通知發送失敗，請稍後確認接收裝置或推播設定。'
      }
    }

    isCreateDialogOpen.value = false
    ElMessage.success('假單已送出')
    if (pushIssueMessage) {
      ElMessage.warning(`假單已送出，但${pushIssueMessage}`)
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '送出假單失敗')
  } finally {
    isSubmitting.value = false
  }
}

const confirmDelete = async (leave: MyLeaveRequest) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆假單嗎？', '⚠️ 刪除確認', {
      confirmButtonText: '確定刪除',
      cancelButtonText: '取消',
      type: 'error'
    })

    await deleteMyLeaveRequest(leave.id)
    leaveRequests.value = leaveRequests.value.filter((item) => item.id !== leave.id)
    ElMessage.success('刪除成功')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '刪除假單失敗')
    }
  }
}

onMounted(async () => {
  isBootstrapping.value = true

  try {
    programSettings.value = await trainingProgramsApi.listSettings().catch((error) => {
      console.warn('訓練項目設定無法載入，請假頁暫以預設項目判斷。', error)
      return getTrainingProgramFallbackSettings()
    })
    members.value = enrichLeaveMembersWithPrograms(await listMyLeaveMembers())
    selectedMemberId.value = members.value[0]?.member_id || ''

    if (selectedMemberId.value) {
      await refreshCurrentMemberData()
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取我的假單失敗')
  } finally {
    isBootstrapping.value = false
  }
})

watch(selectedMemberId, async (nextMemberId, previousMemberId) => {
  if (isBootstrapping.value || !nextMemberId || nextMemberId === previousMemberId) {
    return
  }

  await refreshCurrentMemberData()
  if (isCreateDialogOpen.value) {
    form.selected_training_dates = []
    resetTrainingDateQuickSelect()
    if (form.leave_mode === '上課日期快選') {
      void loadInitialTrainingDateQuickSelectMonths()
    } else {
      void refreshTrainingDateWarning({ notify: true })
    }
  }
})
</script>

<style scoped>
.custom-dialog :deep(.el-dialog__header) {
  border-bottom: 1px solid #f3f4f6;
  margin-right: 0;
  padding: 24px;
}

.custom-dialog :deep(.el-dialog__title) {
  font-weight: 800;
  color: #1f2937;
  font-size: 1.25rem;
}

.custom-dialog :deep(.el-dialog__body) {
  padding: 16px 24px 0 24px;
}

.custom-segmented {
  --el-radio-button-checked-bg-color: var(--color-primary);
  --el-radio-button-checked-border-color: var(--color-primary);
  --el-radio-button-checked-text-color: #fff;
}

.custom-segmented :deep(.el-radio-button) {
  flex: 1 1 0;
  min-width: 0;
}

.custom-segmented :deep(.el-radio-button__inner) {
  width: 100%;
  border-radius: 0;
  border-color: #e5e7eb;
  color: #6b7280;
  font-weight: 700;
}

.custom-segmented :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
}

.custom-segmented :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
}

.custom-segmented :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  box-shadow: -1px 0 0 0 var(--color-primary) !important;
  color: #fff !important;
}

.leave-mode-selector {
  flex-wrap: wrap;
  gap: 0.5rem;
}

.leave-mode-selector :deep(.el-radio-button) {
  flex: 1 1 calc(50% - 0.5rem);
}

.leave-mode-selector :deep(.el-radio-button__inner) {
  border-left: 1px solid #e5e7eb;
  border-radius: 8px !important;
}

@media (min-width: 640px) {
  .leave-mode-selector {
    flex-wrap: nowrap;
    gap: 0;
  }

  .leave-mode-selector :deep(.el-radio-button) {
    flex: 1 1 0;
  }

  .leave-mode-selector :deep(.el-radio-button__inner) {
    border-radius: 0 !important;
  }

  .leave-mode-selector :deep(.el-radio-button:first-child .el-radio-button__inner) {
    border-top-left-radius: 8px !important;
    border-bottom-left-radius: 8px !important;
  }

  .leave-mode-selector :deep(.el-radio-button:last-child .el-radio-button__inner) {
    border-top-right-radius: 8px !important;
    border-bottom-right-radius: 8px !important;
  }
}
</style>
