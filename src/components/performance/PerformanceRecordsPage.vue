<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DataLine, Delete, Edit, Plus, Refresh, TrendCharts } from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import PerformanceRecordFormDialog from '@/components/performance/PerformanceRecordFormDialog.vue'
import ViewModeSwitch from '@/components/ViewModeSwitch.vue'
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

type ViewMode = 'grid' | 'table'

type PerformanceRecordGroup = {
  name: string
  records: PerformanceRecord[]
}

const router = useRouter()
const performanceStore = usePerformanceStore()
const permissionsStore = usePermissionsStore()

const searchKeyword = ref('')
const viewMode = ref<ViewMode>('grid')
const isFormDialogOpen = ref(false)
const editingRecord = ref<PerformanceRecord | null>(null)

const config = computed(() => getPerformanceConfig(props.kind))
const pageTitleIcon = computed(() => (
  props.kind === BASEBALL_ABILITY_FEATURE ? TrendCharts : DataLine
))
const records = computed<PerformanceRecord[]>(() => (
  props.kind === BASEBALL_ABILITY_FEATURE
    ? performanceStore.baseballAbilityRecords
    : performanceStore.physicalTestRecords
) as PerformanceRecord[])

const canCreate = computed(() => permissionsStore.can(config.value.feature, 'CREATE'))
const canEdit = computed(() => permissionsStore.can(config.value.feature, 'EDIT'))
const canDelete = computed(() => permissionsStore.can(config.value.feature, 'DELETE'))
const canSearchRecords = computed(() => canCreate.value || canEdit.value || canDelete.value)

const latestRecords = computed(() => {
  const latestByMember = new Map<string, PerformanceRecord>()

  records.value.forEach((record) => {
    const current = latestByMember.get(record.team_member_id)
    if (!current || record.test_date > current.test_date) {
      latestByMember.set(record.team_member_id, record)
    }
  })

  return [...latestByMember.values()].sort((left, right) =>
    (left.member_name || '').localeCompare(right.member_name || '', 'zh-TW')
  )
})

const filteredLatestRecords = computed(() => {
  const keyword = canSearchRecords.value ? searchKeyword.value.trim().toLowerCase() : ''
  if (!keyword) return latestRecords.value

  return latestRecords.value.filter((record) => [
    record.member_name,
    record.member_role,
    record.member_team_group,
    record.member_status,
    record.member_jersey_number,
    record.test_date
  ].filter(Boolean).join(' ').toLowerCase().includes(keyword))
})

const groupedLatestRecords = computed<PerformanceRecordGroup[]>(() => {
  const groups = new Map<string, PerformanceRecord[]>()

  filteredLatestRecords.value.forEach((record) => {
    const groupName = record.member_team_group?.trim() || '未分組'
    const groupRecords = groups.get(groupName) || []
    groupRecords.push(record)
    groups.set(groupName, groupRecords)
  })

  return [...groups.entries()]
    .sort(([leftName], [rightName]) => {
      if (leftName === '未分組') return 1
      if (rightName === '未分組') return -1
      return leftName.localeCompare(rightName, 'zh-TW')
    })
    .map(([name, groupRecords]) => ({
      name,
      records: groupRecords
    }))
})

const getGroupTitle = (group: PerformanceRecordGroup) => `${group.name}（${group.records.length}人）`

const getMemberLabel = (record: PerformanceRecord) => {
  const jersey = record.member_jersey_number ? ` #${record.member_jersey_number}` : ''
  return `${record.member_name || '未命名球員'}${jersey}`
}

const getMetricValue = (record: PerformanceRecord, metricKey = config.value.primaryMetric) => {
  const metric = config.value.metrics.find((item) => item.key === metricKey) || config.value.metrics[0]
  return metric ? formatPerformanceValue((record as any)[metric.key], metric) : '-'
}

const loadRecords = () => props.kind === BASEBALL_ABILITY_FEATURE
  ? performanceStore.loadBaseballAbilityRecords()
  : performanceStore.loadPhysicalTestRecords()

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

const openCreateDialog = () => {
  editingRecord.value = null
  isFormDialogOpen.value = true
}

const openEditDialog = (record: PerformanceRecord) => {
  editingRecord.value = record
  isFormDialogOpen.value = true
}

const openDetail = (record: PerformanceRecord) => {
  router.push(`${config.value.routeBase}/${record.team_member_id}`)
}

