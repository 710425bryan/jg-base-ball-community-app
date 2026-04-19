<template>
  <div class="animate-fade-in min-h-full bg-[#f7f7f4] px-3 pb-24 pt-3 md:px-6 md:pb-8 md:pt-5">
    <div class="mx-auto max-w-7xl space-y-4 md:space-y-5">
      <section class="flex flex-row items-stretch gap-3 md:gap-4">
        <article class="dashboard-card relative min-w-0 flex-1 overflow-hidden p-4 md:p-7">
          <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/80 via-primary/35 to-transparent"></div>
          <div class="relative">
            <div class="inline-flex rounded-full bg-[#fcead8] px-2.5 py-1 text-[0.65rem] md:px-3 md:py-1 md:text-xs font-black uppercase tracking-wide text-[#b5762a]">
              Back Office
            </div>
            <div class="mt-3 text-[1.4rem] font-black tracking-tight text-slate-950 sm:text-[1.8rem] md:mt-5 md:text-[2.2rem] lg:text-[2.8rem]">
              {{ todayLabel }}
              <span class="ml-1 text-slate-800 md:ml-2">{{ todayWeekday }}</span>
            </div>
            <div class="mt-1 text-[1.2rem] font-black leading-tight text-slate-950 sm:text-[1.5rem] md:mt-4 md:text-[1.85rem] lg:text-[2.7rem]">
              {{ greetingText }}
            </div>
            <p class="mt-2 max-w-3xl text-xs font-bold text-slate-600 md:mt-4 md:text-sm">
              這裡是中港熊戰少棒隊，掌控今日球隊脈動。
            </p>
          </div>
        </article>

        <article class="dashboard-card w-[42%] shrink-0 p-4 sm:w-[230px] md:w-[260px] md:p-6 lg:w-[290px]">
          <div class="text-[0.9rem] font-black text-slate-950 md:text-[1.05rem]">
            天氣預報 <span class="hidden sm:inline">({{ weatherCard.location }})</span>
          </div>
          <div class="mt-3 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:items-center sm:gap-3">
            <div class="weather-illustration weather-illustration-compact hidden shrink-0 sm:block">
              <span class="weather-sun"></span>
              <span class="weather-cloud weather-cloud-back"></span>
              <span class="weather-cloud weather-cloud-front"></span>
            </div>
            <div class="min-w-0">
              <div class="text-[0.75rem] font-semibold text-slate-500 md:text-sm">{{ weatherCard.summary }}</div>
              <div class="mt-1 text-[1.4rem] font-black leading-none text-slate-950 md:text-[1.9rem]">{{ weatherCard.temperature }}</div>
              <div class="mt-1 space-y-0.5 text-[0.75rem] font-semibold text-slate-700 md:mt-2 md:space-y-1 md:text-sm">
                <div>{{ weatherCard.rain }}</div>
                <div>{{ weatherCard.wind }}</div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section class="grid grid-cols-[minmax(0,1fr)_42%] gap-3 sm:grid-cols-[minmax(0,1fr)_230px] md:gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <article class="dashboard-card min-w-0 p-4 md:p-5">
          <div class="text-[0.82rem] font-semibold text-slate-500 md:text-base">球隊總人數</div>
          <div class="mt-2 text-[2.35rem] font-black leading-none text-slate-950 md:text-[3.45rem]">
            {{ stats.totalMembers }}
            <span class="ml-1 text-lg font-semibold text-slate-400 md:text-2xl">人</span>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-semibold leading-tight text-slate-500 md:mt-4 md:gap-x-4 md:gap-y-2 md:text-sm">
            <span class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-[#60a5fa]"></span>
              校隊: {{ stats.schoolTeamMembers }}
            </span>
            <span class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-[#22c55e]"></span>
              社區: {{ stats.communityMembers }}
            </span>
          </div>
        </article>

        <article class="dashboard-card min-w-0 p-4 md:p-5">
          <div class="text-[0.82rem] font-semibold text-slate-500 md:text-base">今日請假人數</div>
          <div class="mt-2 text-[2.35rem] font-black leading-none text-[#ef4444] md:text-[3.45rem]">
            {{ stats.todayLeaves }}
            <span class="ml-1 text-lg font-semibold text-slate-400 md:text-2xl">人</span>
          </div>
        </article>
      </section>

      <section class="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article class="dashboard-card p-5 md:p-6">
          <div class="text-[1.05rem] font-black text-slate-950">待辦清單 (To-Do List)</div>
          <div class="mt-5 space-y-4">
            <div
              v-for="item in todoItems"
              :key="item.key"
              class="flex items-center justify-between gap-3 text-slate-900"
            >
              <div class="min-w-0 pr-2">
                <div class="truncate text-[1.02rem] font-bold">{{ item.displayTitle }}</div>
              </div>
              <router-link
                v-if="item.to"
                :to="item.to"
                class="shrink-0 rounded-xl border-[1.5px] border-slate-700 bg-white px-3.5 py-1 text-sm font-bold text-slate-800 transition-all hover:bg-slate-800 hover:text-white"
              >
                {{ item.actionLabel }}
              </router-link>
            </div>
            <div v-if="todoItems.length === 0" class="text-base font-black text-slate-700">
              目前沒有待辦事項。
            </div>
          </div>
        </article>

        <article v-if="canViewMatches" class="dashboard-card p-5 md:p-6">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-[1.05rem] font-black text-slate-950">賽程表</div>
              <div class="mt-1 text-xs font-semibold text-slate-500">顯示最接近的三筆未來賽事</div>
            </div>
            <router-link
              to="/match-records"
              class="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-900 hover:text-white"
            >
              查看全部
            </router-link>
          </div>

          <div class="mt-5 space-y-3">
            <button
              v-for="match in upcomingMatches"
              :key="match.id"
              type="button"
              class="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              @click="openUpcomingMatch(match.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="rounded-full bg-[#fcead8] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#b5762a]">
                      {{ match.category_group || '賽事' }}
                    </span>
                    <span v-if="match.match_level" class="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                      {{ match.match_level }}
                    </span>
                  </div>
                  <div class="mt-2 line-clamp-1 text-base font-black text-slate-900">{{ match.match_name }}</div>
                  <div class="mt-1 text-sm font-bold text-slate-700">中港熊戰 vs {{ match.opponent || '待確認' }}</div>
                </div>
                <div class="shrink-0 text-right">
                  <div class="text-sm font-black text-slate-900">{{ formatUpcomingMatchDate(match.match_date) }}</div>
                  <div class="mt-1 text-xs font-semibold text-slate-500">{{ match.match_time || '時間待確認' }}</div>
                </div>
              </div>
              <div class="mt-3 line-clamp-1 text-xs font-semibold text-slate-500">{{ match.location || '地點待確認' }}</div>
            </button>

            <div
              v-if="upcomingMatches.length === 0"
              class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500"
            >
              目前沒有未來賽事
            </div>
          </div>
        </article>
      </section>
    </div>

    <MatchDetailDialog
      v-model="upcomingMatchDialogVisible"
      :match-id="selectedUpcomingMatchId"
      :readonly="true"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import MatchDetailDialog from '@/components/match-records/MatchDetailDialog.vue'
import { useMatchesStore } from '@/stores/matches'
import { usePermissionsStore } from '@/stores/permissions'
import {
  createEmptyDashboardPendingCounts,
  createEmptyDashboardSnapshot,
  createEmptyDashboardStats,
  type DashboardAnnouncement,
  type DashboardEvent,
  type DashboardSnapshot
} from '@/types/dashboard'
import {
  isSupabaseRpcMissingError,
  isSupabaseRpcUnavailable,
  markSupabaseRpcUnavailable
} from '@/utils/supabaseRpc'
import type { MatchRecord } from '@/types/match'

type LinkTarget = string | { path: string; query?: Record<string, string> }

type PendingItem = {
  key: string
  title: string
  description: string
  count: string
  to?: LinkTarget
}

type WeatherSnapshot = {
  location: string
  summary: string
  currentTemp: number | null
  maxTemp: number | null
  minTemp: number | null
  rainProbability: number | null
  windSpeedMps: number | null
}

type UpcomingMatchSummary = Pick<
  MatchRecord,
  'id' | 'match_name' | 'opponent' | 'match_date' | 'match_time' | 'location' | 'category_group' | 'match_level'
>

const authStore = useAuthStore()
const matchesStore = useMatchesStore()
const permissionsStore = usePermissionsStore()

const stats = reactive(createEmptyDashboardStats())

const recentAnnouncements = ref<DashboardAnnouncement[]>([])
const todayEvent = ref<DashboardEvent | null>(null)
const upcomingMatches = ref<UpcomingMatchSummary[]>([])
const selectedUpcomingMatchId = ref<string | null>(null)
const upcomingMatchDialogVisible = ref(false)

const pendingCounts = reactive(createEmptyDashboardPendingCounts())

const today = dayjs()
const todayStr = today.format('YYYY-MM-DD')
const xinzhuangCoords = { latitude: 25.0359, longitude: 121.45 }

const weatherState = reactive<WeatherSnapshot>({
  location: 'Xinzhuang',
  summary: '讀取天氣中',
  currentTemp: null,
  maxTemp: null,
  minTemp: null,
  rainProbability: null,
  windSpeedMps: null
})

const canViewAttendance = computed(() => permissionsStore.can('attendance', 'VIEW'))
const canViewAnnouncements = computed(() => permissionsStore.can('announcements', 'VIEW'))
const canViewFees = computed(() => permissionsStore.can('fees', 'VIEW'))
const canViewJoinInquiries = computed(() => permissionsStore.can('join_inquiries', 'VIEW'))
const canViewLeaveRequests = computed(() => permissionsStore.can('leave_requests', 'VIEW'))
const canViewMatches = computed(() => permissionsStore.can('matches', 'VIEW'))

const userName = computed(() => authStore.profile?.nickname || authStore.profile?.name || '球隊夥伴')
const todayLabel = computed(() => today.format('YYYY 年 MM 月 DD 日'))
const todayWeekday = computed(() => `週${'日一二三四五六'[today.day()]}`)

const greetingText = computed(() => {
  if (today.hour() < 12) return `${userName.value}，早安。`
  if (today.hour() < 18) return `${userName.value}，下午好。`
  return `${userName.value}，晚上好。`
})

const weatherCard = computed(() => {
  const maxTemp = weatherState.maxTemp ?? weatherState.currentTemp ?? 26
  const minTemp = weatherState.minTemp ?? weatherState.currentTemp ?? 22
  const rainProbability = weatherState.rainProbability ?? 20
  const windSpeed = weatherState.windSpeedMps ?? 2

  return {
    location: weatherState.location,
    summary: weatherState.summary,
    temperature: `${Math.round(minTemp)}°C / ${Math.round(maxTemp)}°C`,
    rain: `降雨機率: ${Math.round(rainProbability)}%`,
    wind: `風速: ${windSpeed.toFixed(1)}m/s`
  }
})

const getUpcomingMatchTimestamp = (match: UpcomingMatchSummary) => {
  if (!match.match_date) return Number.POSITIVE_INFINITY

  const startTime = match.match_time?.match(/\d{1,2}:\d{2}/)?.[0] || '23:59'
  const value = dayjs(`${match.match_date}T${startTime}`).valueOf()
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

const formatUpcomingMatchDate = (matchDate: string) => dayjs(matchDate).format('MM/DD ddd')

const openUpcomingMatch = async (matchId: string) => {
  selectedUpcomingMatchId.value = matchId
  upcomingMatchDialogVisible.value = true

  if (matchesStore.matches.some((match) => match.id === matchId)) {
    return
  }

  try {
    await matchesStore.fetchMatches()
    if (!matchesStore.matches.some((match) => match.id === matchId)) {
      upcomingMatchDialogVisible.value = false
      ElMessage.warning('找不到這筆比賽資料')
    }
  } catch (error) {
    console.error('Error fetching match detail:', error)
    upcomingMatchDialogVisible.value = false
    ElMessage.error('讀取比賽資料失敗，請稍後再試')
  }
}

const pendingItems = computed<PendingItem[]>(() => {
  const items: PendingItem[] = []

  if (canViewLeaveRequests.value && pendingCounts.upcomingLeaves > 0) {
    items.push({
      key: 'leave-requests',
      title: '近期請假提醒',
      description: `${pendingCounts.upcomingLeaves} 筆待留意，建議先確認本週出勤狀況。`,
      count: `${pendingCounts.upcomingLeaves} 筆`,
      to: '/leave-requests'
    })
  }

  if (canViewAttendance.value) {
    items.push({
      key: 'attendance',
      title: todayEvent.value ? '今日點名已建立' : '今日點名待建立',
      description: todayEvent.value ? '今天已有點名活動，可直接前往處理。' : '今天尚未建立點名活動，若有練習或比賽可先建立。',
      count: todayEvent.value ? '已建立' : '待建立',
      to: '/attendance'
    })
  }

  if (canViewFees.value && pendingCounts.unpaidFees > 0) {
    items.push({
      key: 'fees',
      title: '匯款回報待確認',
      description: `${pendingCounts.unpaidFees} 筆尚未標記為已繳，建議盡快核對。`,
      count: `${pendingCounts.unpaidFees} 筆`,
      to: { path: '/fees', query: { tab: 'quarterly' } }
    })
  }

  if (canViewJoinInquiries.value && pendingCounts.joinInquiries > 0) {
    items.push({
      key: 'join-inquiries',
      title: '入隊申請待跟進',
      description: `${pendingCounts.joinInquiries} 筆新詢問仍待回覆或更新狀態。`,
      count: `${pendingCounts.joinInquiries} 筆`,
      to: '/join-inquiries'
    })
  }

  const priorityMap = { fees: 1, 'join-inquiries': 2, attendance: 3, 'leave-requests': 4 }
  return items.sort((a, b) => (priorityMap[a.key as keyof typeof priorityMap] || 99) - (priorityMap[b.key as keyof typeof priorityMap] || 99))
})

const todoItems = computed(() =>
  pendingItems.value.slice(0, 3).map(item => ({
    ...item,
    displayTitle: `[${todoPrefix(item.key)}] ${item.title.replace('待建立', '(待建立)').replace('已建立', '(已確認)')}`,
    actionLabel: todoActionLabel(item.key)
  }))
)

const weatherCodeToSummary = (code: number | null, isDay = true) => {
  if (code == null) return 'Weather Unavailable'
  if (code === 0) return isDay ? 'Sunny' : 'Clear'
  if ([1].includes(code)) return isDay ? 'Mostly Sunny' : 'Mostly Clear'
  if ([2].includes(code)) return 'Partly Cloudy'
  if ([3].includes(code)) return 'Cloudy'
  if ([45, 48].includes(code)) return 'Foggy'
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain Showers'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow'
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  return 'Partly Cloudy'
}

const formatWindMps = (kmh: number | null | undefined) => {
  if (kmh == null || Number.isNaN(kmh)) return null
  return Math.round((kmh / 3.6) * 10) / 10
}

const fetchWeatherData = async () => {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(xinzhuangCoords.latitude))
    url.searchParams.set('longitude', String(xinzhuangCoords.longitude))
    url.searchParams.set('current', 'temperature_2m,weather_code,is_day,wind_speed_10m')
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max')
    url.searchParams.set('forecast_days', '1')
    url.searchParams.set('timezone', 'Asia/Taipei')

    const response = await fetch(url.toString())
    if (!response.ok) throw new Error(`Weather request failed: ${response.status}`)

    const payload = await response.json()
    const current = payload.current || {}
    const daily = payload.daily || {}

    weatherState.summary = weatherCodeToSummary(current.weather_code ?? null, Boolean(current.is_day))
    weatherState.currentTemp = typeof current.temperature_2m === 'number' ? current.temperature_2m : null
    weatherState.maxTemp = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] ?? null : null
    weatherState.minTemp = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] ?? null : null
    weatherState.rainProbability = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max[0] ?? null : null
    weatherState.windSpeedMps = formatWindMps(current.wind_speed_10m ?? null)
  } catch (error) {
    console.error('Error fetching weather data:', error)
    weatherState.summary = 'Weather Unavailable'
    weatherState.currentTemp = 26
    weatherState.maxTemp = 30
    weatherState.minTemp = 26
    weatherState.rainProbability = 20
    weatherState.windSpeedMps = 2
  }
}

