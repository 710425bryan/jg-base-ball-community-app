<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <!-- Header -->
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0 flex flex-col gap-3 z-10">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <AppPageHeader
          title="收費管理系統"
          subtitle="管理校隊月費、球員季費、比賽費用、裝備付款與收費設定"
          :icon="Money"
          as="h2"
        />
      </div>
      
      <div
        v-if="hasAccess"
        class="overflow-hidden origin-top transform-gpu transition-all duration-300 ease-out"
        :class="isSummaryCollapsed ? 'max-h-0 opacity-0 -translate-y-2 pointer-events-none' : 'max-h-[22rem] md:max-h-[14rem] opacity-100 translate-y-0'"
      >
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 pt-0.5 sm:pt-1">
          <div class="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-amber-50 to-white px-3 py-3 sm:px-4 sm:py-4 shadow-sm">
            <p class="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] sm:tracking-[0.24em] text-primary/70">校隊月費</p>
            <p class="mt-2 sm:mt-3 text-[clamp(1.25rem,6vw,1.7rem)] md:text-3xl leading-none font-black text-slate-900">{{ formatCurrency(monthlySummary.total) }}</p>
            <p class="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-500 leading-tight">
              期間：{{ monthlySummary.periodLabel || '尚未載入' }}
            </p>
          </div>
          <div class="rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-3 sm:px-4 sm:py-4 shadow-sm">
            <p class="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] sm:tracking-[0.24em] text-sky-700">球員季費</p>
            <p class="mt-2 sm:mt-3 text-[clamp(1.25rem,6vw,1.7rem)] md:text-3xl leading-none font-black text-sky-800">{{ formatCurrency(quarterlySummary.total) }}</p>
            <p class="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-sky-700/80 leading-tight">
              期間：{{ quarterlySummary.periodLabel || '尚未載入' }}
            </p>
          </div>
          <div class="rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-3 sm:px-4 sm:py-4 shadow-sm">
            <p class="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] sm:tracking-[0.24em] text-amber-700">比賽費用</p>
            <p class="mt-2 sm:mt-3 text-[clamp(1.25rem,6vw,1.7rem)] md:text-3xl leading-none font-black text-amber-800">{{ formatCurrency(matchFeeSummary.total) }}</p>
            <p class="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-amber-700/80 leading-tight">
              期間：{{ matchFeeSummary.periodLabel || '尚未載入' }}
            </p>
          </div>
          <div class="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-3 sm:px-4 sm:py-4 shadow-sm">
            <p class="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] sm:tracking-[0.24em] text-emerald-700">全部加總</p>
            <p class="mt-2 sm:mt-3 text-[clamp(1.45rem,6.2vw,1.95rem)] md:text-3xl leading-none font-black text-emerald-700">{{ formatCurrency(combinedFeeSummary.total) }}</p>
            <p class="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-emerald-700/80 leading-tight">
              依月費、季費與比賽費用目前各自選定期間加總
            </p>
          </div>
        </div>

        <p class="mt-2 text-[10px] sm:text-[11px] text-gray-400 leading-tight sm:leading-relaxed">
          <span class="sm:hidden">手機版先提供兩邊目前期間的快速合計，方便先看總額再往下操作。</span>
          <span class="hidden sm:inline">校隊月費、球員季費與比賽費用的繳費時間可以不同，所以上方會分開顯示各自期間金額，並另外提供目前選定期間的合計供你快速對帳。</span>
        </p>
      </div>

      <button
        v-if="hasAccess"
        type="button"
        @click="expandSummaryPanel"
        class="w-full overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/90 shadow-sm transition-all duration-300 ease-out text-left"
        :class="isSummaryCollapsed ? 'max-h-24 opacity-100 translate-y-0 mt-0.5 sm:mt-1 px-3 py-3 sm:px-4 sm:py-3.5' : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none px-0 py-0 border-transparent shadow-none'"
        :aria-expanded="!isSummaryCollapsed"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] sm:tracking-[0.24em] text-emerald-700">全部加總</p>
            <p class="mt-1 text-[10px] sm:text-xs text-emerald-700/80 leading-tight break-words">
              {{ collapsedSummaryPeriods }}
            </p>
          </div>
          <div class="shrink-0 text-right">
            <p class="text-lg sm:text-xl font-black leading-none text-emerald-700">{{ formatCurrency(combinedFeeSummary.total) }}</p>
            <p class="mt-1 text-[10px] sm:text-xs text-emerald-700/70">點擊展開總覽</p>
          </div>
        </div>
      </button>

      <!-- Tabs -->
      <div class="overflow-x-auto custom-scrollbar pt-2">
        <div class="flex gap-2 min-w-max">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            @click="activeTab = tab.id"
            class="px-5 py-2 rounded-t-xl text-sm font-bold transition-all border-b-2"
            :class="[
              activeTab === tab.id 
                ? 'text-primary border-primary bg-primary/5' 
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
            ]"
          >
            {{ tab.name }}
          </button>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div ref="contentScrollContainer" class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 relative custom-scrollbar">
      <div class="max-w-6xl mx-auto min-h-full">
        <!-- Not authorized -->
        <div v-if="!hasAccess" class="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <el-icon class="text-6xl text-gray-300 mb-4"><Lock /></el-icon>
          <h3 class="text-lg font-bold text-gray-700">無權限存取</h3>
          <p class="text-sm text-gray-500 mt-2">此頁面僅限系統管理員 (ADMIN) 使用</p>
        </div>
        
        <!-- Tab Contents -->
        <template v-else>
          <ProfilePaymentSubmissionInbox v-if="activeTab === 'monthly' || activeTab === 'quarterly' || activeTab === 'balances' || activeTab === 'settings'" class="mb-6" />
          <MatchPaymentSubmissionInbox
            v-if="activeTab === 'match-fees'"
            class="mb-6"
            @reviewed="handleMatchPaymentReviewed"
          />
          <div v-show="activeTab === 'monthly'">
            <SchoolTeamFees @summary-change="handleMonthlySummaryChange" />
          </div>
          <div v-show="activeTab === 'quarterly'">
            <QuarterlyFees @summary-change="handleQuarterlySummaryChange" />
          </div>
          <div v-show="activeTab === 'match-fees'">
            <MatchFeeManagementPanel
              ref="matchFeeManagementPanelRef"
              @summary-change="handleMatchFeeSummaryChange"
            />
          </div>
          <div v-show="activeTab === 'equipment'" class="space-y-6">
            <EquipmentPaymentSubmissionInbox />
            <EquipmentRequestReviewPanel />
          </div>
          <div v-show="activeTab === 'balances'">
            <PlayerBalanceManager />
          </div>
          <div v-show="activeTab === 'settings'">
            <FeeSettings />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { usePermissionsStore } from '@/stores/permissions'
