<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Delete, Edit, Plus, Refresh, TrendCharts } from '@element-plus/icons-vue'
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

const latestRecord = computed(() => records.value[0] || null)

const loadRecords = () => props.kind === BASEBALL_ABILITY_FEATURE
  ? performanceStore.loadBaseballAbilityRecords(memberId.value)
  : performanceStore.loadPhysicalTestRecords(memberId.value)

const refresh = async () => {
  try {
    await Promise.all([
      performanceStore.loadMembers(),
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
          <div class="min-w-0">
            <button
              type="button"
              class="mb-3 inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors"
              @click="router.push(config.routeBase)"
            >
              <el-icon><ArrowLeft /></el-icon>
              返回{{ config.shortTitle }}
            </button>
            <h2 class="text-xl md:text-2xl font-black text-slate-800 leading-tight flex items-center gap-2">
              <el-icon class="text-primary"><TrendCharts /></el-icon>
              {{ member?.name || '球員' }}｜{{ config.title }}
            </h2>
            <p class="text-xs md:text-sm font-bold text-gray-500 mt-1">
              {{ member?.role || '球員' }}
              <span v-if="member?.team_group">｜{{ member.team_group }}</span>
              <span v-if="member?.jersey_number">｜#{{ member.jersey_number }}</span>
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
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
          </div>
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
        <div v-if="performanceStore.isLoading" class="min-h-[45vh] flex items-center justify-center">
          <div class="text-sm font-bold text-gray-400">數據載入中...</div>
        </div>

        <template v-else>
          <section v-if="records.length === 0" class="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <el-icon class="text-6xl text-gray-200"><TrendCharts /></el-icon>
            <h3 class="mt-4 text-lg font-black text-slate-800">尚無紀錄</h3>
            <p class="mt-2 text-sm text-gray-400">有權限的角色可為這位球員新增第一筆測驗資料。</p>
          </section>

          <template v-else>
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