const fetchUpcomingMatches = async () => {
  if (!canViewMatches.value) {
    upcomingMatches.value = []
    return
  }

  try {
    const { data, error } = await supabase
      .from('matches')
      .select('id, match_name, opponent, match_date, match_time, location, category_group, match_level')
      .gte('match_date', today.format('YYYY-MM-DD'))
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true })
      .limit(20)

    if (error) throw error

    const nowValue = dayjs().valueOf()
    upcomingMatches.value = ((data || []) as UpcomingMatchSummary[])
      .filter((match) => getUpcomingMatchTimestamp(match) >= nowValue)
      .sort((a, b) => getUpcomingMatchTimestamp(a) - getUpcomingMatchTimestamp(b))
      .slice(0, 3)
  } catch (error) {
    console.error('Error fetching upcoming matches:', error)
    upcomingMatches.value = []
  }
}

const todoPrefix = (key: string) => {
  if (key === 'leave-requests') return '請假'
  if (key === 'attendance') return '點名'
  if (key === 'fees') return '收費'
  if (key === 'join-inquiries') return '招募'
  return '提醒'
}

const todoActionLabel = (key: string) => {
  if (key === 'leave-requests') return '審核'
  if (key === 'attendance') return '去點名'
  if (key === 'fees') return '確認'
  if (key === 'join-inquiries') return '查看'
  return '前往'
}

