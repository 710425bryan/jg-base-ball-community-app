<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Calendar, Location, Refresh, Tickets, UserFilled } from '@element-plus/icons-vue'
import type { MyHomeSnapshot, MyHomeTodoItem } from '@/types/myHome'
import {
  buildMyHomeTodoItems,
  formatMyHomeCurrency,
  getMyHomeMemberLeave,
  getSelectedMyHomeMember
} from '@/utils/myHomeSnapshot'

const props = defineProps<{
  snapshot: MyHomeSnapshot
  selectedMemberId: string
  isLoading?: boolean
  errorMessage?: string
  weather?: {
    summary: string
    temperature: string
    rain: string
  }
}>()

const emit = defineEmits<{
  'update:selectedMemberId': [value: string]
  refresh: []
}>()

const router = useRouter()
const members = computed(() => props.snapshot.members)
const selectedMember = computed(() => getSelectedMyHomeMember(members.value, props.selectedMemberId))
const selectedLeave = computed(() => getMyHomeMemberLeave(props.snapshot, selectedMember.value?.id))
const todoItems = computed(() => buildMyHomeTodoItems(props.snapshot, selectedMember.value?.id))
const nextEvent = computed(() => props.snapshot.next_event)
const isNextTrainingEvent = computed(() => nextEvent.value?.match_level === '特訓課')
const selectedTrainingLocations = computed(() =>
  props.snapshot.training_locations
    .filter((location) => location.member_id === selectedMember.value?.id)
    .sort((left, right) => {
      const leftKey = `${left.training_date} ${left.start_time || '23:59'}`
      const rightKey = `${right.training_date} ${right.start_time || '23:59'}`
      return leftKey.localeCompare(rightKey)
    })
)
const paymentSummary = computed(() => props.snapshot.payment_summary)
const equipmentSummary = computed(() => props.snapshot.equipment_summary)
const isPointCardFlipped = ref(false)
const trainingPointLogoSrc = '/training-point-logo.jpg'

const trainingPointCard = computed(() => ({
  balance: selectedMember.value?.point_balance ?? 0,
  reserved: selectedMember.value?.reserved_training_points ?? 0,
  available: selectedMember.value?.available_training_points ?? 0
}))

const memberStatusText = computed(() => {
  if (!selectedMember.value) return '尚未綁定'
  if (selectedLeave.value) return `今日已${selectedLeave.value.leave_type}`
  return '今日未請假'
})

const memberMetaText = computed(() => {
  if (!selectedMember.value) return '請管理員完成帳號與球員綁定'

  return [
    selectedMember.value.role,
    selectedMember.value.team_group,
    selectedMember.value.jersey_number ? `#${selectedMember.value.jersey_number}` : null
  ].filter(Boolean).join('｜') || '球隊成員'
})

