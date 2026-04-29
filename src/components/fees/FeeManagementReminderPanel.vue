<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, BellFilled, InfoFilled, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { getFeeManagementReminders } from '@/services/feeManagementReminders'
import {
  createEmptyFeeManagementReminderSnapshot,
  type FeeManagementReminderItem,
  type FeeManagementReminderSeverity
} from '@/types/feeManagementReminders'

const router = useRouter()

const snapshot = ref(createEmptyFeeManagementReminderSnapshot())
const isLoading = ref(false)
const errorMessage = ref('')

const hasItems = computed(() => snapshot.value.items.length > 0)
const urgentCount = computed(() =>
  snapshot.value.items
    .filter((item) => item.severity === 'urgent')
    .reduce((total, item) => total + item.count, 0)
)

const periodLabel = computed(() => {
  const labels = [
    snapshot.value.monthly_period ? `月費 ${snapshot.value.monthly_period}` : null,
    snapshot.value.quarterly_period ? `季費 ${snapshot.value.quarterly_period}` : null
  ].filter(Boolean)

  return labels.join('｜') || '目前期別'
})

const formatCurrency = (amount: number) => {
  const normalizedAmount = Number(amount) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(normalizedAmount)
}

const severityMeta = (severity: FeeManagementReminderSeverity) => {
  if (severity === 'urgent') {
    return {
      label: '優先處理',
      icon: WarningFilled,
      cardClass: 'border-red-100 bg-red-50/80',
      iconClass: 'bg-red-100 text-red-600',
      badgeClass: 'bg-red-100 text-red-700'
    }
  }

  if (severity === 'warning') {
    return {
      label: '待追蹤',
      icon: BellFilled,
      cardClass: 'border-amber-100 bg-amber-50/80',
      iconClass: 'bg-amber-100 text-amber-700',
      badgeClass: 'bg-amber-100 text-amber-700'
    }
  }

  return {
    label: '提醒',
    icon: InfoFilled,
    cardClass: 'border-sky-100 bg-sky-50/80',
    iconClass: 'bg-sky-100 text-sky-700',
    badgeClass: 'bg-sky-100 text-sky-700'
  }
}

const loadReminders = async () => {
  isLoading.value = true
  errorMessage.value = ''

  try {
    snapshot.value = await getFeeManagementReminders()
  } catch (error: any) {
    errorMessage.value = error?.message || '無法載入收費待辦提醒'
    snapshot.value = createEmptyFeeManagementReminderSnapshot()
  } finally {
    isLoading.value = false
  }
}

const refreshReminders = async () => {
  await loadReminders()

  if (!errorMessage.value) {
    ElMessage.success('收費待辦提醒已更新')
  }
}

const openReminder = async (item: FeeManagementReminderItem) => {
  await router.push(item.link)
}

onMounted(() => {
  void loadReminders()
})
</script>

<template>
  <section class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <el-icon class="text-xl"><BellFilled /></el-icon>
          </span>
          <div>
            <h3 class="text-lg font-black text-slate-800">收費待辦提醒</h3>
            <p class="mt-0.5 text-xs font-semibold text-slate-500">{{ periodLabel }}</p>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
          待辦 {{ snapshot.total_count }} 項
        </span>
        <span
          v-if="urgentCount > 0"
          class="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700"
        >
          優先 {{ urgentCount }} 項
        </span>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-70"
          :disabled="isLoading"
          @click="refreshReminders"
        >
          <el-icon :class="{ 'is-loading': isLoading }"><Refresh /></el-icon>
          重新整理
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm font-bold text-slate-500">
      讀取收費待辦中...
    </div>

    <div v-else-if="errorMessage" class="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-5 text-sm font-bold text-red-600">
      {{ errorMessage }}
    </div>

    <div v-else-if="!hasItems" class="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-5 text-sm font-bold text-emerald-700">
      目前沒有待處理的收費事項。
    </div>

    <template v-else>
      <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,2.15fr)]">
        <div class="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-amber-50 to-white p-4">
          <p class="text-xs font-black uppercase tracking-[0.18em] text-primary/70">待處理總覽</p>
          <p class="mt-3 text-3xl font-black leading-none text-slate-900">{{ snapshot.total_count }}</p>
          <p class="mt-2 text-sm font-bold text-slate-600">項收費待辦</p>
          <p class="mt-3 text-xs font-semibold leading-relaxed text-slate-500">
            已建檔金額合計 {{ formatCurrency(snapshot.total_amount) }}
          </p>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <article
            v-for="item in snapshot.items"
            :key="item.id"
            class="flex min-w-0 flex-col gap-3 rounded-2xl border p-4 transition-colors"
            :class="severityMeta(item.severity).cardClass"
          >
            <div class="flex items-start gap-3">
              <span
                class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                :class="severityMeta(item.severity).iconClass"
              >
                <el-icon class="text-lg">
                  <component :is="severityMeta(item.severity).icon" />
                </el-icon>
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-black text-slate-800">{{ item.title }}</h4>
                  <span
                    class="rounded-full px-2.5 py-1 text-[11px] font-black"
                    :class="severityMeta(item.severity).badgeClass"
                  >
                    {{ severityMeta(item.severity).label }}
                  </span>
                </div>
                <p class="mt-1 text-sm font-semibold leading-6 text-slate-600">{{ item.body }}</p>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-white/80 pt-3">
              <div class="text-xs font-black text-slate-500">
                {{ item.count }} 項
                <span v-if="item.amount > 0">・{{ formatCurrency(item.amount) }}</span>
              </div>
              <button
                type="button"
                class="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-primary"
                @click="openReminder(item)"
              >
                前往處理
                <el-icon><ArrowRight /></el-icon>
              </button>
            </div>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>