const normalizeDashboardSnapshot = (payload: Partial<DashboardSnapshot> | null | undefined): DashboardSnapshot => {
  const emptySnapshot = createEmptyDashboardSnapshot()

  return {
    stats: {
      ...emptySnapshot.stats,
      ...(payload?.stats || {})
    },
    pendingCounts: {
      ...emptySnapshot.pendingCounts,
      ...(payload?.pendingCounts || {})
    },
    todayEvent: payload?.todayEvent ?? null,
    recentAnnouncements: Array.isArray(payload?.recentAnnouncements)
      ? payload.recentAnnouncements
      : []
  }
}

const applyDashboardSnapshot = (snapshot: DashboardSnapshot) => {
  Object.assign(stats, snapshot.stats)
  Object.assign(pendingCounts, snapshot.pendingCounts)
  recentAnnouncements.value = snapshot.recentAnnouncements
  todayEvent.value = snapshot.todayEvent
}

const fetchDashboardDataLegacy = async () => {
  const weekEndStr = today.add(6, 'day').format('YYYY-MM-DD')

  const memberPromise = supabase
    .from('team_members')
    .select('role, status')
    .in('role', ['球員', '校隊'])

  const todayLeavesPromise = canViewLeaveRequests.value
    ? supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
    : Promise.resolve({ count: 0, error: null } as const)

  const announcementsPromise = canViewAnnouncements.value
    ? supabase
        .from('announcements')
        .select('id, title, content, created_at, is_pinned')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(3)
    : Promise.resolve({ data: [], error: null } as const)

  const todayEventPromise = canViewAttendance.value
    ? supabase
        .from('attendance_events')
        .select('id, title, date, event_type, created_at')
        .eq('date', todayStr)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null } as const)

  const joinPromise = canViewJoinInquiries.value
    ? supabase
        .from('join_inquiries')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'completed')
    : Promise.resolve({ count: 0, error: null } as const)

  const feesPromise = canViewFees.value
    ? supabase
        .from('quarterly_fees')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'paid')
    : Promise.resolve({ count: 0, error: null } as const)

  const upcomingLeavesPromise = canViewLeaveRequests.value
    ? supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .gte('end_date', todayStr)
        .lte('start_date', weekEndStr)
    : Promise.resolve({ count: 0, error: null } as const)

  const [membersRes, todayLeavesRes, announcementsRes, todayEventRes, joinRes, feesRes, upcomingLeavesRes] =
    await Promise.all([
      memberPromise,
      todayLeavesPromise,
      announcementsPromise,
      todayEventPromise,
      joinPromise,
      feesPromise,
      upcomingLeavesPromise
    ])

  if (membersRes.error) throw membersRes.error
  if (todayLeavesRes.error) throw todayLeavesRes.error
  if (announcementsRes.error) throw announcementsRes.error
  if (todayEventRes.error) throw todayEventRes.error
  if (joinRes.error) throw joinRes.error
  if (feesRes.error) throw feesRes.error
  if (upcomingLeavesRes.error) throw upcomingLeavesRes.error

  const members = (membersRes.data || []).filter((member: any) => member.status !== '離隊')
  stats.totalMembers = members.length
  stats.schoolTeamMembers = members.filter((member: any) => member.role === '校隊').length
  stats.communityMembers = members.filter((member: any) => member.role === '球員').length
  stats.todayLeaves = todayLeavesRes.count || 0

  recentAnnouncements.value = (announcementsRes.data || []).map((announcement: any) => ({
    id: String(announcement.id),
    title: announcement.title,
    content: announcement.content ?? null,
    createdAt: announcement.created_at,
    isPinned: Boolean(announcement.is_pinned)
  }))

  todayEvent.value = todayEventRes.data
    ? {
        id: String(todayEventRes.data.id),
        title: todayEventRes.data.title,
        date: todayEventRes.data.date,
        eventType: todayEventRes.data.event_type ?? null,
        createdAt: todayEventRes.data.created_at
      }
    : null

  pendingCounts.joinInquiries = joinRes.count || 0
  pendingCounts.unpaidFees = feesRes.count || 0
  pendingCounts.upcomingLeaves = upcomingLeavesRes.count || 0
}

