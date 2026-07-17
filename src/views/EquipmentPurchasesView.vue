<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Close, Filter, Refresh, Search, ShoppingCart } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import AppCollapseButton from '@/components/common/AppCollapseButton.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import EquipmentPaymentAdminDetail from '@/components/equipment/EquipmentPaymentAdminDetail.vue'
import EquipmentPurchaseMasterList from '@/components/equipment/EquipmentPurchaseMasterList.vue'
import EquipmentRequestAdminDetail from '@/components/equipment/EquipmentRequestAdminDetail.vue'
import EquipmentRequestQuantitySummary from '@/components/equipment/EquipmentRequestQuantitySummary.vue'
import { useEquipmentPaymentsStore } from '@/stores/equipmentPayments'
import { useEquipmentRequestsStore } from '@/stores/equipmentRequests'
import { usePermissionsStore } from '@/stores/permissions'
import {
  EQUIPMENT_PAYMENT_ADMIN_STATUSES,
  EQUIPMENT_REQUEST_ADMIN_STATUSES,
  buildEquipmentAdminQuery,
  buildEquipmentPaymentAdminRecords,
  buildEquipmentRequestAdminRecords,
  clampEquipmentAdminPage,
  filterEquipmentAdminRecords,
  findEquipmentAdminRecord,
  getEquipmentAdminRouteState,
  getEquipmentAdminStatusPresentation,
  hasEquipmentAdminListContextChanged,
  summarizeEquipmentAdminRecords,
  summarizeEquipmentRequestQuantities,
  type EquipmentAdminArea,
  type EquipmentAdminRecord,
  type EquipmentAdminStatus,
  type EquipmentPaymentAdminRecord,
  type EquipmentRequestAdminRecord
} from '@/utils/equipmentPurchaseAdmin'

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'
const EQUIPMENT_ADMIN_PAGE_SIZE = 10

const route = useRoute()
const router = useRouter()
const paymentsStore = useEquipmentPaymentsStore()
const requestsStore = useEquipmentRequestsStore()
const permissionsStore = usePermissionsStore()

const initialRouteState = getEquipmentAdminRouteState(route.query)
const activeArea = ref<EquipmentAdminArea>(initialRouteState.area)
const activeStatus = ref<EquipmentAdminStatus>(initialRouteState.status)
const searchTerm = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const subtype = ref('')
const currentPage = ref(1)
const selectedKey = ref<string | null>(null)
const isSummaryCollapsed = ref(true)
const isAdvancedFiltersCollapsed = ref(true)
const isRefreshing = ref(false)
const isDesktopViewport = ref(false)
const detailDrawerOpen = ref(false)
const loadErrors = ref<Record<'requests' | 'submissions' | 'unpaid' | 'refundable', string>>({
  requests: '',
  submissions: '',
  unpaid: '',
  refundable: ''
})

let desktopMediaQuery: MediaQueryList | null = null

const canEdit = computed(() => permissionsStore.can('fees', 'EDIT'))
const canDelete = computed(() => permissionsStore.can('fees', 'DELETE'))

const paymentRecords = computed(() => buildEquipmentPaymentAdminRecords({
  unpaidItems: paymentsStore.adminUnpaidItems,
  submissions: paymentsStore.reviewSubmissions,
  refundableDirectItems: paymentsStore.adminRefundableDirectItems
}))
const requestRecords = computed(() => buildEquipmentRequestAdminRecords(requestsStore.reviewRequests))
const allRecords = computed<EquipmentAdminRecord[]>(() => [...paymentRecords.value, ...requestRecords.value])
const statusOptions = computed(() => activeArea.value === 'payments'
  ? EQUIPMENT_PAYMENT_ADMIN_STATUSES
  : EQUIPMENT_REQUEST_ADMIN_STATUSES
)
const activeStatusPresentation = computed(() => (
  getEquipmentAdminStatusPresentation(activeArea.value, activeStatus.value)
))
const summaries = computed(() => summarizeEquipmentAdminRecords(allRecords.value, activeArea.value))
const visibleRecords = computed(() => filterEquipmentAdminRecords(allRecords.value, {
  area: activeArea.value,
  status: activeStatus.value,
  search: searchTerm.value,
  dateFrom: dateFrom.value,
  dateTo: dateTo.value,
  subtype: subtype.value
}))
const requestQuantitySummaryRows = computed(() => summarizeEquipmentRequestQuantities(visibleRecords.value))
const selectedRecord = computed(() => allRecords.value.find((record) => record.key === selectedKey.value) || null)
const selectedPaymentRecord = computed(() => selectedRecord.value?.area === 'payments'
  ? selectedRecord.value as EquipmentPaymentAdminRecord
  : null
)
const selectedRequestRecord = computed(() => selectedRecord.value?.area === 'requests'
  ? selectedRecord.value as EquipmentRequestAdminRecord
  : null
)

