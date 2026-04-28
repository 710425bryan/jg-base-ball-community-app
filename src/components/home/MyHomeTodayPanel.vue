<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Calendar, Location, Refresh, UserFilled } from '@element-plus/icons-vue'
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

const members = computed(() => props.snapshot.members)
const selectedMember = computed(() => getSelectedMyHomeMember(members.value, props.selectedMemberId))
const selectedLeave = computed(() => getMyHomeMemberLeave(props.snapshot, selectedMember.value?.id))
const todoItems = computed(() => buildMyHomeTodoItems(props.snapshot, selectedMember.value?.id))
const nextEvent = computed(() => props.snapshot.next_event)
const paymentSummary = computed(() => props.snapshot.payment_summary)
const equipmentSummary = computed(() => props.snapshot.equipment_summary)

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

      <div v-else-if="errorMessage" class="p-5 md:p-6">
        <div class="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">
          {{ errorMessage }}
        </div>
      </div>

      <div v-else class="grid gap-4 p-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:p-6 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.05fr)_minmax(320px,0.9fr)]">
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
        </section>

        <section class="rounded-2xl border border-primary/10 bg-primary/5 p-5">
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
              to="/my-leave-requests"
              class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition-colors hover:border-primary hover:text-primary"
            >
              我要請假
            </RouterLink>
          </div>
        </section>

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
              <RouterLink
                v-if="todo.route"
                :to="todo.route"
                class="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-white/80 px-3 text-xs font-black text-slate-800 transition-colors hover:bg-white"
              >
                {{ todo.actionLabel }}
              </RouterLink>
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
  </section>
</template>
