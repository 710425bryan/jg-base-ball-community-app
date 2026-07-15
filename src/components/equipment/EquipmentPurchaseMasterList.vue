<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import dayjs from 'dayjs'
import { RefreshRight } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import {
  getEquipmentAdminStatusPresentation,
  type EquipmentAdminArea,
  type EquipmentAdminRecord,
  type EquipmentAdminStatus
} from '@/utils/equipmentPurchaseAdmin'

const props = withDefaults(defineProps<{
  area: EquipmentAdminArea
  status: EquipmentAdminStatus
  records: EquipmentAdminRecord[]
  selectedKey?: string | null
  page?: number
  pageSize?: number
  isLoading?: boolean
  error?: string
}>(), {
  selectedKey: null,
  page: 1,
  pageSize: 10,
  isLoading: false,
  error: ''
})

const emit = defineEmits<{
  select: [record: EquipmentAdminRecord]
  retry: []
  'update:page': [page: number]
}>()

const listElement = ref<HTMLElement | null>(null)

const pageRecords = computed(() => {
  const start = Math.max(props.page - 1, 0) * props.pageSize
  return props.records.slice(start, start + props.pageSize)
})

const listPresentation = computed(() => (
  getEquipmentAdminStatusPresentation(props.area, props.status)
))

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const formatDate = (value: string) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '日期未設定'
}

const getStatusClass = (record: EquipmentAdminRecord) => (
  getEquipmentAdminStatusPresentation(record.area, record.status).badgeClass
)

const getRowClass = (record: EquipmentAdminRecord) => {
  const presentation = getEquipmentAdminStatusPresentation(record.area, record.status)
  return record.key === props.selectedKey
    ? presentation.selectedRowClass
    : presentation.idleRowClass
}

const handlePageChange = async (page: number) => {
  emit('update:page', page)
  await nextTick()
  listElement.value
    ?.querySelector<HTMLElement>('[data-equipment-record-row]')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <section
    ref="listElement"
    class="rounded-2xl border shadow-sm"
    :class="listPresentation.panelClass"
    :aria-label="`裝備請購付款主清單：${listPresentation.title}`"
  >
    <div v-if="isLoading" class="m-2 rounded-xl border border-white/80 bg-white/90 sm:m-3">
      <AppLoadingState text="讀取裝備請購與付款資料中..." min-height="18rem" />
    </div>

    <div v-else-if="error" class="m-2 flex min-h-72 flex-col items-center justify-center rounded-xl border border-white/80 bg-white/90 px-5 py-10 text-center sm:m-3">
      <p class="text-sm font-bold text-red-600">{{ error }}</p>
      <button
        type="button"
        class="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        @click="emit('retry')"
      >
        <el-icon><RefreshRight /></el-icon>
        重新整理
      </button>
    </div>

    <div v-else-if="records.length === 0" class="m-2 flex min-h-72 flex-col items-center justify-center rounded-xl border border-white/80 bg-white/90 px-5 py-10 text-center sm:m-3">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-400" aria-hidden="true">0</div>
      <h3 class="mt-4 font-black text-slate-700">目前沒有符合條件的資料</h3>
      <p class="mt-1 text-sm text-slate-500">可切換狀態或清除搜尋與進階篩選。</p>
    </div>

    <template v-else>
      <div class="space-y-2 p-2 sm:p-3">
        <button
          v-for="record in pageRecords"
          :key="record.key"
          type="button"
          data-equipment-record-row
          class="block min-h-[7.25rem] w-full cursor-pointer rounded-xl border px-4 py-4 text-left shadow-sm transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 lg:px-5"
          :class="getRowClass(record)"
          :aria-pressed="record.key === selectedKey"
          @click="emit('select', record)"
        >
          <span class="flex items-start justify-between gap-3">
            <span class="min-w-0">
              <span class="block truncate text-base font-black text-slate-800">{{ record.memberName }}</span>
              <span class="mt-1 block line-clamp-2 text-sm font-bold leading-5 text-slate-600">{{ record.equipmentSummary }}</span>
            </span>
            <span :class="getStatusClass(record)" class="shrink-0 rounded-full border px-2.5 py-1 text-xs font-black">
              {{ record.statusLabel }}
            </span>
          </span>
          <span class="mt-3 flex items-end justify-between gap-3">
            <span class="text-xs font-medium text-slate-400">{{ formatDate(record.date) }}</span>
            <span class="tabular-nums text-lg font-black text-primary">{{ formatCurrency(record.amount) }}</span>
          </span>
        </button>
      </div>

      <div v-if="records.length > pageSize" class="flex justify-center border-t border-white/80 bg-white/60 px-3 py-4">
        <el-pagination
          background
          layout="prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :total="records.length"
          :pager-count="5"
          @current-change="handlePageChange"
        />
      </div>
    </template>
  </section>
</template>
