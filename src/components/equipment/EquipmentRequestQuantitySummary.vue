<script setup lang="ts">
import { computed, ref } from 'vue'
import AppCollapseButton from '@/components/common/AppCollapseButton.vue'
import type { EquipmentRequestQuantitySummaryRow } from '@/utils/equipmentPurchaseAdmin'

const props = defineProps<{
  rows: EquipmentRequestQuantitySummaryRow[]
}>()

const isCollapsed = ref(false)

const totalQuantity = computed(() => props.rows.reduce(
  (total, row) => total + row.totalQuantity,
  0
))

const formatNumber = (value: number) => new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 0
}).format(Number(value) || 0)

const getVariantLabel = (row: EquipmentRequestQuantitySummaryRow) => [
  row.size ? `尺寸 ${row.size}` : '無尺寸',
  row.jerseyNumber == null ? '無背號' : `背號 ${row.jerseyNumber}`
].join('｜')
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="equipment-request-quantity-summary-title">
    <div class="flex items-center justify-between gap-3 p-4">
      <div class="min-w-0">
        <h2 id="equipment-request-quantity-summary-title" class="font-black text-slate-800">請購數量統計</h2>
        <p class="mt-1 text-xs leading-5 text-slate-500">
          依目前狀態與篩選彙整全部分頁，共 {{ formatNumber(rows.length) }} 種規格、{{ formatNumber(totalQuantity) }} 件。
        </p>
      </div>
      <AppCollapseButton
        :expanded="!isCollapsed"
        controls="equipment-request-quantity-summary"
        label="請購數量統計"
        class="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:border-primary hover:text-primary"
        @toggle="isCollapsed = !isCollapsed"
      />
    </div>

    <div id="equipment-request-quantity-summary" v-show="!isCollapsed" class="border-t border-slate-100">
      <div v-if="rows.length === 0" class="px-4 py-8 text-center">
        <p class="font-black text-slate-600">目前沒有可統計的請購品項</p>
        <p class="mt-1 text-sm text-slate-400">可切換請購狀態，或清除搜尋與進階篩選。</p>
      </div>

      <div v-else role="table" aria-label="請購裝備數量統計">
        <div
          role="row"
          class="hidden grid-cols-[minmax(12rem,2fr)_minmax(6rem,0.8fr)_minmax(6rem,0.8fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)] gap-3 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500 md:grid"
        >
          <span role="columnheader">裝備</span>
          <span role="columnheader">尺寸</span>
          <span role="columnheader">背號</span>
          <span role="columnheader" class="text-right">請購單數</span>
          <span role="columnheader" class="text-right">總數量</span>
        </div>

        <div
          v-for="row in rows"
          :key="row.key"
          role="row"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-slate-100 px-4 py-4 first:border-t-0 md:grid-cols-[minmax(12rem,2fr)_minmax(6rem,0.8fr)_minmax(6rem,0.8fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)] md:py-3"
        >
          <span role="cell" class="min-w-0">
            <span class="block truncate font-black text-slate-800">{{ row.equipmentName }}</span>
            <span class="mt-1 block text-xs font-bold text-slate-400 md:hidden">{{ getVariantLabel(row) }}</span>
          </span>
          <span role="cell" class="hidden text-sm font-bold text-slate-600 md:block">{{ row.size || '未指定' }}</span>
          <span role="cell" class="hidden text-sm font-bold text-slate-600 md:block">{{ row.jerseyNumber == null ? '未指定' : row.jerseyNumber }}</span>
          <span role="cell" class="hidden text-right text-sm font-bold text-slate-600 md:block">{{ formatNumber(row.requestCount) }} 筆</span>
          <span role="cell" class="text-right">
            <span class="block tabular-nums text-lg font-black text-primary">{{ formatNumber(row.totalQuantity) }} 件</span>
            <span class="mt-1 block text-xs font-bold text-slate-400 md:hidden">{{ formatNumber(row.requestCount) }} 筆請購</span>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