const activeErrors = computed(() => {
  const errors = activeArea.value === 'payments'
    ? [loadErrors.value.unpaid, loadErrors.value.submissions, loadErrors.value.refundable]
    : [loadErrors.value.requests]
  return errors.filter(Boolean)
})
const blockingError = computed(() => {
  const hasAreaRecords = allRecords.value.some((record) => record.area === activeArea.value)
  return !hasAreaRecords && activeErrors.value.length > 0 ? activeErrors.value.join('；') : ''
})
const partialError = computed(() => blockingError.value ? '' : activeErrors.value.join('；'))
const activeAdvancedFilterCount = computed(() => [dateFrom.value, dateTo.value, subtype.value].filter(Boolean).length)

const subtypeOptions = computed(() => activeArea.value === 'payments'
  ? [
    { value: 'transaction', label: '交易項目' },
    { value: 'payment_submission', label: '付款回報單' }
  ]
  : [
    { value: 'pending', label: '待審核' },
    { value: 'approved', label: '已核准／待備貨' },
    { value: 'ready_for_pickup', label: '可取貨' },
    { value: 'picked_up', label: '已領取' },
    { value: 'rejected', label: '已退回' },
    { value: 'cancelled', label: '已取消' }
  ]
)

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) return message
  }
  return fallback
}

const recordMatchesStatus = (record: EquipmentAdminRecord, status: EquipmentAdminStatus) => {
  if (status === 'action') {
    return record.area === 'payments'
      ? record.status === 'unpaid' || record.status === 'review'
      : record.status === 'pending' || record.status === 'processing'
  }
  return record.status === status
}

const replaceRouteQuery = (includeSelection = true) => {
  const record = includeSelection ? selectedRecord.value : null
  void router.replace({
    name: 'EquipmentPurchases',
    query: buildEquipmentAdminQuery({
      area: activeArea.value,
      status: activeStatus.value,
      recordType: record?.recordType,
      recordId: record?.id
    })
  })
}

const applyRouteState = () => {
  const state = getEquipmentAdminRouteState(route.query)
  const record = findEquipmentAdminRecord(allRecords.value, state.recordType, state.recordId)
  const nextArea = record?.area || state.area
  const nextStatus = record && !recordMatchesStatus(record, state.status)
    ? record.status
    : state.status
  const shouldResetPage = hasEquipmentAdminListContextChanged(
    { area: activeArea.value, status: activeStatus.value },
    { area: nextArea, status: nextStatus }
  )

  activeArea.value = nextArea
  activeStatus.value = nextStatus
  selectedKey.value = record?.key || null
  if (shouldResetPage) currentPage.value = 1

  if (record && !isDesktopViewport.value) {
    detailDrawerOpen.value = true
  }
}

const refresh = async (syncRouteState = true) => {
  isRefreshing.value = true
  loadErrors.value = { requests: '', submissions: '', unpaid: '', refundable: '' }

  try {
    const [requestResult, submissionResult, unpaidResult, refundableResult] = await Promise.allSettled([
      requestsStore.loadReviewRequests(),
      paymentsStore.loadReviewSubmissions(),
      paymentsStore.loadAdminUnpaidItems(),
      paymentsStore.loadAdminRefundableDirectItems()
    ])

    if (requestResult.status === 'rejected') {
      loadErrors.value.requests = getErrorMessage(requestResult.reason, '無法載入裝備請購')
    }
    if (submissionResult.status === 'rejected') {
      loadErrors.value.submissions = getErrorMessage(submissionResult.reason, '無法載入付款回報')
    }
    if (unpaidResult.status === 'rejected') {
      loadErrors.value.unpaid = getErrorMessage(unpaidResult.reason, '無法載入尚未付款款項')
    }
    if (refundableResult.status === 'rejected') {
      loadErrors.value.refundable = getErrorMessage(refundableResult.reason, '無法載入可退款款項')
    }

    if (syncRouteState) applyRouteState()
  } finally {
    isRefreshing.value = false
  }
}

