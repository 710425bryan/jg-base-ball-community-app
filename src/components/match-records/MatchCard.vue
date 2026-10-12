<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight, Bell, Calendar, CircleClose, Delete, DocumentCopy, MoreFilled, Operation, Picture, RefreshLeft, Trophy, VideoCamera } from '@element-plus/icons-vue'
import { ElImageViewer, ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import type { MatchRecord } from '@/types/match'
import { normalizeExternalUrl } from '@/utils/externalUrl'
import { formatMatchRecordForGoogleCalendar } from '@/utils/matchCalendarCopy'
import { DEFAULT_MATCH_COVER, isMatchCancelled } from '@/utils/matchPresentation'
import MatchScheduleInfo from './MatchScheduleInfo.vue'

const props = withDefaults(defineProps<{
  match: MatchRecord
  canEdit?: boolean
  canDelete?: boolean
  canNotify?: boolean
  notifyingMatchId?: string | null
}>(), { canEdit: true, canDelete: true, canNotify: false, notifyingMatchId: null })

const emit = defineEmits<{
  (e: 'view' | 'edit' | 'delete' | 'notify' | 'cancel' | 'restore', id: string): void
}>()

const failedCover = ref(false)
const previewVisible = ref(false)
const photoUrl = computed(() => normalizeExternalUrl(props.match.photo_url))
const coverUrl = computed(() => !failedCover.value && photoUrl.value ? photoUrl.value : DEFAULT_MATCH_COVER)
const hasPhoto = computed(() => Boolean(photoUrl.value && !failedCover.value))
const cancelled = computed(() => isMatchCancelled(props.match))
const future = computed(() => Boolean(props.match.match_date && dayjs(props.match.match_date).isAfter(dayjs(), 'day')))
const historical = computed(() => Boolean(props.match.match_date && dayjs(props.match.match_date).isBefore(dayjs(), 'day')))
const canCancel = computed(() => props.canEdit && !cancelled.value && props.match.match_level !== '特訓課')
const canRestore = computed(() => props.canEdit && cancelled.value && props.match.match_level !== '特訓課')
const videoUrl = computed(() => normalizeExternalUrl(props.match.video_url))
const dateLabel = computed(() => {
  if (!props.match.match_date) return '日期待確認'
  const date = dayjs(props.match.match_date)
  if (!date.isValid()) return '日期待確認'
  return `${date.format('YYYY/MM/DD')}（${'日一二三四五六'[date.day()]}）`
})
const result = computed(() => {
  if (cancelled.value) return { label: '已取消', class: 'bg-red-50 text-red-700 border-red-200' }
  if (future.value) return { label: '未賽', class: 'bg-slate-50 text-slate-600 border-slate-200' }
  if (props.match.home_score > props.match.opponent_score) return { label: '勝利', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (props.match.home_score < props.match.opponent_score) return { label: '敗場', class: 'bg-red-50 text-red-700 border-red-200' }
  return { label: '平手', class: 'bg-amber-50 text-amber-800 border-amber-200' }
})

watch(photoUrl, () => { failedCover.value = false; previewVisible.value = false })

const handleCoverError = () => {
  failedCover.value = true
  previewVisible.value = false
}

const handleCommand = async (command: string) => {
  if (command === 'video' && videoUrl.value) {
    window.open(videoUrl.value, '_blank', 'noopener,noreferrer')
    return
  }
  if (command === 'copy') {
    try {
      const text = formatMatchRecordForGoogleCalendar(props.match)
      await navigator.clipboard.writeText(text)
      ElMessage.success('已複製 Google 行事曆格式')
    } catch {
      ElMessage.error('複製失敗，請手動複製')
    }
    return
  }
  if (command === 'edit' && props.canEdit && !cancelled.value) emit('edit', props.match.id)
  if (command === 'delete' && props.canDelete) emit('delete', props.match.id)
  if (command === 'notify' && props.canNotify && !cancelled.value && !props.notifyingMatchId) emit('notify', props.match.id)
  if (command === 'cancel' && canCancel.value) emit('cancel', props.match.id)
  if (command === 'restore' && canRestore.value) emit('restore', props.match.id)
}
</script>

<template>
  <article
    class="flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md"
    :class="cancelled ? 'border-slate-300' : 'border-slate-200'"
    :aria-label="match.match_name"
    @click="emit('view', match.id)"
  >
    <div class="relative h-20 shrink-0 bg-slate-900 md:h-32">
      <img
        :src="coverUrl"
        :alt="hasPhoto ? `${match.match_name}賽事照片` : '中港熊戰社區棒球隊Logo預設封面'"
        class="h-full w-full"
        :class="[hasPhoto ? 'object-cover' : 'object-contain', cancelled ? 'opacity-60 saturate-0' : '']"
        loading="lazy"
        decoding="async"
        data-testid="match-cover"
        @error="handleCoverError"
      >
      <button
        v-if="hasPhoto"
        type="button"
        class="absolute bottom-2 right-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:bg-slate-100"
        :aria-label="`預覽${match.match_name}照片`"
        @click.stop="previewVisible = true"
      >
        <el-icon aria-hidden="true"><Picture /></el-icon>
        預覽照片
      </button>
    </div>

    <div class="flex flex-1 flex-col gap-2 px-3 py-2.5 md:gap-3 md:p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 text-base font-black" :class="cancelled ? 'text-slate-500' : 'text-slate-800'" data-testid="match-date">
          <el-icon class="text-primary" aria-hidden="true"><Calendar /></el-icon>
          <span>{{ dateLabel }}</span>
        </div>
        <span class="shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold" :class="result.class" data-testid="match-result">{{ result.label }}</span>
      </div>

      <div class="space-y-1.5 md:space-y-2">
        <p v-if="match.tournament_name" class="flex items-start gap-1.5 text-sm font-bold text-amber-800">
          <el-icon class="mt-0.5 shrink-0" aria-hidden="true"><Trophy /></el-icon>
          <span class="break-words">{{ match.tournament_name }}</span>
        </p>
        <h3 class="break-words text-lg font-black leading-snug text-slate-900">{{ match.match_name }}</h3>
        <template v-if="match.category_group || match.match_level">
          <p class="text-sm font-bold text-slate-500 md:hidden">{{ [match.category_group, match.match_level].filter(Boolean).join('・') }}</p>
          <div class="hidden flex-wrap gap-1.5 md:flex">
            <span v-if="match.category_group" class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ match.category_group }}</span>
            <span v-if="match.match_level" class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ match.match_level }}</span>
          </div>
        </template>
      </div>

      <MatchScheduleInfo :match="match" :emphasize-gather-time="!historical" />

      <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 md:py-3">
        <div class="min-w-0 text-center">
          <p class="break-words text-sm font-bold text-slate-700">中港熊戰</p>
          <p v-if="!future && !cancelled" class="mt-1 text-3xl font-black" :class="match.home_score > match.opponent_score ? 'text-primary' : 'text-slate-800'" data-testid="home-score">{{ match.home_score }}</p>
        </div>
        <span class="text-xs font-black text-slate-400" aria-label="對戰">VS</span>
        <div class="min-w-0 text-center">
          <p class="break-words text-sm font-bold text-slate-700">{{ match.opponent || '對手待確認' }}</p>
          <p v-if="!future && !cancelled" class="mt-1 text-3xl font-black text-slate-800" data-testid="opponent-score">{{ match.opponent_score }}</p>
        </div>
      </div>

      <div class="mt-auto flex items-center gap-2 border-t border-slate-100 pt-2 md:pt-3" @click.stop>
        <button
          type="button"
          class="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:bg-slate-200"
          :aria-label="`查看${match.match_name}詳細資料`"
          @click="emit('view', match.id)"
        >
          詳細資料 <el-icon aria-hidden="true"><ArrowRight /></el-icon>
        </button>
        <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
          <button type="button" class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:bg-slate-100" :aria-label="`${match.match_name}更多操作`" title="更多操作">
            <el-icon aria-hidden="true"><MoreFilled /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="copy" :icon="DocumentCopy" class="!min-h-11">複製 Google 行事曆格式</el-dropdown-item>
              <el-dropdown-item v-if="videoUrl" command="video" :icon="VideoCamera" class="!min-h-11">觀看比賽影片</el-dropdown-item>
              <el-dropdown-item v-if="canNotify && !cancelled" command="notify" :icon="Bell" :disabled="Boolean(notifyingMatchId)" class="!min-h-11">{{ notifyingMatchId === match.id ? '發送中…' : '發送賽事通知' }}</el-dropdown-item>
              <el-dropdown-item v-if="canEdit && !cancelled" command="edit" :icon="Operation" class="!min-h-11">編輯比賽</el-dropdown-item>
              <el-dropdown-item v-if="canCancel" command="cancel" :icon="CircleClose" divided class="!min-h-11 !text-amber-800">取消比賽</el-dropdown-item>
              <el-dropdown-item v-if="canRestore" command="restore" :icon="RefreshLeft" divided class="!min-h-11 !text-primary">恢復比賽</el-dropdown-item>
              <el-dropdown-item v-if="canDelete" command="delete" :icon="Delete" :divided="!canCancel" class="!min-h-11 !text-red-600">刪除比賽</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <ElImageViewer v-if="previewVisible && hasPhoto" :url-list="[photoUrl]" teleported @close="previewVisible = false" />
  </article>
</template>
