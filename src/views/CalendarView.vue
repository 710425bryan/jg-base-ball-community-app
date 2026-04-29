<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Calendar, InfoFilled, Location, Refresh } from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import MatchDetailDialog from '@/components/match-records/MatchDetailDialog.vue'
import { useMatchesStore } from '@/stores/matches'
import type { MatchRecord } from '@/types/match'
import {
  getDashboardMatchStart,
  getDashboardUpcomingMatches
} from '@/utils/dashboardHome'

const matchesStore = useMatchesStore()
const showParserInfo = ref(false)
const selectedMatchId = ref<string | null>(null)
const detailVisible = ref(false)
type ScheduleTab = 'upcoming' | 'calendar'

const activeScheduleTab = ref<ScheduleTab>('upcoming')
const scheduleTabs: Array<{ key: ScheduleTab; label: string; description: string }> = [
  {
    key: 'upcoming',
    label: '近期賽程',
    description: '可快速查看賽事詳情與導航'
  },
  {
    key: 'calendar',
    label: '完整月曆',
    description: '用月曆檢視長期安排'
  }
]

const upcomingMatches = computed(() => getDashboardUpcomingMatches(matchesStore.matches, dayjs(), 8))
const nextMatch = computed(() => upcomingMatches.value[0] || null)
const activeScheduleTabDescription = computed(() =>
  scheduleTabs.find((tab) => tab.key === activeScheduleTab.value)?.description || ''
)

const fetchMatches = async () => {
  await matchesStore.fetchUpcomingMatches(8, dayjs().format('YYYY-MM-DD'))
}

const openMatchDetail = (matchId: string) => {
  selectedMatchId.value = matchId
  detailVisible.value = true
}

const formatMatchDate = (match: MatchRecord) => {
  const start = getDashboardMatchStart(match)
  if (!start) return match.match_date
  return `${start.format('MM/DD')} 週${'日一二三四五六'[start.day()]}`
}

const formatMatchTime = (match: MatchRecord) => match.match_time || '時間待確認'

const getMatchTitle = (match: MatchRecord) => {
  if (match.opponent) return `中港熊戰 vs ${match.opponent}`
  return match.match_name || '賽事待確認'
}

const getMatchContextBadges = (match: MatchRecord) => [
  match.category_group ? { key: 'category', label: match.category_group.trim() } : null,
  match.tournament_name ? { key: 'tournament', label: match.tournament_name.trim() } : null
].filter((badge): badge is { key: string; label: string } => Boolean(badge?.label))

