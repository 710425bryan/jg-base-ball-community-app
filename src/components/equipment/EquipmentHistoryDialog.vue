<script setup lang="ts">
import { computed, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Loading } from '@element-plus/icons-vue'
import { useEquipmentStore } from '@/stores/equipment'
import type { Equipment, EquipmentTransaction } from '@/types/equipment'
import { getEquipmentTransactionTotalPrice } from '@/utils/equipmentPricing'

const props = defineProps<{
  modelValue: boolean
  equipment: Equipment | null
  canDelete?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const equipmentStore = useEquipmentStore()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const transactions = computed(() => props.equipment?.equipment_transactions || [])

const typeLabel = (type: string) => {
  const map: Record<string, string> = {
    borrow: '借出',
    return: '歸還',
    receive: '領取',
    purchase: '購買'
  }
  return map[type] || type
}

const typeClass = (type: string) => {
  if (type === 'return') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  if (type === 'purchase') return 'bg-primary/10 border-primary/20 text-primary'
  if (type === 'receive') return 'bg-blue-50 border-blue-200 text-blue-700'
  return 'bg-amber-50 border-amber-200 text-amber-700'
}

const formatDate = (value?: string | null) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '尚無日期'
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const removeTransaction = async (transaction: EquipmentTransaction) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆裝備交易紀錄嗎？庫存計算會同步更新。', '刪除交易', {
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    await equipmentStore.removeTransaction(transaction.id)
    ElMessage.success('已刪除交易紀錄')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '刪除交易紀錄失敗')
    }
  }
}

watch(() => props.modelValue, (value) => {
  if (value && props.equipment?.id) {
    void equipmentStore.loadTransactions(props.equipment.id)
  }
})
</script>

<template>
  <el-dialog
    v-model="isOpen"
    title="裝備交易紀錄"
    width="94%"
    style="max-width: 860px; border-radius: 16px;"
  >
    <div v-if="equipment" class="mb-4 rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
      <div class="text-lg font-black text-slate-800">{{ equipment.name }}</div>
      <p class="mt-1 text-xs font-bold text-gray-400">{{ equipment.category }}</p>
    </div>

    <div v-if="equipmentStore.isLoading" class="flex items-center justify-center gap-3 py-10 text-gray-500 font-bold">
      <el-icon class="is-loading text-primary"><Loading /></el-icon>
      讀取交易紀錄中...
    </div>

    <div v-else-if="transactions.length === 0" class="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-8 text-center text-sm font-bold text-gray-400">
      目前尚無交易紀錄。
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[760px] text-left">
        <thead>
          <tr class="border-b border-gray-100 bg-gray-50 text-sm text-gray-500">
            <th class="px-4 py-3 font-bold">日期</th>
            <th class="px-4 py-3 font-bold">類型</th>
            <th class="px-4 py-3 font-bold">成員</th>
            <th class="px-4 py-3 font-bold">尺寸</th>
            <th class="px-4 py-3 font-bold">數量</th>
            <th class="px-4 py-3 font-bold">金額</th>
            <th class="px-4 py-3 font-bold">備註</th>
            <th v-if="canDelete" class="px-4 py-3 font-bold text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="transaction in transactions" :key="transaction.id" class="hover:bg-gray-50/60">
            <td class="px-4 py-3 text-sm font-bold text-slate-700">{{ formatDate(transaction.transaction_date) }}</td>
            <td class="px-4 py-3">
              <span :class="typeClass(transaction.transaction_type)" class="rounded-full border px-3 py-1 text-xs font-bold">
                {{ typeLabel(transaction.transaction_type) }}
              </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-600">{{ transaction.team_members?.name || '未指定' }}</td>
            <td class="px-4 py-3 text-sm text-gray-600">{{ transaction.size || '-' }}</td>
            <td class="px-4 py-3 font-black text-slate-800">{{ transaction.quantity }}</td>
            <td class="px-4 py-3 font-black text-primary">
              {{ transaction.transaction_type === 'purchase' ? formatCurrency(getEquipmentTransactionTotalPrice(transaction, equipment)) : '-' }}
            </td>
            <td class="px-4 py-3 text-sm text-gray-500 max-w-[14rem] truncate">{{ transaction.notes || '-' }}</td>
            <td v-if="canDelete" class="px-4 py-3 text-right">
              <button
                type="button"
                class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-red-500 hover:bg-red-100 transition-colors"
                title="刪除交易"
                @click="removeTransaction(transaction)"
              >
                <el-icon><Delete /></el-icon>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </el-dialog>
</template>
