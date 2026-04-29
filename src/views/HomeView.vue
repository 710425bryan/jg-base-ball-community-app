<script setup lang="ts">
import { ArrowRight, Calendar, Cloudy, Goods, Lightning, Location, MoonNight, PartlyCloudy, Pouring, ShoppingCart, Sunny, VideoCameraFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import HomeHolidayHeroOverlay from '@/components/home/HomeHolidayHeroOverlay.vue'
import MyHomeTodayPanel from '@/components/home/MyHomeTodayPanel.vue'
import MatchDetailDialog from '@/components/match-records/MatchDetailDialog.vue'
import FeeManagementReminderPanel from '@/components/fees/FeeManagementReminderPanel.vue'
import { getMyHomeSnapshot } from '@/services/myHome'
import { supabase } from '@/services/supabase'
import { getMatchWeatherForecast, type WeatherSnapshot } from '@/services/weatherApi'
import { useAuthStore } from '@/stores/auth'
import { useEquipmentStore } from '@/stores/equipment'
import { useMatchesStore } from '@/stores/matches'
import { usePermissionsStore } from '@/stores/permissions'
import { createEmptyDashboardStats, type DashboardAnnouncement } from '@/types/dashboard'
import type { Equipment } from '@/types/equipment'
import type { MatchRecord } from '@/types/match'
import { createEmptyMyHomeSnapshot } from '@/types/myHome'
import {
  getEquipmentRemainingOverallQuantity,
  getEquipmentSizeInventoryList
} from '@/utils/equipmentInventory'
import {
  formatDashboardMatchDay,
  formatDashboardMatchMonth,
  getDashboardMatchResultMeta,
  getDashboardRecentMatches,
  getDashboardUpcomingMatches,
  isDashboardMatchInProgress,
  pickDashboardHeroMatch
} from '@/utils/dashboardHome'

type WeatherStatus = 'loading' | 'success' | 'unavailable'
type WeatherIconName = 'cloudy' | 'lightning' | 'moon-night' | 'partly-cloudy' | 'pouring' | 'sunny'

type TeamMemberStatRow = {
  role: string | null
  status: string | null
}

type LeaveRequestStatRow = {
  user_id: string | null
}

type AttendanceRecordStatRow = {
  member_id: string | null
  status: string | null
}

type AttendanceEventStatRow = {
  id: string | number
  attendance_records: AttendanceRecordStatRow[] | null
}

type AnnouncementRow = {
  id: string | number
  title: string
  content: string | null
  created_at: string
  is_pinned: boolean | null
  image_url?: string | null
}

const TEAM_LABEL = '中港熊戰'
const MEMBER_STAT_ROLES = ['球員', '校隊', '教練']
const INACTIVE_MEMBER_STATUSES = new Set(['離隊', '退隊'])
const DEFAULT_WEATHER_TEMP = 26
const DEFAULT_WEATHER_RAIN = 20
const DEFAULT_WEATHER_WIND = 2
const WEATHER_ICON_COMPONENTS: Record<WeatherIconName, typeof Cloudy> = {
  cloudy: Cloudy,
  lightning: Lightning,
  'moon-night': MoonNight,
  'partly-cloudy': PartlyCloudy,
  pouring: Pouring,
  sunny: Sunny
}
const SUNNY_RAY_ROTATIONS = ['0deg', '45deg', '90deg', '135deg', '180deg', '225deg', '270deg', '315deg'] as const
const PARTLY_CLOUDY_RAY_ROTATIONS = ['-20deg', '25deg', '70deg', '115deg'] as const
const RAIN_DROP_STYLES = [
  { id: 'left', style: { '--drop-left': '28%', '--drop-delay': '0ms', '--drop-duration': '1.45s' } },
  { id: 'center', style: { '--drop-left': '48%', '--drop-delay': '180ms', '--drop-duration': '1.2s' } },
  { id: 'right', style: { '--drop-left': '68%', '--drop-delay': '420ms', '--drop-duration': '1.35s' } }
] as const

const router = useRouter()
const authStore = useAuthStore()
const equipmentStore = useEquipmentStore()
const matchesStore = useMatchesStore()
const permissionsStore = usePermissionsStore()

const stats = reactive(createEmptyDashboardStats())
const weatherState = reactive<WeatherSnapshot>({
  location: '新莊',
  summary: '讀取天氣中',
  currentTemp: null,
  maxTemp: null,
  minTemp: null,
  rainProbability: null,
  windSpeedMps: null,
  weatherCode: null,
  isDay: null,
  forecastDate: null,
  isMatchDateForecast: false
})

const latestAnnouncements = ref<DashboardAnnouncement[]>([])
const detailVisible = ref(false)
const selectedMatchId = ref<string | null>(null)
const now = ref(dayjs())
const weatherStatus = ref<WeatherStatus>('loading')
const myHomeSnapshot = ref(createEmptyMyHomeSnapshot())
const selectedMyHomeMemberId = ref('')
const isMyHomeLoading = ref(false)
const myHomeError = ref('')

let clockId: ReturnType<typeof setInterval> | null = null

const canViewMatches = computed(() => permissionsStore.can('matches', 'VIEW'))
const canViewAnnouncements = computed(() => permissionsStore.can('announcements', 'VIEW'))
const canViewFees = computed(() => permissionsStore.can('fees', 'VIEW'))
const isAdmin = computed(() => permissionsStore.currentRole === 'ADMIN')
const hasLinkedTeamMembers = computed(() => {
  const linkedIds = authStore.profile?.linked_team_member_ids
  return Array.isArray(linkedIds) && linkedIds.length > 0
})
const shouldShowMyHomePanel = computed(() => {
  const role = authStore.profile?.role
  return role === 'MEMBER' || role === 'PARENT' || hasLinkedTeamMembers.value
})

const userName = computed(() => authStore.profile?.nickname || authStore.profile?.name || '球隊夥伴')
const todayLabel = computed(() => now.value.format('YYYY 年 MM 月 DD 日'))
const todayWeekday = computed(() => `週${'日一二三四五六'[now.value.day()]}`)

const greetingText = computed(() => {
  if (now.value.hour() < 12) return `${userName.value}，早安。`
  if (now.value.hour() < 18) return `${userName.value}，下午好。`
  return `${userName.value}，晚上好。`
})

const weatherCard = computed(() => {
  const currentTemp = weatherState.currentTemp ?? weatherState.maxTemp ?? DEFAULT_WEATHER_TEMP
  const minTemp = weatherState.minTemp ?? currentTemp
  const maxTemp = weatherState.maxTemp ?? currentTemp
  const rainProbability = weatherState.rainProbability ?? DEFAULT_WEATHER_RAIN
  const windSpeed = weatherState.windSpeedMps ?? DEFAULT_WEATHER_WIND

  return {
    summary: weatherState.summary,
    temperature: `${Math.round(currentTemp)}°`,
    range: `${Math.round(minTemp)}° / ${Math.round(maxTemp)}°`,
    rain: `降雨機率 ${Math.round(rainProbability)}%`,
    wind: `風速 ${windSpeed.toFixed(1)}m/s`
  }
})
const myHomeWeatherCard = computed(() => ({
  summary: weatherStatus.value === 'success' ? weatherCard.value.summary : '氣象資料暫時不可用',
  temperature: weatherCard.value.temperature,
  rain: weatherCard.value.rain
}))
const weatherLocationDetail = computed(() => {
  const location = weatherState.location || '新莊區'
  if (!weatherState.forecastDate) return location

  const dateLabel = weatherState.isMatchDateForecast
    ? dayjs(weatherState.forecastDate).format('M/D')
    : '今日'

  return `${dateLabel} ${location}`
})
const weatherIconName = computed<WeatherIconName>(() => {
  const code = weatherState.weatherCode
  const isDay = weatherState.isDay ?? true

  if (code == null) return isDay ? 'cloudy' : 'moon-night'
  if (code === 0) return isDay ? 'sunny' : 'moon-night'
  if ([1, 2].includes(code)) return 'partly-cloudy'
  if ([95, 96, 99].includes(code)) return 'lightning'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'pouring'
  return 'cloudy'
})
const weatherEffect = computed(() => {
  switch (weatherIconName.value) {
    case 'sunny':
      return 'sunny'
    case 'partly-cloudy':
      return 'partly-cloudy'
    case 'pouring':
      return 'rain'
    case 'lightning':
      return 'thunder'
    case 'cloudy':
      return 'cloudy'
    default:
      return 'none'
  }
})
const currentWeatherIcon = computed(() => WEATHER_ICON_COMPONENTS[weatherIconName.value] || Cloudy)
const weatherIconStyle = computed<Record<string, string>>(() => {
  if (weatherIconName.value === 'sunny') {
    return {
      color: '#f8c24a',
      '--weather-icon-glow-color': 'rgba(248, 194, 74, 0.36)'
    }
  }

  if (weatherIconName.value === 'partly-cloudy') {
    return {
      color: '#fbbf24',
      '--weather-icon-glow-color': 'rgba(251, 191, 36, 0.32)'
    }
  }

  if (weatherIconName.value === 'pouring') {
    return {
      color: '#93c5fd',
      '--weather-icon-glow-color': 'rgba(147, 197, 253, 0.32)'
    }
  }

  if (weatherIconName.value === 'lightning') {
    return {
      color: '#facc15',
      '--weather-icon-glow-color': 'rgba(250, 204, 21, 0.34)'
    }
  }

  if (weatherIconName.value === 'moon-night') {
    return {
      color: '#dbeafe',
      '--weather-icon-glow-color': 'rgba(219, 234, 254, 0.28)'
    }
  }

  return {
    color: '#e2e8f0',
    '--weather-icon-glow-color': 'rgba(226, 232, 240, 0.24)'
  }
})

const heroMatch = computed(() => (canViewMatches.value ? pickDashboardHeroMatch(matchesStore.matches, now.value) : null))
const isHeroMatchLive = computed(() => (heroMatch.value ? isDashboardMatchInProgress(heroMatch.value, now.value) : false))
const upcomingMatches = computed(() => (canViewMatches.value ? getDashboardUpcomingMatches(matchesStore.matches, now.value, 4) : []))
const recentMatches = computed(() => (canViewMatches.value ? getDashboardRecentMatches(matchesStore.matches, now.value, 4) : []))
const featuredAnnouncement = computed(() => latestAnnouncements.value[0] ?? null)
const supportingAnnouncements = computed(() => latestAnnouncements.value.slice(1, 3))
const availableAddonEquipments = computed(() =>
  equipmentStore.equipments.filter((equipment) =>
    equipment.quick_purchase_enabled
    && Number(equipment.purchase_price || 0) > 0
    && getEquipmentRemainingOverallQuantity(equipment) > 0
  )
)
const featuredAddonEquipment = computed(() => availableAddonEquipments.value[0] ?? null)
const addonPreviewEquipments = computed(() => availableAddonEquipments.value.slice(0, 4))
const isEquipmentAddonLoading = computed(() => equipmentStore.isLoading && equipmentStore.equipments.length === 0)

const formatHeroDateTime = (match: MatchRecord) =>
  `${match.match_date.replace(/-/g, '/')} ${match.match_time || ''}`.trim()

const formatAnnouncementDate = (createdAt: string) => dayjs(createdAt).format('YYYY.MM.DD')

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const getDisplayOpponent = (match: MatchRecord) => (match.match_level === '特訓課' ? '特訓課' : match.opponent || '待確認')

const getMatchLocationLabel = (match: MatchRecord) => match.location || '比賽地點待確認'

const getMatchLocationHref = (match: MatchRecord) => {
  const location = match.location?.trim()
  if (!location) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

const getUpcomingMetaLabel = (match: MatchRecord) => {
  if (match.match_time) return match.match_time
  if (match.match_level) return match.match_level
  return '時間待確認'
}

const getRecentResultToneClass = (match: MatchRecord) => {
  const result = getDashboardMatchResultMeta(match.home_score, match.opponent_score)
  if (result.tone === 'win') return 'text-[#16a34a]'
  if (result.tone === 'lose') return 'text-[#dc2626]'
  if (result.tone === 'draw') return 'text-[#64748b]'
  return 'text-[#94a3b8]'
}

const getAddonAvailabilityLabel = (equipment: Equipment) => {
  const availableSizes = getEquipmentSizeInventoryList(equipment).filter((item) => item.remaining > 0)
  if (availableSizes.length > 0) return `${availableSizes.length} 個尺寸可選`
  return `可用 ${getEquipmentRemainingOverallQuantity(equipment)} 件`
}

const isActiveDashboardMember = (member: TeamMemberStatRow) =>
  !INACTIVE_MEMBER_STATUSES.has(member.status || '')

const resetAdminStats = () => {
  Object.assign(stats, createEmptyDashboardStats())
}

const getDashboardWeatherTarget = () => {
  if (heroMatch.value?.location) {
    return {
      location: heroMatch.value.location,
      matchDate: heroMatch.value.match_date
    }
  }

  const nextPersonalEvent = myHomeSnapshot.value.next_event
  if (nextPersonalEvent?.type === 'match' && nextPersonalEvent.location) {
    return {
      location: nextPersonalEvent.location,
      matchDate: nextPersonalEvent.date
    }
  }

  return {
    location: null,
    matchDate: null
  }
}

const fetchWeatherData = async () => {
  weatherStatus.value = 'loading'

  try {
    Object.assign(weatherState, await getMatchWeatherForecast({
      ...getDashboardWeatherTarget(),
      now: now.value
    }))
    weatherStatus.value = 'success'
  } catch (error) {
    console.error('Error fetching weather data:', error)
    weatherState.summary = '氣象資料暫時不可用'
    weatherState.currentTemp = DEFAULT_WEATHER_TEMP
    weatherState.maxTemp = DEFAULT_WEATHER_TEMP + 4
    weatherState.minTemp = DEFAULT_WEATHER_TEMP
    weatherState.rainProbability = DEFAULT_WEATHER_RAIN
    weatherState.windSpeedMps = DEFAULT_WEATHER_WIND
    weatherState.weatherCode = null
    weatherState.isDay = true
    weatherState.forecastDate = now.value.format('YYYY-MM-DD')
    weatherState.isMatchDateForecast = false
    weatherStatus.value = 'unavailable'
  }
}

const fetchMatchesData = async () => {
  if (!canViewMatches.value) {
    return
  }

  try {
    await matchesStore.fetchMatches()
  } catch (error) {
    console.error('Error fetching dashboard matches:', error)
  }
}

const fetchAdminStats = async () => {
  if (!isAdmin.value) {
    resetAdminStats()
    return
  }

  try {
    const currentDate = now.value.format('YYYY-MM-DD')
    const [membersRes, todayLeaveRequestsRes, todayAttendanceEventsRes] = await Promise.all([
      supabase
        .from('team_members')
        .select('role, status')
        .in('role', MEMBER_STAT_ROLES),
      supabase
        .from('leave_requests')
        .select('user_id')
        .lte('start_date', currentDate)
        .gte('end_date', currentDate),
      supabase
        .from('attendance_events')
        .select('id, attendance_records(member_id, status)')
        .eq('date', currentDate)
    ])

    if (membersRes.error) throw membersRes.error
    if (todayLeaveRequestsRes.error) throw todayLeaveRequestsRes.error
    if (todayAttendanceEventsRes.error) throw todayAttendanceEventsRes.error

    const members = Array.isArray(membersRes.data)
      ? (membersRes.data as TeamMemberStatRow[]).filter(isActiveDashboardMember)
      : []
    const todayLeaveRequests = Array.isArray(todayLeaveRequestsRes.data)
      ? todayLeaveRequestsRes.data as LeaveRequestStatRow[]
      : []
    const todayAttendanceEvents = Array.isArray(todayAttendanceEventsRes.data)
      ? todayAttendanceEventsRes.data as AttendanceEventStatRow[]
      : []
    const leaveRequestMemberIds = new Set<string>()
    const attendanceLeaveMemberIds = new Set<string>()

    todayLeaveRequests.forEach((leave) => {
      if (leave.user_id) leaveRequestMemberIds.add(leave.user_id)
    })

    todayAttendanceEvents.forEach((event) => {
      event.attendance_records?.forEach((record) => {
        if (record.status === '請假' && record.member_id) {
          attendanceLeaveMemberIds.add(record.member_id)
        }
      })
    })

    const todayLeaveMemberIds = new Set([...leaveRequestMemberIds, ...attendanceLeaveMemberIds])

    stats.totalMembers = members.length
    stats.schoolTeamMembers = members.filter((member) => member.role === '校隊').length
    stats.communityMembers = members.filter((member) => member.role === '球員').length
    stats.coachMembers = members.filter((member) => member.role === '教練').length
    stats.todayLeaves = todayLeaveMemberIds.size
    stats.todayLeaveRequests = leaveRequestMemberIds.size
    stats.todayAttendanceLeaves = attendanceLeaveMemberIds.size
    stats.todayAttendanceEvents = todayAttendanceEvents.length
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error)
    resetAdminStats()
  }
}

const fetchAnnouncementsData = async () => {
  if (!canViewAnnouncements.value) {
    latestAnnouncements.value = []
    return
  }

  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, created_at, is_pinned, image_url')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3)

    if (error) throw error

    latestAnnouncements.value = (data as AnnouncementRow[] | null | undefined)?.map((announcement) => ({
      id: String(announcement.id),
      title: announcement.title,
      content: announcement.content ?? null,
      createdAt: announcement.created_at,
      isPinned: Boolean(announcement.is_pinned),
      imageUrl: announcement.image_url ?? null
    })) ?? []
  } catch (error) {
    console.error('Error fetching dashboard announcements:', error)
    latestAnnouncements.value = []
  }
}

