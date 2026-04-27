<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import {
  BASEBALL_ABILITY_FEATURE,
  type BaseballAbilityPayload,
  type PerformanceMemberOption,
  type PerformancePayload,
  type PerformanceRecord,
  type PerformanceRecordKind,
  type PerformanceSubmitMeta,
  type PhysicalTestPayload
} from '@/types/performance'
import { getPerformanceConfig } from '@/utils/performanceConfig'

const props = defineProps<{
  modelValue: boolean
  kind: PerformanceRecordKind
  members: PerformanceMemberOption[]
  records: PerformanceRecord[]
  record?: PerformanceRecord | null
  initialMemberId?: string | null
  isSaving?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', payload: PerformancePayload, meta: PerformanceSubmitMeta): void
}>()

const formRef = ref()

const form = reactive({
  team_member_id: '',
  test_date: new Date().toISOString().slice(0, 10),
  home_to_first: 0,
  pitch_speed: 0,
  home_to_home: 0,
  exit_velocity: 0,
  catch_count: 0,
  base_run_180s_laps: 0,
  relay_throw_count: 0,
  height: 0,
  weight: 0,
  bmi: 0,
  arm_span: 0,
  shuttle_run: 0,
  sit_and_reach: 0,
  sit_ups: 0,
  standing_long_jump: 0,
  vertical_jump: 0
})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const config = computed(() => getPerformanceConfig(props.kind))
const isBaseballAbility = computed(() => props.kind === BASEBALL_ABILITY_FEATURE)
const isEditing = computed(() => Boolean(props.record))
const playerRoles = new Set(['球員', '校隊'])
const dialogTitle = computed(() => `${props.record ? '編輯' : '新增'}${config.value.shortTitle}紀錄`)
const lastPrefillKey = ref('')
const sameMonthUpdateRecordId = ref<string | null>(null)
const isSameMonthUpdate = computed(() => !isEditing.value && Boolean(sameMonthUpdateRecordId.value))
const submitButtonLabel = computed(() => {
  if (!isSameMonthUpdate.value) return '儲存'
  return form.test_date.slice(0, 7) === getCurrentMonth() ? '更新本月紀錄' : '更新該月紀錄'
})

const rules = {
  team_member_id: [{ required: true, message: '請選擇球員', trigger: 'change' }],
  test_date: [{ required: true, message: '請選擇測驗日期', trigger: 'change' }]
}

const isPlayerMember = (member?: PerformanceMemberOption | null) =>
  Boolean(member?.role && playerRoles.has(member.role))

const selectableMembers = computed(() => {
  const playerMembers = props.members.filter(isPlayerMember)
  if (!isEditing.value) return playerMembers

  const selectedMember = props.members.find((member) => member.id === form.team_member_id)
  if (selectedMember && !playerMembers.some((member) => member.id === selectedMember.id)) {
    return [selectedMember, ...playerMembers]
  }

  return playerMembers
})

const toNumber = (value: unknown) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