const handleSubmit = async (payload: PerformancePayload, meta: PerformanceSubmitMeta) => {
  const recordId = editingRecord.value?.id || meta.recordId || null

  try {
    if (props.kind === BASEBALL_ABILITY_FEATURE) {
      await performanceStore.saveBaseballAbilityRecord(payload as BaseballAbilityPayload, {
        id: recordId
      })
    } else {
      await performanceStore.savePhysicalTestRecord(payload as PhysicalTestPayload, {
        id: recordId
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
      `確定要刪除 ${getMemberLabel(record)} 在 ${record.test_date} 的紀錄嗎？`,
      `刪除${config.value.shortTitle}紀錄`,
      {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    if (props.kind === BASEBALL_ABILITY_FEATURE) {
      await performanceStore.removeBaseballAbilityRecord(record.id)
    } else {
      await performanceStore.removePhysicalTestRecord(record.id)
    }

    ElMessage.success('已刪除紀錄')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '刪除紀錄失敗')
    }
  }
}

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
            :title="config.title"
            :subtitle="config.description"
            :icon="pageTitleIcon"
            as="h2"
          >
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
                {{ config.addButtonLabel }}
              </button>
            </template>
          </AppPageHeader>
        </div>

        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-center"
          :class="canSearchRecords ? 'lg:justify-between' : 'lg:justify-end'"
        >
          <el-input
            v-if="canSearchRecords"
            v-model="searchKeyword"
            size="large"
            clearable
            class="lg:max-w-xl"
            placeholder="搜尋球員姓名、背號、組別或測驗日期"
          />
          <ViewModeSwitch v-model="viewMode" grid-label="卡片" table-label="表格" class="shrink-0" />
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <div class="max-w-7xl mx-auto">
        <AppLoadingState v-if="performanceStore.isLoading" text="數據載入中..." />

        <section v-else-if="filteredLatestRecords.length === 0" class="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <el-icon class="text-6xl text-gray-200"><DataLine /></el-icon>
          <h3 class="mt-4 text-lg font-black text-slate-800">{{ config.emptyTitle }}</h3>
          <p class="mt-2 text-sm text-gray-400">可維護者可檢視全隊資料；僅檢視與綁定使用者只會看到已綁定球員的資料。</p>
        </section>

        <div v-else class="grid gap-6">
          <section v-for="group in groupedLatestRecords" :key="group.name" class="grid gap-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-base md:text-lg font-black text-slate-800">{{ getGroupTitle(group) }}</h3>
            </div>

            <div v-if="viewMode === 'grid'" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article
                v-for="record in group.records"
                :key="record.id"
                class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="h-12 w-12 overflow-hidden rounded-2xl bg-gray-100">
                      <img v-if="record.member_avatar_url" :src="record.member_avatar_url" :alt="getMemberLabel(record)" class="h-full w-full object-cover" />
                      <div v-else class="flex h-full w-full items-center justify-center text-lg font-black text-gray-400">
                        {{ (record.member_name || '?').charAt(0) }}
                      </div>
                    </div>
                    <div class="min-w-0">
                      <h3 class="truncate text-lg font-black text-slate-800">{{ getMemberLabel(record) }}</h3>
                      <p class="mt-1 text-xs font-bold text-gray-400">{{ record.member_role || '球員' }}</p>
                    </div>
                  </div>
                  <span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">{{ record.test_date }}</span>
                </div>

                <div class="mt-5 grid grid-cols-2 gap-2">
                  <div
                    v-for="metric in config.metrics.slice(0, 4)"
                    :key="metric.key"
                    class="rounded-2xl bg-gray-50 px-3 py-3"
                  >
                    <div class="text-[11px] font-bold text-gray-400">{{ metric.label }}</div>
                    <div class="mt-1 font-black text-slate-800">{{ getMetricValue(record, metric.key) }}</div>
                  </div>
                </div>

                <div class="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
                    @click="openDetail(record)"
                  >
                    <el-icon><TrendCharts /></el-icon>
                    趨勢
                  </button>
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
              </article>
            </div>

            <section v-else class="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div class="overflow-x-auto">
                <table class="w-full min-w-[1120px] text-left">
                  <thead>
                    <tr class="border-b border-gray-100 bg-gray-50 text-sm text-gray-500">
                      <th class="px-5 py-3 font-bold">球員</th>
                      <th class="px-5 py-3 font-bold">最新測驗</th>
                      <th v-for="metric in config.metrics" :key="metric.key" class="px-5 py-3 font-bold">{{ metric.label }}</th>
                      <th class="px-5 py-3 font-bold text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="record in group.records" :key="record.id" class="hover:bg-gray-50/60">
                      <td class="px-5 py-4">
                        <div class="font-black text-slate-800">{{ getMemberLabel(record) }}</div>
                        <div class="mt-1 text-xs font-bold text-gray-400">{{ record.member_role || '球員' }}</div>
                      </td>
                      <td class="px-5 py-4 text-sm font-bold text-gray-600">{{ record.test_date }}</td>
                      <td v-for="metric in config.metrics" :key="metric.key" class="px-5 py-4 text-sm font-bold text-gray-600">
                        {{ getMetricValue(record, metric.key) }}
                      </td>
                      <td class="px-5 py-4">
                        <div class="flex justify-end gap-2">
                          <button
                            type="button"
                            class="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
                            @click="openDetail(record)"
                          >
                            <el-icon><TrendCharts /></el-icon>
                            趨勢
                          </button>
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
          </section>
        </div>
      </div>
    </div>

    <PerformanceRecordFormDialog
      v-model="isFormDialogOpen"
      :kind="kind"
      :members="performanceStore.members"
      :records="records"
      :record="editingRecord"
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
