<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import FeeSettingMemberEditor from '@/components/fees/FeeSettingMemberEditor.vue'
import { supabase } from '@/services/supabase'
import {
  getQuarterlyFeeCompensationDefaults,
  saveQuarterlyFeeCompensationDefaults
} from '@/services/quarterlyFeeCompensations'
import { trainingProgramsApi } from '@/services/trainingProgramsApi'
import {
  getSchoolTeamMonthlyPerSessionDefaults,
  saveSchoolTeamMonthlyPerSessionDefaults
} from '@/services/schoolTeamMonthlyFeeSettings'
import type { QuarterlyFeeCompensationDefaults } from '@/types/quarterlyFeeCompensation'
import type {
  SchoolTeamMonthlyFeeProgramKey,
  SchoolTeamMonthlyPerSessionDefaultsByProgram
} from '@/types/schoolTeamMonthlyFee'
import type { TrainingProgramSetting } from '@/types/trainingProgram'
import {
  DEFAULT_FIXED_MONTHLY_FEE,
  getMemberBillingLabel,
  isFixedMonthlyBillingMember,
  isPerSessionMonthlyBillingMember,
  NO_FEE_BILLING_MODE,
  normalizeFixedMonthlyFee
} from '@/utils/memberBilling'
import { getActiveSiblingIds, isActiveRosterMember } from '@/utils/memberLifecycle'
import {
  CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
  getTrainingProgramFallbackSettings,
  getTrainingProgramForMember,
  JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY
} from '@/utils/trainingPrograms'
import {
  DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT,
  DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT,
  normalizeQuarterlyFeeCompensationDefaults
} from '@/utils/quarterlyFeeCompensation'
import {
  createDefaultSchoolTeamMonthlyPerSessionDefaultsByProgram,
  normalizeSchoolTeamMonthlyPerSessionDefaults
} from '@/utils/schoolTeamMonthlyFee'

type FeeSettingKind = 'per_session' | 'monthly_fixed'
type FeeSettingsTab = 'per_session' | 'monthly_fixed' | 'quarterly_compensation' | 'no_fee'

const emit = defineEmits<{
  schoolTeamMonthlySettingsUpdated: [programKey: SchoolTeamMonthlyFeeProgramKey]
}>()

const DEFAULT_PER_SESSION_FEE = 500
const feeSettingTabs: Array<{ id: FeeSettingsTab; name: string }> = [
  { id: 'per_session', name: '計次月費' },
  { id: 'monthly_fixed', name: '固定月繳' },
  { id: 'quarterly_compensation', name: '季費補償' },
  { id: 'no_fee', name: '不收費' }
]
const schoolTeamPerSessionPrograms: Array<{
  key: SchoolTeamMonthlyFeeProgramKey
  label: string
  programLabel: string
  description: string
  badgeClass: string
  allowsCalculationModeSwitch: boolean
}> = [
  {
    key: CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
    label: '中港校隊計次費率',
    programLabel: '中港總部',
    description: '獨立依「中港總部」當月訓練日期計算；全日／上午假單會扣除堂數。',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    allowsCalculationModeSwitch: false
  },
  {
    key: JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY,
    label: '國中部計次費率',
    programLabel: '國中部',
    description: '可切換單次月費或依「國中部」當月訓練日期計算；請假天數只記錄、不扣月費。',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
    allowsCalculationModeSwitch: true
  }
]

const activeSettingsTab = ref<FeeSettingsTab>('per_session')
const isLoading = ref(true)
const programSettings = ref<TrainingProgramSetting[]>(getTrainingProgramFallbackSettings())
const activeFeeMembers = ref<any[]>([])
const perSessionPlayerMembers = ref<any[]>([])
const fixedMonthlyMembers = ref<any[]>([])
const noFeeMembers = ref<any[]>([])
const perSessionFeeMap = ref<Record<string, number>>({})
const fixedMonthlyFeeMap = ref<Record<string, number>>({})
const isSaving = ref<Record<string, boolean>>({})
const isPerSessionDirty = ref<Record<string, boolean>>({})
const isFixedMonthlyDirty = ref<Record<string, boolean>>({})