const fetchEquipmentAddonData = async () => {
  try {
    await equipmentStore.loadEquipments()
  } catch (error) {
    console.error('Error fetching dashboard equipment add-ons:', error)
  }
}

const fetchMyHomeSnapshotData = async () => {
  if (!shouldShowMyHomePanel.value) {
    myHomeSnapshot.value = createEmptyMyHomeSnapshot()
    selectedMyHomeMemberId.value = ''
    return
  }

  isMyHomeLoading.value = true
  myHomeError.value = ''

  try {
    const snapshot = await getMyHomeSnapshot(now.value.format('YYYY-MM-DD'))
    myHomeSnapshot.value = snapshot

    const hasSelectedMember = snapshot.members.some((member) => member.id === selectedMyHomeMemberId.value)
    if (!hasSelectedMember) {
      selectedMyHomeMemberId.value = snapshot.members[0]?.id || ''
    }
  } catch (error: any) {
    console.error('Error fetching personal home snapshot:', error)
    myHomeError.value = error?.message || '無法載入個人化首頁資料'
    myHomeSnapshot.value = createEmptyMyHomeSnapshot()
    selectedMyHomeMemberId.value = ''
  } finally {
    isMyHomeLoading.value = false
  }
}

const openMatchDetail = async (matchId: string) => {
  selectedMatchId.value = matchId
  detailVisible.value = true

  if (matchesStore.matches.some((match) => match.id === matchId)) {
    return
  }

  try {
    await matchesStore.fetchMatches()
    if (!matchesStore.matches.some((match) => match.id === matchId)) {
      detailVisible.value = false
      ElMessage.warning('找不到這筆比賽資料')
    }
  } catch (error) {
    console.error('Error fetching match detail:', error)
    detailVisible.value = false
    ElMessage.error('讀取比賽資料失敗，請稍後再試')
  }
}

