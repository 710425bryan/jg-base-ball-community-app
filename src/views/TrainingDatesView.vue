<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import {
  Calendar,
  Check,
  Loading,
  MagicStick,
  Refresh
} from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import { trainingDatesApi } from '@/services/trainingDatesApi'
import { usePermissionsStore } from '@/stores/permissions'
import type { TrainingMonthDates } from '@/types/trainingDate'
import {
  formatTrainingMonthDateLabel,
  formatTrainingMonthLabel,
  getDefaultTrainingMonthDates,
  normalizeTrainingMonth,
  normalizeTrainingMonthDateList
} from '@/utils/trainingMonthDates'

type CalendarDay = {
  date: string
  day: number
  weekday: string
  isTrainingDate: boolean
  isToday: boolean
  isPast: boolean
}

const permissionsStore = usePermissionsStore()
const canEdit = computed(() => permissionsStore.can('training_dates', 'EDIT'))
const selectedMonth = ref(dayjs().format('YYYY-MM'))
const monthDates = ref<TrainingMonthDates | null>(null)
const selectedDates = ref<string[]>([])
const note = ref('')
const isLoading = ref(false)
const isSaving = ref(false)

const today = computed(() => dayjs().format('YYYY-MM-DD'))
const monthLabel = computed(() => formatTrainingMonthLabel(selectedMonth.value))
const sortedSelectedDates = computed(() =>
  normalizeTrainingMonthDateList(selectedDates.value, selectedMonth.value)
)
const selectedDateSet = computed(() => new Set(sortedSelectedDates.value))
const defaultDates = computed(() => getDefaultTrainingMonthDates(selectedMonth.value))
const hasCustomSetting = computed(() => monthDates.value?.is_default === false)

const calendarDays = computed<CalendarDay[]>(() => {
  const month = normalizeTrainingMonth(selectedMonth.value)
  const [year, monthNumber] = month.split('-').map(Number)
  const daysInMonth = dayjs(`${month}-01`).daysInMonth()
  const days: CalendarDay[] = []

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    const parsed = dayjs(date)
    days.push({
      date,
      day,
      weekday: `週${'日一二三四五六'[parsed.day()]}`,
      isTrainingDate: selectedDateSet.value.has(date),
      isToday: date === today.value,
      isPast: date < today.value
    })
  }

  const firstDay = dayjs(`${year}-${String(monthNumber).padStart(2, '0')}-01`).day()
  return [
    ...Array.from({ length: firstDay }, (_, index) => ({
      date: `blank-${index}`,
      day: 0,
      weekday: '',
      isTrainingDate: false,
      isToday: false,
      isPast: false
    })),
    ...days
  ]
})

const loadMonthDates = async () => {
  isLoading.value = true
  try {
    const data = await trainingDatesApi.getMonthDates(selectedMonth.value)
    monthDates.value = data
    selectedDates.value = [...data.training_dates]
    note.value = data.note || ''
  } catch (error: any) {
    console.error('Error loading training dates:', error)
    monthDates.value = null
    selectedDates.value = getDefaultTrainingMonthDates(selectedMonth.value)
    note.value = ''
    ElMessage.error(error?.message || '無法載入訓練日期設定')
  } finally {
    isLoading.value = false
  }
}

const applyDefaultSaturdays = () => {
  if (!canEdit.value) return
  selectedDates.value = [...defaultDates.value]
}

const toggleDate = (date: string) => {
  if (!canEdit.value || date.startsWith('blank-')) return
  if (selectedDateSet.value.has(date)) {
    selectedDates.value = selectedDates.value.filter((item) => item !== date)
    return
  }

  selectedDates.value = normalizeTrainingMonthDateList([...selectedDates.value, date], selectedMonth.value)
}

const saveMonthDates = async () => {
  if (!canEdit.value) {
    ElMessage.warning('需要訓練日期編輯權限才能儲存')
    return
  }

  isSaving.value = true
  try {
    const result = await trainingDatesApi.saveMonthDates({
      month: selectedMonth.value,
      trainingDates: sortedSelectedDates.value,
      note: note.value
    })

    monthDates.value = {
      month_start: result.month_start,
      month: normalizeTrainingMonth(result.month_start),
      training_dates: result.training_dates,
      note: result.note,
      is_default: false,
      updated_at: result.updated_at
    }
    selectedDates.value = [...result.training_dates]
    note.value = result.note || ''

    if (result.changed) {
      try {
        const dispatchResult = await trainingDatesApi.dispatchNotifications(result)
        if (dispatchResult?.error) throw new Error(dispatchResult.error)
        ElMessage.success(
          `訓練日期已儲存並通知：新增 ${dispatchResult?.created_count ?? 0} 筆，推播 ${dispatchResult?.dispatched_count ?? 0} 台裝置`
        )
      } catch (notificationError: any) {
        console.error('Error dispatching training date notifications:', notificationError)
        ElMessage.warning('訓練日期已儲存，但通知發送失敗，請稍後再試。')
      }
    } else {
      ElMessage.success('訓練日期已儲存，日期未異動所以未發送通知。')
    }
  } catch (error: any) {
    console.error('Error saving training dates:', error)
    ElMessage.error(error?.message || '儲存訓練日期失敗')
  } finally {
    isSaving.value = false
  }
}