import { Money, Lock } from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'

// Import Sub Components
import SchoolTeamFees from '@/components/fees/SchoolTeamFees.vue'
import QuarterlyFees from '@/components/fees/QuarterlyFees.vue'
import FeeSettings from '@/components/fees/FeeSettings.vue'
import ProfilePaymentSubmissionInbox from '@/components/fees/ProfilePaymentSubmissionInbox.vue'
import MatchFeeManagementPanel from '@/components/fees/MatchFeeManagementPanel.vue'
import MatchPaymentSubmissionInbox from '@/components/fees/MatchPaymentSubmissionInbox.vue'
import PlayerBalanceManager from '@/components/fees/PlayerBalanceManager.vue'
import EquipmentRequestReviewPanel from '@/components/equipment/EquipmentRequestReviewPanel.vue'
import EquipmentPaymentSubmissionInbox from '@/components/equipment/EquipmentPaymentSubmissionInbox.vue'

const route = useRoute()
const permissionsStore = usePermissionsStore()
const hasAccess = computed(() => permissionsStore.can('fees', 'VIEW'))

type FeeSummarySnapshot = {
  periodLabel: string
  total: number
  paid: number
  unpaid: number
  isReady: boolean
}

const tabs = [
  { id: 'monthly', name: '校隊月費結算' },
  { id: 'quarterly', name: '球員季費表單' },
  { id: 'match-fees', name: '比賽費用' },
  { id: 'equipment', name: '裝備請購/付款' },
  { id: 'balances', name: '球員餘額' },
  { id: 'settings', name: '校隊收費設定' }
]