const handleHeroAction = () => {
  if (heroMatch.value) {
    void openMatchDetail(heroMatch.value.id)
    return
  }

  router.push('/match-records')
}

const openAnnouncements = () => {
  router.push('/announcements')
}

const openEquipmentAddons = () => {
  router.push('/equipment-addons')
}

onMounted(() => {
  clockId = setInterval(() => {
    now.value = dayjs()
  }, 60_000)

  const myHomePromise = fetchMyHomeSnapshotData()
  const matchesPromise = fetchMatchesData()

  void Promise.allSettled([
    Promise.allSettled([myHomePromise, matchesPromise]).then(() => fetchWeatherData()),
    fetchAdminStats(),
    fetchAnnouncementsData(),
    fetchEquipmentAddonData()
  ])
})

onUnmounted(() => {
  if (clockId) {
    clearInterval(clockId)
    clockId = null
  }
})
</script>

<template>
  <div class="animate-home-fade min-h-full bg-[#f8fafc] pb-24 font-sans md:pb-8">
    <section
      data-test="dashboard-hero"
      class="relative flex min-h-[350px] w-full items-end overflow-hidden rounded-b-3xl border-b-4 border-slate-800 bg-slate-900 shadow-lg md:h-[50vh] md:min-h-[450px]"
    >
      <img
        :src="'/hero-bg.jpg'"
        alt="中港熊戰英雄區背景"
        class="absolute inset-0 h-full w-full object-cover opacity-40"
        draggable="false"
      />
      <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.7)_0%,rgba(15,23,42,0.42)_45%,rgba(15,23,42,0.9)_100%)]"></div>
      <div class="absolute bottom-0 left-0 h-24 w-full bg-gradient-to-t from-slate-900 to-transparent"></div>
      <div
        class="pointer-events-none absolute right-0 top-0 hidden h-full w-2/3 translate-x-32 skew-x-[12deg] bg-slate-800 opacity-50 md:block lg:w-1/2"
      ></div>
      <HomeHolidayHeroOverlay />

      <div class="relative z-10 mx-auto flex h-full w-full max-w-7xl items-end px-3 pb-8 pt-7 sm:px-4 md:pb-10 md:pt-10">
        <div class="flex min-h-[450px] w-full flex-col justify-end gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
          <div class="mb-[22px] flex min-w-0 flex-col justify-end md:flex-1 md:max-w-[64%] md:translate-y-3 lg:max-w-[62%] lg:translate-y-4">
              <div
              class="mt-4 mb-[22px] inline-flex w-max items-center gap-2 rounded-md px-3 py-1 text-xs font-black uppercase tracking-[0.24em] shadow-sm md:mt-5"
                :class="isHeroMatchLive ? 'bg-red-600 text-white shadow-red-600/30' : 'bg-primary text-white shadow-primary/30'"
              >
              <el-icon v-if="isHeroMatchLive"><VideoCameraFilled /></el-icon>
              {{ heroMatch ? (isHeroMatchLive ? '賽事進行中' : 'UPCOMING MATCH') : 'BACK OFFICE HOME' }}
            </div>

            <div v-if="heroMatch && canViewMatches" data-test="hero-match-info" class="mt-0.5 max-w-4xl md:mt-1">
              <h1 class="hero-title hero-match-title font-black uppercase italic leading-[0.84] tracking-tight text-white">
                <span class="hero-match-name">{{ TEAM_LABEL }}</span>
                <span class="hero-match-vs text-primary">VS</span>
                <span class="hero-match-opponent">{{ getDisplayOpponent(heroMatch) }}</span>
              </h1>

              <div class="mt-3 flex flex-wrap items-center gap-3 text-sm font-bold text-slate-200 md:text-base">
                <span class="flex items-center gap-1.5 font-black text-white">
                  <el-icon><Calendar /></el-icon>
                  {{ formatHeroDateTime(heroMatch) }}
                </span>
                <span
                  v-if="heroMatch.category_group"
                  class="rounded bg-primary px-2 py-0.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-sm"
                >
                  {{ heroMatch.category_group }}
                </span>
                <span
                  v-if="heroMatch.match_level"
                  class="rounded bg-white/15 px-2 py-0.5 text-xs font-bold text-white backdrop-blur-sm"
                >
                  {{ heroMatch.match_level }}
                </span>
              </div>

              <a
                v-if="getMatchLocationHref(heroMatch)"
                :href="getMatchLocationHref(heroMatch) || undefined"
                target="_blank"
                rel="noreferrer"
                class="mt-2 flex max-w-3xl items-center gap-2 text-base font-bold text-primary transition hover:text-[#ffd089] md:text-[1.15rem]"
              >
                <el-icon><Location /></el-icon>
                <span class="line-clamp-1 underline-offset-4 hover:underline">{{ getMatchLocationLabel(heroMatch) }}</span>
              </a>
              <p v-else class="mt-2 flex max-w-3xl items-center gap-2 text-base font-bold text-primary md:text-[1.15rem]">
                <el-icon><Location /></el-icon>
                <span class="line-clamp-1">{{ getMatchLocationLabel(heroMatch) }}</span>
              </p>
            </div>

            <div v-else class="mt-4 max-w-3xl">
              <div class="text-sm font-bold uppercase tracking-[0.22em] text-slate-300">{{ todayLabel }} {{ todayWeekday }}</div>
              <h1 class="hero-title mt-3 text-[2.3rem] font-black uppercase italic leading-[0.94] tracking-tight text-white sm:text-[3.4rem] md:text-[4.2rem]">
                中港熊戰棒球隊
              </h1>
              <p class="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-200 md:text-base">
                {{ greetingText }} 這裡是球隊後台大廳，掌握近期賽程、行政進度與最新公告。
              </p>
            </div>

            <div data-test="hero-weather-panel-desktop" class="mt-5 hidden max-w-full md:block">
              <section data-test="today-weather-card" class="flex w-full justify-start">
                <div
                  v-if="weatherStatus === 'loading'"
                  class="today-weather-card today-weather-card--loading weather-card-enter max-w-full"
                >
                  <div class="today-weather-icon-skeleton weather-shimmer"></div>
                  <div class="min-w-0 flex-1">
                    <div class="today-weather-line today-weather-line-lg weather-shimmer w-[3.4rem]"></div>
                    <div class="today-weather-line weather-shimmer mt-2 w-full max-w-[14rem]"></div>
                  </div>
                </div>

                <div
                  v-else
                  class="today-weather-card weather-card-enter max-w-full"
                >
                  <div class="today-weather-title">TODAY WEATHER</div>
                  <div class="today-weather-main">
                    <div
                      class="today-weather-icon-wrap weather-icon-float"
                      :style="weatherIconStyle"
                    >
                      <div
                        v-if="weatherEffect !== 'none'"
                        class="weather-effect-layer"
                        aria-hidden="true"
                      >
                        <template v-if="weatherEffect === 'sunny'">
                          <span class="weather-sun-ring"></span>
                          <span
                            v-for="(rotation, index) in SUNNY_RAY_ROTATIONS"
                            :key="rotation"
                            class="weather-sun-ray"
                            :style="{ '--ray-rotate': rotation, '--ray-delay': `${index * 120}ms` }"
                          ></span>
                        </template>

                        <template v-else-if="weatherEffect === 'partly-cloudy'">
                          <span class="weather-sun-ring weather-sun-ring-soft"></span>
                          <span
                            v-for="(rotation, index) in PARTLY_CLOUDY_RAY_ROTATIONS"
                            :key="rotation"
                            class="weather-sun-ray weather-sun-ray-soft"
                            :style="{ '--ray-rotate': rotation, '--ray-delay': `${index * 160}ms` }"
                          ></span>
                          <span class="weather-cloud-band weather-cloud-band-soft weather-cloud-band-top"></span>
                        </template>

                        <template v-else-if="weatherEffect === 'rain'">
                          <span
                            v-for="drop in RAIN_DROP_STYLES"
                            :key="drop.id"
                            class="weather-rain-drop"
                            :style="drop.style"
                          ></span>
                        </template>

                        <template v-else-if="weatherEffect === 'thunder'">
                          <span class="weather-thunder-flash"></span>
                          <span class="weather-thunder-strike"></span>
                        </template>

                        <template v-else-if="weatherEffect === 'cloudy'">
                          <span class="weather-cloud-band weather-cloud-band-top"></span>
                          <span class="weather-cloud-band weather-cloud-band-bottom"></span>
                        </template>
                      </div>

                      <el-icon class="weather-icon-foreground weather-icon-glow text-[1.45rem]">
                        <component :is="currentWeatherIcon" />
                      </el-icon>
                    </div>

                    <div class="min-w-0 flex-1 text-white">
                      <div class="today-weather-summary">{{ weatherStatus === 'success' ? weatherCard.summary : '天氣暫時無法取得' }}</div>
                      <div class="today-weather-temperature">{{ weatherCard.temperature }}</div>
                      <div class="today-weather-range">{{ weatherCard.range }}</div>
                    </div>
                  </div>

                  <div class="today-weather-detail min-w-0 truncate">降雨 {{ Math.round(weatherState.rainProbability ?? DEFAULT_WEATHER_RAIN) }}% {{ weatherLocationDetail }}</div>
                  <div class="today-weather-detail">{{ weatherCard.wind }}</div>
                </div>
              </section>
            </div>

            <div class="mt-4 flex items-end justify-between gap-3 md:hidden">
              <div data-test="hero-weather-panel" class="min-w-0 flex-1">
                <section data-test="today-weather-card" class="flex w-full justify-start">
                  <div
                    v-if="weatherStatus === 'loading'"
                    class="today-weather-card today-weather-card--loading weather-card-enter max-w-full"
                  >
                    <div class="today-weather-icon-skeleton weather-shimmer"></div>
                    <div class="min-w-0 flex-1">
                      <div class="today-weather-line today-weather-line-lg weather-shimmer w-[3.4rem]"></div>
                      <div class="today-weather-line weather-shimmer mt-2 w-full max-w-[14rem]"></div>
                    </div>
                  </div>

                  <div
                    v-else
                    class="today-weather-card weather-card-enter max-w-full"
                  >
                    <div class="today-weather-title">TODAY WEATHER</div>
                    <div class="today-weather-main">
                      <div
                        class="today-weather-icon-wrap weather-icon-float"
                        :style="weatherIconStyle"
                      >
                        <div
                          v-if="weatherEffect !== 'none'"
                          class="weather-effect-layer"
                          aria-hidden="true"
                        >
                          <template v-if="weatherEffect === 'sunny'">
                            <span class="weather-sun-ring"></span>
                            <span
                              v-for="(rotation, index) in SUNNY_RAY_ROTATIONS"
                              :key="rotation"
                              class="weather-sun-ray"
                              :style="{ '--ray-rotate': rotation, '--ray-delay': `${index * 120}ms` }"
                            ></span>
                          </template>

                          <template v-else-if="weatherEffect === 'partly-cloudy'">
                            <span class="weather-sun-ring weather-sun-ring-soft"></span>
                            <span
                              v-for="(rotation, index) in PARTLY_CLOUDY_RAY_ROTATIONS"
                              :key="rotation"
                              class="weather-sun-ray weather-sun-ray-soft"
                              :style="{ '--ray-rotate': rotation, '--ray-delay': `${index * 160}ms` }"
                            ></span>
                            <span class="weather-cloud-band weather-cloud-band-soft weather-cloud-band-top"></span>
                          </template>

                          <template v-else-if="weatherEffect === 'rain'">
                            <span
                              v-for="drop in RAIN_DROP_STYLES"
                              :key="drop.id"
                              class="weather-rain-drop"
                              :style="drop.style"
                            ></span>
                          </template>

                          <template v-else-if="weatherEffect === 'thunder'">
                            <span class="weather-thunder-flash"></span>
                            <span class="weather-thunder-strike"></span>
                          </template>

                          <template v-else-if="weatherEffect === 'cloudy'">
                            <span class="weather-cloud-band weather-cloud-band-top"></span>
                            <span class="weather-cloud-band weather-cloud-band-bottom"></span>
                          </template>
                        </div>

                        <el-icon class="weather-icon-foreground weather-icon-glow text-[1.45rem]">
                          <component :is="currentWeatherIcon" />
                        </el-icon>
                      </div>

                      <div class="min-w-0 flex-1 text-white">
                        <div class="today-weather-summary">{{ weatherStatus === 'success' ? weatherCard.summary : '天氣暫時無法取得' }}</div>
                        <div class="today-weather-temperature">{{ weatherCard.temperature }}</div>
                        <div class="today-weather-range">{{ weatherCard.range }}</div>
                      </div>
                    </div>

                    <div class="today-weather-detail min-w-0 truncate">降雨 {{ Math.round(weatherState.rainProbability ?? DEFAULT_WEATHER_RAIN) }}% {{ weatherLocationDetail }}</div>
                    <div class="today-weather-detail">{{ weatherCard.wind }}</div>
                  </div>
                </section>
              </div>

              <div class="flex shrink-0 items-center gap-3 self-end">
                <a
                  href="https://www.facebook.com/groups/203206672887263"
                  target="_blank"
                  rel="noreferrer"
                  class="hero-social-link hero-social-link--facebook"
                  title="Facebook 社群"
                >
                  <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/></svg>
                </a>
                <a
                  href="https://www.instagram.com/reel/DWIbtw4EZ55/"
                  target="_blank"
                  rel="noreferrer"
                  class="hero-social-link hero-social-link--instagram"
                  title="Instagram 最新動態"
                >
                  <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect>
                    <circle cx="12" cy="12" r="4"></circle>
                    <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none"></circle>
                  </svg>
                </a>
              </div>
            </div>

            <div v-if="canViewMatches" data-test="hero-action-panel" class="mt-3 w-full md:hidden">
              <button
                type="button"
                class="hero-cta-button flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-none transition-all hover:-translate-y-0.5 hover:bg-[#e29b34]"
                @click="handleHeroAction"
              >
                {{ heroMatch ? '詳細資訊' : '查看賽程' }}
                <el-icon><ArrowRight /></el-icon>
              </button>
            </div>
          </div>

          <div class="hidden w-full flex-col gap-4 md:flex md:w-auto md:min-w-[220px] md:max-w-[280px] md:items-end md:justify-end md:self-end">
            <div data-test="hero-social-links" class="flex items-center gap-3 self-end">
              <a
                href="https://www.facebook.com/groups/203206672887263"
                target="_blank"
                rel="noreferrer"
                class="hero-social-link hero-social-link--facebook"
                title="Facebook 社群"
              >
                <svg class="h-[1.35rem] w-[1.35rem]" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/></svg>
              </a>
              <a
                href="https://www.instagram.com/reel/DWIbtw4EZ55/"
                target="_blank"
                rel="noreferrer"
                class="hero-social-link hero-social-link--instagram"
                title="Instagram 最新動態"
              >
                <svg class="h-[1.15rem] w-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect>
                  <circle cx="12" cy="12" r="4"></circle>
                  <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none"></circle>
                </svg>
              </a>
            </div>

            <div v-if="canViewMatches" data-test="hero-action-panel" class="w-full md:w-auto">
              <button
                type="button"
                class="hero-cta-button flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-none transition-all hover:-translate-y-0.5 hover:bg-[#e29b34] md:min-w-[220px] md:px-8 md:py-4"
                @click="handleHeroAction"
              >
                {{ heroMatch ? '詳細資訊' : '查看賽程' }}
                <el-icon><ArrowRight /></el-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <MyHomeTodayPanel
      v-if="shouldShowMyHomePanel"
      v-model:selected-member-id="selectedMyHomeMemberId"
      :snapshot="myHomeSnapshot"
      :is-loading="isMyHomeLoading"
      :error-message="myHomeError"
      :weather="myHomeWeatherCard"
      @refresh="fetchMyHomeSnapshotData"
    />

    <section
      v-if="canViewFees"
      data-test="dashboard-fee-reminders"
      class="mx-auto mt-6 w-full max-w-7xl px-3 sm:px-4"
    >
      <FeeManagementReminderPanel />
    </section>

    <section v-if="isAdmin" data-test="admin-stats" class="mx-auto mt-6 w-full max-w-7xl px-3 sm:px-4">
      <div class="grid gap-4 md:grid-cols-2">
        <article class="dashboard-card p-5 md:p-6">
          <div class="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">Team Members</div>
          <div data-test="team-members-total" class="mt-3 flex items-end gap-2 text-[3.25rem] font-black leading-[0.88] text-slate-950 sm:text-[3.75rem] md:text-[4.15rem]">
            {{ stats.totalMembers }}
            <span class="pb-1 text-[1.4rem] font-bold leading-none text-slate-400 sm:text-[1.7rem] md:text-[2rem]">人</span>
          </div>
          <div class="mt-5 flex flex-wrap gap-3 text-sm font-semibold text-slate-500 sm:text-[15px]">
            <span data-test="school-team-count" class="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full bg-white/85 px-3 py-1.5 shadow-sm shadow-slate-200/70">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-[#60a5fa]"></span>
              校隊 {{ stats.schoolTeamMembers }}
            </span>
            <span data-test="community-members-count" class="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full bg-white/85 px-3 py-1.5 shadow-sm shadow-slate-200/70">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-[#22c55e]"></span>
              社區 {{ stats.communityMembers }}
            </span>
            <span data-test="coach-members-count" class="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full bg-white/85 px-3 py-1.5 shadow-sm shadow-slate-200/70">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f59e0b]"></span>
              教練 {{ stats.coachMembers }}
            </span>
          </div>
        </article>

        <article class="dashboard-card p-5 md:p-6">
          <div class="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">Today Leaves</div>
          <div data-test="today-leaves-total" class="mt-3 flex items-end gap-2 text-[3.25rem] font-black leading-[0.88] text-[#ef4444] sm:text-[3.75rem] md:text-[4.15rem]">
            {{ stats.todayLeaves }}
            <span class="pb-1 text-[1.4rem] font-bold leading-none text-slate-400 sm:text-[1.7rem] md:text-[2rem]">人</span>
          </div>
          <p class="mt-5 text-sm font-semibold leading-6 text-slate-500">
            含請假系統與今日點名，同一成員重疊只計 1 人，方便管理者快速掌握出勤狀況。
          </p>
          <div class="mt-4 flex flex-wrap gap-2 text-xs font-black text-slate-500 sm:text-sm">
            <span data-test="today-leave-requests-count" class="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-red-600">
              請假系統 {{ stats.todayLeaveRequests }}
            </span>
            <span data-test="today-attendance-leaves-count" class="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-blue-600">
              今日點名 {{ stats.todayAttendanceLeaves }}
            </span>
            <span data-test="today-attendance-events-count" class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
              點名單 {{ stats.todayAttendanceEvents }}
            </span>
          </div>
          <router-link
            to="/attendance"
            data-test="today-attendance-link"
            class="mt-5 inline-flex text-sm font-black text-primary transition-colors hover:text-[#b87515]"
          >
            查看今天點名 +
          </router-link>
        </article>
      </div>
    </section>

    <section data-test="equipment-addons-section" class="mx-auto mt-8 w-full max-w-7xl px-3 sm:px-4">
      <div class="flex flex-col gap-3 border-b-[5px] border-primary pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 class="section-title text-slate-900">裝備加購 <span class="section-subtitle">ADD-ONS</span></h2>
          <p class="mt-1 text-sm font-semibold text-slate-500">開放中的球隊裝備與商品，可以直接前往加購申請。</p>
        </div>
        <button
          type="button"
          data-test="equipment-addons-link"
          class="self-start text-sm font-black text-primary transition-colors hover:text-[#b87515] sm:self-auto"
          @click="openEquipmentAddons"
        >
          前往加購 +
        </button>
      </div>

      <button
        type="button"
        class="addon-showcase-card group mt-4 w-full text-left"
        :disabled="isEquipmentAddonLoading"
        @click="openEquipmentAddons"
      >
        <div class="grid min-h-[18rem] gap-0 lg:grid-cols-[minmax(280px,0.42fr)_minmax(0,0.58fr)]">
          <div class="relative min-h-[15rem] overflow-hidden bg-slate-900">
            <img
              v-if="featuredAddonEquipment?.image_url"
              :src="featuredAddonEquipment.image_url"
              :alt="featuredAddonEquipment.name"
              class="h-full min-h-[15rem] w-full object-cover transition-transform duration-700 group-hover:scale-105"
              draggable="false"
            />
            <div
              v-else
              class="flex h-full min-h-[15rem] w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(216,143,34,0.34),transparent_38%),linear-gradient(135deg,#0f172a_0%,#334155_100%)] text-white"
            >
              <el-icon class="text-[5rem] text-white/80"><Goods /></el-icon>
            </div>
            <div class="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent"></div>
            <div class="absolute bottom-4 left-4 rounded bg-primary px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
              {{ availableAddonEquipments.length > 0 ? `${availableAddonEquipments.length} 項可加購` : '裝備加購' }}
            </div>
          </div>

          <div class="flex min-w-0 flex-col justify-between p-5 sm:p-6">
            <div>
              <div class="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                <el-icon><ShoppingCart /></el-icon>
                家長加購入口
              </div>
              <h3 class="mt-4 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                {{ featuredAddonEquipment?.name || '裝備加購申請' }}
              </h3>
              <p class="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-slate-500">
                {{ featuredAddonEquipment?.specs || featuredAddonEquipment?.notes || '查看目前開放申請的裝備商品，送出後由管理員審核與備貨。' }}
              </p>

              <div v-if="isEquipmentAddonLoading" class="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400">
                讀取加購商品中...
              </div>

              <div v-else-if="addonPreviewEquipments.length > 0" class="mt-5 grid gap-2 sm:grid-cols-2">
                <div
                  v-for="equipment in addonPreviewEquipments"
                  :key="equipment.id"
                  class="flex min-w-0 items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0 sm:last:border-b"
                >
                  <div class="min-w-0">
                    <div class="truncate text-sm font-black text-slate-800">{{ equipment.name }}</div>
                    <div class="mt-1 text-xs font-bold text-slate-400">{{ getAddonAvailabilityLabel(equipment) }}</div>
                  </div>
                  <div class="shrink-0 text-sm font-black text-primary">{{ formatCurrency(equipment.purchase_price) }}</div>
                </div>
              </div>

              <div v-else class="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400">
                目前沒有開放加購商品，之後有新品會顯示在這裡。
              </div>
            </div>

            <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span class="text-xs font-bold text-slate-400">點擊區塊即可進入裝備加購</span>
              <span class="inline-flex items-center justify-center gap-2 rounded-sm bg-slate-900 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white">
                開始加購
                <el-icon><ArrowRight /></el-icon>
              </span>
            </div>
          </div>
        </div>
      </button>
    </section>

    <section class="mx-auto mt-8 w-full max-w-7xl px-3 sm:px-4">
      <div v-if="canViewMatches" class="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        <div data-test="upcoming-section" class="flex flex-col gap-4">
          <div class="flex items-end justify-between border-b-[5px] border-primary pb-2">
            <div>
              <h2 class="section-title text-slate-900">近期賽程 <span class="section-subtitle">UPCOMING</span></h2>
            </div>
            <router-link
              to="/match-records"
              class="text-sm font-black text-primary transition-colors hover:text-[#b87515]"
            >
              全部賽程 +
            </router-link>
          </div>

          <div v-if="upcomingMatches.length > 0" class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              v-for="match in upcomingMatches"
              :key="match.id"
              type="button"
              class="match-card"
              @click="openMatchDetail(match.id)"
            >
              <div class="match-card-date">
                <span class="match-card-month">{{ formatDashboardMatchMonth(match.match_date) }}</span>
                <span class="match-card-day">{{ formatDashboardMatchDay(match.match_date) }}</span>
                <span
                  v-if="match.category_group"
                  class="mt-1 inline-flex rounded bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white"
                >
                  {{ match.category_group }}
                </span>
              </div>

              <div class="min-w-0 flex-1 pr-2 text-left">
                <div class="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Upcoming</div>
                <div class="mt-1 text-base font-black text-slate-900">{{ TEAM_LABEL }}</div>
                <div class="mt-1 line-clamp-1 text-sm font-bold text-slate-600">{{ getDisplayOpponent(match) }}</div>
                <div class="mt-2 text-xs font-semibold text-slate-400">{{ getUpcomingMetaLabel(match) }}</div>
                <div class="mt-1 line-clamp-1 text-xs font-semibold text-slate-400">{{ getMatchLocationLabel(match) }}</div>
              </div>

              <div class="flex min-w-[68px] flex-col items-center justify-center border-l border-slate-100 pl-3 text-slate-300">
                <span
                  v-if="isDashboardMatchInProgress(match, now)"
                  class="mb-1 rounded bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-red-600"
                >
                  Live
                </span>
                <el-icon class="text-lg"><ArrowRight /></el-icon>
              </div>
            </button>
          </div>

          <div
            v-else
            class="rounded-[1.5rem] border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm font-bold text-slate-400"
          >
            目前沒有未來賽事
          </div>
        </div>

        <div data-test="recent-section" class="flex flex-col gap-4">
          <div class="flex items-end justify-between border-b-[5px] border-slate-900 pb-2">
            <div>
              <h2 class="section-title text-slate-900">過往戰績 <span class="section-subtitle">RESULTS</span></h2>
            </div>
            <router-link
              to="/match-records"
              class="text-sm font-black text-slate-500 transition-colors hover:text-slate-900"
            >
              戰績紀錄 +
            </router-link>
          </div>

          <div v-if="recentMatches.length > 0" class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              v-for="match in recentMatches"
              :key="match.id"
              type="button"
              class="match-card"
              @click="openMatchDetail(match.id)"
            >
              <div class="match-card-date">
                <span class="match-card-month">{{ formatDashboardMatchMonth(match.match_date) }}</span>
                <span class="match-card-day">{{ formatDashboardMatchDay(match.match_date) }}</span>
                <span
                  v-if="match.category_group"
                  class="mt-1 inline-flex rounded bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white"
                >
                  {{ match.category_group }}
                </span>
              </div>

              <div class="min-w-0 flex-1 pr-3 text-left">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate text-base font-black text-slate-900">{{ TEAM_LABEL }}</span>
                  <span class="text-xl font-black text-slate-900">{{ match.home_score }}</span>
                </div>
                <div class="mt-1 flex items-center justify-between gap-3">
                  <span class="truncate text-sm font-bold text-slate-500">{{ getDisplayOpponent(match) }}</span>
                  <span class="text-lg font-black text-slate-500">{{ match.opponent_score }}</span>
                </div>
              </div>

              <div class="min-w-[66px] border-l border-slate-100 pl-3 text-center">
                <div class="text-xl font-black" :class="getRecentResultToneClass(match)">
                  {{ getDashboardMatchResultMeta(match.home_score, match.opponent_score).label }}
                </div>
                <div class="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">Result</div>
              </div>
            </button>
          </div>

          <div
            v-else
            class="rounded-[1.5rem] border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm font-bold text-slate-400"
          >
            目前沒有過往戰績
          </div>
        </div>
      </div>

      <div
        v-if="canViewAnnouncements"
        data-test="news-section"
        class="mt-12 flex flex-col gap-4"
        :class="{ 'mt-0': !canViewMatches }"
      >
        <div class="flex items-end justify-between border-b-[5px] border-slate-900 pb-2">
          <div>
            <h2 class="section-title text-slate-900">最新消息 <span class="section-subtitle">LATEST NEWS</span></h2>
          </div>
          <button
            type="button"
            class="text-sm font-black text-slate-500 transition-colors hover:text-slate-900"
            @click="openAnnouncements"
          >
            更多公告 +
          </button>
        </div>

        <div v-if="featuredAnnouncement" class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <button
            type="button"
            class="announcement-feature-card"
            @click="openAnnouncements"
          >
            <div class="announcement-feature-media">
              <img
                v-if="featuredAnnouncement.imageUrl"
                :src="featuredAnnouncement.imageUrl"
                class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                alt="公告封面"
              />
              <div v-else class="announcement-feature-fallback"></div>
              <div class="announcement-feature-overlay"></div>
              <span
                class="absolute bottom-4 left-4 z-20 rounded-sm px-3 py-1 text-xs font-black uppercase tracking-[0.16em]"
                :class="featuredAnnouncement.isPinned ? 'bg-red-500 text-white' : 'bg-primary text-white'"
              >
                {{ featuredAnnouncement.isPinned ? '置頂公告' : '最新公告' }}
              </span>
            </div>

            <div class="flex flex-1 flex-col p-6 text-left">
              <div class="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                {{ formatAnnouncementDate(featuredAnnouncement.createdAt) }}
              </div>
              <h3 class="mt-3 text-[1.55rem] font-black leading-tight text-slate-900">
                {{ featuredAnnouncement.title }}
              </h3>
              <p class="mt-3 line-clamp-3 text-sm font-medium leading-7 text-slate-500">
                {{ featuredAnnouncement.content || '點擊查看完整公告內容。' }}
              </p>
            </div>
          </button>

          <div class="flex flex-col gap-4" v-if="supportingAnnouncements.length > 0">
            <button
              v-for="announcement in supportingAnnouncements"
              :key="announcement.id"
              type="button"
              class="announcement-side-card"
              @click="openAnnouncements"
            >
              <div class="announcement-side-media">
                <img
                  v-if="announcement.imageUrl"
                  :src="announcement.imageUrl"
                  class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt="公告封面"
                />
                <div v-else class="announcement-side-fallback"></div>
              </div>

              <div class="min-w-0 flex-1 p-4 text-left">
                <div class="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {{ formatAnnouncementDate(announcement.createdAt) }}
                </div>
                <h3 class="mt-2 line-clamp-2 text-lg font-black leading-snug text-slate-900">
                  {{ announcement.title }}
                </h3>
                <p class="mt-2 line-clamp-2 text-sm font-medium text-slate-500">
                  {{ announcement.content || '點擊查看完整公告內容。' }}
                </p>
              </div>
            </button>
          </div>
        </div>

        <div
          v-else
          class="rounded-[1.5rem] border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm font-bold text-slate-400"
        >
          目前沒有最新系統公告
        </div>
      </div>
    </section>

    <MatchDetailDialog
      v-model="detailVisible"
      :match-id="selectedMatchId"
      :readonly="true"
    />
  </div>
</template>

<style scoped>
.hero-title {
  text-shadow: 0 14px 30px rgba(15, 23, 42, 0.45);
}

.hero-match-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.08em 0.26em;
  font-size: clamp(2.15rem, 4vw, 4.7rem);
  text-wrap: balance;
}