watch(selectedMonth, () => {
  void loadMonthDates()
})

onMounted(() => {
  void loadMonthDates()
})
</script>

<template>
  <div class="h-full min-w-0 overflow-y-auto bg-background p-2 text-text md:p-6">
    <div class="mx-auto flex max-w-7xl flex-col gap-4">
      <AppPageHeader
        title="訓練日期設定"
        subtitle="設定每月訓練日期；未設定月份預設為該月所有星期六。"
        :icon="Calendar"
        as="h2"
      >
        <template #title-suffix>
          <span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
            {{ hasCustomSetting ? '已設定' : '預設週六' }}
          </span>
        </template>
        <template #actions>
          <button
            type="button"
            class="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition-colors hover:border-primary hover:text-primary"
            :disabled="isLoading"
            @click="loadMonthDates"
          >
            <el-icon :class="{ 'is-loading': isLoading }"><Refresh /></el-icon>
            重新整理
          </button>
          <button
            v-if="canEdit"
            type="button"
            class="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-white shadow-md transition-colors hover:bg-primary-hover disabled:opacity-60"
            :disabled="isSaving"
            @click="saveMonthDates"
          >
            <el-icon :class="{ 'is-loading': isSaving }">
              <Loading v-if="isSaving" />
              <Check v-else />
            </el-icon>
            {{ isSaving ? '儲存中' : '儲存設定' }}
          </button>
        </template>
      </AppPageHeader>

      <AppLoadingState v-if="isLoading" text="讀取訓練日期中..." min-height="45vh" />

      <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
          <div class="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] md:items-end">
            <el-form-item label="設定月份" class="mb-0 font-bold">
              <el-date-picker
                v-model="selectedMonth"
                type="month"
                value-format="YYYY-MM"
                format="YYYY 年 MM 月"
                class="!w-full"
                size="large"
              />
            </el-form-item>
            <div class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              {{ monthLabel }} 共 {{ sortedSelectedDates.length }} 個訓練日，個人首頁會一次顯示當月全部日期。
            </div>
          </div>

          <div class="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-black text-slate-400">
            <span v-for="weekday in ['日', '一', '二', '三', '四', '五', '六']" :key="weekday">週{{ weekday }}</span>
          </div>

          <div class="mt-2 grid grid-cols-7 gap-2">
            <button
              v-for="day in calendarDays"
              :key="day.date"
              type="button"
              class="flex aspect-square min-h-12 flex-col items-center justify-center rounded-xl border text-sm font-black transition-colors md:min-h-16"
              :class="[
                day.day === 0 ? 'cursor-default border-transparent bg-transparent' : '',
                day.day > 0 && day.isTrainingDate ? 'border-primary bg-primary text-white shadow-sm shadow-primary/20' : '',
                day.day > 0 && !day.isTrainingDate ? 'border-slate-100 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-primary/5' : '',
                day.isToday && !day.isTrainingDate ? 'ring-2 ring-primary/30' : '',
                !canEdit && day.day > 0 ? 'cursor-default' : ''
              ]"
              :disabled="day.day === 0 || !canEdit"
              @click="toggleDate(day.date)"
            >
              <span v-if="day.day > 0">{{ day.day }}</span>
              <span v-if="day.day > 0" class="mt-1 text-[10px] font-bold opacity-80">{{ day.weekday }}</span>
            </button>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <button
              v-if="canEdit"
              type="button"
              class="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700 transition-colors hover:bg-emerald-100"
              @click="applyDefaultSaturdays"
            >
              <el-icon><MagicStick /></el-icon>
              套用本月星期六
            </button>
          </div>
        </main>

        <aside class="h-fit rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
          <div class="text-lg font-black text-slate-900">本月訓練日</div>
          <p class="mt-1 text-sm font-bold text-slate-400">儲存後若日期有新增或取消，系統會通知家長與球員。</p>

          <div class="mt-4 grid gap-2">
            <div
              v-for="date in sortedSelectedDates"
              :key="date"
              class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700"
            >
              {{ formatTrainingMonthDateLabel(date) }}
            </div>
            <div v-if="sortedSelectedDates.length === 0" class="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm font-bold text-slate-400">
              本月沒有訓練日期。
            </div>
          </div>

          <el-form-item label="備註" class="mt-4 mb-0 font-bold">
            <el-input
              v-model="note"
              type="textarea"
              :rows="4"
              :disabled="!canEdit"
              placeholder="選填，例如：遇雨另行通知"
            />
          </el-form-item>
        </aside>
      </div>
    </div>
  </div>
</template>
