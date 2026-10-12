<script setup lang="ts">
import { computed } from 'vue'
import { Clock, Location, Position } from '@element-plus/icons-vue'
import type { MatchRecord } from '@/types/match'
import { getMatchGatherTime, getMatchMapsUrl, isMatchCancelled } from '@/utils/matchPresentation'

const props = withDefaults(defineProps<{
  match: MatchRecord
  emphasizeGatherTime?: boolean
  showCancellationStatus?: boolean
}>(), { emphasizeGatherTime: true, showCancellationStatus: true })
const cancelled = computed(() => isMatchCancelled(props.match))
const emphasizeGathering = computed(() => props.emphasizeGatherTime && !cancelled.value)
const gatherTime = computed(() => getMatchGatherTime(props.match) || '待確認')
const mapsUrl = computed(() => getMatchMapsUrl(props.match.location))
const canNavigate = computed(() => Boolean(mapsUrl.value && !cancelled.value))
</script>

<template>
  <div class="space-y-2 md:space-y-3" data-testid="match-schedule">
    <div v-if="cancelled && showCancellationStatus" class="rounded-xl border border-red-200 bg-red-50 p-2.5 md:p-3" role="status">
      <p class="text-base font-black text-red-700">已取消・無須集合</p>
      <p class="mt-1 break-words text-sm leading-relaxed text-red-700">{{ match.cancellation_reason || '未填寫取消原因' }}</p>
    </div>
    <dl class="grid min-w-0 grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-2">
      <div
        class="min-w-0 rounded-xl border p-2.5 md:p-3"
        :class="emphasizeGathering ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-500'"
        data-testid="gather-time"
      >
        <dt class="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <el-icon aria-hidden="true"><Clock /></el-icon>
          {{ cancelled ? '原集合時間' : '集合時間' }}
        </dt>
        <dd class="break-words text-2xl font-black leading-tight">{{ gatherTime }}</dd>
      </div>
      <div class="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5 md:p-3" :class="cancelled ? 'text-slate-500' : 'text-slate-800'" data-testid="match-time">
        <dt class="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <el-icon aria-hidden="true"><Clock /></el-icon>
          {{ cancelled ? '原比賽時間' : '比賽時間' }}
        </dt>
        <dd class="break-words text-xl font-black leading-snug">{{ match.match_time?.trim() || '待確認' }}</dd>
      </div>
    </dl>
    <component
      :is="canNavigate ? 'a' : 'div'"
      :href="canNavigate ? mapsUrl : undefined"
      :target="canNavigate ? '_blank' : undefined"
      :rel="canNavigate ? 'noopener noreferrer' : undefined"
      :aria-label="canNavigate ? `導航至${match.location}` : undefined"
      class="block min-h-11 min-w-0 rounded-xl border border-slate-200 p-2.5 md:p-3"
      :class="[cancelled ? 'bg-slate-50 text-slate-500' : 'bg-white text-slate-800', canNavigate ? 'transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:bg-slate-100' : '']"
      @click.stop
    >
      <div class="flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
        <p class="flex items-center gap-1"><el-icon class="text-base" :class="cancelled ? 'text-slate-400' : 'text-primary'" aria-hidden="true"><Location /></el-icon>{{ cancelled ? '原比賽地點' : '比賽地點' }}</p>
        <span v-if="canNavigate" class="inline-flex items-center gap-1 text-sm text-slate-600">導航<el-icon aria-hidden="true"><Position /></el-icon></span>
      </div>
      <p class="mt-1 whitespace-normal break-words text-base font-black leading-relaxed" data-testid="match-location">{{ match.location?.trim() || '待確認' }}</p>
    </component>
  </div>
</template>
