<template>
  <div class="mx-auto flex max-w-4xl animate-fade-in flex-col gap-5">
    <div class="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm font-bold leading-relaxed text-primary">
      <el-icon class="mt-0.5 text-lg"><InfoFilled /></el-icon>
      <div>校隊與開啟計次月費的球員會依單次金額進入月費表；開啟固定月繳的社區球員會以這裡設定的月繳金額進入月費表。不收費成員不會產生新的隊費與比賽費，裝備加購仍依實際申請付款。</div>
    </div>

    <section class="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm" v-loading="isCompensationDefaultsLoading">
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
          class="inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-black transition-colors"
          :class="isCompensationDefaultsDirty ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'cursor-not-allowed bg-gray-100 text-gray-400'"
          :disabled="isCompensationDefaultsSaving || !isCompensationDefaultsDirty"
          @click="updateCompensationDefaults"
        >
          {{ isCompensationDefaultsSaving ? '儲存中...' : '儲存預設' }}
        </button>
      </div>
    </section>

    <section class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm" v-loading="isLoading">
      <div class="border-b border-gray-100 bg-gray-50/80 px-4 py-3">
        <h3 class="text-base font-black text-gray-800">計次月費</h3>
        <p class="mt-1 text-xs font-medium text-gray-400">用於月費公式：出席堂數 x 單次收費金額。</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[560px]">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50/60">
              <th class="w-1/2 px-4 py-3 text-left text-sm font-bold text-gray-500">成員姓名</th>
              <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">單次收費金額 (元)</th>
              <th class="w-32 px-4 py-3 text-center text-sm font-bold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="schoolMembers.length === 0">
              <td colspan="3" class="px-4 py-8 text-center text-sm font-bold text-gray-400">目前沒有計次月費成員</td>
            </tr>
            <tr v-for="member in schoolMembers" :key="member.id" class="transition-colors hover:bg-gray-50/50">
              <td class="flex items-center gap-2 px-4 py-3">
                <span class="font-black text-gray-800">{{ member.name }}</span>
                <span class="whitespace-nowrap rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  {{ member.training_program_label || '中港總部' }}
                </span>
                <span v-if="hasActiveFeeSibling(member)" class="whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold" :class="member.is_primary_payer ? 'border-green-200 bg-green-50 text-green-600' : 'border-primary/20 bg-primary/10 text-primary'">
                  {{ member.is_primary_payer ? '主要繳費人' : '半價優惠' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <el-input-number
                  v-model="perSessionFeeMap[member.id]"
                  :min="0"
                  :step="50"
                  size="large"
                  class="!w-32 font-mono font-bold"
                  @change="markDirty(member.id, 'per_session')"
                />
              </td>
              <td class="px-4 py-3 text-center">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-sm font-bold transition-colors"
                  :class="isPerSessionDirty[member.id] ? 'bg-primary text-white hover:bg-primary/90' : 'cursor-not-allowed bg-gray-100 text-gray-400'"
                  :disabled="isSaving[member.id] || !isPerSessionDirty[member.id]"
                  @click="updateFeeSetting(member.id, 'per_session')"
                >
                  {{ isSaving[member.id] ? '儲存中...' : '儲存' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm" v-loading="isLoading">
      <div class="border-b border-amber-100 bg-amber-50/80 px-4 py-3">
        <h3 class="text-base font-black text-gray-800">社區球員固定月繳</h3>
        <p class="mt-1 text-xs font-medium text-amber-700/80">只顯示球員名單中已開啟「固定月繳」的球員。</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[560px]">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50/60">
              <th class="w-1/2 px-4 py-3 text-left text-sm font-bold text-gray-500">球員姓名</th>
              <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">固定月繳金額 (元)</th>
              <th class="w-32 px-4 py-3 text-center text-sm font-bold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="fixedMonthlyMembers.length === 0">
              <td colspan="3" class="px-4 py-8 text-center text-sm font-bold text-gray-400">目前沒有開啟固定月繳的社區球員</td>
            </tr>
            <tr v-for="member in fixedMonthlyMembers" :key="member.id" class="transition-colors hover:bg-amber-50/40">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="font-black text-gray-800">{{ member.name }}</span>
                  <span class="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">固定月繳</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <el-input-number
                  v-model="fixedMonthlyFeeMap[member.id]"
                  :min="0"
                  :step="100"
                  size="large"
                  class="!w-32 font-mono font-bold"
                  @change="markDirty(member.id, 'monthly_fixed')"
                />
              </td>
              <td class="px-4 py-3 text-center">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-sm font-bold transition-colors"
                  :class="isFixedMonthlyDirty[member.id] ? 'bg-amber-500 text-white hover:bg-amber-600' : 'cursor-not-allowed bg-gray-100 text-gray-400'"
                  :disabled="isSaving[member.id] || !isFixedMonthlyDirty[member.id]"
                  @click="updateFeeSetting(member.id, 'monthly_fixed')"
                >
                  {{ isSaving[member.id] ? '儲存中...' : '儲存' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm" v-loading="isLoading">
      <div class="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <h3 class="text-base font-black text-gray-800">不收費成員</h3>
        <p class="mt-1 text-xs font-medium text-slate-500">以下成員不會產生新的月費、季費或比賽費；既有帳款與裝備付款仍保留。</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[420px]">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50/60">
              <th class="w-1/2 px-4 py-3 text-left text-sm font-bold text-gray-500">成員姓名</th>
              <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">身分</th>
              <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">狀態</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="noFeeMembers.length === 0">
              <td colspan="3" class="px-4 py-8 text-center text-sm font-bold text-gray-400">目前沒有不收費成員</td>
            </tr>
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

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import {
  getQuarterlyFeeCompensationDefaults,
  saveQuarterlyFeeCompensationDefaults
} from '@/services/quarterlyFeeCompensations'
import { trainingProgramsApi } from '@/services/trainingProgramsApi'
import type { QuarterlyFeeCompensationDefaults } from '@/types/quarterlyFeeCompensation'
import type { TrainingProgramSetting } from '@/types/trainingProgram'
import {
  DEFAULT_FIXED_MONTHLY_FEE,
  FIXED_MONTHLY_FEE_BILLING_MODE,
  isPerSessionMonthlyBillingMember,
  NO_FEE_BILLING_MODE,
  normalizeFixedMonthlyFee
} from '@/utils/memberBilling'
import { getActiveSiblingIds, isActiveRosterMember } from '@/utils/memberLifecycle'
import {
  getTrainingProgramFallbackSettings,
  getTrainingProgramForMember
} from '@/utils/trainingPrograms'
import {
  DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT,
  DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT,
  normalizeQuarterlyFeeCompensationDefaults
} from '@/utils/quarterlyFeeCompensation'

type FeeSettingKind = 'per_session' | 'monthly_fixed'

const DEFAULT_PER_SESSION_FEE = 500

const isLoading = ref(true)
const programSettings = ref<TrainingProgramSetting[]>(getTrainingProgramFallbackSettings())
const activeFeeMembers = ref<any[]>([])
const schoolMembers = ref<any[]>([])
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

const isCompensationDefaultsDirty = computed(() => {
  const normalized = normalizeQuarterlyFeeCompensationDefaults(compensationDefaults.value)
  return normalized.regularDailyCredit !== savedCompensationDefaults.value.regularDailyCredit
    || normalized.discountDailyCredit !== savedCompensationDefaults.value.discountDailyCredit
})

const hasActiveFeeSibling = (member: any) =>
  getActiveSiblingIds(member, activeFeeMembers.value).length > 0

const markDirty = (memberId: string, kind: FeeSettingKind) => {
  if (kind === 'per_session') {
    isPerSessionDirty.value[memberId] = true
    return
  }

  isFixedMonthlyDirty.value[memberId] = true
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
      .select('id, name, role, team_group, status, is_inactive_or_graduated, sibling_ids, is_primary_payer, fee_billing_mode')
      .in('role', ['校隊', '球員'])
      .order('name')

    if (membersError) throw membersError

    activeFeeMembers.value = (teamMembers || [])
      .filter(isActiveRosterMember)
      .map((member) => {
        const program = getTrainingProgramForMember(member, programSettings.value)
        return {
          ...member,
          training_program: program.program_key,
          training_program_label: program.label
        }
      })
    schoolMembers.value = activeFeeMembers.value.filter(
      (member) => isPerSessionMonthlyBillingMember(member)
    ).sort((left, right) =>
      String(left.training_program_label || '').localeCompare(String(right.training_program_label || ''), 'zh-Hant')
      || String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hant')
    )
    fixedMonthlyMembers.value = activeFeeMembers.value.filter(
      (member) => member.role === '球員' && member.fee_billing_mode === FIXED_MONTHLY_FEE_BILLING_MODE
    )
    noFeeMembers.value = activeFeeMembers.value.filter(
      (member) =>
        (member.role === '球員' || member.role === '校隊') &&
        member.fee_billing_mode === NO_FEE_BILLING_MODE
    )

    schoolMembers.value.forEach((member) => {
      perSessionFeeMap.value[member.id] = DEFAULT_PER_SESSION_FEE
      isPerSessionDirty.value[member.id] = false
      isSaving.value[member.id] = false
    })

    fixedMonthlyMembers.value.forEach((member) => {
      fixedMonthlyFeeMap.value[member.id] = DEFAULT_FIXED_MONTHLY_FEE
      isFixedMonthlyDirty.value[member.id] = false
      isSaving.value[member.id] = false
    })

    const allMemberIds = [...schoolMembers.value, ...fixedMonthlyMembers.value].map((member) => member.id)
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
  } catch (e: any) {
    ElMessage.error('載入設定失敗: ' + e.message)
    console.error(e)
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
  } catch (e: any) {
    ElMessage.error('載入季費補償預設失敗: ' + e.message)
    console.error(e)
  } finally {
    isCompensationDefaultsLoading.value = false
  }
}

const updateCompensationDefaults = async () => {
  isCompensationDefaultsSaving.value = true
  try {
    const saved = await saveQuarterlyFeeCompensationDefaults(compensationDefaults.value)
    compensationDefaults.value = { ...saved }
    savedCompensationDefaults.value = { ...saved }
    ElMessage.success('季費補償預設已更新')
  } catch (e: any) {
    ElMessage.error('儲存季費補償預設失敗: ' + e.message)
    console.error(e)
  } finally {
    isCompensationDefaultsSaving.value = false
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
  } catch(e: any) {
    ElMessage.error('儲存紀錄失敗: ' + e.message)
    console.error(e)
  } finally {
    isSaving.value[memberId] = false
  }
}

onMounted(() => {
  fetchData()
  fetchCompensationDefaults()
})
</script>