const getMapsHref = (location?: string | null) => {
  const normalized = location?.trim()
  if (!normalized) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalized)}`
}

onMounted(() => {
  void fetchMatches()
})
</script>

<template>
  <div class="h-full flex-1 flex flex-col animate-fade-in bg-background text-text overflow-y-auto p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:p-6">
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <AppPageHeader
          title="賽程與行事曆"
          subtitle="切換近期賽程與完整月曆，不需要往下滑找內容。"
          :icon="Calendar"
          as="h2"
        >
          <template #actions>
            <button
              type="button"
              class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
              :disabled="matchesStore.loading"
              @click="fetchMatches"
            >
              <el-icon :class="{ 'is-loading': matchesStore.loading }"><Refresh /></el-icon>
              重新整理
            </button>
            <button
              type="button"
              class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 transition-colors hover:border-primary hover:text-primary"
              @click="showParserInfo = true"
            >
              <el-icon><InfoFilled /></el-icon>
              同步說明
            </button>
          </template>
        </AppPageHeader>
      </div>

      <div class="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm md:flex-row md:items-center md:justify-between">
        <div class="grid grid-cols-2 gap-2 md:w-auto">
          <button
            v-for="tab in scheduleTabs"
            :key="tab.key"
            type="button"
            class="min-h-11 rounded-xl px-4 text-sm font-black transition-colors"
            :class="activeScheduleTab === tab.key ? 'bg-primary text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-slate-800'"
            :aria-selected="activeScheduleTab === tab.key"
            @click="activeScheduleTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
        <p class="px-2 text-sm font-bold text-gray-400 md:text-right">{{ activeScheduleTabDescription }}</p>
      </div>

      <section
        v-show="activeScheduleTab === 'upcoming'"
        class="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-lg"
      >
        <div class="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div class="border-b border-white/10 p-5 md:p-6 lg:border-b-0 lg:border-r">
            <div class="text-xs font-black uppercase tracking-[0.22em] text-primary">Next Match</div>
            <h3 class="mt-3 text-3xl font-black leading-tight md:text-4xl">
              {{ nextMatch ? getMatchTitle(nextMatch) : '近期尚無賽程' }}
            </h3>
            <div v-if="nextMatch && getMatchContextBadges(nextMatch).length > 0" class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="badge in getMatchContextBadges(nextMatch)"
                :key="badge.key"
                class="inline-flex max-w-full rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-primary"
              >
                {{ badge.label }}
              </span>
            </div>
            <p class="mt-3 text-sm font-semibold leading-7 text-slate-300">
              {{ nextMatch ? `${formatMatchDate(nextMatch)}｜${formatMatchTime(nextMatch)}` : '同步賽程後，這裡會顯示下一場比賽或訓練安排。' }}
            </p>

            <div v-if="nextMatch" class="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-black text-white transition-colors hover:bg-primary-hover"
                @click="openMatchDetail(nextMatch.id)"
              >
                查看賽事詳情
              </button>
              <a
                v-if="getMapsHref(nextMatch.location)"
                :href="getMapsHref(nextMatch.location) || undefined"
                target="_blank"
                rel="noreferrer"
                class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 text-sm font-black text-white transition-colors hover:bg-white/15"
              >
                <el-icon><Location /></el-icon>
                開啟導航
              </a>
            </div>
          </div>

          <div class="grid gap-3 p-4 md:grid-cols-2 md:p-5">
            <button
              v-for="match in upcomingMatches"
              :key="match.id"
              type="button"
              class="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-left transition-colors hover:bg-white/[0.1]"
              @click="openMatchDetail(match.id)"
            >
              <div class="text-xs font-black uppercase tracking-[0.18em] text-primary">{{ formatMatchDate(match) }}</div>
              <div v-if="getMatchContextBadges(match).length > 0" class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="badge in getMatchContextBadges(match)"
                  :key="badge.key"
                  class="inline-flex max-w-full rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-black leading-none text-primary"
                >
                  {{ badge.label }}
                </span>
              </div>
              <h4 class="mt-2 line-clamp-2 text-lg font-black text-white">{{ getMatchTitle(match) }}</h4>
              <p class="mt-2 text-sm font-bold text-slate-300">{{ formatMatchTime(match) }}</p>
              <p v-if="match.location" class="mt-1 line-clamp-1 text-sm font-semibold text-slate-400">{{ match.location }}</p>
            </button>

            <div
              v-if="!matchesStore.loading && upcomingMatches.length === 0"
              class="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] p-6 text-sm font-bold text-slate-300 md:col-span-2"
            >
              目前沒有未來賽事。可到比賽紀錄頁新增，或使用同步行事曆功能匯入。
            </div>
          </div>
        </div>
      </section>

      <section
        v-show="activeScheduleTab === 'calendar'"
        class="min-h-[520px] overflow-hidden rounded-3xl border border-gray-100 bg-white p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-4"
      >
        <div class="mb-3 flex items-center justify-between px-2 pt-2">
          <div>
            <h3 class="text-lg font-black text-slate-800">完整 Google Calendar</h3>
            <p class="mt-1 text-xs font-bold text-gray-400">保留月曆檢視，方便查看長期安排。</p>
          </div>
        </div>

        <div class="relative h-[520px] overflow-hidden rounded-2xl border border-gray-100 md:h-[620px]">
          <iframe
            class="absolute inset-0"
            src="https://calendar.google.com/calendar/embed?src=jg.baseball.bear@gmail.com&ctz=Asia/Taipei&bgcolor=%23ffffff&color=%23D88F22&showTitle=0&showNav=1&showPrint=0&showCalendars=0&showTz=0"
            style="border:none;"
            width="100%"
            height="100%"
            frameborder="0"
            scrolling="no"
          ></iframe>
        </div>
      </section>
    </div>

    <el-dialog
      v-model="showParserInfo"
      title="賽事解析與同步機制"
      width="90%"
      style="max-width: 520px; border-radius: 16px;"
    >
      <div class="text-sm text-gray-600 space-y-4">
        <p>系統已透過 <strong><code>googleCalendarParser.ts</code></strong> 支援賽事名稱、對戰對手、組別、集合時間、帶隊教練與參賽球員解析。</p>
        <div class="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-primary">
          同步寫入資料庫仍需後端環境允許；目前此頁同時提供系統賽事卡片與原始 Google Calendar 檢視。
        </div>
      </div>
    </el-dialog>

    <MatchDetailDialog
      v-model="detailVisible"
      :match-id="selectedMatchId"
      :readonly="true"
    />
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