const activeTab = ref('monthly')
const contentScrollContainer = ref<HTMLElement | null>(null)
const contentScrollTop = ref(0)
const isSummaryCollapsed = ref(false)
const createEmptySummary = (): FeeSummarySnapshot => ({
  periodLabel: '',
  total: 0,
  paid: 0,
  unpaid: 0,
  isReady: false
})

const monthlySummary = ref<FeeSummarySnapshot>(createEmptySummary())
const quarterlySummary = ref<FeeSummarySnapshot>(createEmptySummary())
const matchFeeSummary = ref<FeeSummarySnapshot>(createEmptySummary())
const matchFeeManagementPanelRef = ref<InstanceType<typeof MatchFeeManagementPanel> | null>(null)
const SUMMARY_COLLAPSE_SCROLL_TOP = 32
const SUMMARY_EXPAND_SCROLL_TOP = 8

watch(() => [route.query.tab, route.query.highlight_equipment_submission_id, route.query.highlight_match_submission_id], ([newTab, equipmentSubmissionId, matchSubmissionId]) => {
  if (equipmentSubmissionId) {
    activeTab.value = 'equipment'
  } else if (matchSubmissionId) {
    activeTab.value = 'match-fees'
  } else if (newTab === 'monthly' || newTab === 'quarterly' || newTab === 'match-fees' || newTab === 'equipment' || newTab === 'balances' || newTab === 'settings') {
    activeTab.value = newTab as string
  } else if (route.query.highlight_submission_id && activeTab.value === 'equipment') {
    activeTab.value = 'monthly'
  }
}, { immediate: true })

const formatCurrency = (amount: number) => {
  const normalizedAmount = Number(amount) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(normalizedAmount)
}

const handleMonthlySummaryChange = (summary: FeeSummarySnapshot) => {
  monthlySummary.value = summary
}

const handleQuarterlySummaryChange = (summary: FeeSummarySnapshot) => {
  quarterlySummary.value = summary
}

const handleMatchFeeSummaryChange = (summary: FeeSummarySnapshot) => {
  matchFeeSummary.value = summary
}

const handleMatchPaymentReviewed = async () => {
  await matchFeeManagementPanelRef.value?.refresh()
}

const combinedFeeSummary = computed(() => ({
  total: monthlySummary.value.total + quarterlySummary.value.total + matchFeeSummary.value.total,
  paid: monthlySummary.value.paid + quarterlySummary.value.paid + matchFeeSummary.value.paid,
  unpaid: monthlySummary.value.unpaid + quarterlySummary.value.unpaid + matchFeeSummary.value.unpaid,
  isReady: monthlySummary.value.isReady || quarterlySummary.value.isReady || matchFeeSummary.value.isReady
}))

const collapsedSummaryPeriods = computed(() => {
  const monthLabel = monthlySummary.value.periodLabel || '尚未載入'
  const quarterLabel = quarterlySummary.value.periodLabel || '尚未載入'
  const matchLabel = matchFeeSummary.value.periodLabel || '尚未載入'

  return `月費 ${monthLabel}｜季費 ${quarterLabel}｜比賽 ${matchLabel}`
})

const syncSummaryCollapseState = (nextScrollTop: number) => {
  contentScrollTop.value = nextScrollTop

  if (contentScrollTop.value > SUMMARY_COLLAPSE_SCROLL_TOP) {
    isSummaryCollapsed.value = true
  } else if (contentScrollTop.value <= SUMMARY_EXPAND_SCROLL_TOP) {
    isSummaryCollapsed.value = false
  }
}

const handleContentScroll = () => {
  syncSummaryCollapseState(contentScrollContainer.value?.scrollTop ?? 0)
}

const attachContentScrollListener = () => {
  if (!contentScrollContainer.value) return

  contentScrollContainer.value.addEventListener('scroll', handleContentScroll, { passive: true })
  handleContentScroll()
}

const detachContentScrollListener = () => {
  if (!contentScrollContainer.value) return

  contentScrollContainer.value.removeEventListener('scroll', handleContentScroll)
}

const expandSummaryPanel = () => {
  isSummaryCollapsed.value = false
}

onMounted(async () => {
  await nextTick()
  attachContentScrollListener()
})

onBeforeUnmount(() => {
  detachContentScrollListener()
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  height: 4px;
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}
</style>