.hero-match-name,
.hero-match-opponent {
  white-space: nowrap;
}

.hero-match-vs {
  font-size: 0.78em;
  line-height: 0.9;
}

.hero-social-link {
  display: inline-flex;
  height: 36px;
  width: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.58);
  color: #e2e8f0;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(12px);
  transition: transform 0.2s ease, background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.hero-social-link:hover {
  transform: translateY(-2px);
  color: #ffffff;
}

.hero-social-link--facebook:hover {
  border-color: #1877f2;
  background: #1877f2;
}

.hero-social-link--instagram:hover {
  border-color: rgba(225, 48, 108, 0.82);
  background: linear-gradient(135deg, #feda75 0%, #fa7e1e 32%, #d62976 66%, #962fbf 100%);
}

.hero-cta-button {
  box-shadow: none !important;
}

.hero-weather-card {
  background:
    radial-gradient(circle at top left, rgba(148, 163, 184, 0.18), transparent 38%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.94) 0%, rgba(30, 41, 59, 0.82) 100%);
}

.today-weather-card {
  display: flex;
  width: min(100%, 24rem);
  align-items: center;
  gap: 0.65rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(18, 29, 52, 0.96) 0%, rgba(42, 49, 78, 0.92) 100%);
  border-radius: 9999px;
  padding: 0.48rem 0.8rem;
  color: #ffffff;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(12px);
}

