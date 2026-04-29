<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Delete, Edit, Plus, Refresh, TrendCharts } from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import PerformanceRecordFormDialog from '@/components/performance/PerformanceRecordFormDialog.vue'
import PerformanceTrendChart from '@/components/performance/PerformanceTrendChart.vue'
import { usePerformanceStore } from '@/stores/performance'
import { usePermissionsStore } from '@/stores/permissions'
import {
  BASEBALL_ABILITY_FEATURE,
  type BaseballAbilityPayload,
  type PerformancePayload,
  type PerformanceRecord,
  type PerformanceRecordKind,
  type PerformanceMetricDefinition,
  type PerformanceSubmitMeta,
  type PhysicalTestPayload
} from '@/types/performance'
import { formatPerformanceValue, getPerformanceConfig } from '@/utils/performanceConfig'

const props = defineProps<{
  kind: PerformanceRecordKind
}>()

const route = useRoute()
const router = useRouter()
const performanceStore = usePerformanceStore()
const permissionsStore = usePermissionsStore()

const isFormDialogOpen = ref(false)
const editingRecord = ref<PerformanceRecord | null>(null)
const selectedMetricKey = ref('')

const config = computed(() => getPerformanceConfig(props.kind))
const memberId = computed(() => String(route.params.memberId || ''))
const records = computed<PerformanceRecord[]>(() => (
  props.kind === BASEBALL_ABILITY_FEATURE
    ? performanceStore.baseballAbilityRecords
    : performanceStore.physicalTestRecords
) as PerformanceRecord[])

const selectedMetric = computed(() =>
  config.value.metrics.find((metric) => metric.key === selectedMetricKey.value) || config.value.metrics[0]
)

const member = computed(() => {
  const option = performanceStore.members.find((item) => item.id === memberId.value)
  if (option) return option

  const record = records.value[0]
  if (!record) return null

  return {
    id: record.team_member_id,
    name: record.member_name || '未命名球員',
    role: record.member_role,
    team_group: record.member_team_group,
    status: record.member_status,
    jersey_number: record.member_jersey_number,
    avatar_url: record.member_avatar_url
  }
})

const canCreate = computed(() => permissionsStore.can(config.value.feature, 'CREATE'))
const canEdit = computed(() => permissionsStore.can(config.value.feature, 'EDIT'))
const canDelete = computed(() => permissionsStore.can(config.value.feature, 'DELETE'))

type MetricDirection = 'higher' | 'lower' | 'neutral'

const metricDirectionByKey: Record<string, MetricDirection> = {
  pitch_speed: 'higher',
  exit_velocity: 'higher',
  home_to_first: 'lower',
  home_to_home: 'lower',
  catch_count: 'higher',
  relay_throw_count: 'higher',
  base_run_180s_laps: 'higher',
  height: 'neutral',
  weight: 'neutral',
  bmi: 'neutral',
  arm_span: 'neutral',
  shuttle_run: 'lower',
  sit_and_reach: 'higher',
  sit_ups: 'higher',
  standing_long_jump: 'higher',
  vertical_jump: 'higher'
}

const sortedRecords = computed(() => [...records.value].sort((left, right) =>
  right.test_date.localeCompare(left.test_date) || right.created_at.localeCompare(left.created_at)
))
const latestRecord = computed(() => sortedRecords.value[0] || null)
const previousRecord = computed(() => {
  if (!latestRecord.value) return null
  return sortedRecords.value.find((record) => record.id !== latestRecord.value?.id) || null
})

const getMetricNumber = (record: PerformanceRecord | null, metricKey: string) => {
  if (!record) return null

  const numericValue = Number((record as any)[metricKey])
  return Number.isFinite(numericValue) ? numericValue : null
}

const getMetricDirection = (metricKey: string): MetricDirection => metricDirectionByKey[metricKey] || 'higher'

