<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { useEquipmentStore } from '@/stores/equipment'
import { fetchEquipmentRequestHistoryItems } from '@/services/equipmentApi'
import type {
  Equipment,
  EquipmentInventoryAdjustment,
  EquipmentRequestHistoryItem,
  EquipmentTransaction
} from '@/types/equipment'
import {
  formatEquipmentVariantLabel,
  getEquipmentRequestItemTotalPrice,
  getEquipmentTransactionTotalPrice
} from '@/utils/equipmentPricing'
import {
  EQUIPMENT_REQUEST_RESERVED_STATUSES,
  getEquipmentRequestStatusLabel
} from '@/utils/equipmentRequestStatus'

const props = defineProps<{
  modelValue: boolean
  equipment: Equipment | null
  canDelete?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const equipmentStore = useEquipmentStore()
const requestHistoryItems = ref<EquipmentRequestHistoryItem[]>([])
const isRequestHistoryLoading = ref(false)

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const displayEquipment = computed(() => {
  if (!props.equipment?.id) return props.equipment
  return equipmentStore.equipmentById.get(props.equipment.id) || props.equipment
})

const transactions = computed(() => displayEquipment.value?.equipment_transactions || [])
const inventoryAdjustments = computed(() => displayEquipment.value?.inventory_adjustments || [])
const isHistoryLoading = computed(() => equipmentStore.isLoading || isRequestHistoryLoading.value)

const typeLabel = (type: string) => {
  if (type.startsWith('request:')) {
    return '加購申請'
  }

  const map: Record<string, string> = {
    borrow: '借出',
    return: '歸還',
    receive: '領取',
    purchase: '購買',
    stock_in: '新增庫存'
  }
  return map[type] || type
}

const typeClass = (type: string) => {
  if (type.startsWith('request:')) return 'bg-sky-50 border-sky-200 text-sky-700'
  if (type === 'stock_in') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  if (type === 'return') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  if (type === 'purchase') return 'bg-primary/10 border-primary/20 text-primary'
  if (type === 'receive') return 'bg-blue-50 border-blue-200 text-blue-700'
  return 'bg-amber-50 border-amber-200 text-amber-700'
}

type HistoryItem = {
  id: string
  kind: 'transaction' | 'inventory_adjustment' | 'request_item'
  recordType: string
  time: string | null
  person: string | null
  source: string
  sourceDetail: string | null
  variantLabel: string
  quantityLabel: string
  quantityTone: 'positive' | 'negative' | 'neutral'
  amount: number | null
  notes: string | null
  transaction?: EquipmentTransaction
  requestItem?: EquipmentRequestHistoryItem
}

const formatDateTime = (value?: string | null) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '尚無時間'
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const getTransactionQuantityLabel = (transaction: EquipmentTransaction) => {
  const quantity = Math.max(Number(transaction.quantity || 0), 0)
  return transaction.transaction_type === 'return' ? `+${quantity}` : `-${quantity}`
}

const getTransactionSource = (transaction: EquipmentTransaction) => {
  if (transaction.transaction_type === 'purchase') {
    return transaction.request_item_id ? '裝備加購' : '管理端購買'
  }

  return '管理端交易'
}

const getTransactionSourceDetail = (transaction: EquipmentTransaction) => {
  if (transaction.transaction_type === 'purchase' && transaction.request_item_id) {
    return '領取後建立付款項目'
  }

  if (transaction.transaction_type === 'purchase') {
    return '手動新增購買'
  }

  return null
}

const getTransactionNotes = (transaction: EquipmentTransaction) =>
  transaction.request_item?.request?.notes?.trim()
  || transaction.notes
  || null

const getRequestHistoryTime = (item: EquipmentRequestHistoryItem) =>
  item.picked_up_at || item.rejected_at || item.cancelled_at || item.ready_at || item.approved_at || item.requested_at

const isRequestItemReserved = (item: EquipmentRequestHistoryItem) =>
  EQUIPMENT_REQUEST_RESERVED_STATUSES.includes(item.request_status as any)

const getRequestQuantityLabel = (item: EquipmentRequestHistoryItem) => {
  if (isRequestItemReserved(item)) {
    return `預扣 -${Math.max(Number(item.quantity || 0), 0)}`
  }

  return '未扣庫存'
}

const quantityClass = (item: HistoryItem) => {
  if (item.quantityTone === 'positive') return 'text-emerald-700'
  if (item.quantityTone === 'negative') return 'text-rose-600'
  return 'text-gray-500'
}

const mapTransactionHistoryItem = (transaction: EquipmentTransaction): HistoryItem => ({
  id: `transaction-${transaction.id}`,
  kind: 'transaction',
  recordType: transaction.transaction_type,
  time: transaction.created_at || transaction.transaction_date,
  person: transaction.team_members?.name || transaction.handled_by || null,
  source: getTransactionSource(transaction),
  sourceDetail: getTransactionSourceDetail(transaction),
  variantLabel: formatEquipmentVariantLabel(transaction),
  quantityLabel: getTransactionQuantityLabel(transaction),
  quantityTone: transaction.transaction_type === 'return' ? 'positive' : 'negative',
  amount: transaction.transaction_type === 'purchase'
    ? getEquipmentTransactionTotalPrice(transaction, displayEquipment.value)
    : null,
  notes: getTransactionNotes(transaction),
  transaction
})

const mapAdjustmentHistoryItem = (adjustment: EquipmentInventoryAdjustment): HistoryItem => ({
  id: `inventory-${adjustment.id}`,
  kind: 'inventory_adjustment',
  recordType: adjustment.adjustment_type || 'stock_in',
  time: adjustment.created_at || adjustment.adjustment_date,
  person: adjustment.team_members?.name || adjustment.handled_by || null,
  source: '庫存調整',
  sourceDetail: '新增庫存',
  variantLabel: formatEquipmentVariantLabel(adjustment),
  quantityLabel: `+${Math.max(Number(adjustment.quantity_delta || 0), 0)}`,
  quantityTone: 'positive',
  amount: null,
  notes: adjustment.notes || null
})

const mapRequestHistoryItem = (item: EquipmentRequestHistoryItem): HistoryItem => ({
  id: `request-item-${item.request_item_id}`,
  kind: 'request_item',
  recordType: `request:${item.request_status}`,
  time: getRequestHistoryTime(item),
  person: item.member_name || null,
  source: '裝備加購',
  sourceDetail: getEquipmentRequestStatusLabel(item.request_status),
  variantLabel: formatEquipmentVariantLabel(item),
  quantityLabel: getRequestQuantityLabel(item),
  quantityTone: isRequestItemReserved(item) ? 'negative' : 'neutral',
  amount: getEquipmentRequestItemTotalPrice({
    unit_price_snapshot: item.unit_price,
    quantity: item.quantity
  }),
  notes: item.notes?.trim() || `申請 ${item.request_id}`,
  requestItem: item
})

const historyItems = computed(() => [
  ...transactions.value.map(mapTransactionHistoryItem),
  ...inventoryAdjustments.value.map(mapAdjustmentHistoryItem),
  ...requestHistoryItems.value.map(mapRequestHistoryItem)
].sort((a, b) => {
  const aTime = dayjs(a.time).isValid() ? dayjs(a.time).valueOf() : 0
  const bTime = dayjs(b.time).isValid() ? dayjs(b.time).valueOf() : 0
  return bTime - aTime
}))

const loadDialogHistory = async () => {
  if (!props.equipment?.id) return
  isRequestHistoryLoading.value = true

  try {
    const [, requestItems] = await Promise.all([
      equipmentStore.loadHistory(props.equipment.id),
      fetchEquipmentRequestHistoryItems(props.equipment.id)
    ])
    requestHistoryItems.value = requestItems
  } finally {
    isRequestHistoryLoading.value = false
  }
}

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
    void loadDialogHistory()
  } else if (!value) {
    requestHistoryItems.value = []
  }
})
</script>