const fetchDashboardData = async () => {
  try {
    if (isSupabaseRpcUnavailable('get_dashboard_snapshot')) {
      await fetchDashboardDataLegacy()
      return
    }

    const { data, error } = await supabase.rpc('get_dashboard_snapshot', {
      p_today: todayStr
    })

    if (error) throw error

    applyDashboardSnapshot(
      normalizeDashboardSnapshot((data || null) as Partial<DashboardSnapshot> | null)
    )
  } catch (error) {
    if (isSupabaseRpcMissingError(error, 'get_dashboard_snapshot')) {
      markSupabaseRpcUnavailable('get_dashboard_snapshot')
      console.warn('get_dashboard_snapshot RPC 尚未部署，改用前端查詢 fallback。')
      await fetchDashboardDataLegacy()
      return
    }

    console.error('Error fetching dashboard data:', error)
  }
}

onMounted(() => {
  void Promise.allSettled([fetchDashboardData(), fetchWeatherData(), fetchUpcomingMatches()])
})
</script>

<style scoped>
.dashboard-card {
  position: relative;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(216, 143, 34, 0.06), transparent 36%),
    linear-gradient(180deg, #ffffff 0%, #fcfcfb 100%);
  box-shadow:
    0 14px 28px rgba(15, 23, 42, 0.07),
    0 2px 4px rgba(15, 23, 42, 0.03);
}