.today-weather-card--loading {
  min-height: 3.15rem;
}

.today-weather-title,
.today-weather-range,
.today-weather-detail:last-of-type {
  display: none;
}

.today-weather-main {
  margin-top: 0;
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.65rem;
}

.today-weather-main > .min-w-0 {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.18rem 0.45rem;
}

.today-weather-summary {
  order: 2;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.9);
}

.today-weather-temperature {
  order: 1;
  margin-top: 0;
  font-size: 1.55rem;
  font-weight: 900;
  line-height: 1;
  color: #ffffff;
}

.today-weather-detail {
  position: relative;
  margin-top: 0;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.88);
}

.today-weather-detail:first-of-type::before {
  content: '/';
  margin-right: 0.45rem;
  color: rgba(255, 255, 255, 0.45);
}

.today-weather-copy {
  min-width: 0;
  flex: 1;
}

.today-weather-inline {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.18rem 0.45rem;
}

.today-weather-divider {
  color: rgba(255, 255, 255, 0.45);
}

.today-weather-location {
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.82);
}

.today-weather-icon-wrap {
  position: relative;
  display: flex;
  height: 2.2rem;
  width: 2.2rem;
  flex: none;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  overflow: hidden;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.12) 0%, rgba(15, 23, 42, 0) 72%);
}

