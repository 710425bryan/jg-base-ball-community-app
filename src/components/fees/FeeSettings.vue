<template>
  <div class="mx-auto flex max-w-4xl animate-fade-in flex-col gap-5">
    <div class="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm font-bold leading-relaxed text-primary">
      <el-icon class="mt-0.5 text-lg"><InfoFilled /></el-icon>
      <div>校隊維持計次月費；開啟固定月繳的社區球員會以這裡設定的月繳金額進入月費表，預設 2000 元，不參與堂數、請假或手足半價計算。</div>
    </div>

    <section class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm" v-loading="isLoading">
      <div class="border-b border-gray-100 bg-gray-50/80 px-4 py-3">
        <h3 class="text-base font-black text-gray-800">校隊計次月費</h3>
        <p class="mt-1 text-xs font-medium text-gray-400">用於校隊月費公式：出席堂數 x 單次收費金額。</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[560px]">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50/60">
              <th class="w-1/2 px-4 py-3 text-left text-sm font-bold text-gray-500">校隊成員姓名</th>
              <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">單次收費金額 (元)</th>
              <th class="w-32 px-4 py-3 text-center text-sm font-bold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="schoolMembers.length === 0">
              <td colspan="3" class="px-4 py-8 text-center text-sm font-bold text-gray-400">目前沒有校隊成員</td>
            </tr>
            <tr v-for="member in schoolMembers" :key="member.id" class="transition-colors hover:bg-gray-50/50">
              <td class="flex items-center gap-2 px-4 py-3">
                <span class="font-black text-gray-800">{{ member.name }}</span>
                <span v-if="member.sibling_ids && member.sibling_ids.length > 0" class="whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold" :class="member.is_primary_payer ? 'border-green-200 bg-green-50 text-green-600' : 'border-primary/20 bg-primary/10 text-primary'">
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import {
  DEFAULT_FIXED_MONTHLY_FEE,
  FIXED_MONTHLY_FEE_BILLING_MODE,
  normalizeFixedMonthlyFee
} from '@/utils/memberBilling'

type FeeSettingKind = 'per_session' | 'monthly_fixed'

const DEFAULT_PER_SESSION_FEE = 500

const isLoading = ref(true)
const schoolMembers = ref<any[]>([])
const fixedMonthlyMembers = ref<any[]>([])
const perSessionFeeMap = ref<Record<string, number>>({})
const fixedMonthlyFeeMap = ref<Record<string, number>>({})
const isSaving = ref<Record<string, boolean>>({})
const isPerSessionDirty = ref<Record<string, boolean>>({})
const isFixedMonthlyDirty = ref<Record<string, boolean>>({})

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
    const { data: teamMembers, error: membersError } = await supabase
      .from('team_members')
      .select('id, name, role, status, sibling_ids, is_primary_payer, fee_billing_mode')
      .in('role', ['校隊', '球員'])
      .order('name')

    if (membersError) throw membersError

    const activeMembers = (teamMembers || []).filter((member) => member.status !== '退隊')
    schoolMembers.value = activeMembers.filter((member) => member.role === '校隊')
    fixedMonthlyMembers.value = activeMembers.filter(
      (member) => member.role === '球員' && member.fee_billing_mode === FIXED_MONTHLY_FEE_BILLING_MODE
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

const updateFeeSetting = async (memberId: string, kind: FeeSettingKind) => {
  isSaving.value[memberId] = true

  try {
    const payload = kind === 'per_session'
      ? {
          member_id: memberId,
          per_session_fee: Number(perSessionFeeMap.value[memberId] ?? DEFAULT_PER_SESSION_FEE),
          updated_at: new Date().toISOString()
        }
      : {
          member_id: memberId,
          monthly_fixed_fee: normalizeFixedMonthlyFee(fixedMonthlyFeeMap.value[memberId]),
          updated_at: new Date().toISOString()
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
})
</script>