<template>
  <el-dialog
    v-model="isOpen"
    title="裝備交易紀錄"
    width="96%"
    style="max-width: 1180px; border-radius: 16px;"
  >
    <div v-if="displayEquipment" class="mb-4 rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
      <div class="text-lg font-black text-slate-800">{{ displayEquipment.name }}</div>
      <p class="mt-1 text-xs font-bold text-gray-400">{{ displayEquipment.category }}</p>
    </div>

    <AppLoadingState v-if="isHistoryLoading" text="讀取交易紀錄中..." min-height="8rem" />

    <div v-else-if="historyItems.length === 0" class="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-8 text-center text-sm font-bold text-gray-400">
      目前尚無紀錄。
    </div>

    <div v-else class="space-y-3">
      <div class="space-y-3 xl:hidden">
        <article
          v-for="item in historyItems"
          :key="item.id"
          class="rounded-lg border border-gray-100 bg-white p-4 shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-xs font-bold text-gray-400">{{ formatDateTime(item.time) }}</div>
              <span :class="typeClass(item.recordType)" class="mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold">
                {{ typeLabel(item.recordType) }}
              </span>
            </div>
            <button
              v-if="canDelete && item.kind === 'transaction' && item.transaction"
              type="button"
              class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-500 transition-colors hover:bg-red-100"
              title="刪除交易"
              @click="removeTransaction(item.transaction)"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div class="min-w-0">
              <div class="text-xs font-bold text-gray-400">來源</div>
              <div class="mt-1 break-words font-black text-slate-700">{{ item.source }}</div>
              <div v-if="item.sourceDetail" class="mt-0.5 break-words text-xs font-bold text-gray-400">{{ item.sourceDetail }}</div>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-gray-400">人員</div>
              <div class="mt-1 break-words text-gray-600">{{ item.person || '未指定' }}</div>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-gray-400">規格 / 號碼</div>
              <div class="mt-1 break-words text-gray-600">{{ item.variantLabel }}</div>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-gray-400">庫存異動</div>
              <div class="mt-1 font-black" :class="quantityClass(item)">{{ item.quantityLabel }}</div>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-gray-400">金額</div>
              <div class="mt-1 font-black text-primary">
                {{ item.amount !== null ? formatCurrency(item.amount) : '-' }}
              </div>
            </div>
          </div>

          <div class="mt-4 border-t border-gray-100 pt-3">
            <div class="text-xs font-bold text-gray-400">備註</div>
            <p class="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600">
              {{ item.notes || '-' }}
            </p>
          </div>
        </article>
      </div>

      <div class="hidden overflow-x-auto rounded-lg border border-gray-100 xl:block">
        <table class="w-full min-w-[1100px] table-fixed text-left">
          <colgroup>
            <col class="w-[9rem]">
            <col class="w-[6rem]">
            <col class="w-[9rem]">
            <col class="w-[5rem]">
            <col class="w-[7rem]">
            <col class="w-[6rem]">
            <col class="w-[6.5rem]">
            <col>
            <col v-if="canDelete" class="w-[5rem]">
          </colgroup>
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50 text-sm text-gray-500">
              <th class="px-4 py-3 font-bold whitespace-nowrap">時間</th>
              <th class="px-4 py-3 font-bold whitespace-nowrap">紀錄</th>
              <th class="px-4 py-3 font-bold whitespace-nowrap">來源</th>
              <th class="px-4 py-3 font-bold whitespace-nowrap">人員</th>
              <th class="px-4 py-3 font-bold whitespace-nowrap">規格 / 號碼</th>
              <th class="px-4 py-3 font-bold whitespace-nowrap">庫存異動</th>
              <th class="px-4 py-3 font-bold whitespace-nowrap">金額</th>
              <th class="px-4 py-3 font-bold whitespace-nowrap">備註</th>
              <th v-if="canDelete" class="sticky right-0 bg-gray-50 px-4 py-3 font-bold text-right whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="item in historyItems" :key="item.id" class="group hover:bg-gray-50/60">
              <td class="px-4 py-3 align-top text-sm font-bold text-slate-700 whitespace-nowrap">{{ formatDateTime(item.time) }}</td>
              <td class="px-4 py-3 align-top">
                <span :class="typeClass(item.recordType)" class="inline-flex rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap">
                  {{ typeLabel(item.recordType) }}
                </span>
              </td>
              <td class="px-4 py-3 align-top text-sm text-gray-600">
                <div class="break-words font-black text-slate-700">{{ item.source }}</div>
                <div v-if="item.sourceDetail" class="mt-0.5 break-words text-xs font-bold text-gray-400">{{ item.sourceDetail }}</div>
              </td>
              <td class="px-4 py-3 align-top text-sm text-gray-600 break-words">{{ item.person || '未指定' }}</td>
              <td class="px-4 py-3 align-top text-sm text-gray-600 break-words">{{ item.variantLabel }}</td>
              <td class="px-4 py-3 align-top font-black whitespace-nowrap" :class="quantityClass(item)">{{ item.quantityLabel }}</td>
              <td class="px-4 py-3 align-top font-black text-primary whitespace-nowrap">
                {{ item.amount !== null ? formatCurrency(item.amount) : '-' }}
              </td>
              <td class="px-4 py-3 align-top text-sm leading-relaxed text-gray-500 whitespace-pre-wrap break-words">{{ item.notes || '-' }}</td>
              <td v-if="canDelete" class="sticky right-0 bg-white px-4 py-3 text-right align-top transition-colors group-hover:bg-gray-50/60">
                <button
                  v-if="item.kind === 'transaction' && item.transaction"
                  type="button"
                  class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                  title="刪除交易"
                  @click="removeTransaction(item.transaction)"
                >
                  <el-icon><Delete /></el-icon>
                </button>
                <span v-else class="text-xs text-gray-300">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </el-dialog>
</template>