.today-weather-icon-skeleton {
  height: 2rem;
  width: 2rem;
  flex: none;
  border-radius: 999px;
}

.today-weather-line {
  height: 0.72rem;
  width: 100%;
  border-radius: 999px;
}

.today-weather-line-lg {
  height: 1rem;
}

.weather-card-enter {
  animation: weather-card-enter 460ms cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: left center;
  will-change: transform, opacity;
}

.weather-shimmer {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.18) 50%, rgba(255, 255, 255, 0.08) 100%);
  background-size: 200% 100%;
  animation: weather-shimmer 1.25s linear infinite;
}

.dashboard-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at top left, rgba(216, 143, 34, 0.08), transparent 34%),
    linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);
  box-shadow:
    0 18px 34px rgba(15, 23, 42, 0.07),
    0 2px 4px rgba(15, 23, 42, 0.03);
}

.addon-showcase-card {
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1.35rem;
  background: #ffffff;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.07);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.addon-showcase-card:hover:not(:disabled) {
  transform: translateY(-3px);
  border-color: rgba(216, 143, 34, 0.4);
  box-shadow: 0 18px 34px rgba(15, 23, 42, 0.11);
}

.addon-showcase-card:disabled {
  cursor: progress;
  opacity: 0.82;
}

.section-title {
  font-size: 1.8rem;
  font-weight: 900;
  font-style: italic;
  letter-spacing: 0.02em;
}