const clearSelection = (syncRoute = true) => {
  selectedKey.value = null
  detailDrawerOpen.value = false
  if (syncRoute) replaceRouteQuery(false)
}

const selectArea = (area: EquipmentAdminArea) => {
  if (activeArea.value === area) return
  activeArea.value = area
  activeStatus.value = 'action'
  subtype.value = ''
  currentPage.value = 1
  clearSelection(false)
  replaceRouteQuery(false)
}

const selectStatus = (status: EquipmentAdminStatus) => {
  activeStatus.value = status
  currentPage.value = 1
  clearSelection(false)
  replaceRouteQuery(false)
}

const selectRecord = (record: EquipmentAdminRecord) => {
  selectedKey.value = record.key
  if (!isDesktopViewport.value) detailDrawerOpen.value = true
  replaceRouteQuery(true)
}

const clearAdvancedFilters = () => {
  dateFrom.value = ''
  dateTo.value = ''
  subtype.value = ''
}

const getStatusOptionClass = (status: EquipmentAdminStatus) => {
  const presentation = getEquipmentAdminStatusPresentation(activeArea.value, status)
  return activeStatus.value === status
    ? presentation.optionActiveClass
    : presentation.optionIdleClass
}

const handleRecordChanged = async () => {
  const previousKey = selectedKey.value
  await refresh(false)
  const updated = allRecords.value.find((record) => record.key === previousKey)
  if (!updated || !recordMatchesStatus(updated, activeStatus.value)) {
    clearSelection(true)
  }
}

const handleDesktopMediaChange = (event: MediaQueryListEvent | MediaQueryList) => {
  isDesktopViewport.value = event.matches
  if (event.matches) detailDrawerOpen.value = false
  else if (selectedRecord.value) detailDrawerOpen.value = true
}

const handleDrawerClosed = () => {
  if (!isDesktopViewport.value && selectedKey.value) clearSelection(true)
}

watch([searchTerm, dateFrom, dateTo, subtype], () => {
  currentPage.value = 1
  if (selectedRecord.value && !visibleRecords.value.some((record) => record.key === selectedRecord.value?.key)) {
    clearSelection(true)
  }
})

watch(() => visibleRecords.value.length, (recordCount) => {
  currentPage.value = clampEquipmentAdminPage(
    currentPage.value,
    recordCount,
    EQUIPMENT_ADMIN_PAGE_SIZE
  )
})

watch(() => route.fullPath, () => applyRouteState())

onMounted(() => {
  if (typeof window.matchMedia === 'function') {
    desktopMediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
    handleDesktopMediaChange(desktopMediaQuery)
    desktopMediaQuery.addEventListener?.('change', handleDesktopMediaChange)
  }
  void refresh(true)
})

onBeforeUnmount(() => {
  desktopMediaQuery?.removeEventListener?.('change', handleDesktopMediaChange)
})
</script>