const buildMetricTrend = (metric: PerformanceMetricDefinition) => {
  const latestValue = getMetricNumber(latestRecord.value, metric.key)
  const previousValue = getMetricNumber(previousRecord.value, metric.key)
  const formattedLatest = latestRecord.value ? getMetricValue(latestRecord.value, metric.key) : '-'

  if (latestValue === null || previousValue === null) {
    return {
      key: metric.key,
      label: metric.label,
      latest: formattedLatest,
      changeText: '待累積第二筆',
      tone: 'neutral' as const,
      hasPrevious: false
    }
  }

  const delta = latestValue - previousValue
  const direction = getMetricDirection(metric.key)
  const absDelta = formatPerformanceValue(Math.abs(delta), metric)
  const isSame = Math.abs(delta) < 0.0001
  const isImproved = direction === 'higher'
    ? delta > 0
    : direction === 'lower'
      ? delta < 0
      : false

  return {
    key: metric.key,
    label: metric.label,
    latest: formattedLatest,
    changeText: isSame
      ? '和上次持平'
      : direction === 'neutral'
        ? `變化 ${delta > 0 ? '+' : '-'}${absDelta}`
        : `${isImproved ? '進步' : '需留意'} ${absDelta}`,
    tone: isSame || direction === 'neutral' ? 'neutral' as const : isImproved ? 'positive' as const : 'negative' as const,
    hasPrevious: true
  }
}

const progressMetricSummary = computed(() => {
  const trends = config.value.metrics.map(buildMetricTrend)
  return trends.find((trend) => trend.hasPrevious && trend.tone !== 'neutral') || trends[0] || null
})

const coachNoteSummary = computed(() => {
  const recordValue = latestRecord.value as any
  return recordValue?.coach_note || recordValue?.coach_notes || recordValue?.notes || recordValue?.remark || recordValue?.remarks || '尚未留下教練備註'
})

const practiceSuggestion = computed(() => {
  const trend = progressMetricSummary.value
  if (!latestRecord.value || !trend) return '累積測驗紀錄後，這裡會整理適合的練習方向。'
  if (!trend.hasPrevious) return '再累積一次測驗後，就能看出進步方向與需要加強的項目。'
  if (trend.tone === 'positive') return `${trend.label} 有進步，建議維持固定練習節奏，並讓教練確認下一個目標。`
  if (trend.tone === 'negative') return `${trend.label} 較前一次需要留意，建議近期練習先放慢節奏、確認動作穩定度。`
  return '整體變化穩定，建議維持每週基礎訓練與規律追蹤。'
})

const parentSummaryCards = computed(() => [
  {
    label: '最近一次',
    value: latestRecord.value?.test_date || '-',
    helper: latestRecord.value ? `${config.value.primaryMetricLabel}: ${getMetricValue(latestRecord.value, config.value.primaryMetric)}` : '尚無測驗資料',
    tone: 'primary'
  },
  {
    label: '進步幅度',
    value: progressMetricSummary.value?.changeText || '待累積',
    helper: progressMetricSummary.value?.label || '尚無可比較項目',
    tone: progressMetricSummary.value?.tone || 'neutral'
  },
  {
    label: '教練備註',
    value: coachNoteSummary.value,
    helper: '完整紀錄仍由教練維護',
    tone: 'neutral'
  },
  {
    label: '建議方向',
    value: practiceSuggestion.value,
    helper: '供家長快速掌握，不取代教練現場判斷',
    tone: 'warm'
  }
])

const loadRecords = () => props.kind === BASEBALL_ABILITY_FEATURE
  ? performanceStore.loadBaseballAbilityRecords(memberId.value)
  : performanceStore.loadPhysicalTestRecords(memberId.value)

const refresh = async () => {
  try {
    await Promise.all([
      performanceStore.loadMembers(config.value.feature),
      loadRecords()
    ])
  } catch (error: any) {
    ElMessage.error(error?.message || `無法載入${config.value.title}`)
  }
}

const getMetricValue = (record: PerformanceRecord, metricKey: string) => {
  const metric = config.value.metrics.find((item) => item.key === metricKey)
  return metric ? formatPerformanceValue((record as any)[metric.key], metric) : '-'
}