.section-subtitle {
  margin-left: 0.45rem;
  font-size: 0.72rem;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #64748b;
}

.match-card {
  display: flex;
  align-items: center;
  border: 2px solid #e5edf7;
  border-radius: 1rem;
  background: #ffffff;
  padding: 1rem 1.15rem;
  text-align: left;
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.06);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.match-card:hover {
  transform: translateY(-2px);
  border-color: #cbd5e1;
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.1);
}

.match-card-date {
  margin-right: 1rem;
  display: flex;
  min-width: 4.25rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 2px solid #eef2f7;
  padding-right: 1rem;
}

.match-card-month {
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0.22em;
  color: #94a3b8;
}

.match-card-day {
  font-size: 2rem;
  line-height: 1;
  font-weight: 900;
  color: #0f172a;
}

.announcement-feature-card,
.announcement-side-card {
  display: flex;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 1.35rem;
  background: #ffffff;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.07);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.announcement-feature-card:hover,
.announcement-side-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.1);
}

.announcement-feature-card {
  flex-direction: column;
}

.announcement-feature-media {
  position: relative;
  height: 18rem;
  overflow: hidden;
  background: #0f172a;
}

.announcement-feature-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0.08) 100%);
}

.announcement-feature-fallback {
  height: 100%;
  width: 100%;
  background:
    radial-gradient(circle at top left, rgba(216, 143, 34, 0.28), transparent 38%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 41, 59, 0.85) 100%);
}

