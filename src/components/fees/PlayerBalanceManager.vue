<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Refresh, Wallet } from '@element-plus/icons-vue'
import { usePermissionsStore } from '@/stores/permissions'
import {
  adjustPlayerBalance,
  listPlayerBalances,
  listPlayerBalanceTransactions
} from '@/services/playerBalances'
import type { PlayerBalanceSummary, PlayerBalanceTransaction } from '@/types/playerBalances'
import { formatPlayerBalanceSource } from '@/utils/playerBalance'

const permissionsStore = usePermissionsStore()
const canEdit = computed(() => permissionsStore.can('fees', 'EDIT'))

const isLoading = ref(false)
const isSaving = ref(false)
const members = ref<PlayerBalanceSummary[]>([])
const transactions = ref<PlayerBalanceTransaction[]>([])
const selectedMemberId = ref('')

const form = reactive({
  delta: 0,
  reason: ''
})

const selectedMember = computed(() =>
  members.value.find((member) => member.member_id === selectedMemberId.value) || null
)

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const formatDateTime = (value?: string | null) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '尚無資料'
}

const deltaClass = (delta: number) => Number(delta) >= 0
  ? 'text-emerald-700'
  : 'text-red-600'

const loadTransactions = async () => {
  if (!selectedMemberId.value) {
    transactions.value = []
    return
  }

  transactions.value = await listPlayerBalanceTransactions(selectedMemberId.value)
}

const refresh = async () => {
  isLoading.value = true
  try {
    members.value = await listPlayerBalances()
    if (!selectedMemberId.value || !members.value.some((member) => member.member_id === selectedMemberId.value)) {
      selectedMemberId.value = members.value[0]?.member_id || ''
    }
    await loadTransactions()
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入球員餘額')
  } finally {
    isLoading.value = false
  }
}

const submitAdjustment = async () => {
  if (!selectedMemberId.value || !canEdit.value) return

  const delta = Math.trunc(Number(form.delta) || 0)
  if (delta === 0) {
    ElMessage.warning('請輸入非 0 的調整金額')
    return
  }

  isSaving.value = true
  try {
    await adjustPlayerBalance(selectedMemberId.value, delta, form.reason.trim() || null)
    form.delta = 0
    form.reason = ''
    ElMessage.success('餘額已更新')
    await refresh()
  } catch (error: any) {
    ElMessage.error(error?.message || '更新餘額失敗')
  } finally {
    isSaving.value = false
  }
}

watch(selectedMemberId, () => {
  void loadTransactions()
})

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="flex flex-col gap-4 animate-fade-in">
    <section class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 md:p-5 shadow-sm">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="flex items-start gap-3">
          <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <el-icon><Wallet /></el-icon>
          </span>
          <div>
            <h3 class="text-lg font-black text-emerald-900">球員餘額</h3>
            <p class="mt-1 text-xs md:text-sm text-emerald-700/80">
              餘額以球員為單位管理，家長可在繳費與裝備付款時使用，扣款會在管理員確認付款時正式入帳。
            </p>
          </div>
        </div>

        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-white transition-colors disabled:opacity-70"
          :disabled="isLoading"
          @click="refresh"
        >
          <el-icon :class="{ 'is-loading': isLoading }"><Refresh /></el-icon>
          重新整理
        </button>
      </div>
    </section>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <label class="text-xs font-bold text-gray-500">查看球員</label>
        <el-select
          v-model="selectedMemberId"
          class="mt-2 w-full"
          size="large"
          filterable
          placeholder="請選擇球員"
          :loading="isLoading"
        >
          <el-option
            v-for="member in members"
            :key="member.member_id"
            :label="`${member.member_name}｜${member.role}`"
            :value="member.member_id"
          />
        </el-select>

        <div class="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
          <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600">目前餘額</div>
          <div class="mt-2 text-3xl font-black text-emerald-700">
            {{ formatCurrency(selectedMember?.balance_amount || 0) }}
          </div>
          <p class="mt-2 text-xs font-bold text-emerald-600/80">
            {{ selectedMember?.member_name || '尚未選擇' }}
          </p>
        </div>

        <div v-if="canEdit" class="mt-4 border-t border-gray-100 pt-4">
          <div class="text-sm font-black text-slate-800">手動調整</div>
          <div class="mt-3 grid gap-3">
            <el-input-number
              v-model="form.delta"
              class="!w-full"
              :step="100"
              :min="-100000"
              :max="100000"
              size="large"
            />
            <el-input
              v-model="form.reason"
              type="textarea"
              :rows="3"
              maxlength="120"
              show-word-limit
              placeholder="例如：溢繳入帳、退款扣回、活動補助"
            />
            <button
              type="button"
              class="rounded-2xl bg-emerald-600 px-5 py-3 font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-70"
              :disabled="isSaving || !selectedMemberId"
              @click="submitAdjustment"
            >
              {{ isSaving ? '儲存中...' : '儲存調整' }}
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div class="border-b border-gray-100 px-4 py-3">
          <h4 class="font-black text-slate-800">餘額流水</h4>
          <p class="mt-1 text-xs text-gray-400">包含手動調整、付款扣抵與溢繳轉入。</p>
        </div>

        <div v-if="isLoading" class="p-5 text-sm font-bold text-gray-400">讀取餘額資料中...</div>
        <div v-else-if="transactions.length === 0" class="p-5 text-sm font-bold text-gray-400">目前沒有餘額流水。</div>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[760px]">
            <thead>
              <tr class="bg-gray-50/80 border-b border-gray-100">
                <th class="py-3 px-4 text-left text-sm font-bold text-gray-500">時間</th>
                <th class="py-3 px-4 text-left text-sm font-bold text-gray-500">來源</th>
                <th class="py-3 px-4 text-right text-sm font-bold text-gray-500">異動</th>
                <th class="py-3 px-4 text-right text-sm font-bold text-gray-500">異動後餘額</th>
                <th class="py-3 px-4 text-left text-sm font-bold text-gray-500">備註</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="transaction in transactions" :key="transaction.id" class="hover:bg-gray-50/60">
                <td class="py-3 px-4 text-sm font-medium text-gray-500">{{ formatDateTime(transaction.created_at) }}</td>
                <td class="py-3 px-4 text-sm font-bold text-slate-700">{{ formatPlayerBalanceSource(transaction.source) }}</td>
                <td class="py-3 px-4 text-right font-mono font-black" :class="deltaClass(transaction.delta)">
                  {{ transaction.delta > 0 ? '+' : '' }}{{ formatCurrency(transaction.delta) }}
                </td>
                <td class="py-3 px-4 text-right font-mono font-black text-slate-800">
                  {{ formatCurrency(transaction.balance_after) }}
                </td>
                <td class="py-3 px-4 text-sm text-gray-500">
                  {{ transaction.reason || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