const openCreateDialog = () => {
  editingRecord.value = null
  isFormDialogOpen.value = true
}

const openEditDialog = (record: PerformanceRecord) => {
  editingRecord.value = record
  isFormDialogOpen.value = true
}

const handleSubmit = async (payload: PerformancePayload, meta: PerformanceSubmitMeta) => {
  const recordId = editingRecord.value?.id || meta.recordId || null

  try {
    if (props.kind === BASEBALL_ABILITY_FEATURE) {
      await performanceStore.saveBaseballAbilityRecord(payload as BaseballAbilityPayload, {
        id: recordId,
        reloadMemberId: memberId.value
      })
    } else {
      await performanceStore.savePhysicalTestRecord(payload as PhysicalTestPayload, {
        id: recordId,
        reloadMemberId: memberId.value
      })
    }

    ElMessage.success(recordId ? '已更新紀錄' : '已新增紀錄')
    isFormDialogOpen.value = false
    editingRecord.value = null
  } catch (error: any) {
    ElMessage.error(error?.message || '儲存紀錄失敗')
  }
}

const removeRecord = async (record: PerformanceRecord) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除 ${record.test_date} 的紀錄嗎？`,
      `刪除${config.value.shortTitle}紀錄`,
      {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    if (props.kind === BASEBALL_ABILITY_FEATURE) {
      await performanceStore.removeBaseballAbilityRecord(record.id, memberId.value)
    } else {
      await performanceStore.removePhysicalTestRecord(record.id, memberId.value)
    }

    ElMessage.success('已刪除紀錄')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '刪除紀錄失敗')
    }
  }
}

watch(
  () => props.kind,
  () => {
    selectedMetricKey.value = config.value.primaryMetric
  },
  { immediate: true }
)

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0 z-10">
      <div class="max-w-7xl mx-auto flex flex-col gap-4">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <AppPageHeader
            :title="`${member?.name || '球員'}｜${config.title}`"
            :icon="TrendCharts"
            as="h2"
          >
            <template #before>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors"
                @click="router.push(config.routeBase)"
              >
                <el-icon><ArrowLeft /></el-icon>
                返回{{ config.shortTitle }}
              </button>
            </template>

            <template #subtitle>
              {{ member?.role || '球員' }}
              <span v-if="member?.team_group">｜{{ member.team_group }}</span>
              <span v-if="member?.jersey_number">｜#{{ member.jersey_number }}</span>
            </template>

            <template #actions>
              <button
                type="button"
                class="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors disabled:opacity-70"
                :disabled="performanceStore.isLoading"
                @click="refresh"
              >
                <el-icon :class="{ 'is-loading': performanceStore.isLoading }"><Refresh /></el-icon>
                重新整理
              </button>
              <button
                v-if="canCreate"
                type="button"
                class="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
                @click="openCreateDialog"
              >
                <el-icon><Plus /></el-icon>
                新增紀錄
              </button>
            </template>
          </AppPageHeader>
        </div>

        <div class="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <section class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
            <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/70">紀錄</p>
            <p class="mt-2 text-2xl font-black text-primary">{{ records.length }}</p>
          </section>
          <section class="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
            <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">最新日期</p>
            <p class="mt-2 text-2xl font-black text-sky-800">{{ latestRecord?.test_date || '-' }}</p>
          </section>
          <section
            v-for="metric in config.metrics.slice(0, 2)"
            :key="metric.key"
            class="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3"
          >
            <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">最新{{ metric.label }}</p>
            <p class="mt-2 text-2xl font-black text-emerald-700">{{ latestRecord ? getMetricValue(latestRecord, metric.key) : '-' }}</p>
          </section>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <div class="max-w-7xl mx-auto grid gap-4">
        <AppLoadingState v-if="performanceStore.isLoading" text="數據載入中..." />

        <template v-else>
          <section v-if="records.length === 0" class="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <el-icon class="text-6xl text-gray-200"><TrendCharts /></el-icon>
            <h3 class="mt-4 text-lg font-black text-slate-800">尚無紀錄</h3>
            <p class="mt-2 text-sm text-gray-400">可維護者可為這位球員新增第一筆測驗資料；僅檢視使用者只會看到已綁定球員的資料。</p>
          </section>

          <template v-else>
            <section class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div class="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 class="text-lg font-black text-slate-800">家長摘要</h3>
                  <p class="mt-1 text-sm font-bold text-gray-400">最近表現、進步幅度與練習方向先整理在這裡。</p>
                </div>
                <span class="text-xs font-black text-primary">{{ config.shortTitle }}</span>
              </div>
              <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div
                  v-for="card in parentSummaryCards"
                  :key="card.label"
                  class="rounded-2xl border px-4 py-3"
                  :class="{
                    'border-primary/15 bg-primary/5': card.tone === 'primary',
                    'border-emerald-100 bg-emerald-50': card.tone === 'positive',
                    'border-amber-100 bg-amber-50': card.tone === 'negative' || card.tone === 'warm',
                    'border-gray-100 bg-gray-50': card.tone === 'neutral'
                  }"
                >
                  <div class="text-[11px] font-black tracking-[0.16em] text-gray-400">{{ card.label }}</div>
                  <div class="mt-2 min-h-[3rem] text-base font-black leading-6 text-slate-800">{{ card.value }}</div>
                  <div class="mt-2 text-xs font-bold leading-5 text-gray-500">{{ card.helper }}</div>
                </div>
              </div>
            </section>

            <section class="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
              <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 class="text-lg font-black text-slate-800">趨勢檢視</h3>
                  <p class="mt-1 text-sm font-bold text-gray-400">選擇指標查看歷次測驗變化。</p>
                </div>
                <el-select v-model="selectedMetricKey" size="large" class="w-full md:w-64">
                  <el-option
                    v-for="metric in config.metrics"
                    :key="metric.key"
                    :label="metric.label"
                    :value="metric.key"
                  />
                </el-select>
              </div>

              <PerformanceTrendChart
                v-if="selectedMetric"
                :records="records"
                :metric-key="selectedMetric.key"
                :metric-label="selectedMetric.label"
                :unit="selectedMetric.unit"
              />
            </section>

            <section class="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div class="border-b border-gray-100 px-5 py-4">
                <h3 class="text-lg font-black text-slate-800">歷史紀錄</h3>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full min-w-[920px] text-left">
                  <thead>
                    <tr class="border-b border-gray-100 bg-gray-50 text-sm text-gray-500">
                      <th class="px-5 py-3 font-bold">測驗日期</th>
                      <th v-for="metric in config.metrics" :key="metric.key" class="px-5 py-3 font-bold">{{ metric.label }}</th>
                      <th class="px-5 py-3 font-bold text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="record in records" :key="record.id" class="hover:bg-gray-50/60">
                      <td class="px-5 py-4 font-black text-slate-800">{{ record.test_date }}</td>
                      <td v-for="metric in config.metrics" :key="metric.key" class="px-5 py-4 text-sm font-bold text-gray-600">
                        {{ getMetricValue(record, metric.key) }}
                      </td>
                      <td class="px-5 py-4">
                        <div class="flex justify-end gap-2">
                          <button
                            v-if="canEdit"
                            type="button"
                            class="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors"
                            @click="openEditDialog(record)"
                          >
                            <el-icon><Edit /></el-icon>
                            編輯
                          </button>
                          <button
                            v-if="canDelete"
                            type="button"
                            class="inline-flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-100 transition-colors"
                            @click="removeRecord(record)"
                          >
                            <el-icon><Delete /></el-icon>
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </template>
        </template>
      </div>
    </div>

    <PerformanceRecordFormDialog
      v-model="isFormDialogOpen"
      :kind="kind"
      :members="performanceStore.members"
      :records="records"
      :record="editingRecord"
      :initial-member-id="memberId"
      :is-saving="performanceStore.isSaving"
      @submit="handleSubmit"
    />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  height: 4px;
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}
</style>