<template>
  <div class="min-h-full bg-background px-3 py-4 text-text sm:px-4 lg:px-6 lg:py-6">
    <div class="mx-auto max-w-7xl space-y-4">
      <AppPageHeader
        title="裝備請購／付款"
        subtitle="集中處理裝備款項、付款審核、請購進度與退款作廢"
        :icon="ShoppingCart"
      >
        <template #actions>
          <button
            type="button"
            class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
            :disabled="isRefreshing"
            @click="refresh(false)"
          >
            <el-icon :class="{ 'is-loading': isRefreshing }"><Refresh /></el-icon>
            {{ isRefreshing ? '更新中…' : '重新整理' }}
          </button>
        </template>
      </AppPageHeader>

      <section class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div class="grid grid-cols-2 gap-2" aria-label="管理類型">
          <button
            type="button"
            class="min-h-11 rounded-xl border px-4 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            :class="activeArea === 'payments' ? 'border-orange-200 bg-orange-50/70 text-primary shadow-sm' : 'border-transparent bg-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-50'"
            :aria-pressed="activeArea === 'payments'"
            @click="selectArea('payments')"
          >付款管理</button>
          <button
            type="button"
            class="min-h-11 rounded-xl border px-4 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            :class="activeArea === 'requests' ? 'border-orange-200 bg-orange-50/70 text-primary shadow-sm' : 'border-transparent bg-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-50'"
            :aria-pressed="activeArea === 'requests'"
            @click="selectArea('requests')"
          >請購管理</button>
        </div>

        <div class="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="處理狀態">
          <button
            v-for="option in statusOptions"
            :key="option.value"
            type="button"
            class="min-h-11 shrink-0 rounded-xl border px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            :class="getStatusOptionClass(option.value)"
            :aria-pressed="activeStatus === option.value"
            @click="selectStatus(option.value)"
          >{{ option.label }}</button>
        </div>

        <div
          class="mt-3 rounded-2xl border px-4 py-3"
          :class="activeStatusPresentation.panelClass"
          role="status"
          aria-live="polite"
        >
          <h2 class="font-black" :class="activeStatusPresentation.titleClass">
            {{ activeStatusPresentation.title }}
          </h2>
          <p class="mt-1 text-sm leading-6" :class="activeStatusPresentation.descriptionClass">
            {{ activeStatusPresentation.description }}
          </p>
        </div>
      </section>

      <EquipmentRequestQuantitySummary
        v-if="activeArea === 'requests'"
        :rows="requestQuantitySummaryRows"
      />

      <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="font-black text-slate-800">狀態金額摘要</h2>
            <p class="mt-1 text-xs text-slate-500">各狀態分開計算，不跨請購與付款生命週期加總。</p>
          </div>
          <AppCollapseButton
            :expanded="!isSummaryCollapsed"
            controls="equipment-admin-summary"
            label="狀態金額摘要"
            class="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:border-primary hover:text-primary"
            @toggle="isSummaryCollapsed = !isSummaryCollapsed"
          />
        </div>
        <div id="equipment-admin-summary" v-show="!isSummaryCollapsed" class="mt-4 grid gap-3 sm:grid-cols-3">
          <div
            v-for="summary in summaries"
            :key="summary.status"
            class="rounded-2xl border p-4"
            :class="getEquipmentAdminStatusPresentation(activeArea, summary.status).summaryClass"
          >
            <p class="text-xs font-black" :class="getEquipmentAdminStatusPresentation(activeArea, summary.status).titleClass">
              {{ summary.label }}{{ activeArea === 'requests' && summary.status === 'history' ? '｜申請金額' : '' }}
            </p>
            <p class="mt-2 tabular-nums text-xl font-black text-slate-800">{{ formatCurrency(summary.amount) }}</p>
            <p class="mt-1 text-xs font-bold text-slate-400">{{ summary.count }} 筆</p>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-center gap-2">
          <label class="relative min-w-0 flex-1">
            <span class="sr-only">搜尋球員或裝備</span>
            <el-icon class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400"><Search /></el-icon>
            <input
              v-model="searchTerm"
              type="search"
              class="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-base text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="搜尋球員、裝備或備註"
            />
          </label>
          <AppCollapseButton
            :expanded="!isAdvancedFiltersCollapsed"
            controls="equipment-admin-advanced-filters"
            label="進階篩選"
            class="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:border-primary hover:text-primary"
            @toggle="isAdvancedFiltersCollapsed = !isAdvancedFiltersCollapsed"
          />
        </div>

        <div id="equipment-admin-advanced-filters" v-show="!isAdvancedFiltersCollapsed" class="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <el-form-item label="起始日期" class="!mb-0 font-bold">
            <el-date-picker
              v-model="dateFrom"
              type="date"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              placeholder="選擇起始日期"
              clearable
              size="large"
              class="equipment-admin-filter-control !w-full"
            />
          </el-form-item>
          <el-form-item label="結束日期" class="!mb-0 font-bold">
            <el-date-picker
              v-model="dateTo"
              type="date"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              placeholder="選擇結束日期"
              clearable
              size="large"
              class="equipment-admin-filter-control !w-full"
            />
          </el-form-item>
          <el-form-item label="資料類型" class="!mb-0 font-bold">
            <el-select
              v-model="subtype"
              placeholder="全部類型"
              clearable
              size="large"
              class="equipment-admin-filter-control !w-full"
            >
              <el-option label="全部類型" value="" />
              <el-option v-for="option in subtypeOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>
          <div class="sm:col-span-3 flex items-center justify-between gap-3">
            <p class="text-xs font-bold text-slate-400">已套用 {{ activeAdvancedFilterCount }} 個進階條件</p>
            <button type="button" class="min-h-11 rounded-xl px-4 text-sm font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50" :disabled="activeAdvancedFilterCount === 0" @click="clearAdvancedFilters">
              清除進階篩選
            </button>
          </div>
        </div>
      </section>

      <div v-if="partialError" class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700" role="status">
        部分資料載入失敗：{{ partialError }}。其餘資料仍可繼續處理。
      </div>

      <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)]">
        <EquipmentPurchaseMasterList
          :area="activeArea"
          :status="activeStatus"
          :records="visibleRecords"
          :selected-key="selectedKey"
          :page="currentPage"
          :page-size="EQUIPMENT_ADMIN_PAGE_SIZE"
          :is-loading="isRefreshing && allRecords.length === 0"
          :error="blockingError"
          @select="selectRecord"
          @retry="refresh(true)"
          @update:page="currentPage = $event"
        />

        <section class="hidden min-h-[32rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block" aria-label="裝備請購付款明細">
          <EquipmentPaymentAdminDetail
            v-if="selectedPaymentRecord"
            :record="selectedPaymentRecord"
            :can-edit="canEdit"
            @changed="handleRecordChanged"
          />
          <EquipmentRequestAdminDetail
            v-else-if="selectedRequestRecord"
            :record="selectedRequestRecord"
            :can-edit="canEdit"
            :can-delete="canDelete"
            @changed="handleRecordChanged"
          />
          <div v-else class="flex min-h-[32rem] flex-col items-center justify-center px-6 text-center">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-primary">
              <el-icon :size="26"><Filter /></el-icon>
            </div>
            <h2 class="mt-4 text-lg font-black text-slate-700">請從左側選擇一筆資料</h2>
            <p class="mt-2 max-w-sm text-sm leading-6 text-slate-500">選取後會在這裡顯示完整金額、品項、處理進度與可用操作。</p>
          </div>
        </section>
      </div>
    </div>

    <el-drawer
      v-model="detailDrawerOpen"
      direction="rtl"
      size="100%"
      :with-header="false"
      append-to-body
      destroy-on-close
      class="equipment-admin-detail-drawer"
      @closed="handleDrawerClosed"
    >
      <div class="flex min-h-dvh flex-col bg-white">
        <header class="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 pt-[env(safe-area-inset-top)]">
          <div class="min-w-0">
            <h2 class="truncate font-black text-slate-800">{{ selectedRecord?.memberName || '裝備處理明細' }}</h2>
            <p class="truncate text-xs font-bold text-slate-400">{{ selectedRecord?.statusLabel }}</p>
          </div>
          <button type="button" class="app-icon-button shrink-0" aria-label="返回裝備請購付款清單" title="返回清單" @click="clearSelection(true)">
            <el-icon><Close /></el-icon>
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <EquipmentPaymentAdminDetail
            v-if="selectedPaymentRecord"
            :record="selectedPaymentRecord"
            :can-edit="canEdit"
            @changed="handleRecordChanged"
          />
          <EquipmentRequestAdminDetail
            v-else-if="selectedRequestRecord"
            :record="selectedRequestRecord"
            :can-edit="canEdit"
            :can-delete="canDelete"
            @changed="handleRecordChanged"
          />
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
:global(.equipment-admin-detail-drawer .el-drawer__body) {
  padding: 0;
}

:deep(.equipment-admin-filter-control .el-input__wrapper),
:deep(.equipment-admin-filter-control .el-select__wrapper) {
  min-height: 44px;
}
</style>
