<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { CoachLeaveClassDateLoader, CoachLeaveDateSelectionState, CoachLeaveTrainingDates } from '@/types/coachLeaveDateSelection'
import { getTaiwanToday } from '@/utils/coachLeaveRequests'
import {
  COACH_LEAVE_DATE_MODES, getAdjacentCoachLeaveMonth, normalizeCoachLeaveClassDates
} from '@/utils/coachLeaveDateSelection'
import { formatTrainingMonthDateLabel, formatTrainingMonthLabel } from '@/utils/trainingMonthDates'
import { DEFAULT_TRAINING_PROGRAM_KEY } from '@/utils/trainingPrograms'

const props = withDefaults(defineProps<{
  modelValue: CoachLeaveDateSelectionState
  open: boolean
  disabled?: boolean
  error?: string
  loadClassDates?: CoachLeaveClassDateLoader
}>(), { disabled: false, error: '' })
const emit = defineEmits<{ (event: 'update:modelValue', value: CoachLeaveDateSelectionState): void }>()
const update = (value: Partial<CoachLeaveDateSelectionState>) => emit('update:modelValue', { ...props.modelValue, ...value })
const months = ref<Record<string, CoachLeaveTrainingDates>>({})
const selectedProgram = ref('')
const loading = ref(false)
const loadError = ref('')
const failedMonths = ref<string[]>([])
let generation = 0
const currentMonth = () => getTaiwanToday().slice(0, 7)
const programs = computed(() => {
  const options = new Map<string, { program_key: string; program_label: string }>()
  for (const month of Object.keys(months.value).sort()) {
    for (const program of months.value[month]?.programs || []) {
      if (!options.has(program.program_key)) options.set(program.program_key, program)
    }
  }
  return [...options.values()]
})
const monthItems = computed(() => Object.keys(months.value).sort().map((month) => ({ month,
  dates: normalizeCoachLeaveClassDates(months.value[month]?.programs.find((program) => program.program_key === selectedProgram.value)?.training_dates || [], month)
})))
const selectedDates = computed(() => [...new Set(props.modelValue.selectedDates)].sort())
const selectedDateSet = computed(() => new Set(selectedDates.value))
const selectedSummary = computed(() => selectedDates.value.slice(0, 5).map(formatTrainingMonthDateLabel).join('、')
  + (selectedDates.value.length > 5 ? ` 等 ${selectedDates.value.length} 天` : ''))
const weekdays = [{ value: 1, label: '週一' }, { value: 2, label: '週二' }, { value: 3, label: '週三' },
  { value: 4, label: '週四' }, { value: 5, label: '週五' }, { value: 6, label: '週六' }, { value: 0, label: '週日' }]
const disabledDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` < getTaiwanToday()

const loadMonths = async (requested: string[]) => {
  if (!props.loadClassDates || loading.value) return
  const missing = [...new Set(requested)].filter((month) => !(month in months.value))
  if (!missing.length) return
  const revision = generation
  const loader = props.loadClassDates
  loading.value = true; loadError.value = ''
  const results = await Promise.allSettled(missing.map(async (month) => ({ month, dates: await loader(month) })))
  if (revision !== generation || !props.open) return
  failedMonths.value = []
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]!
    if (result.status === 'fulfilled') {
      months.value = { ...months.value, [result.value.month]: result.value.dates }
    } else {
      failedMonths.value.push(missing[index]!)
      loadError.value = '上課日期載入失敗，請稍後再試；已選日期會保留。'
    }
  }
  if (!programs.value.some((program) => program.program_key === selectedProgram.value)) {
    selectedProgram.value = programs.value.some((program) => program.program_key === DEFAULT_TRAINING_PROGRAM_KEY)
      ? DEFAULT_TRAINING_PROGRAM_KEY : programs.value[0]?.program_key || ''
  }
  loading.value = false
}
const loadInitialMonths = () => loadMonths([currentMonth(), getAdjacentCoachLeaveMonth(currentMonth(), 1)])
const loadNextMonth = () => {
  const latest = monthItems.value[monthItems.value.length - 1]?.month
  void loadMonths(latest ? [getAdjacentCoachLeaveMonth(latest, 1)] : [currentMonth(), getAdjacentCoachLeaveMonth(currentMonth(), 1)])
}
const toggleDate = (date: string) => {
  if (props.disabled || date < getTaiwanToday()) return
  const selection = new Set(selectedDates.value)
  if (selection.has(date)) selection.delete(date)
  else selection.add(date)
  update({ selectedDates: [...selection].sort() })
}
watch(() => props.open, (open) => {
  generation += 1; months.value = {}; selectedProgram.value = ''; loading.value = false; loadError.value = ''; failedMonths.value = []
  if (open) void loadInitialMonths()
}, { immediate: true })
watch(() => props.loadClassDates, () => {
  generation += 1; months.value = {}; selectedProgram.value = ''; loading.value = false; loadError.value = ''; failedMonths.value = []
  if (props.open) void loadInitialMonths()
})
onBeforeUnmount(() => { generation += 1 })
</script>

<template>
  <div class="min-w-0" data-test="coach-leave-date-selection">
    <el-form-item label="請假模式">
      <el-radio-group :model-value="modelValue.mode" :disabled="disabled" class="coach-leave-mode-selector" @update:model-value="update({ mode: $event })">
        <el-radio-button v-for="mode in COACH_LEAVE_DATE_MODES" :key="mode.value" :value="mode.value" :data-test="`leave-mode-${mode.value}`">{{ mode.label }}</el-radio-button>
      </el-radio-group>
    </el-form-item>

    <el-form-item v-if="modelValue.mode === 'quick'" label="上課日期">
      <section class="w-full min-w-0 rounded-2xl border border-primary/20 bg-primary/5 p-3" data-test="training-date-quick-select">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <p class="min-w-0 flex-1 text-sm leading-relaxed text-slate-600">可多選要請假的上課日期；載入未來月份時會保留已選日期。</p>
          <el-button class="!ml-0 !min-h-11" :loading="loading" :disabled="disabled || !loadClassDates" data-test="load-next-training-month" @click="loadNextMonth">載入下個月</el-button>
        </div>
        <p v-if="!loadClassDates" class="mt-3 text-sm text-slate-500">上課日期尚未載入，您也可以切換單日、連續多日或固定週期。</p>
        <div v-if="programs.length > 1" class="mt-3">
          <div id="coach-leave-program-label" class="mb-2 text-sm font-bold text-slate-700">訓練項目</div>
          <el-select v-model="selectedProgram" size="large" class="w-full" :disabled="disabled" aria-labelledby="coach-leave-program-label" data-test="training-program-select">
            <el-option v-for="program in programs" :key="program.program_key" :value="program.program_key" :label="program.program_label" />
          </el-select>
          <p class="mt-2 text-xs leading-relaxed text-slate-500">切換訓練項目會保留已選日期。</p>
        </div>
        <p v-else-if="programs.length === 1" class="mt-3 text-sm font-bold text-primary">{{ programs[0]?.program_label }} 上課日期</p>
        <p v-if="loading && !monthItems.length" class="mt-3 text-sm text-slate-500" role="status">載入上課日期中...</p>
        <div v-if="loadError" class="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800" role="alert">
          <p>{{ loadError }}</p>
          <el-button class="!mt-2 !ml-0 !min-h-11" :disabled="disabled || loading" data-test="retry-class-dates" @click="loadMonths(failedMonths)">重新載入</el-button>
        </div>
        <div v-for="item in monthItems" :key="item.month" class="mt-3 rounded-xl border border-primary/10 bg-white p-3">
          <div class="flex justify-between gap-3 text-sm font-bold text-slate-700"><span>{{ formatTrainingMonthLabel(item.month) }}</span><span>{{ item.dates.length }} 天</span></div>
          <p v-if="!item.dates.length" class="mt-3 text-sm text-slate-400">這個月目前沒有上課日期。</p>
          <div v-else class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button v-for="date in item.dates" :key="date" type="button" class="min-h-11 rounded-xl border px-2 py-2 text-sm font-bold"
              :class="date < getTaiwanToday() ? 'border-slate-200 bg-slate-100 text-slate-400' : selectedDateSet.has(date) ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600'"
              :disabled="disabled || date < getTaiwanToday()" :aria-pressed="selectedDateSet.has(date)" :data-date="date" data-test="training-date-option" @click="toggleDate(date)">
              {{ formatTrainingMonthDateLabel(date) }}
            </button>
          </div>
        </div>
        <p class="mt-3 rounded-xl bg-white p-3 text-sm font-bold text-slate-600" data-test="selected-training-dates">
          {{ selectedDates.length ? `已選 ${selectedDates.length} 天：${selectedSummary}` : '請至少選擇一個上課日期。' }}
        </p>
        <el-button v-if="selectedDates.length" class="!mt-2 !ml-0 !min-h-11" :disabled="disabled" @click="update({ selectedDates: [] })">清除已選日期</el-button>
      </section>
    </el-form-item>

    <el-form-item v-else-if="modelValue.mode === 'single'" label="請假日期">
      <el-date-picker :model-value="modelValue.singleDate" type="date" format="YYYY/MM/DD" value-format="YYYY-MM-DD" placeholder="請假日期" size="large" class="!w-full" :clearable="false" :disabled="disabled" :disabled-date="disabledDate" @update:model-value="update({ singleDate: $event })" />
    </el-form-item>

    <div v-else-if="modelValue.mode === 'range'" class="grid min-w-0 gap-3 md:grid-cols-2">
      <el-form-item label="開始日期">
        <el-date-picker :model-value="modelValue.rangeStart" type="date" format="YYYY/MM/DD" value-format="YYYY-MM-DD" placeholder="開始日期" size="large" class="!w-full" :clearable="false" :disabled="disabled" :disabled-date="disabledDate" @update:model-value="update({ rangeStart: $event })" />
      </el-form-item>
      <el-form-item label="結束日期">
        <el-date-picker :model-value="modelValue.rangeEnd" type="date" format="YYYY/MM/DD" value-format="YYYY-MM-DD" placeholder="結束日期" size="large" class="!w-full" :clearable="false" :disabled="disabled" :disabled-date="disabledDate" @update:model-value="update({ rangeEnd: $event })" />
      </el-form-item>
    </div>

    <div v-else class="rounded-2xl border border-primary/20 bg-primary/5 p-3">
      <el-form-item label="固定星期請假">
        <el-checkbox-group :model-value="modelValue.recurringDays" :disabled="disabled" class="coach-leave-weekdays" @update:model-value="update({ recurringDays: $event })">
          <el-checkbox-button v-for="day in weekdays" :key="day.value" :value="day.value">{{ day.label }}</el-checkbox-button>
        </el-checkbox-group>
      </el-form-item>
      <div class="grid min-w-0 gap-3 md:grid-cols-2">
        <el-form-item label="生效開始日期">
          <el-date-picker :model-value="modelValue.recurringStart" type="date" format="YYYY/MM/DD" value-format="YYYY-MM-DD" size="large" class="!w-full" :clearable="false" :disabled="disabled" :disabled-date="disabledDate" @update:model-value="update({ recurringStart: $event })" />
        </el-form-item>
        <el-form-item label="生效結束日期">
          <el-date-picker :model-value="modelValue.recurringEnd" type="date" format="YYYY/MM/DD" value-format="YYYY-MM-DD" size="large" class="!w-full" :clearable="false" :disabled="disabled" :disabled-date="disabledDate" @update:model-value="update({ recurringEnd: $event })" />
        </el-form-item>
      </div>
      <p class="text-sm leading-relaxed text-slate-500">在生效期限內，依所選星期建立各日假單。</p>
    </div>
    <p v-if="modelValue.mode === 'range' || modelValue.mode === 'recurring'" class="mb-3 text-sm leading-relaxed text-slate-500">每次最多 365 筆，日期範圍最多 365 天。</p>
    <p v-if="error" class="mb-3 text-sm font-bold text-red-600" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.coach-leave-mode-selector { display: grid; width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.coach-leave-mode-selector :deep(.el-radio-button__inner), .coach-leave-weekdays :deep(.el-checkbox-button__inner) {
  display: flex; align-items: center; justify-content: center; min-height: 44px; width: 100%; border: 1px solid var(--el-border-color); border-radius: 10px;
}
.coach-leave-weekdays { display: grid; width: 100%; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
@media (min-width: 768px) { .coach-leave-mode-selector { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