const compensationDefaults = ref<QuarterlyFeeCompensationDefaults>({
  regularDailyCredit: DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT,
  discountDailyCredit: DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT
})
const savedCompensationDefaults = ref<QuarterlyFeeCompensationDefaults>({
  regularDailyCredit: DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT,
  discountDailyCredit: DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT
})
const isCompensationDefaultsLoading = ref(false)
const isCompensationDefaultsSaving = ref(false)

const schoolTeamPerSessionDefaults = ref<SchoolTeamMonthlyPerSessionDefaultsByProgram>(
  createDefaultSchoolTeamMonthlyPerSessionDefaultsByProgram()
)
const savedSchoolTeamPerSessionDefaults = ref<SchoolTeamMonthlyPerSessionDefaultsByProgram>(
  createDefaultSchoolTeamMonthlyPerSessionDefaultsByProgram()
)
const isSchoolTeamPerSessionDefaultsLoading = ref<Record<SchoolTeamMonthlyFeeProgramKey, boolean>>({
  [CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY]: false,
  [JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY]: false
})
const isSchoolTeamPerSessionDefaultsSaving = ref<Record<SchoolTeamMonthlyFeeProgramKey, boolean>>({
  [CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY]: false,
  [JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY]: false
})

const isCompensationDefaultsDirty = computed(() => {
  const normalized = normalizeQuarterlyFeeCompensationDefaults(compensationDefaults.value)
  return normalized.regularDailyCredit !== savedCompensationDefaults.value.regularDailyCredit
    || normalized.discountDailyCredit !== savedCompensationDefaults.value.discountDailyCredit
})

const isSchoolTeamPerSessionDefaultsDirty = (programKey: SchoolTeamMonthlyFeeProgramKey) => {
  const normalized = normalizeSchoolTeamMonthlyPerSessionDefaults(
    schoolTeamPerSessionDefaults.value[programKey],
    programKey
  )
  const saved = savedSchoolTeamPerSessionDefaults.value[programKey]
  return normalized.calculationMode !== saved.calculationMode
    || normalized.singleMonthlyFee !== saved.singleMonthlyFee
    || normalized.regularPerSessionFee !== saved.regularPerSessionFee
    || normalized.discountPerSessionFee !== saved.discountPerSessionFee
}

const hasActiveFeeSibling = (member: any) =>
  getActiveSiblingIds(member, activeFeeMembers.value).length > 0

const getBillingModeMember = (member: any) => ({
  ...member,
  training_program: member.billing_training_program
})

const getFeeSettingMemberBillingLabel = (member: any) =>
  getMemberBillingLabel(getBillingModeMember(member))

const decorateEditorMember = (member: any) => ({
  ...member,
  has_active_fee_sibling: hasActiveFeeSibling(member),
  billing_label: getFeeSettingMemberBillingLabel(member)
})

const markDirty = (memberId: string, kind: FeeSettingKind) => {
  if (kind === 'per_session') {
    isPerSessionDirty.value[memberId] = true
    return
  }

  isFixedMonthlyDirty.value[memberId] = true
}

const updateEditorValue = (
  payload: { memberId: string; value: number | undefined },
  kind: FeeSettingKind
) => {
  if (kind === 'per_session') {
    perSessionFeeMap.value[payload.memberId] = Math.max(0, Number(payload.value) || 0)
  } else {
    fixedMonthlyFeeMap.value[payload.memberId] = normalizeFixedMonthlyFee(payload.value)
  }
  markDirty(payload.memberId, kind)
}