const getMapsHref = (location: string | null | undefined) => {
  const normalized = location?.trim()
  if (!normalized) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalized)}`
}

const nextEventLocationHref = computed(() => getMapsHref(nextEvent.value?.location))

const getTrainingLocationHref = (location: {
  venue_name?: string | null
  venue_address?: string | null
  venue_maps_url?: string | null
}) => location.venue_maps_url || getMapsHref(location.venue_address || location.venue_name)

const formatTrainingLocationDate = (value: string) => {
  const date = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return value
  return `${value.slice(5).replace('-', '/')} 週${'日一二三四五六'[date.getDay()]}`
}

const formatTrainingLocationTime = (start?: string | null, end?: string | null) => {
  if (start && end) return `${start}-${end}`
  return start || end || '時間未設定'
}

const getTodoClass = (todo: MyHomeTodoItem) => {
  const classMap: Record<MyHomeTodoItem['severity'], string> = {
    info: 'border-sky-100 bg-sky-50 text-sky-800',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-100 bg-amber-50 text-amber-800',
    danger: 'border-red-100 bg-red-50 text-red-700'
  }

  return classMap[todo.severity]
}

const handleMemberChange = (value: string) => {
  emit('update:selectedMemberId', value)
}

const navigateToTodo = (todo: MyHomeTodoItem) => {
  if (!todo.route) return
  void router.push(todo.route)
}

watch(() => selectedMember.value?.id, () => {
  isPointCardFlipped.value = false
})
</script>

<template>
  <section class="mx-auto mt-6 w-full max-w-7xl px-3 sm:px-4" data-test="my-home-today-panel">
    <div class="rounded-3xl border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.08)] overflow-hidden">
      <div class="flex flex-col gap-4 border-b border-slate-100 bg-slate-950 px-5 py-5 text-white md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <div class="text-xs font-black uppercase tracking-[0.22em] text-primary">My Day</div>
          <h2 class="mt-1 text-2xl font-black leading-tight md:text-3xl">我的今日重點</h2>
          <p class="mt-2 text-sm font-semibold text-slate-300">賽程、請假、繳費與裝備狀態集中看。</p>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <el-select
            v-if="members.length > 1"
            :model-value="selectedMember?.id"
            class="w-full sm:w-56"
            size="large"
            placeholder="選擇成員"
            @change="handleMemberChange"
          >
            <el-option
              v-for="member in members"
              :key="member.id"
              :label="member.name"
              :value="member.id"
            />
          </el-select>

          <button
            type="button"
            class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white transition-colors hover:bg-white/15 disabled:opacity-60"
            :disabled="isLoading"
            @click="emit('refresh')"
          >
            <el-icon :class="{ 'is-loading': isLoading }"><Refresh /></el-icon>
            重新整理
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="grid gap-4 p-5 md:grid-cols-3 md:p-6">
        <div v-for="index in 3" :key="index" class="h-40 animate-pulse rounded-2xl bg-slate-100"></div>
      </div>

      <div v-else class="p-5 md:p-6">
        <div
          v-if="errorMessage"
          class="mb-4 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700"
        >
          部分資料暫時無法更新：{{ errorMessage }}
        </div>

        <div class="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.05fr)_minmax(320px,0.9fr)]">
          <section class="rounded-2xl border border-slate-100 bg-slate-50 p-5">
          <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-slate-400 shadow-sm">
              <img
                v-if="selectedMember?.avatar_url"
                :src="selectedMember.avatar_url"
                class="h-full w-full object-cover"
                alt="成員大頭照"
              />
              <el-icon v-else class="text-xl"><UserFilled /></el-icon>
            </div>
            <div class="min-w-0">
              <div class="truncate text-xl font-black text-slate-900">{{ selectedMember?.name || '尚未綁定成員' }}</div>
              <p class="mt-1 truncate text-sm font-bold text-slate-500">{{ memberMetaText }}</p>
            </div>
          </div>

          <div class="mt-5 grid grid-cols-2 gap-3">
            <div class="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <div class="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">出席</div>
              <div class="mt-2 text-base font-black text-slate-900">{{ memberStatusText }}</div>
            </div>
            <div class="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <div class="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">天氣</div>
              <div class="mt-2 text-base font-black text-slate-900">{{ weather?.temperature || '-' }}</div>
              <p class="mt-1 text-xs font-bold text-slate-500">{{ weather?.summary || '氣象資料更新中' }}</p>
            </div>
          </div>

          <button
            v-if="selectedMember"
            type="button"
            class="training-point-card mt-4"
            :class="{ 'is-flipped': isPointCardFlipped }"
            aria-label="翻轉特訓點數卡"
            @click="isPointCardFlipped = !isPointCardFlipped"
          >
            <span class="training-point-card__inner">
              <span class="training-point-card__face training-point-card__face--front">
                <span class="training-point-card__shine"></span>
                <span class="training-point-card__front-content">
                  <span class="training-point-card__brand">
                    <img :src="trainingPointLogoSrc" alt="中港熊戰 Logo" class="training-point-card__logo" />
                    <span>
                      <span class="training-point-card__label">特訓點數</span>
                      <span class="training-point-card__member">{{ selectedMember.name }}</span>
                    </span>
                  </span>
                  <span class="training-point-card__available">
                    <span class="training-point-card__caption">目前可用</span>
                    <span class="training-point-card__number">{{ trainingPointCard.available }}</span>
                  </span>
                </span>
                <span class="training-point-card__hint">點擊查看明細</span>
              </span>
              <span class="training-point-card__face training-point-card__face--back">
                <span class="training-point-card__back-header">
                  <span class="training-point-card__label">點數明細</span>
                  <span>點擊返回</span>
                </span>
                <span class="training-point-card__back-main">
                  <span>可報名點數</span>
                  <strong>{{ trainingPointCard.available }}</strong>
                </span>
                <span class="training-point-card__detail-grid">
                  <span class="training-point-card__detail">
                    <span>總點數</span>
                    <strong>{{ trainingPointCard.balance }}</strong>
                  </span>
                  <span class="training-point-card__detail">
                    <span>已保留</span>
                    <strong>{{ trainingPointCard.reserved }}</strong>
                  </span>
                </span>
              </span>
            </span>
          </button>
          </section>

          <div class="grid content-start gap-4">
            <section class="rounded-2xl border border-primary/20 bg-amber-50 p-5 shadow-sm">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="text-[11px] font-black uppercase tracking-[0.18em] text-primary/80">Next Up</div>
                <h3 class="mt-2 text-xl font-black leading-tight text-slate-900">
                  {{ nextEvent?.title || '目前沒有即將到來的賽程' }}
                </h3>
              </div>
              <el-icon class="shrink-0 text-2xl text-primary"><Calendar /></el-icon>
            </div>

            <div v-if="nextEvent" class="mt-4 grid gap-2 text-sm font-bold text-slate-600">
              <div>{{ nextEvent.date }}<span v-if="nextEvent.time">｜{{ nextEvent.time }}</span></div>
              <div v-if="nextEvent.location" class="flex min-w-0 items-center gap-2">
                <el-icon class="text-primary"><Location /></el-icon>
                <span class="truncate">{{ nextEvent.location }}</span>
              </div>
              <div v-if="nextEvent.coaches" class="line-clamp-1">帶隊教練：{{ nextEvent.coaches }}</div>
            </div>

            <div class="mt-5 flex flex-wrap gap-2">
              <RouterLink
                v-if="nextEvent"
                :to="nextEvent.route"
                class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover"
              >
                查看詳情
              </RouterLink>
              <RouterLink
                v-if="isNextTrainingEvent"
                to="/training"
                class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 text-sm font-black text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100"
              >
                <el-icon><Tickets /></el-icon>
                特訓報名
              </RouterLink>
              <a
                v-if="nextEventLocationHref"
                :href="nextEventLocationHref"
                target="_blank"
                rel="noreferrer"
                class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-primary/20 bg-white px-4 text-sm font-black text-primary transition-colors hover:border-primary"
              >
                開啟導航
              </a>
              <RouterLink
                v-if="!isNextTrainingEvent"
                to="/my-leave-requests"
                class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                我要請假
              </RouterLink>
            </div>
            </section>

            <section class="rounded-2xl border border-sky-100 bg-sky-50 p-5 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-black text-slate-900">本週訓練場地</div>
              <span class="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">{{ selectedTrainingLocations.length }} 筆</span>
            </div>

            <div v-if="selectedTrainingLocations.length > 0" class="mt-3 grid gap-2">
              <article
                v-for="location in selectedTrainingLocations"
                :key="`${location.session_id}:${location.member_id}`"
                class="rounded-xl border px-3 py-2"
                :class="location.is_on_leave ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-sky-100 bg-white/85 text-slate-700'"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-black">{{ location.title }}</div>
                    <div class="mt-1 text-xs font-bold opacity-75">
                      {{ formatTrainingLocationDate(location.training_date) }}｜{{ formatTrainingLocationTime(location.start_time, location.end_time) }}
                    </div>
                  </div>
                  <span v-if="location.is_on_leave" class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-700">已請假</span>
                </div>
                <div class="mt-2 flex min-w-0 items-center gap-2 text-sm font-black">
                  <el-icon class="shrink-0 text-primary"><Location /></el-icon>
                  <span class="truncate">{{ location.venue_name }}</span>
                </div>
                <a
                  v-if="getTrainingLocationHref(location)"
                  :href="getTrainingLocationHref(location) || undefined"
                  target="_blank"
                  rel="noreferrer"
                  class="mt-2 inline-flex text-xs font-black text-primary hover:underline"
                >
                  開啟導航
                </a>
              </article>
            </div>

            <div v-else class="mt-3 rounded-xl border border-dashed border-sky-200 bg-white/85 px-3 py-4 text-center text-sm font-bold text-slate-500">
              本週尚未發布場地配置。
            </div>
            </section>
          </div>

          <section class="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:col-span-2 xl:col-span-1">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">To-do</div>
              <h3 class="mt-1 text-xl font-black text-slate-900">我的待辦中心</h3>
            </div>
            <div class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{{ todoItems.length }} 項</div>
          </div>

          <div class="mt-4 grid gap-3">
            <article
              v-for="todo in todoItems"
              :key="todo.key"
              class="rounded-2xl border px-4 py-3"
              :class="getTodoClass(todo)"
            >
              <div class="font-black">{{ todo.title }}</div>
              <p class="mt-1 text-sm font-semibold leading-6 opacity-80">{{ todo.body }}</p>
              <button
                v-if="todo.route"
                type="button"
                class="mt-3 inline-flex min-h-11 w-full touch-manipulation select-none items-center justify-center rounded-xl bg-white/80 px-4 text-sm font-black text-slate-800 transition-colors hover:bg-white sm:w-auto"
                @click.stop="navigateToTodo(todo)"
              >
                {{ todo.actionLabel }}
              </button>
            </article>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-2xl bg-slate-50 px-4 py-3">
              <div class="text-xs font-bold text-slate-400">待繳費</div>
              <div class="mt-1 font-black text-slate-900">{{ paymentSummary.unpaid_count }} 筆</div>
              <div class="mt-1 text-xs font-bold text-primary">{{ formatMyHomeCurrency(paymentSummary.total_unpaid_amount) }}</div>
            </div>
            <div class="rounded-2xl bg-slate-50 px-4 py-3">
              <div class="text-xs font-bold text-slate-400">裝備進度</div>
              <div class="mt-1 font-black text-slate-900">{{ equipmentSummary.active_request_count }} 筆</div>
              <div class="mt-1 text-xs font-bold text-primary">待領 {{ equipmentSummary.ready_for_pickup_count }} 筆</div>
            </div>
          </div>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.training-point-card {
  display: block;
  width: 100%;
  min-height: 13.75rem;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-perspective: 980px;
  perspective: 980px;
  text-align: left;
}

.training-point-card__inner {
  position: relative;
  display: block;
  min-height: 13.75rem;
  -webkit-transform-style: preserve-3d;
  transform-style: preserve-3d;
  transition: transform 720ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.training-point-card.is-flipped .training-point-card__inner {
  -webkit-transform: rotateY(180deg);
  transform: rotateY(180deg);
}

.training-point-card__face {
  position: absolute;
  inset: 0;
  display: flex;
  min-height: 13.75rem;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(234, 179, 8, 0.34);
  border-radius: 1.25rem;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.14);
  -webkit-transform-style: preserve-3d;
  transform-style: preserve-3d;
}

.training-point-card__face--front {
  justify-content: space-between;
  padding: 1rem 1.1rem;
  -webkit-transform: rotateY(0deg) translateZ(0.1px);
  transform: rotateY(0deg) translateZ(0.1px);
  background:
    radial-gradient(circle at 12% 18%, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0) 22%),
    linear-gradient(135deg, #fff7d6 0%, #f59e0b 42%, #111827 100%);
}

.training-point-card__face--back {
  gap: 0.8rem;
  justify-content: space-between;
  padding: 1rem 1.1rem;
  -webkit-transform: rotateY(180deg) translateZ(0.1px);
  transform: rotateY(180deg) translateZ(0.1px);
  background:
    radial-gradient(circle at 85% 18%, rgba(245, 158, 11, 0.42), transparent 28%),
    linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: white;
}

.training-point-card__shine {
  position: absolute;
  inset: -40%;
  transform: translateX(-56%) rotate(18deg);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.78), transparent);
  animation: training-card-shine 3.8s ease-in-out infinite;
}

.training-point-card__front-content,
.training-point-card__brand,
.training-point-card__available,
.training-point-card__back-header,
.training-point-card__back-main,
.training-point-card__detail,
.training-point-card__hint {
  position: relative;
  z-index: 1;
  display: flex;
}

.training-point-card__front-content {
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.training-point-card__brand {
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.training-point-card__logo {
  height: 3.2rem;
  width: 3.2rem;
  border-radius: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.92);
  object-fit: contain;
  padding: 0.18rem;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.24);
}

.training-point-card__label {
  position: relative;
  z-index: 1;
  max-width: 100%;
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.training-point-card__member {
  display: block;
  margin-top: 0.35rem;
  max-width: 7.5rem;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.training-point-card__available {
  min-width: 5.4rem;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.training-point-card__number {
  position: relative;
  z-index: 1;
  color: white;
  font-size: 4.75rem;
  font-weight: 950;
  letter-spacing: 0;
  line-height: 0.9;
  text-shadow: 0 8px 22px rgba(15, 23, 42, 0.28);
}

.training-point-card__caption {
  position: relative;
  z-index: 1;
  color: rgba(255, 255, 255, 0.84);
  font-size: 0.9rem;
  font-weight: 900;
}

.training-point-card__hint {
  align-self: flex-end;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  padding: 0.38rem 0.68rem;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.72rem;
  font-weight: 900;
}

.training-point-card__back-header {
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: rgba(255, 255, 255, 0.58);
  font-size: 0.72rem;
  font-weight: 900;
}

.training-point-card__back-main {
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 1.05rem;
  background: rgba(255, 255, 255, 0.1);
  padding: 0.85rem 0.95rem;
  font-size: 0.95rem;
  font-weight: 950;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.training-point-card__back-main strong {
  color: #facc15;
  font-size: 2.3rem;
  line-height: 1;
}

.training-point-card__detail-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.training-point-card__detail {
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.09);
  padding: 0.72rem 0.78rem;
  font-size: 0.78rem;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.68);
}

.training-point-card__detail strong {
  color: #facc15;
  font-size: 1.45rem;
  line-height: 1;
}

@media (max-width: 380px) {
  .training-point-card__face {
    min-height: 14.25rem;
  }

  .training-point-card__inner,
  .training-point-card {
    min-height: 14.25rem;
  }

  .training-point-card__number {
    font-size: 4rem;
  }

  .training-point-card__member {
    max-width: 5.8rem;
  }
}

@keyframes training-card-shine {
  0%,
  42% {
    transform: translateX(-56%) rotate(18deg);
    opacity: 0;
  }
  56% {
    opacity: 1;
  }
  76%,
  100% {
    transform: translateX(56%) rotate(18deg);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .training-point-card__inner,
  .training-point-card__shine {
    animation: none;
    transition: none;
  }
}
</style>
