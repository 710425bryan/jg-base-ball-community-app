<script setup lang="ts">
import type { MatchRecord } from '@/types/match'
import AppActionOverflow from '@/components/common/AppActionOverflow.vue'
import { getMatchGatherTime, isMatchCancelled } from '@/utils/matchPresentation'
import { normalizeExternalUrl } from '@/utils/externalUrl'
import { formatMatchRecordForGoogleCalendar } from '@/utils/matchCalendarCopy'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  matches: MatchRecord[]
  canEdit?: boolean
  canDelete?: boolean
  canNotify?: boolean
  notifyingMatchId?: string | null
}>()

const emit = defineEmits<{
  (e: 'view', id: string): void
  (e: 'edit', id: string): void
  (e: 'delete', id: string): void
  (e: 'notify', id: string): void
  (e: 'cancel', id: string): void
  (e: 'restore', id: string): void
}>()

const isFuture = (date: string) => dayjs(date).isAfter(dayjs(), 'day')

const getResultTag = (m: MatchRecord) => {
  if (isMatchCancelled(m)) return { label: '已取消', type: 'danger' }
  if (isFuture(m.match_date)) return { label: '未開打', type: 'info' }
  if (m.home_score > m.opponent_score) return { label: '勝', type: 'success' }
  if (m.home_score < m.opponent_score) return { label: '敗', type: 'danger' }
  return { label: '和', type: 'warning' }
}

const copyMatchInfo = (m: MatchRecord) => {
  const text = formatMatchRecordForGoogleCalendar(m)
  
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已複製 Google 行事曆格式')
  }).catch(() => {
    ElMessage.error('複製失敗，請手動複製')
  })
}

const openVideo = (url?: string | null) => {
  const videoUrl = normalizeExternalUrl(url)
  if (!videoUrl) return
  window.open(videoUrl, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
    <el-table 
      :data="matches" 
      class="w-full" 
      row-class-name="group cursor-pointer transition-colors"
      @row-click="(row: any) => emit('view', row.id)"
      :header-cell-style="{ fontSize: '12px', fontWeight: 'bold' }"
    >
      <!-- Date -->
      <el-table-column label="日期時間" width="190">
        <template #default="{ row }">
          <div class="flex flex-col justify-center">
            <span class="font-bold text-gray-800 text-sm">{{ dayjs(row.match_date).format('YYYY/MM/DD') }}</span>
            <span class="font-bold text-slate-700">比賽 {{ row.match_time || '待確認' }}</span>
            <span class="font-bold" :class="isMatchCancelled(row) ? 'text-slate-500' : 'text-amber-700'">集合 {{ getMatchGatherTime(row) || '待確認' }}</span>
          </div>
        </template>
      </el-table-column>

      <!-- Match Name -->
      <el-table-column label="賽事名稱" min-width="180">
        <template #default="{ row }">
          <div class="flex flex-col">
            <span class="font-extrabold text-gray-800">{{ row.match_name }}</span>
            <div class="flex items-center gap-1.5 mt-1">
              <span v-if="row.category_group" class="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold">{{ row.category_group }}</span>
              <span v-if="row.match_level" class="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded font-bold">{{ row.match_level }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="比賽地點" min-width="180">
        <template #default="{ row }"><span class="whitespace-normal break-words font-bold text-slate-800">{{ row.location || '待確認' }}</span></template>
      </el-table-column>
      <!-- Versus -->
      <el-table-column label="對戰組合" min-width="220">
        <template #default="{ row }">
          <div class="flex items-center space-x-3 bg-gray-50/80 px-3 py-2 rounded-lg border border-gray-100/50 w-fit">
            <span class="font-bold text-sm text-gray-800">中港</span>
            <span class="text-[10px] font-black italic text-gray-300 px-1">VS</span>
            <span class="font-bold text-sm text-gray-800 truncate max-w-[100px]" :title="row.opponent">{{ row.opponent }}</span>
          </div>
        </template>
      </el-table-column>

      <!-- Score & Result -->
      <el-table-column label="比分結果" width="120" align="center">
        <template #default="{ row }">
          <div v-if="isMatchCancelled(row)" class="text-center"><el-tag type="danger">已取消</el-tag><p class="mt-1 text-sm">無須集合</p></div>
          <div v-else-if="!isFuture(row.match_date)" class="flex flex-col items-center">
            <span class="font-black text-base tracking-widest text-gray-900 line-through-none">
              <span :class="{'text-primary': row.home_score > row.opponent_score}">{{ row.home_score }}</span> 
              <span class="text-gray-300 mx-0.5">-</span> 
              <span :class="{'text-red-500': row.opponent_score > row.home_score}">{{ row.opponent_score }}</span>
            </span>
            <el-tag :type="getResultTag(row).type" size="small" class="mt-1 !border-none !font-bold" effect="dark">{{ getResultTag(row).label }}</el-tag>
          </div>
          <el-tag v-else type="info" effect="plain" class="!font-bold">尚未開打</el-tag>
        </template>
      </el-table-column>

      <!-- Actions -->
      <el-table-column label="操作" width="180" align="right" fixed="right">
        <template #default="{ row }">
          <div class="flex items-center justify-end gap-2" @click.stop>
            <el-button class="!min-h-11 !rounded-xl" @click="emit('view', row.id)">詳情</el-button>
            <AppActionOverflow :aria-label="`${row.match_name} 更多操作`">
              <el-dropdown-item v-if="props.canEdit !== false && !isMatchCancelled(row)" @click="emit('edit', row.id)">編輯賽事</el-dropdown-item>
              <el-dropdown-item v-if="props.canNotify && !isMatchCancelled(row)" :disabled="Boolean(props.notifyingMatchId)" @click="emit('notify', row.id)">發送通知</el-dropdown-item>
              <el-dropdown-item @click="copyMatchInfo(row)">複製賽事資訊</el-dropdown-item>
              <el-dropdown-item v-if="normalizeExternalUrl(row.video_url)" @click="openVideo(row.video_url)">觀看影片</el-dropdown-item>
              <el-dropdown-item v-if="props.canEdit === true && !isMatchCancelled(row) && row.match_level !== '特訓課'" divided class="!text-red-600" @click="emit('cancel', row.id)">取消比賽</el-dropdown-item>
              <el-dropdown-item v-if="props.canEdit === true && isMatchCancelled(row) && row.match_level !== '特訓課'" divided class="!min-h-11 !text-primary" @click="emit('restore', row.id)">恢復比賽</el-dropdown-item>
              <el-dropdown-item v-if="props.canDelete !== false" class="!text-red-600" @click="emit('delete', row.id)">刪除賽事</el-dropdown-item>
            </AppActionOverflow>
          </div>
        </template>
      </el-table-column>

      <!-- Empty State handling handled by wrapper in view -->
    </el-table>
  </div>
</template>