.announcement-side-card {
  min-height: 9.5rem;
}

.announcement-side-media {
  position: relative;
  width: 32%;
  min-width: 8rem;
  overflow: hidden;
  background: #0f172a;
}

.announcement-side-fallback {
  height: 100%;
  width: 100%;
  background:
    radial-gradient(circle at top left, rgba(216, 143, 34, 0.22), transparent 34%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(51, 65, 85, 0.78) 100%);
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

.weather-icon-float {
  animation: weather-icon-float 3.6s ease-in-out infinite;
  will-change: transform;
}

.weather-effect-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.weather-effect-layer span {
  position: absolute;
  display: block;
}

.weather-icon-foreground {
  position: relative;
  z-index: 1;
}

.weather-icon-glow {
  color: inherit;
  filter: drop-shadow(0 0 8px var(--weather-icon-glow-color, rgba(255, 255, 255, 0.12)));
}

.weather-sun-ring {
  inset: 22%;
  border-radius: 9999px;
  border: 1px solid rgba(254, 243, 199, 0.72);
  box-shadow: 0 0 14px rgba(252, 211, 77, 0.34);
  animation: weather-sun-pulse 2.6s ease-in-out infinite;
}

.weather-sun-ring-soft {
  inset: 28%;
  opacity: 0.78;
  box-shadow: 0 0 12px rgba(252, 211, 77, 0.28);
}

.weather-sun-ray {
  left: 50%;
  top: 50%;
  width: 2px;
  height: 9px;
  border-radius: 9999px;
  background: linear-gradient(180deg, rgba(254, 243, 199, 0) 0%, rgba(254, 243, 199, 0.96) 100%);
  opacity: 0.76;
  animation: weather-sun-ray-pulse 2.6s ease-in-out infinite;
  animation-delay: var(--ray-delay, 0ms);
}

.weather-sun-ray-soft {
  height: 8px;
  opacity: 0.62;
}

.weather-rain-drop {
  top: -18%;
  left: var(--drop-left);
  width: 2px;
  height: 10px;
  border-radius: 9999px;
  background: linear-gradient(180deg, rgba(191, 219, 254, 0) 0%, rgba(191, 219, 254, 0.95) 100%);
  opacity: 0;
  transform: rotate(12deg) translate3d(0, -8px, 0);
  animation: weather-raindrop-fall var(--drop-duration, 1.3s) linear infinite;
  animation-delay: var(--drop-delay, 0ms);
}

.weather-thunder-flash {
  inset: 0;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(250, 232, 255, 0.55) 0%, rgba(196, 181, 253, 0.2) 38%, rgba(15, 23, 42, 0) 72%);
  opacity: 0.08;
  animation: weather-thunder-flash 2.8s linear infinite;
}

.weather-thunder-strike {
  left: 52%;
  top: 14%;
  width: 12px;
  height: 22px;
  background: linear-gradient(180deg, rgba(254, 249, 195, 0.98) 0%, rgba(250, 204, 21, 0.92) 100%);
  clip-path: polygon(52% 0, 100% 0, 62% 38%, 82% 38%, 30% 100%, 42% 58%, 16% 58%);
  filter: drop-shadow(0 0 8px rgba(250, 204, 21, 0.4));
  opacity: 0.12;
  transform: translateX(-50%) scale(0.82) rotate(-4deg);
  animation: weather-thunder-strike 2.8s ease-in-out infinite;
}

.weather-cloud-band {
  height: 8px;
  border-radius: 9999px;
  background: rgba(226, 232, 240, 0.18);
  box-shadow: 7px -1px 0 1px rgba(226, 232, 240, 0.16), -6px 1px 0 0 rgba(226, 232, 240, 0.13);
  opacity: 0.88;
}

.weather-cloud-band-soft {
  opacity: 0.7;
}

.weather-cloud-band-top {
  top: 30%;
  left: -28%;
  width: 16px;
  animation: weather-cloud-drift 5.8s ease-in-out infinite;
}

.weather-cloud-band-bottom {
  top: 56%;
  right: -30%;
  width: 18px;
  animation: weather-cloud-drift-reverse 6.4s ease-in-out infinite;
}

.animate-home-fade {
  animation: homeFadeIn 0.45s ease-out;
}

@keyframes weather-card-enter {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.985);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes weather-shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}

@keyframes weather-icon-float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-2px);
  }
}

@keyframes weather-sun-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.82);
  }

  50% {
    opacity: 0.96;
    transform: scale(1.08);
  }
}

@keyframes weather-sun-ray-pulse {
  0%,
  100% {
    opacity: 0.38;
    transform: translate(-50%, -50%) rotate(var(--ray-rotate)) translateY(-12px) scaleY(0.72);
  }

  50% {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--ray-rotate)) translateY(-15px) scaleY(1.08);
  }
}

@keyframes weather-raindrop-fall {
  0% {
    opacity: 0;
    transform: rotate(12deg) translate3d(0, -8px, 0) scaleY(0.82);
  }

  18% {
    opacity: 0.92;
  }

  100% {
    opacity: 0;
    transform: rotate(12deg) translate3d(-3px, 32px, 0) scaleY(1.1);
  }
}

@keyframes weather-thunder-flash {
  0%,
  42%,
  100% {
    opacity: 0.06;
    transform: scale(0.9);
  }

  46% {
    opacity: 0.94;
    transform: scale(1.08);
  }

  51% {
    opacity: 0.24;
  }

  56% {
    opacity: 0.76;
    transform: scale(1.02);
  }
}

@keyframes weather-thunder-strike {
  0%,
  42%,
  100% {
    opacity: 0.12;
    transform: translateX(-50%) scale(0.82) rotate(-4deg);
  }

  46% {
    opacity: 1;
    transform: translateX(-50%) scale(1.06) rotate(2deg);
  }

  56% {
    opacity: 0.2;
    transform: translateX(-50%) scale(0.9) rotate(-2deg);
  }
}

@keyframes weather-cloud-drift {
  0%,
  100% {
    transform: translateX(0) translateY(0);
  }

  50% {
    transform: translateX(34px) translateY(1px);
  }
}

@keyframes weather-cloud-drift-reverse {
  0%,
  100% {
    transform: translateX(0) translateY(0);
  }

  50% {
    transform: translateX(-34px) translateY(-1px);
  }
}

@keyframes homeFadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 767px) {
  .section-title {
    font-size: 1.55rem;
  }

  .announcement-feature-media {
    height: 15rem;
  }

  .today-weather-card {
    width: 100%;
    max-width: 100%;
    gap: 0.55rem;
    padding: 0.42rem 0.72rem;
  }

  .today-weather-temperature {
    font-size: 1.32rem;
  }

  .today-weather-summary,
  .today-weather-detail,
  .today-weather-location {
    font-size: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .weather-card-enter,
  .weather-icon-float,
  .weather-effect-layer span,
  .weather-shimmer {
    animation: none;
  }
}
</style>
