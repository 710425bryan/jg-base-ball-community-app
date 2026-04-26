<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DataLine, UserFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { supabase } from '@/services/supabase'
import type { MatchRecord } from '@/types/match'
import { calculateMatchAttendanceStats, type MatchRosterMeta } from '@/utils/matchRecordStats'

const props = defineProps<{
  matches: MatchRecord[]
}>()

const roster = ref<MatchRosterMeta[]>([])
const loadingRoster = ref(false)

const attendanceRows = computed(() => calculateMatchAttendanceStats(props.matches, roster.value))
const totalCalledUp = computed(() => attendanceRows.value.reduce((sum, row) => sum + row.calledUp, 0))
const totalAttended = computed(() => attendanceRows.value.reduce((sum, row) => sum + row.attended, 0))
const totalAbsent = computed(() => attendanceRows.value.reduce((sum, row) => sum + row.absentTotal, 0))
const overallAttendanceRate = computed(() =>
  totalCalledUp.value > 0 ? Math.round((totalAttended.value / totalCalledUp.value) * 1000) / 10 : 0
)

const getRateClass = (rate: number) => {
  if (rate >= 80) return 'text-green-600'
  if (rate >= 60) return 'text-orange-500'
  return 'text-red-500'
}

const getRateBarClass = (rate: number) => {
  if (rate >= 80) return 'bg-green-500'
  if (rate >= 60) return 'bg-orange-400'
  return 'bg-red-500'
}

const fetchRoster = async () => {
  loadingRoster.value = true
  try {
    const { data, error } = await supabase
      .from('team_members_safe')
      .select('name, role, team_group, status, jersey_number')
      .order('role')
      .order('name')

    if (error) throw error

    roster.value = (data || [])
      .filter((member: any) => member.status !== '退隊')
      .map((member: any) => ({
        name: member.name || '',
        role: member.role || '',
        team_group: member.team_group || '',
        status: member.status || '',
        jersey_number: member.jersey_number || ''
      }))
  } catch (error: any) {
    ElMessage.error(`讀取球員名單失敗：${error?.message || '請稍後再試'}`)
  } finally {
    loadingRoster.value = false
  }
}

onMounted(() => {
  fetchRoster()
})
</script>

<template>
  <section class="space-y-5">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div class="text-xs font-black tracking-widest text-slate-400">MATCHES</div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-3xl font-black text-slate-900">{{ matches.length }}</span>
          <span class="text-sm font-bold text-slate-400">場</span>
        </div>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div class="text-xs font-black tracking-widest text-slate-400">CALLED UP</div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-3xl font-black text-blue-700">{{ totalCalledUp }}</span>
          <span class="text-sm font-bold text-slate-400">人次</span>
        </div>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div class="text-xs font-black tracking-widest text-slate-400">ATTENDED</div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-3xl font-black text-green-700">{{ totalAttended }}</span>
          <span class="text-sm font-bold text-slate-400">人次</span>
        </div>
      </div>
      <div class="rounded-lg border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <div class="text-xs font-black tracking-widest text-slate-300">RATE</div>
        <div class="mt-2 flex items-baseline gap-1">
          <span class="text-3xl font-black text-primary">{{ overallAttendanceRate.toFixed(1) }}</span>
          <span class="text-base font-black text-primary">%</span>
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <el-icon class="text-xl"><DataLine /></el-icon>
          </div>
          <div>
            <h2 class="text-base font-black text-slate-900">賽事出席率</h2>
            <p class="mt-0.5 text-xs font-semibold text-slate-500">依目前篩選後的已賽比賽名單統計，總請假 {{ totalAbsent }} 人次</p>
          </div>
        </div>
        <div class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
          球員 {{ attendanceRows.length }} 人
        </div>
      </div>

      <div v-if="attendanceRows.length === 0 && !loadingRoster" class="flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <el-icon class="mb-3 text-5xl text-slate-300"><UserFilled /></el-icon>
        <h3 class="text-base font-black text-slate-700">尚無出席統計資料</h3>
        <p class="mt-2 max-w-md text-sm font-medium text-slate-500">目前篩選範圍內沒有已填寫出賽名單或請假名單的賽事。</p>
      </div>

      <el-table
        v-else
        v-loading="loadingRoster"
        :data="attendanceRows"
        stripe
        border
        style="width: 100%"
        empty-text="無出席資料"
        :default-sort="{ prop: 'attendanceRate', order: 'descending' }"
      >
        <el-table-column prop="name" label="球員姓名" min-width="130" fixed sortable>
          <template #default="{ row }">
            <div class="flex flex-col gap-1">
              <span class="font-black text-slate-800">{{ row.name }}</span>
              <span v-if="row.category" class="w-fit rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500">{{ row.category }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="number" label="背號" width="80" align="center" sortable>
          <template #default="{ row }">
            <span class="font-mono font-bold text-slate-500">{{ row.number || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="calledUp" label="應出席" width="100" align="center" sortable />
        <el-table-column prop="attended" label="實出席" width="100" align="center" sortable />
        <el-table-column prop="absentTotal" label="總請假" width="100" align="center" sortable />
        <el-table-column label="請假紀錄" align="center">
          <el-table-column prop="absentLevel1" label="一級" width="80" align="center" sortable />
          <el-table-column prop="absentLevel2" label="二級" width="80" align="center" sortable />
          <el-table-column prop="absentLevel3" label="三級" width="80" align="center" sortable />
          <el-table-column prop="absentOther" label="其他" width="80" align="center" sortable />
        </el-table-column>
        <el-table-column prop="attendanceRate" label="出席率" width="160" align="center" sortable>
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <span class="w-14 text-right font-mono text-sm font-black" :class="getRateClass(row.attendanceRate)">
                {{ row.attendanceRate.toFixed(1) }}%
              </span>
              <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  class="h-full rounded-full transition-all"
                  :class="getRateBarClass(row.attendanceRate)"
                  :style="{ width: `${Math.min(row.attendanceRate, 100)}%` }"
                ></div>
              </div>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>