const fetchData = async () => {
  isLoading.value = true
  try {
    programSettings.value = await trainingProgramsApi.listSettings().catch((error) => {
      console.warn('訓練項目設定無法載入，收費設定暫以預設項目判斷。', error)
      return getTrainingProgramFallbackSettings()
    })

    const { data: teamMembers, error: membersError } = await supabase
      .from('team_members')
      .select('id, name, role, team_group, training_program, status, is_inactive_or_graduated, sibling_ids, is_primary_payer, fee_billing_mode')
      .in('role', ['校隊', '球員'])
      .order('name')

    if (membersError) throw membersError

    activeFeeMembers.value = (teamMembers || [])
      .filter(isActiveRosterMember)
      .map((member) => {
        const program = getTrainingProgramForMember(member, programSettings.value)
        return {
          ...member,
          billing_training_program: member.training_program,
          training_program: program.program_key,
          training_program_label: program.label
        }
      })
    perSessionPlayerMembers.value = activeFeeMembers.value
      .filter((member) =>
        member.role === '球員'
        &&
        isPerSessionMonthlyBillingMember(getBillingModeMember(member))
      )
      .sort((left, right) =>
        String(left.training_program_label || '').localeCompare(String(right.training_program_label || ''), 'zh-Hant')
        || String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hant')
      )
      .map(decorateEditorMember)
    fixedMonthlyMembers.value = activeFeeMembers.value
      .filter((member) => isFixedMonthlyBillingMember(getBillingModeMember(member)))
      .map(decorateEditorMember)
    noFeeMembers.value = activeFeeMembers.value.filter(
      (member) =>
        (member.role === '球員' || member.role === '校隊') &&
        member.fee_billing_mode === NO_FEE_BILLING_MODE
    )

    perSessionPlayerMembers.value.forEach((member) => {
      perSessionFeeMap.value[member.id] = DEFAULT_PER_SESSION_FEE
      isPerSessionDirty.value[member.id] = false
      isSaving.value[member.id] = false
    })

    fixedMonthlyMembers.value.forEach((member) => {
      fixedMonthlyFeeMap.value[member.id] = DEFAULT_FIXED_MONTHLY_FEE
      isFixedMonthlyDirty.value[member.id] = false
      isSaving.value[member.id] = false
    })

    const allMemberIds = [...perSessionPlayerMembers.value, ...fixedMonthlyMembers.value].map((member) => member.id)
    if (allMemberIds.length === 0) return

    const { data: settings, error: settingsError } = await supabase
      .from('fee_settings')
      .select('member_id, per_session_fee, monthly_fixed_fee')
      .in('member_id', allMemberIds)

    if (settingsError) throw settingsError

    settings?.forEach((setting) => {
      if (perSessionFeeMap.value[setting.member_id] !== undefined) {
        perSessionFeeMap.value[setting.member_id] = Number(setting.per_session_fee ?? DEFAULT_PER_SESSION_FEE)
      }
      if (fixedMonthlyFeeMap.value[setting.member_id] !== undefined) {
        fixedMonthlyFeeMap.value[setting.member_id] = normalizeFixedMonthlyFee(setting.monthly_fixed_fee)
      }
    })
  } catch (error: any) {
    ElMessage.error('載入設定失敗: ' + error.message)
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

const fetchCompensationDefaults = async () => {
  isCompensationDefaultsLoading.value = true
  try {
    const defaults = await getQuarterlyFeeCompensationDefaults()
    compensationDefaults.value = { ...defaults }
    savedCompensationDefaults.value = { ...defaults }
  } catch (error: any) {
    ElMessage.error('載入季費補償預設失敗: ' + error.message)
    console.error(error)
  } finally {
    isCompensationDefaultsLoading.value = false
  }
}

const fetchSchoolTeamPerSessionDefaults = async (programKey: SchoolTeamMonthlyFeeProgramKey) => {
  isSchoolTeamPerSessionDefaultsLoading.value[programKey] = true
  try {
    const defaults = await getSchoolTeamMonthlyPerSessionDefaults(programKey)
    schoolTeamPerSessionDefaults.value[programKey] = { ...defaults }
    savedSchoolTeamPerSessionDefaults.value[programKey] = { ...defaults }
  } catch (error: any) {
    ElMessage.error('載入校隊計次費率失敗: ' + error.message)
    console.error(error)
  } finally {
    isSchoolTeamPerSessionDefaultsLoading.value[programKey] = false
  }
}

const updateCompensationDefaults = async () => {
  isCompensationDefaultsSaving.value = true
  try {
    const saved = await saveQuarterlyFeeCompensationDefaults(compensationDefaults.value)
    compensationDefaults.value = { ...saved }
    savedCompensationDefaults.value = { ...saved }
    ElMessage.success('季費補償預設已更新')
  } catch (error: any) {
    ElMessage.error('儲存季費補償預設失敗: ' + error.message)
    console.error(error)
  } finally {
    isCompensationDefaultsSaving.value = false
  }
}

const updateSchoolTeamPerSessionDefaults = async (
  programKey: SchoolTeamMonthlyFeeProgramKey,
  label: string
) => {
  isSchoolTeamPerSessionDefaultsSaving.value[programKey] = true
  try {
    const saved = await saveSchoolTeamMonthlyPerSessionDefaults(
      programKey,
      schoolTeamPerSessionDefaults.value[programKey]
    )
    schoolTeamPerSessionDefaults.value[programKey] = { ...saved }
    savedSchoolTeamPerSessionDefaults.value[programKey] = { ...saved }
    emit('schoolTeamMonthlySettingsUpdated', programKey)
    ElMessage.success(`${label}月費設定已更新`)
  } catch (error: any) {
    ElMessage.error(`儲存${label}月費設定失敗: ` + error.message)
    console.error(error)
  } finally {
    isSchoolTeamPerSessionDefaultsSaving.value[programKey] = false
  }
}

const updateFeeSetting = async (memberId: string, kind: FeeSettingKind) => {
  isSaving.value[memberId] = true

  try {
    const payload: {
      member_id: string
      per_session_fee?: number
      monthly_fixed_fee?: number
      updated_at: string
    } = {
      member_id: memberId,
      updated_at: new Date().toISOString()
    }

    if (kind === 'per_session') {
      payload.per_session_fee = Number(perSessionFeeMap.value[memberId] ?? DEFAULT_PER_SESSION_FEE)
    } else {
      payload.monthly_fixed_fee = normalizeFixedMonthlyFee(fixedMonthlyFeeMap.value[memberId])
    }

    const { error } = await supabase
      .from('fee_settings')
      .upsert(payload, { onConflict: 'member_id' })

    if (error) throw error

    ElMessage.success('儲存成功')
    if (kind === 'per_session') {
      isPerSessionDirty.value[memberId] = false
    } else {
      isFixedMonthlyDirty.value[memberId] = false
    }
  } catch (error: any) {
    ElMessage.error('儲存紀錄失敗: ' + error.message)
    console.error(error)
  } finally {
    isSaving.value[memberId] = false
  }
}

onMounted(() => {
  void fetchData()
  void fetchCompensationDefaults()
  schoolTeamPerSessionPrograms.forEach((program) => {
    void fetchSchoolTeamPerSessionDefaults(program.key)
  })
})
</script>

<template>
  <div class="mx-auto flex max-w-5xl animate-fade-in flex-col gap-4">
    <div class="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm font-bold leading-relaxed text-primary">
      <el-icon class="mt-0.5 text-lg"><InfoFilled /></el-icon>
      <div>中港校隊固定依訓練日期計次；國中部可切換單次月費或依訓練日期計算。社區計次月費維持逐球員設定，社區固定月繳維持固定金額。</div>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm" role="tablist" aria-label="收費設定分類">
      <div class="flex min-w-max gap-1.5">
        <button
          v-for="tab in feeSettingTabs"
          :id="`fee-settings-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          class="min-h-11 rounded-xl px-4 text-sm font-black transition-colors"
          :class="activeSettingsTab === tab.id ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'"
          :aria-selected="activeSettingsTab === tab.id"
          :aria-controls="`fee-settings-panel-${tab.id}`"
          @click="activeSettingsTab = tab.id"
        >
          {{ tab.name }}
        </button>
      </div>
    </div>

    <section
      v-show="activeSettingsTab === 'per_session'"
      id="fee-settings-panel-per_session"
      role="tabpanel"
      aria-labelledby="fee-settings-tab-per_session"
      class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
      v-loading="isLoading"
    >
      <div class="border-b border-gray-100 bg-gray-50/80 px-4 py-3">
        <h3 class="text-base font-black text-gray-800">計次月費</h3>
        <p class="mt-1 text-xs font-medium text-gray-400">中港校隊與國中部各自使用獨立設定；國中部預設單次月費 2,000 元。</p>
      </div>

      <div class="grid gap-4 border-b border-gray-100 bg-slate-50/50 p-4 lg:grid-cols-2">
        <article
          v-for="program in schoolTeamPerSessionPrograms"
          :key="program.key"
          class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          v-loading="isSchoolTeamPerSessionDefaultsLoading[program.key]"
        >
          <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 class="text-sm font-black text-slate-800">{{ program.label }}</h4>
              <p class="mt-1 text-xs font-medium leading-relaxed text-slate-500">{{ program.description }}</p>
            </div>
            <span class="rounded-lg border px-2 py-1 text-xs font-black" :class="program.badgeClass">{{ program.programLabel }}</span>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
          <div
            v-if="program.allowsCalculationModeSwitch"
            class="flex min-h-11 flex-col gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p class="text-xs font-black text-slate-700">國中部計費方式</p>
              <p class="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">關閉為單次月費；開啟後才依當月訓練日期與單次費率計算。</p>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs font-black">
              <span :class="schoolTeamPerSessionDefaults[program.key].calculationMode === 'single_monthly' ? 'text-sky-700' : 'text-slate-400'">單次月費</span>
              <el-switch
                v-model="schoolTeamPerSessionDefaults[program.key].calculationMode"
                active-value="training_dates"
                inactive-value="single_monthly"
                size="large"
                aria-label="切換國中部單次月費或依當月訓練日期計算"
              />
              <span :class="schoolTeamPerSessionDefaults[program.key].calculationMode === 'training_dates' ? 'text-sky-700' : 'text-slate-400'">當月訓練日期計算</span>
            </div>
          </div>
          <label
            v-if="program.allowsCalculationModeSwitch && schoolTeamPerSessionDefaults[program.key].calculationMode === 'single_monthly'"
            class="flex flex-col gap-1.5 sm:col-span-2"
          >
            <span class="text-xs font-bold text-gray-500">單次月費金額 (元)</span>
            <el-input-number
              v-model="schoolTeamPerSessionDefaults[program.key].singleMonthlyFee"
              :min="0"
              :step="100"
              size="large"
              class="!w-full"
            />
            <span class="text-[11px] font-medium text-slate-400">預設 2,000 元；半價／有效手足折扣會依既有規則折半。</span>
          </label>
          <label
            v-if="!program.allowsCalculationModeSwitch || schoolTeamPerSessionDefaults[program.key].calculationMode === 'training_dates'"
            class="flex flex-col gap-1.5"
          >
            <span class="text-xs font-bold text-gray-500">一般球員單次收費金額 (元)</span>
            <el-input-number
              v-model="schoolTeamPerSessionDefaults[program.key].regularPerSessionFee"
              :min="0"
              :step="50"
              size="large"
              class="!w-full"
            />
          </label>
          <label
            v-if="!program.allowsCalculationModeSwitch || schoolTeamPerSessionDefaults[program.key].calculationMode === 'training_dates'"
            class="flex flex-col gap-1.5"
          >
            <span class="text-xs font-bold text-gray-500">半價 / 手足折扣單次收費金額 (元)</span>
            <el-input-number
              v-model="schoolTeamPerSessionDefaults[program.key].discountPerSessionFee"
              :min="0"
              :step="50"
              size="large"
              class="!w-full"
            />
          </label>
          <button
            type="button"
            class="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-5 text-sm font-black transition-colors sm:col-span-2"
            :class="isSchoolTeamPerSessionDefaultsDirty(program.key) ? 'bg-primary text-white hover:bg-primary/90' : 'cursor-not-allowed bg-gray-100 text-gray-400'"
            :disabled="isSchoolTeamPerSessionDefaultsSaving[program.key] || !isSchoolTeamPerSessionDefaultsDirty(program.key)"
            @click="updateSchoolTeamPerSessionDefaults(program.key, program.programLabel)"
          >
            {{ isSchoolTeamPerSessionDefaultsSaving[program.key] ? '儲存中...' : `儲存${program.programLabel}設定` }}
          </button>
          </div>
        </article>
      </div>

      <div class="border-b border-gray-100 bg-white px-4 py-3">
        <h4 class="text-sm font-black text-slate-800">社區計次月費</h4>
        <p class="mt-1 text-xs font-medium text-slate-500">以下球員仍可逐人設定單次收費，不共用中港校隊或國中部費率。</p>
      </div>
      <FeeSettingMemberEditor
        kind="per_session"
        :members="perSessionPlayerMembers"
        :values="perSessionFeeMap"
        :dirty-map="isPerSessionDirty"
        :saving-map="isSaving"
        @update-value="updateEditorValue($event, 'per_session')"
        @save="updateFeeSetting($event, 'per_session')"
      />
    </section>

    <section
      v-show="activeSettingsTab === 'monthly_fixed'"
      id="fee-settings-panel-monthly_fixed"
      role="tabpanel"
      aria-labelledby="fee-settings-tab-monthly_fixed"
      class="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm"
      v-loading="isLoading"
    >
      <div class="border-b border-amber-100 bg-amber-50/80 px-4 py-3">
        <h3 class="text-base font-black text-gray-800">固定月繳</h3>
        <p class="mt-1 text-xs font-medium text-amber-700/80">只顯示社區固定月繳球員；國中部的單次月費／訓練日期切換在「計次月費」分頁設定。</p>
      </div>
      <FeeSettingMemberEditor
        kind="monthly_fixed"
        :members="fixedMonthlyMembers"
        :values="fixedMonthlyFeeMap"
        :dirty-map="isFixedMonthlyDirty"
        :saving-map="isSaving"
        @update-value="updateEditorValue($event, 'monthly_fixed')"
        @save="updateFeeSetting($event, 'monthly_fixed')"
      />
    </section>

    <section
      v-show="activeSettingsTab === 'quarterly_compensation'"
      id="fee-settings-panel-quarterly_compensation"
      role="tabpanel"
      aria-labelledby="fee-settings-tab-quarterly_compensation"
      class="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
      v-loading="isCompensationDefaultsLoading"
    >
      <div class="border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
        <h3 class="text-base font-black text-gray-800">季費堂數不足補償</h3>
        <p class="mt-1 text-xs font-medium text-emerald-700/80">用於球員季費表單的補償試算；核准補償單後才會轉入球員餘額。</p>
      </div>
      <div class="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-bold text-gray-500">一般球員每日折抵金額 (元)</span>
          <el-input-number
            v-model="compensationDefaults.regularDailyCredit"
            :min="0"
            :step="50"
            size="large"
            class="!w-full"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-bold text-gray-500">半價 / 手足折扣每日折抵金額 (元)</span>
          <el-input-number
            v-model="compensationDefaults.discountDailyCredit"
            :min="0"
            :step="50"
            size="large"
            class="!w-full"
          />
        </label>
        <button
          type="button"
          class="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-5 text-sm font-black transition-colors md:w-auto"
          :class="isCompensationDefaultsDirty ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'cursor-not-allowed bg-gray-100 text-gray-400'"
          :disabled="isCompensationDefaultsSaving || !isCompensationDefaultsDirty"
          @click="updateCompensationDefaults"
        >
          {{ isCompensationDefaultsSaving ? '儲存中...' : '儲存預設' }}
        </button>
      </div>
    </section>

    <section
      v-show="activeSettingsTab === 'no_fee'"
      id="fee-settings-panel-no_fee"
      role="tabpanel"
      aria-labelledby="fee-settings-tab-no_fee"
      class="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
      v-loading="isLoading"
    >
      <div class="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <h3 class="text-base font-black text-gray-800">不收費成員</h3>
        <p class="mt-1 text-xs font-medium text-slate-500">以下成員不會產生新的月費、季費或比賽費；既有帳款與裝備付款仍保留。</p>
      </div>
      <div v-if="noFeeMembers.length === 0" class="px-4 py-8 text-center text-sm font-bold text-gray-400">目前沒有不收費成員</div>
      <div v-else class="grid gap-3 p-3 md:hidden">
        <article v-for="member in noFeeMembers" :key="member.id" class="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-black text-gray-800">{{ member.name }}</span>
            <span class="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600">不收費</span>
          </div>
          <p class="mt-2 text-sm font-bold text-slate-500">{{ member.role }}｜{{ member.status || '在隊' }}</p>
        </article>
      </div>
      <div v-if="noFeeMembers.length > 0" class="hidden overflow-x-auto md:block">
        <table class="w-full min-w-[420px]">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50/60">
              <th class="w-1/2 px-4 py-3 text-left text-sm font-bold text-gray-500">成員姓名</th>
              <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">身分</th>
              <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">狀態</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="member in noFeeMembers" :key="member.id" class="transition-colors hover:bg-slate-50/60">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="font-black text-gray-800">{{ member.name }}</span>
                  <span class="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">不收費</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm font-bold text-slate-600">{{ member.role }}</td>
              <td class="px-4 py-3 text-sm font-bold text-slate-500">{{ member.status || '在隊' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
