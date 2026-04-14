<template>
  <div class="relative animate-fade-in p-3 pb-5 md:p-6">
    <div class="mx-auto max-w-7xl space-y-5 md:space-y-6">
      <section
        class="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(216,143,34,0.20),_transparent_38%),linear-gradient(135deg,_#fffaf1_0%,_#ffffff_45%,_#f7fafc_100%)] shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
      >
        <div class="grid gap-6 px-5 py-6 md:grid-cols-[1.4fr_0.9fr] md:px-8 md:py-8">
          <div class="space-y-5">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <div
                  class="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-extrabold tracking-wide text-amber-700"
                >
                  <span class="h-2 w-2 rounded-full bg-amber-500"></span>
                  社區棒球營運大廳
                </div>
                <div
                  :class="roleBadgeClass"
                  class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-extrabold tracking-wide"
                >
                  {{ roleLabel }}
                </div>
              </div>
              <h2 class="text-3xl font-black tracking-tight text-slate-800 md:text-4xl">
                {{ greetingText }}
              </h2>
              <p class="max-w-2xl text-sm font-medium leading-6 text-slate-500 md:text-base">
                今天先掌握球隊動態、待處理事項與本週行程，重要資訊都集中在這一頁。
              </p>
            </div>

            <div class="rounded-[24px] border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur md:p-5">
              <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div class="space-y-2">
                  <div class="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Dashboard Mode</div>
                  <div class="text-lg font-black text-slate-800 md:text-xl">{{ dashboardModeTitle }}</div>
                  <p class="max-w-xl text-sm font-medium leading-6 text-slate-500">
                    {{ dashboardNarrative }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="chip in priorityChips"
                    :key="chip"
                    class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600"
                  >
                    {{ chip }}
                  </span>
                </div>
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-3">
              <div class="min-h-[132px] rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-orange-50 p-4 shadow-sm">
                <div class="text-xs font-black uppercase tracking-[0.22em] text-red-500">今日重點提醒</div>
                <div class="mt-3 text-base font-black leading-6 text-slate-800">
                  {{ todayReminderTitle }}
                </div>
                <div class="mt-2 text-xs font-medium leading-5 text-slate-500">
                  {{ todayReminderBody }}
                </div>
              </div>

              <div class="min-h-[132px] rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-sm">
                <div class="text-xs font-black uppercase tracking-[0.22em] text-sky-600">天氣提醒</div>
                <div class="mt-3 text-base font-black leading-6 text-slate-800">
                  {{ weatherReminderTitle }}
                </div>
                <div class="mt-2 text-xs font-medium leading-5 text-slate-500">
                  {{ weatherReminderBody }}
                </div>
              </div>

              <div class="min-h-[132px] rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-4 shadow-sm">
                <div class="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">集合資訊</div>
                <div class="mt-3 text-base font-black leading-6 text-slate-800">
                  {{ gatherInfoTitle }}
                </div>
                <div class="mt-2 text-xs font-medium leading-5 text-slate-500">
                  {{ gatherInfoBody }}
                </div>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur">
                <div class="text-xs font-bold uppercase tracking-wide text-slate-400">今天日期</div>
                <div class="mt-2 text-xl font-black text-slate-800">{{ todayLabel }}</div>
                <div class="mt-1 text-xs font-medium text-slate-500">{{ todayWeekday }}</div>
              </div>
              <div class="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur">
                <div class="text-xs font-bold uppercase tracking-wide text-slate-400">今日焦點</div>
                <div class="mt-2 text-xl font-black text-slate-800">{{ heroEventTitle }}</div>
                <div class="mt-1 text-xs font-medium text-slate-500">{{ heroEventSubtitle }}</div>
              </div>
              <div class="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur">
                <div class="text-xs font-bold uppercase tracking-wide text-slate-400">本週節奏</div>
                <div class="mt-2 text-xl font-black text-slate-800">{{ pendingCounts.weeklyEvents }} 場活動</div>
                <div class="mt-1 text-xs font-medium text-slate-500">已安排未來 7 天的球隊行程</div>
              </div>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row">
              <router-link
                v-if="canViewLeaveRequests"
                to="/leave-requests"
                class="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(216,143,34,0.28)] transition-all hover:bg-primary-hover"
              >
                我要請假
              </router-link>
              <router-link
                to="/calendar"
                class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition-all hover:border-primary/40 hover:text-primary"
              >
                查看本週行程
              </router-link>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <div
              v-for="card in focusCards"
              :key="card.title"
              class="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-xs font-bold uppercase tracking-wide text-slate-400">{{ card.title }}</div>
                  <div class="mt-2 text-2xl font-black text-slate-800">{{ card.value }}</div>
                </div>
                <div
                  :class="card.iconClass"
                  class="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black"
                >
                  {{ card.icon }}
                </div>
              </div>
              <div class="mt-2 text-xs font-medium leading-5 text-slate-500">{{ card.description }}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div
          :class="quickSectionClass"
          class="rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]"
        >
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 class="text-lg font-black text-slate-800">快速操作</h3>
              <p class="mt-1 text-xs font-medium text-slate-500">常用入口集中在這裡，直接進到下一步。</p>
            </div>
          </div>
          <div class="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
            <router-link
              v-for="action in quickActions"
              :key="action.key"
              :to="action.to"
              :class="action.surfaceClass"
              class="group min-h-[136px] rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white hover:shadow-md"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-2">
                  <div :class="action.iconClass" class="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-black">
                    {{ action.icon }}
                  </div>
                  <div class="text-sm font-black text-slate-800">{{ action.title }}</div>
                  <div class="text-xs font-medium leading-5 text-slate-500">{{ action.description }}</div>
                </div>
                <div :class="action.badgeClass" class="rounded-xl px-2 py-1 text-[11px] font-extrabold">
                  {{ action.badge }}
                </div>
              </div>
            </router-link>
          </div>
        </div>

        <div
          :class="pendingSectionClass"
          class="rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]"
        >
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 class="text-lg font-black text-slate-800">待處理事項</h3>
              <p class="mt-1 text-xs font-medium text-slate-500">管理上值得優先注意的幾件事。</p>
            </div>
          </div>
          <div class="space-y-3 p-4 sm:p-5">
            <div
              v-for="item in pendingItems"
              :key="item.key"
              :class="item.surfaceClass"
              class="min-h-[108px] rounded-2xl border p-4"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-start gap-3">
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-700 shadow-sm">
                    {{ item.icon }}
                  </div>
                  <div>
                  <div class="text-sm font-black text-slate-800">{{ item.title }}</div>
                  <div class="mt-1 text-xs font-medium text-slate-500">{{ item.description }}</div>
                  </div>
                </div>
                <div :class="item.countClass" class="rounded-2xl px-3 py-1.5 text-sm font-black">
                  {{ item.count }}
                </div>
              </div>
              <router-link
                v-if="item.to"
                :to="item.to"
                class="mt-3 inline-flex items-center text-xs font-black text-primary transition-colors hover:text-primary-hover"
              >
                前往查看
              </router-link>
            </div>
            <div
              v-if="pendingItems.length === 0 && !isLoading"
              class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center"
            >
              <div class="text-base font-black text-slate-700">目前沒有待處理事項</div>
              <div class="mt-2 text-sm font-medium text-slate-500">首頁很乾淨，代表目前節奏穩定。</div>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div class="rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 class="text-lg font-black text-slate-800">本週行程</h3>
              <p class="mt-1 text-xs font-medium text-slate-500">未來 7 天的練習、比賽與活動安排。</p>
            </div>
            <router-link
              v-if="canViewAttendance"
              to="/attendance"
              class="text-xs font-black text-primary hover:text-primary-hover"
            >
              查看更多
            </router-link>
          </div>
          <div class="space-y-3 p-4 sm:p-5">
            <div
              v-for="event in weeklySchedule"
              :key="event.id"
              class="flex min-h-[102px] items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition-colors hover:bg-white"
            >
              <div class="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-slate-900 text-white">
                <div class="text-[11px] font-bold uppercase tracking-wide">{{ monthLabel(event.date) }}</div>
                <div class="text-xl font-black leading-none">{{ dayjs(event.date).format('DD') }}</div>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary">
                    {{ event.event_type || '活動' }}
                  </span>
                  <span class="text-xs font-medium text-slate-400">{{ formatWeekday(event.date) }}</span>
                </div>
                <div class="mt-2 truncate text-sm font-black text-slate-800">
                  {{ event.title || `${event.event_type || '球隊活動'}安排` }}
                </div>
                <div class="mt-1 text-xs font-medium text-slate-500">{{ event.date }}</div>
              </div>
            </div>
            <div
              v-if="weeklySchedule.length === 0 && !isLoading"
              class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-10 text-center"
            >
              <div class="text-base font-black text-slate-700">本週暫無安排活動</div>
              <div class="mt-2 text-sm font-medium text-slate-500">可以趁這個空檔安排練習、測試賽或團隊活動。</div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-6">
          <div
            :class="announcementsSectionClass"
            class="rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]"
          >
            <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 class="text-lg font-black text-slate-800">最新公告</h3>
                <p class="mt-1 text-xs font-medium text-slate-500">重要公告與球隊訊息更新。</p>
              </div>
              <router-link
                v-if="canViewAnnouncements"
                to="/announcements"
                class="text-xs font-black text-primary hover:text-primary-hover"
              >
                全部公告
              </router-link>
            </div>
            <div class="space-y-3 p-4 sm:p-5">
              <div
                v-for="announcement in recentAnnouncements"
                :key="announcement.id"
                class="min-h-[136px] cursor-pointer rounded-2xl border border-slate-100 bg-gradient-to-r from-amber-50/70 via-white to-slate-50 p-4 transition-all hover:border-primary/30 hover:shadow-sm"
                @click="goToAnnouncements"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <span
                      v-if="announcement.is_pinned"
                      class="rounded-full bg-red-500 px-2 py-1 text-[10px] font-black text-white"
                    >
                      置頂
                    </span>
                    <span
                      v-else
                      class="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black text-primary"
                    >
                      公告
                    </span>
                  </div>
                  <span class="text-[11px] font-medium text-slate-400">
                    {{ dayjs(announcement.created_at).format('MM/DD HH:mm') }}
                  </span>
                </div>
                <div class="mt-3 line-clamp-1 text-sm font-black text-slate-800">{{ announcement.title }}</div>
                <div class="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500">
                  {{ announcement.content }}
                </div>
              </div>
              <div
                v-if="recentAnnouncements.length === 0 && !isLoading"
                class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center"
              >
                <div class="text-base font-black text-slate-700">目前沒有最新公告</div>
                <div class="mt-2 text-sm font-medium text-slate-500">可以發布近期練習提醒、集合通知或最新消息。</div>
              </div>
            </div>
          </div>

          <div
            :class="leaveSectionClass"
            class="rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]"
          >
            <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 class="text-lg font-black text-slate-800">近期請假動態</h3>
                <p class="mt-1 text-xs font-medium text-slate-500">先掌握近期人力異動與請假安排。</p>
              </div>
              <router-link
                v-if="canViewLeaveRequests"
                to="/leave-requests"
                class="text-xs font-black text-primary hover:text-primary-hover"
              >
                請假列表
              </router-link>
            </div>
            <div class="space-y-3 p-4 sm:p-5">
              <div
                v-for="leave in recentLeaves"
                :key="leave.id"
                class="flex min-h-[92px] items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                    <img
                      v-if="leave.team_members?.avatar_url"
                      :src="leave.team_members.avatar_url"
                      class="h-full w-full object-cover"
                    />
                    <span v-else class="text-sm font-black text-slate-400">
                      {{ leave.team_members?.name?.charAt(0) || '?' }}
                    </span>
                  </div>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-black text-slate-800">
                      {{ maskName(leave.team_members?.name) }}
                    </div>
                    <div class="mt-1 text-xs font-medium text-slate-500">
                      {{ formatLeaveRange(leave.start_date, leave.end_date) }}
                    </div>
                  </div>
                </div>
                <span
                  class="rounded-full border px-2.5 py-1 text-[11px] font-black"
                  :class="leave.leave_type === '事假' ? 'border-orange-200 bg-orange-50 text-primary' : 'border-red-200 bg-red-50 text-red-600'"
                >
                  {{ leave.leave_type }}
                </span>
              </div>
              <div
                v-if="recentLeaves.length === 0 && !isLoading"
                class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center"
              >
                <div class="text-base font-black text-slate-700">近期沒有人員請假</div>
                <div class="mt-2 text-sm font-medium text-slate-500">球隊人力狀況穩定，今天看起來不錯。</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'

type QuickAction = {
  key: string
  title: string
  description: string
  to: string | { path: string; query?: Record<string, string> }
  icon: string
  badge: string
  badgeClass: string
  iconClass: string
  surfaceClass: string
}

type PendingItem = {
  key: string
  title: string
  description: string
  count: string
  to?: string | { path: string; query?: Record<string, string> }
  icon: string
  countClass: string
  surfaceClass: string
}

const router = useRouter()
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()

const isLoading = ref(true)
const recentLeaves = ref<any[]>([])
const recentAnnouncements = ref<any[]>([])
const weeklySchedule = ref<any[]>([])
const todayEvent = ref<any>(null)

const stats = reactive({
  totalMembers: 0,
  schoolTeamMembers: 0,
  communityMembers: 0,
  todayLeaves: 0
})

const pendingCounts = reactive({
  joinInquiries: 0,
  unpaidFees: 0,
  upcomingLeaves: 0,
  weeklyEvents: 0
})

const roleNameMap: Record<string, string> = {
  ADMIN: '系統管理員',
  MANAGER: '管理員',
  HEAD_COACH: '總教練',
  COACH: '教練',
  MEMBER: '球員',
  PARENT: '家長'
}

const weekdayMap = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
const monthMap = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const canViewAttendance = computed(() => permissionsStore.can('attendance', 'VIEW'))
const canViewPlayers = computed(() => permissionsStore.can('players', 'VIEW'))
const canViewFees = computed(() => permissionsStore.can('fees', 'VIEW'))
const canViewAnnouncements = computed(() => permissionsStore.can('announcements', 'VIEW'))
const canViewJoinInquiries = computed(() => permissionsStore.can('join_inquiries', 'VIEW'))
const canViewLeaveRequests = computed(() => permissionsStore.can('leave_requests', 'VIEW'))
const currentRole = computed(() => authStore.profile?.role || '')
const roleGroup = computed(() => {
  if (['ADMIN', 'MANAGER'].includes(currentRole.value)) return 'manager'
  if (['HEAD_COACH', 'COACH'].includes(currentRole.value)) return 'coach'
  return 'member'
})
const roleLabel = computed(() => roleNameMap[currentRole.value] || '球隊夥伴')
const roleBadgeClass = computed(() => {
  if (roleGroup.value === 'manager') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (roleGroup.value === 'coach') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-blue-200 bg-blue-50 text-blue-700'
})
const dashboardModeTitle = computed(() => {
  if (roleGroup.value === 'manager') return '今天先看待處理事項與營運節奏'
  if (roleGroup.value === 'coach') return '今天先掌握出勤、請假與訓練安排'
  return '今天先確認行程、公告與球隊最新狀態'
})
const dashboardNarrative = computed(() => {
  if (roleGroup.value === 'manager') {
    return '首頁會優先把待確認的收費、入隊申請和重要管理項目放在前面，方便你快速巡檢。'
  }
  if (roleGroup.value === 'coach') {
    return '首頁會把出勤節奏、請假動態和本週行程放在較前面，讓你更快進入帶隊狀態。'
  }
  return '首頁會優先呈現本週行程、最新公告和常用入口，讓你一打開就知道接下來要注意什麼。'
})
const priorityChips = computed(() => {
  if (roleGroup.value === 'manager') return ['待辦優先', '收費巡檢', '入隊跟進', '全隊節奏']
  if (roleGroup.value === 'coach') return ['出勤優先', '請假掌握', '訓練安排', '現場節奏']
  return ['本週行程', '最新公告', '快速操作', '球隊狀態']
})
const quickSectionClass = computed(() => (roleGroup.value === 'manager' ? 'xl:order-2' : 'xl:order-1'))
const pendingSectionClass = computed(() => (roleGroup.value === 'manager' ? 'xl:order-1' : 'xl:order-2'))
const announcementsSectionClass = computed(() => (roleGroup.value === 'coach' ? 'xl:order-2' : 'xl:order-1'))
const leaveSectionClass = computed(() => (roleGroup.value === 'coach' ? 'xl:order-1' : 'xl:order-2'))

const today = dayjs()
const todayLabel = computed(() => today.format('YYYY 年 MM 月 DD 日'))
const todayWeekday = computed(() => formatWeekday(today.format('YYYY-MM-DD')))

const getPriorityValue = (map: Record<string, number>, key: string) => map[key] || 99

const greetingText = computed(() => {
  const name = authStore.profile?.nickname || authStore.profile?.name || '今天的球隊夥伴'

  if (today.hour() < 12) return `${name}，早安，先掌握今天的球隊節奏。`
  if (today.hour() < 18) return `${name}，下午好，今天的重要事項都在這裡。`
  return `${name}，晚上好，來看看今天還有哪些事要收尾。`
})

const heroEventTitle = computed(() => {
  if (todayEvent.value) {
    return todayEvent.value.title || todayEvent.value.event_type || '今日有球隊活動'
  }

  return '今日暫無活動'
})

const heroEventSubtitle = computed(() => {
  if (todayEvent.value) {
    return `${todayEvent.value.date} ${todayEvent.value.event_type || '球隊活動'}`
  }

  return '可先查看本週行程或處理待辦事項'
})

const todayReminderTitle = computed(() => {
  if (todayEvent.value) return `今天有 ${todayEvent.value.event_type || '球隊活動'}`
  if (recentAnnouncements.value.length > 0) return '先查看最新公告'
  return '今天先確認本週節奏'
})

const todayReminderBody = computed(() => {
  if (todayEvent.value) {
    return `${todayEvent.value.title || '已安排今日活動'}，建議先確認出勤、請假與現場分工。`
  }
  if (recentAnnouncements.value.length > 0) {
    return `公告「${recentAnnouncements.value[0].title}」可能有今天需要注意的訊息。`
  }
  return '目前沒有今天的活動提醒，可以先查看本週行程與待處理事項。'
})

const weatherReminderTitle = computed(() => {
  if (todayEvent.value) return '出發前先看天氣與補水'
  return '今天也別忘了看天氣'
})

const weatherReminderBody = computed(() => {
  if (todayEvent.value) {
    return '目前首頁尚未串接即時天氣，若今天有活動，建議出門前確認降雨機率、氣溫與是否需要雨具。'
  }
  return '目前首頁尚未串接即時天氣服務，建議出門前查看 Google 天氣或氣象資訊。'
})

const gatherInfoTitle = computed(() => {
  if (todayEvent.value) return todayEvent.value.title || '今日活動已安排'
  return '今日暫無集合資訊'
})

const gatherInfoBody = computed(() => {
  if (todayEvent.value) {
    return `${todayEvent.value.date} ${todayEvent.value.event_type || '球隊活動'}，若需要集合地點與集合時間，請到行事曆或公告確認。`
  }
  return '今天沒有偵測到活動；若臨時有集合安排，建議透過公告或行事曆同步通知。'
})

const focusCards = computed(() => {
  const cards = [
    {
      key: 'today-leaves',
      title: '今日請假',
      value: `${stats.todayLeaves} 人`,
      description: stats.todayLeaves > 0 ? '今天有人員請假，建議留意出勤安排。' : '今天暫時沒有人請假，出勤狀況穩定。',
      icon: '假',
      iconClass: stats.todayLeaves > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
    },
    {
      key: 'members',
      title: '現役球員',
      value: `${stats.totalMembers} 人`,
      description: `校隊 ${stats.schoolTeamMembers} 人，社區球員 ${stats.communityMembers} 人。`,
      icon: '隊',
      iconClass: 'bg-blue-50 text-blue-600'
    },
    {
      key: 'weekly-events',
      title: '本週活動',
      value: `${pendingCounts.weeklyEvents} 場`,
      description: pendingCounts.weeklyEvents > 0 ? '本週已有安排活動，記得提早確認人力。' : '這週尚未排定活動，可以安排新的練習。',
      icon: '程',
      iconClass: 'bg-amber-50 text-amber-700'
    }
  ]

  const priorityMap =
    roleGroup.value === 'manager'
      ? { 'weekly-events': 1, 'today-leaves': 2, members: 3 }
      : roleGroup.value === 'coach'
        ? { 'today-leaves': 1, 'weekly-events': 2, members: 3 }
        : { 'weekly-events': 1, members: 2, 'today-leaves': 3 }

  return cards.sort((a, b) => getPriorityValue(priorityMap, a.key) - getPriorityValue(priorityMap, b.key))
})

const quickActions = computed<QuickAction[]>(() => {
  const actions: QuickAction[] = [
    {
      key: 'calendar',
      title: '查看行事曆',
      description: '查看球隊活動、練習與近期重要日期。',
      to: '/calendar',
      icon: '曆',
      badge: '行程',
      badgeClass: 'bg-blue-50 text-blue-600',
      iconClass: 'bg-blue-50 text-blue-600',
      surfaceClass: 'border-blue-100 bg-blue-50/50'
    }
  ]

  if (canViewLeaveRequests.value) {
    actions.unshift({
      key: 'leave-requests',
      title: '我要請假',
      description: '快速送出請假申請，讓教練與管理者即時掌握。',
      to: '/leave-requests',
      icon: '假',
      badge: '常用',
      badgeClass: 'bg-primary/10 text-primary',
      iconClass: 'bg-amber-50 text-primary',
      surfaceClass: 'border-amber-100 bg-amber-50/50'
    })
  }

  if (canViewAttendance.value) {
    actions.push({
      key: 'attendance',
      title: '點名系統',
      description: '前往查看或建立今日點名活動。',
      to: '/attendance',
      icon: '點',
      badge: '出勤',
      badgeClass: 'bg-emerald-50 text-emerald-600',
      iconClass: 'bg-emerald-50 text-emerald-600',
      surfaceClass: 'border-emerald-100 bg-emerald-50/50'
    })
  }

  if (canViewPlayers.value) {
    actions.push({
      key: 'players',
      title: '球員名單',
      description: '查看完整球員資料、背號與分組資訊。',
      to: '/players',
      icon: '員',
      badge: '名單',
      badgeClass: 'bg-slate-100 text-slate-600',
      iconClass: 'bg-slate-100 text-slate-600',
      surfaceClass: 'border-slate-200 bg-slate-50/60'
    })
  }

  if (canViewFees.value) {
    actions.push({
      key: 'fees',
      title: '收費管理',
      description: '處理匯款回報、月費與季費收費資訊。',
      to: '/fees',
      icon: '費',
      badge: '收費',
      badgeClass: 'bg-amber-50 text-amber-700',
      iconClass: 'bg-amber-50 text-amber-700',
      surfaceClass: 'border-amber-100 bg-amber-50/50'
    })
  }

  if (canViewAnnouncements.value) {
    actions.push({
      key: 'announcements',
      title: '系統公告',
      description: '發布或查看球隊公告與通知內容。',
      to: '/announcements',
      icon: '告',
      badge: '公告',
      badgeClass: 'bg-rose-50 text-rose-600',
      iconClass: 'bg-rose-50 text-rose-600',
      surfaceClass: 'border-rose-100 bg-rose-50/50'
    })
  }

  if (canViewJoinInquiries.value) {
    actions.push({
      key: 'join-inquiries',
      title: '入隊申請',
      description: '查看新家長詢問與潛在新球員資料。',
      to: '/join-inquiries',
      icon: '招',
      badge: '招募',
      badgeClass: 'bg-violet-50 text-violet-600',
      iconClass: 'bg-violet-50 text-violet-600',
      surfaceClass: 'border-violet-100 bg-violet-50/50'
    })
  }

  const priorityMap =
    roleGroup.value === 'manager'
      ? {
          fees: 1,
          'join-inquiries': 2,
          announcements: 3,
          attendance: 4,
          players: 5,
          'leave-requests': 6,
          calendar: 7
        }
      : roleGroup.value === 'coach'
        ? {
            attendance: 1,
            'leave-requests': 2,
            calendar: 3,
            players: 4,
            announcements: 5,
            fees: 6,
            'join-inquiries': 7
          }
        : {
            calendar: 1,
            'leave-requests': 2,
            announcements: 3,
            players: 4,
            attendance: 5,
            fees: 6,
            'join-inquiries': 7
          }

  return actions.sort((a, b) => getPriorityValue(priorityMap, a.key) - getPriorityValue(priorityMap, b.key))
})

const pendingItems = computed<PendingItem[]>(() => {
  const items: PendingItem[] = []

  if (canViewJoinInquiries.value) {
    items.push({
      key: 'join-inquiries',
      title: '入隊申請待跟進',
      description: '尚未完成的新入隊詢問，需要回覆家長或更新狀態。',
      count: `${pendingCounts.joinInquiries} 筆`,
      to: '/join-inquiries',
      icon: '招',
      countClass: pendingCounts.joinInquiries > 0 ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500',
      surfaceClass: 'border-violet-100 bg-violet-50/50'
    })
  }

  if (canViewFees.value) {
    items.push({
      key: 'fees',
      title: '匯款回報待確認',
      description: '尚未標記為已繳的回報，建議盡快核對。',
      count: `${pendingCounts.unpaidFees} 筆`,
      to: { path: '/fees', query: { tab: 'quarterly' } },
      icon: '費',
      countClass: pendingCounts.unpaidFees > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500',
      surfaceClass: 'border-amber-100 bg-amber-50/50'
    })
  }

  if (canViewLeaveRequests.value) {
    items.push({
      key: 'leave-requests',
      title: '近期請假提醒',
      description: '未來 7 天內已有請假安排的人員數量。',
      count: `${pendingCounts.upcomingLeaves} 筆`,
      to: '/leave-requests',
      icon: '假',
      countClass: pendingCounts.upcomingLeaves > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500',
      surfaceClass: 'border-red-100 bg-red-50/50'
    })
  }

  if (canViewAttendance.value) {
    items.push({
      key: 'attendance',
      title: todayEvent.value ? '今日點名已建立' : '今日點名待建立',
      description: todayEvent.value
        ? '今天已有點名活動，可直接進入點名系統查看。'
        : '今天尚未建立點名活動，若有練習或比賽可先建立。',
      count: todayEvent.value ? '已建立' : '待建立',
      to: '/attendance',
      icon: '點',
      countClass: todayEvent.value ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
      surfaceClass: 'border-emerald-100 bg-emerald-50/50'
    })
  }

  const priorityMap =
    roleGroup.value === 'manager'
      ? { fees: 1, 'join-inquiries': 2, attendance: 3, 'leave-requests': 4 }
      : roleGroup.value === 'coach'
        ? { attendance: 1, 'leave-requests': 2, 'join-inquiries': 3, fees: 4 }
        : { 'leave-requests': 1, attendance: 2, fees: 3, 'join-inquiries': 4 }

  return items.sort((a, b) => getPriorityValue(priorityMap, a.key) - getPriorityValue(priorityMap, b.key))
})

const maskName = (name: string) => {
  if (!name) return '未知'
  if (name.length <= 1) return name
  if (name.length === 2) return `${name[0]}*`
  return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`
}

const formatWeekday = (dateString: string) => {
  const day = dayjs(dateString).day()
  return weekdayMap[day] || ''
}

const monthLabel = (dateString: string) => {
  const monthIndex = dayjs(dateString).month()
  return monthMap[monthIndex] || ''
}

const formatLeaveRange = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return '-'
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`
}

const goToAnnouncements = () => {
  if (canViewAnnouncements.value) {
    router.push('/announcements')
  }
}

const fetchDashboardData = async () => {
  isLoading.value = true

  try {
    const todayStr = dayjs().format('YYYY-MM-DD')
    const weekEndStr = dayjs().add(6, 'day').format('YYYY-MM-DD')

    const memberPromise = supabase
      .from('team_members')
      .select('role', { count: 'exact' })
      .in('role', ['球員', '校隊'])
      .neq('status', '離隊')

    const todayLeavesPromise = canViewLeaveRequests.value
      ? supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .lte('start_date', todayStr)
          .gte('end_date', todayStr)
      : Promise.resolve({ count: 0, error: null } as any)

    const announcementsPromise = canViewAnnouncements.value
      ? supabase
          .from('announcements')
          .select('*')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] as any[], error: null } as any)

    const recentLeavesPromise = canViewLeaveRequests.value
      ? supabase
          .from('leave_requests')
          .select('id, user_id, leave_type, start_date, end_date, team_members(name, avatar_url)')
          .gte('end_date', todayStr)
          .order('start_date', { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [] as any[], error: null } as any)

    const weeklyEventsPromise = supabase
      .from('attendance_events')
      .select('id, title, date, event_type, created_at')
      .gte('date', todayStr)
      .lte('date', weekEndStr)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })

    const todayEventPromise = canViewAttendance.value
      ? supabase
          .from('attendance_events')
          .select('id, title, date, event_type')
          .eq('date', todayStr)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as any)

    const joinPromise = canViewJoinInquiries.value
      ? supabase
          .from('join_inquiries')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'completed')
      : Promise.resolve({ count: 0, error: null } as any)

    const feesPromise = canViewFees.value
      ? supabase
          .from('quarterly_fees')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'paid')
      : Promise.resolve({ count: 0, error: null } as any)

    const upcomingLeavesPromise = canViewLeaveRequests.value
      ? supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .gte('end_date', todayStr)
          .lte('start_date', weekEndStr)
      : Promise.resolve({ count: 0, error: null } as any)

    const [
      membersRes,
      todayLeavesRes,
      announcementsRes,
      recentLeavesRes,
      weeklyEventsRes,
      todayEventRes,
      joinRes,
      feesRes,
      upcomingLeavesRes
    ] = await Promise.all([
      memberPromise,
      todayLeavesPromise,
      announcementsPromise,
      recentLeavesPromise,
      weeklyEventsPromise,
      todayEventPromise,
      joinPromise,
      feesPromise,
      upcomingLeavesPromise
    ])

    if (membersRes.error) throw membersRes.error
    if (todayLeavesRes?.error) throw todayLeavesRes.error
    if (announcementsRes?.error) throw announcementsRes.error
    if (recentLeavesRes?.error) throw recentLeavesRes.error
    if (weeklyEventsRes.error) throw weeklyEventsRes.error
    if (todayEventRes?.error) throw todayEventRes.error
    if (joinRes?.error) throw joinRes.error
    if (feesRes?.error) throw feesRes.error
    if (upcomingLeavesRes?.error) throw upcomingLeavesRes.error

    const members = membersRes.data || []

    stats.totalMembers = membersRes.count || 0
    stats.schoolTeamMembers = members.filter((member: any) => member.role === '校隊').length
    stats.communityMembers = members.filter((member: any) => member.role === '球員').length
    stats.todayLeaves = todayLeavesRes?.count || 0

    recentAnnouncements.value = announcementsRes?.data || []
    recentLeaves.value = recentLeavesRes?.data || []
    weeklySchedule.value = weeklyEventsRes.data || []
    todayEvent.value = todayEventRes?.data || null

    pendingCounts.weeklyEvents = weeklySchedule.value.length
    pendingCounts.joinInquiries = joinRes?.count || 0
    pendingCounts.unpaidFees = feesRes?.count || 0
    pendingCounts.upcomingLeaves = upcomingLeavesRes?.count || 0
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchDashboardData()
})
</script>

<style scoped>
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
</style>