const getLocalDateString = () => {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

const getCurrentMonth = () => getLocalDateString().slice(0, 7)

const getPreviousMonth = (month: string) => {
  const [year, monthIndex] = month.split('-').map(Number)
  const previousMonthDate = new Date(year, monthIndex - 2, 1)
  return [
    previousMonthDate.getFullYear(),
    String(previousMonthDate.getMonth() + 1).padStart(2, '0')
  ].join('-')
}

const sortRecordsByNewest = (left: PerformanceRecord, right: PerformanceRecord) =>
  right.test_date.localeCompare(left.test_date) || right.created_at.localeCompare(left.created_at)

const resetMetricFields = () => {
  form.home_to_first = 0
  form.pitch_speed = 0
  form.home_to_home = 0
  form.exit_velocity = 0
  form.catch_count = 0
  form.base_run_180s_laps = 0
  form.relay_throw_count = 0
  form.height = 0
  form.weight = 0
  form.bmi = 0
  form.arm_span = 0
  form.shuttle_run = 0
  form.sit_and_reach = 0
  form.sit_ups = 0
  form.standing_long_jump = 0
  form.vertical_jump = 0
}

const applyRecordMetrics = (record?: PerformanceRecord | null) => {
  if (!record) {
    resetMetricFields()
    return
  }

  const recordValue = record as any
  form.home_to_first = toNumber(recordValue.home_to_first)
  form.pitch_speed = toNumber(recordValue.pitch_speed)
  form.home_to_home = toNumber(recordValue.home_to_home)
  form.exit_velocity = toNumber(recordValue.exit_velocity)
  form.catch_count = toNumber(recordValue.catch_count)
  form.base_run_180s_laps = toNumber(recordValue.base_run_180s_laps)
  form.relay_throw_count = toNumber(recordValue.relay_throw_count)
  form.height = toNumber(recordValue.height)
  form.weight = toNumber(recordValue.weight)
  form.bmi = toNumber(recordValue.bmi)
  form.arm_span = toNumber(recordValue.arm_span)
  form.shuttle_run = toNumber(recordValue.shuttle_run)
  form.sit_and_reach = toNumber(recordValue.sit_and_reach)
  form.sit_ups = toNumber(recordValue.sit_ups)
  form.standing_long_jump = toNumber(recordValue.standing_long_jump)
  form.vertical_jump = toNumber(recordValue.vertical_jump)
}

const getPrefillRecord = (teamMemberId: string, testDate: string) => {
  const currentMonth = getCurrentMonth()
  const targetMonth = testDate.slice(0, 7)
  const targetMonthStart = `${targetMonth}-01`
  const memberRecords = props.records
    .filter((record) => record.team_member_id === teamMemberId)
    .sort(sortRecordsByNewest)
  const sameMonthRecord = memberRecords.find((record) => record.test_date.startsWith(targetMonth))

  if (sameMonthRecord) {
    return {
      record: sameMonthRecord,
      source: 'same-month' as const
    }
  }

  if (targetMonth === currentMonth) {
    const previousMonth = getPreviousMonth(targetMonth)
    const previousMonthRecord = memberRecords.find((record) => record.test_date.startsWith(previousMonth))

    return {
      record: previousMonthRecord || memberRecords.find((record) => record.test_date < targetMonthStart) || null,
      source: previousMonthRecord ? 'previous-month' as const : 'previous-record' as const
    }
  }

  return {
    record: memberRecords.find((record) => record.test_date < testDate) || null,
    source: 'previous-record' as const
  }
}

const prefillFromPreviousRecord = () => {
  if (!isOpen.value || isEditing.value || !form.team_member_id || !form.test_date) return

  const { record: previousRecord, source } = getPrefillRecord(form.team_member_id, form.test_date)
  const prefillKey = [
    props.kind,
    form.team_member_id,
    form.test_date,
    source,
    previousRecord?.id || 'none'
  ].join(':')

  if (lastPrefillKey.value === prefillKey) return
  lastPrefillKey.value = prefillKey
  sameMonthUpdateRecordId.value = source === 'same-month' ? previousRecord?.id || null : null

  applyRecordMetrics(previousRecord)

  if (!previousRecord) return

  const currentMonth = getCurrentMonth()
  const isCurrentMonthRecord = form.test_date.slice(0, 7) === currentMonth
  const sourceMonth = previousRecord.test_date.slice(0, 7)
  const message = source === 'same-month'
    ? `已自動帶入該球員${isCurrentMonthRecord ? '本月' : '該月份'}既有的${config.value.shortTitle}資料，儲存後會更新原紀錄。`
    : isCurrentMonthRecord && source === 'previous-month'
      ? `已自動帶入該球員上個月的${config.value.shortTitle}資料（來源月份：${sourceMonth}）。`
      : `已自動帶入該球員前次的${config.value.shortTitle}資料（${previousRecord.test_date}）。`

  ElMessage.info({
    message,
    duration: 4200
  })
}

const resetForm = () => {
  const record = props.record || null
  const initialMember = props.initialMemberId
    ? props.members.find((member) => member.id === props.initialMemberId)
    : null
  const initialMemberId = initialMember && isPlayerMember(initialMember) ? props.initialMemberId : ''

  lastPrefillKey.value = ''
  sameMonthUpdateRecordId.value = null
  form.team_member_id = record?.team_member_id || initialMemberId || ''
  form.test_date = record?.test_date || getLocalDateString()
  applyRecordMetrics(record)
  formRef.value?.clearValidate?.()
  prefillFromPreviousRecord()
}

watch(
  () => props.modelValue,
  (value) => {
    if (value) resetForm()
  }
)

watch(
  [() => form.team_member_id, () => form.test_date, () => props.records, () => props.kind],
  () => prefillFromPreviousRecord()
)

watch(
  [() => form.height, () => form.weight, () => props.kind],
  ([height, weight, kind]) => {
    if (kind === BASEBALL_ABILITY_FEATURE) return

    const heightInMeters = Number(height) / 100
    if (heightInMeters > 0 && Number(weight) > 0) {
      form.bmi = Number((Number(weight) / (heightInMeters * heightInMeters)).toFixed(1))
    } else {
      form.bmi = 0
    }
  }
)

const buildPayload = (): PerformancePayload => {
  if (isBaseballAbility.value) {
    return {
      team_member_id: form.team_member_id,
      test_date: form.test_date,
      home_to_first: toNumber(form.home_to_first),
      pitch_speed: toNumber(form.pitch_speed),
      home_to_home: toNumber(form.home_to_home),
      exit_velocity: toNumber(form.exit_velocity),
      catch_count: toNumber(form.catch_count),
      base_run_180s_laps: toNumber(form.base_run_180s_laps),
      relay_throw_count: toNumber(form.relay_throw_count)
    } satisfies BaseballAbilityPayload
  }

  return {
    team_member_id: form.team_member_id,
    test_date: form.test_date,
    height: toNumber(form.height),
    weight: toNumber(form.weight),
    bmi: toNumber(form.bmi),
    arm_span: toNumber(form.arm_span),
    shuttle_run: toNumber(form.shuttle_run),
    sit_and_reach: toNumber(form.sit_and_reach),
    sit_ups: toNumber(form.sit_ups),
    standing_long_jump: toNumber(form.standing_long_jump),
    vertical_jump: toNumber(form.vertical_jump)
  } satisfies PhysicalTestPayload
}

const submit = async () => {
  if (!formRef.value) return

  await formRef.value.validate((valid: boolean) => {
    if (!valid) return
    emit('submit', buildPayload(), {
      recordId: props.record?.id || sameMonthUpdateRecordId.value,
      isSameMonthUpdate: isSameMonthUpdate.value
    })
  })
}
</script>

<template>
  <el-dialog
    v-model="isOpen"
    :title="dialogTitle"
    width="92%"
    style="max-width: 760px; border-radius: 16px;"
    destroy-on-close
    class="performance-record-dialog"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="選擇球員" prop="team_member_id" class="font-bold">
          <el-select
            v-model="form.team_member_id"
            class="w-full"
            size="large"
            filterable
            placeholder="請選擇球員"
            :disabled="Boolean(record)"
          >
            <el-option
              v-for="member in selectableMembers"
              :key="member.id"
              :label="`${member.name}${member.jersey_number ? ' #' + member.jersey_number : ''}${member.team_group ? '（' + member.team_group + '）' : ''}`"
              :value="member.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="測驗日期" prop="test_date" class="font-bold">
          <el-date-picker
            v-model="form.test_date"
            type="date"
            value-format="YYYY-MM-DD"
            size="large"
            class="!w-full"
          />
        </el-form-item>
      </div>

      <div v-if="isBaseballAbility" class="grid gap-4 md:grid-cols-2">
        <el-form-item label="球速 (km/h)" class="font-bold">
          <el-input-number v-model="form.pitch_speed" class="!w-full" :min="0" :step="1" size="large" />
        </el-form-item>
        <el-form-item label="擊球初速 (km/h)" class="font-bold">
          <el-input-number v-model="form.exit_velocity" class="!w-full" :min="0" :step="1" size="large" />
        </el-form-item>
        <el-form-item label="本壘到一壘 (秒)" class="font-bold">
          <el-input-number v-model="form.home_to_first" class="!w-full" :min="0" :step="0.1" :precision="2" size="large" />
        </el-form-item>
        <el-form-item label="全壘跑速 (秒)" class="font-bold">
          <el-input-number v-model="form.home_to_home" class="!w-full" :min="0" :step="0.1" :precision="2" size="large" />
        </el-form-item>
        <el-form-item label="接球次數 (次)" class="font-bold">
          <el-input-number v-model="form.catch_count" class="!w-full" :min="0" :step="1" size="large" />
        </el-form-item>
        <el-form-item label="接力傳球次數 (次)" class="font-bold">
          <el-input-number v-model="form.relay_throw_count" class="!w-full" :min="0" :step="1" size="large" />
        </el-form-item>
        <el-form-item label="壘間180秒圈數" class="font-bold md:col-span-2">
          <el-input-number v-model="form.base_run_180s_laps" class="!w-full" :min="0" :step="0.5" :precision="1" size="large" />
        </el-form-item>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-3">
        <el-form-item label="身高 (cm)" class="font-bold">
          <el-input-number v-model="form.height" class="!w-full" :min="0" :step="0.5" :precision="1" size="large" />
        </el-form-item>
        <el-form-item label="體重 (kg)" class="font-bold">
          <el-input-number v-model="form.weight" class="!w-full" :min="0" :step="0.5" :precision="1" size="large" />
        </el-form-item>
        <el-form-item label="BMI" class="font-bold">
          <el-input-number v-model="form.bmi" class="!w-full" :min="0" :step="0.1" :precision="1" size="large" />
        </el-form-item>
        <el-form-item label="臂展 (cm)" class="font-bold">
          <el-input-number v-model="form.arm_span" class="!w-full" :min="0" :step="0.5" :precision="1" size="large" />
        </el-form-item>
        <el-form-item label="折返跑 (秒)" class="font-bold">
          <el-input-number v-model="form.shuttle_run" class="!w-full" :min="0" :step="0.1" :precision="2" size="large" />
        </el-form-item>
        <el-form-item label="坐姿體前彎 (cm)" class="font-bold">
          <el-input-number v-model="form.sit_and_reach" class="!w-full" :step="0.5" :precision="1" size="large" />
        </el-form-item>
        <el-form-item label="仰臥起坐 (次/分)" class="font-bold">
          <el-input-number v-model="form.sit_ups" class="!w-full" :min="0" :step="1" size="large" />
        </el-form-item>
        <el-form-item label="立定跳遠 (cm)" class="font-bold">
          <el-input-number v-model="form.standing_long_jump" class="!w-full" :min="0" :step="1" size="large" />
        </el-form-item>
        <el-form-item label="垂直摸高 (cm)" class="font-bold">
          <el-input-number v-model="form.vertical_jump" class="!w-full" :min="0" :step="1" size="large" />
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="rounded-2xl border border-gray-200 px-5 py-3 font-bold text-gray-600 hover:border-gray-300 hover:text-gray-800 transition-colors"
          @click="isOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:bg-primary-hover transition-colors disabled:opacity-70"
          :disabled="isSaving"
          @click="submit"
        >
          <span v-if="isSaving" class="inline-flex items-center gap-2">
            <el-icon class="is-loading"><Loading /></el-icon>
            儲存中
          </span>
          <span v-else>{{ submitButtonLabel }}</span>
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
@media (max-width: 639px) {
  :global(.performance-record-dialog) {
    width: 100% !important;
    max-width: none !important;
    height: 100dvh;
    margin: 0 !important;
    border-radius: 0 !important;
    display: flex;
    flex-direction: column;
  }

  :global(.performance-record-dialog .el-dialog__body) {
    flex: 1;
    overflow-y: auto;
    padding-bottom: calc(1rem + env(safe-area-inset-bottom));
  }

  :global(.performance-record-dialog .el-dialog__headerbtn) {
    top: calc(0.5rem + env(safe-area-inset-top));
    right: calc(0.5rem + env(safe-area-inset-right));
    width: 44px;
    height: 44px;
  }
}
</style>
