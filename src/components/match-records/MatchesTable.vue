<script setup lang="ts">
import type { MatchRecord } from '@/types/match'
import { Delete, Operation, DocumentCopy, Bell, VideoCamera } from '@element-plus/icons-vue'
import { normalizeExternalUrl } from '@/utils/externalUrl'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  matches: MatchRecord[]
  canEdit?: boolean
  canDelete?: boolean
  canNotify?: boolean
}>()

const emit = defineEmits<{
  (e: 'view', id: string): void
  (e: 'edit', id: string): void
  (e: 'delete', id: string): void
}>()

const isFuture = (date: string) => dayjs(date).isAfter(dayjs(), 'day')

const getResultTag = (m: MatchRecord) => {
  if (isFuture(m.match_date)) return { label: '未開打', type: 'info' }
  if (m.home_score > m.opponent_score) return { label: '勝', type: 'success' }
  if (m.home_score < m.opponent_score) return { label: '敗', type: 'danger' }
  return { label: '和', type: 'warning' }
}

const copyMatchInfo = (m: MatchRecord) => {
  const videoUrl = normalizeExternalUrl(m.video_url)
  const text = `
🏆 賽事：${m.match_name}
📅 日期：${m.match_date} ${m.match_time}
📍 地點：${m.location || '未定'}
🆚 對戰：中港熊戰 vs ${m.opponent}
📋 組別：${m.category_group || '-'} / ${m.match_level || '-'}
${videoUrl ? `🎥 影片：${videoUrl}` : ''}
  `.trim()
  
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已複製賽事資訊')
  }).catch(() => {
    ElMessage.error('複製失敗，請手動複製')
  })
}

const handleNotifyLine = (m: MatchRecord) => {
  // Mock notify
  ElMessage.success(`已發送推播通知：${m.match_name}`)
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
      <el-table-column label="日期時間" width="130">
        <template #default="{ row }">
          <div class="flex flex-col justify-center">
            <span class="font-bold text-gray-800 text-sm">{{ dayjs(row.match_date).format('YYYY/MM/DD') }}</span>
            <span class="text-xs text-gray-400 font-medium">{{ row.match_time }}</span>
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
          <div v-if="!isFuture(row.match_date)" class="flex flex-col items-center">
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
          <div class="flex items-center justify-end space-x-1" @click.stop>
             <el-tooltip v-if="props.canNotify !== false" content="發送推播通知" placement="top">
               <el-button @click.stop="handleNotifyLine(row)" circle size="small" class="!border-none hover:!bg-blue-50 hover:!text-blue-500 text-gray-400">
                 <el-icon><Bell /></el-icon>
               </el-button>
             </el-tooltip>
             <el-tooltip content="複製賽程" placement="top">
               <el-button @click.stop="copyMatchInfo(row)" circle size="small" class="!border-none hover:!bg-green-50 hover:!text-green-600 text-gray-400">
                 <el-icon><DocumentCopy /></el-icon>
               </el-button>
             </el-tooltip>
             <el-tooltip v-if="normalizeExternalUrl(row.video_url)" content="觀看影片" placement="top">
               <el-button @click.stop="openVideo(row.video_url)" circle size="small" class="!border-none hover:!bg-sky-50 hover:!text-sky-600 text-gray-400">
                 <el-icon><VideoCamera /></el-icon>
               </el-button>
             </el-tooltip>
             <el-tooltip v-if="props.canEdit !== false" content="編輯" placement="top">
               <el-button @click.stop="emit('edit', row.id)" circle size="small" class="!border-none hover:!bg-orange-50 hover:!text-orange-500 text-gray-400">
                 <el-icon><Operation /></el-icon>
               </el-button>
             </el-tooltip>
             <el-tooltip v-if="props.canDelete !== false" content="刪除" placement="top">
               <el-button @click.stop="emit('delete', row.id)" circle size="small" class="!border-none hover:!bg-red-50 hover:!text-red-500 text-gray-400">
                 <el-icon><Delete /></el-icon>
               </el-button>
             </el-tooltip>
          </div>
        </template>
      </el-table-column>

      <!-- Empty State handling handled by wrapper in view -->
    </el-table>
  </div>
</template>
