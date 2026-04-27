<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceRecord } from '@/types/performance'

const props = defineProps<{
  records: PerformanceRecord[]
  metricKey: string
  metricLabel: string
  unit?: string
}>()

const width = 640
const height = 220
const padding = 34

const rows = computed(() => props.records
  .map((record) => ({
    id: record.id,
    date: record.test_date,
    value: Number((record as any)[props.metricKey])
  }))
  .filter((row) => Number.isFinite(row.value))
  .sort((left, right) => left.date.localeCompare(right.date)))

const bounds = computed(() => {
  const values = rows.value.map((row) => row.value)
  const min = Math.min(...values)
  const max = Math.max(...values)

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 }
  }

  if (min === max) {
    return {
      min: Math.max(0, min - 1),
      max: max + 1
    }
  }

  const gap = (max - min) * 0.12
  return {
    min: Math.max(0, min - gap),
    max: max + gap
  }
})

const points = computed(() => {
  const count = rows.value.length
  const xSpan = width - padding * 2
  const ySpan = height - padding * 2
  const valueSpan = bounds.value.max - bounds.value.min || 1

  return rows.value.map((row, index) => {
    const x = count === 1 ? width / 2 : padding + (index / (count - 1)) * xSpan
    const y = padding + ((bounds.value.max - row.value) / valueSpan) * ySpan
    return { ...row, x, y }
  })
})

const polylinePoints = computed(() => points.value.map((point) => `${point.x},${point.y}`).join(' '))

const latest = computed(() => rows.value[rows.value.length - 1])
const latestValueLabel = computed(() => {
  if (!latest.value) return '-'
  const formatted = latest.value.value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
  return props.unit ? `${formatted} ${props.unit}` : formatted
})
</script>

<template>
  <div class="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div>
        <div class="text-sm font-black text-slate-800">{{ metricLabel }}趨勢</div>
        <div class="mt-1 text-xs font-bold text-gray-400">{{ rows.length }} 筆紀錄</div>
      </div>
      <div class="rounded-2xl bg-primary/5 px-3 py-2 text-right">
        <div class="text-[11px] font-bold text-primary/70">最新</div>
        <div class="text-sm font-black text-primary">{{ latestValueLabel }}</div>
      </div>
    </div>

    <div v-if="rows.length === 0" class="flex h-52 items-center justify-center rounded-2xl bg-gray-50 text-sm font-bold text-gray-400">
      尚無可繪製的數據
    </div>

    <svg v-else :viewBox="`0 0 ${width} ${height}`" role="img" class="h-56 w-full overflow-visible">
      <line :x1="padding" :x2="width - padding" :y1="height - padding" :y2="height - padding" stroke="#e5e7eb" stroke-width="2" />
      <line :x1="padding" :x2="padding" :y1="padding" :y2="height - padding" stroke="#e5e7eb" stroke-width="2" />
      <line
        v-for="ratio in [0.25, 0.5, 0.75]"
        :key="ratio"
        :x1="padding"
        :x2="width - padding"
        :y1="padding + (height - padding * 2) * ratio"
        :y2="padding + (height - padding * 2) * ratio"
        stroke="#f1f5f9"
        stroke-width="1"
      />
      <polyline
        v-if="points.length > 1"
        :points="polylinePoints"
        fill="none"
        stroke="#D88F22"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <g v-for="point in points" :key="point.id">
        <circle :cx="point.x" :cy="point.y" r="7" fill="#D88F22" stroke="#ffffff" stroke-width="3" />
        <text :x="point.x" :y="point.y - 13" text-anchor="middle" class="fill-slate-700 text-[18px] font-bold">
          {{ point.value.toLocaleString('zh-TW', { maximumFractionDigits: 1 }) }}
        </text>
      </g>
      <text :x="padding" :y="height - 8" text-anchor="start" class="fill-slate-400 text-[16px] font-bold">
        {{ rows[0]?.date }}
      </text>
      <text :x="width - padding" :y="height - 8" text-anchor="end" class="fill-slate-400 text-[16px] font-bold">
        {{ rows[rows.length - 1]?.date }}
      </text>
    </svg>
  </div>
</template>