.dashboard-card-soft {
  background: #ffffff;
  border: 4px solid #fad2d2;
}

.dashboard-card-darkline::before {
  content: "";
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 4px;
  border-radius: 24px 24px 0 0;
  background: linear-gradient(90deg, #374151 0%, #111827 100%);
}

.weather-illustration {
  position: relative;
  width: 98px;
  height: 76px;
}

.weather-illustration-compact {
  width: 74px;
  height: 58px;
}

.weather-illustration-compact .weather-sun {
  top: 5px;
  left: 31px;
  width: 26px;
  height: 26px;
  box-shadow: 0 0 0 6px rgba(246, 178, 58, 0.14);
}

.weather-illustration-compact .weather-cloud-front {
  left: 8px;
  bottom: 7px;
  width: 40px;
  height: 18px;
}

.weather-illustration-compact .weather-cloud-front::before {
  left: 2px;
  bottom: 5px;
  width: 16px;
  height: 16px;
}

.weather-illustration-compact .weather-cloud-front::after {
  left: 17px;
  bottom: 8px;
  width: 20px;
  height: 20px;
}

.weather-illustration-compact .weather-cloud-back {
  right: 4px;
  bottom: 14px;
  width: 22px;
  height: 12px;
}

.weather-illustration-compact .weather-cloud-back::before {
  left: 1px;
  bottom: 3px;
  width: 10px;
  height: 10px;
}

.weather-illustration-compact .weather-cloud-back::after {
  left: 8px;
  bottom: 4px;
  width: 13px;
  height: 13px;
}

.weather-sun {
  position: absolute;
  top: 6px;
  left: 42px;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: #f6b23a;
  box-shadow: 0 0 0 8px rgba(246, 178, 58, 0.14);
}

.weather-cloud {
  position: absolute;
  border: 4px solid #0f172a;
  background: #fff;
  border-radius: 999px;
}

.weather-cloud::before,
.weather-cloud::after {
  content: "";
  position: absolute;
  border: 4px solid #0f172a;
  background: #fff;
  border-radius: 999px;
}

.weather-cloud-front {
  left: 10px;
  bottom: 10px;
  width: 52px;
  height: 24px;
}

.weather-cloud-front::before {
  left: 4px;
  bottom: 8px;
  width: 21px;
  height: 21px;
}

.weather-cloud-front::after {
  left: 22px;
  bottom: 11px;
  width: 26px;
  height: 26px;
}

.weather-cloud-back {
  right: 6px;
  bottom: 18px;
  width: 30px;
  height: 16px;
  opacity: 0.85;
}

.weather-cloud-back::before {
  left: 2px;
  bottom: 5px;
  width: 14px;
  height: 14px;
}

.weather-cloud-back::after {
  left: 11px;
  bottom: 7px;
  width: 17px;
  height: 17px;
}

.animate-fade-in {
  animation: fadeIn 0.45s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.btn-folded {
  position: relative;
  background: linear-gradient(-45deg, transparent 15px, #475569 0);
  border-radius: 12px;
}

.btn-folded::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  border-left: 16px solid #64748b;
  border-bottom: 16px solid transparent;
  box-shadow: -2px -2px 4px rgba(0, 0, 0, 0.15);
  border-top-left-radius: 4px;
}
</style>
