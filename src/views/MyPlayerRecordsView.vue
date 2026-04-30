<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0">
      <div class="max-w-7xl mx-auto">
        <AppPageHeader
          title="我的成績"
          subtitle="查看關聯球員的比賽紀錄、未來賽程、打擊成績與投球成績"
          :icon="DataAnalysis"
          as="h2"
        >
          <template #actions>
            <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <el-select
                v-if="members.length > 1"
                v-model="selectedMemberId"
                data-test="member-select"
                class="w-full sm:w-64"
                size="large"
                filterable
                placeholder="切換球員"
              >
                <el-option
                  v-for="member in members"
                  :key="member.member_id"
                  :label="buildMemberOptionLabel(member)"
                  :value="member.member_id"
                />
              </el-select>

              <div
                v-else-if="selectedMember"
                class="inline-flex min-h-11 items-center rounded-2xl border border-primary/15 bg-primary/5 px-4 text-sm font-black text-primary"
              >
                {{ buildMemberOptionLabel(selectedMember) }}
              </div>

              <button
                type="button"
                class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                :disabled="isRefreshing || !selectedMemberId"
                @click="refreshCurrentMemberData"
              >
                <el-icon :class="{ 'is-loading': isRefreshing }"><Refresh /></el-icon>
                {{ isRefreshing ? '更新中' : '重新整理' }}
              </button>
            </div>
          </template>
        </AppPageHeader>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <AppLoadingState v-if="isBootstrapping" text="讀取我的成績中..." min-height="50vh" />

      <div v-else class="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <section
          v-if="members.length === 0"
          data-test="empty-members"
          class="my-record-summary-card bg-white rounded-3xl border border-gray-100 shadow-sm p-8 md:p-10 text-center"
        >
          <div class="text-xl font-black text-slate-800">目前沒有可查看的球員成績</div>
          <p class="mt-3 text-sm text-gray-500 leading-relaxed">
            你的帳號尚未綁定球員，或目前沒有可切換的球員資料。若需要查看成績，請請管理員協助完成綁定。
          </p>
        </section>

        <template v-else>
          <section class="my-record-summary-card rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
            <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div class="flex items-center gap-4 min-w-0">
                <el-avatar :size="72" :src="selectedMember?.avatar_url || undefined" class="shrink-0 border border-gray-200 bg-gray-50">
                  <span class="text-xl font-black text-gray-400">{{ selectedMember?.name?.charAt(0) || '球' }}</span>
                </el-avatar>

                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-2xl font-black leading-tight text-slate-900">{{ selectedMember?.name || '未選擇球員' }}</h3>
                    <span v-if="selectedMember?.is_linked" class="rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-black text-primary">關聯球員</span>
                    <span v-if="selectedMember?.jersey_number" class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">#{{ selectedMember.jersey_number }}</span>
                  </div>
                  <p class="mt-2 text-sm font-bold text-gray-500">
                    {{ selectedMember?.role || '球員' }}{{ selectedMember?.team_group ? `｜${selectedMember.team_group}` : '' }}{{ selectedMember?.status ? `｜${selectedMember.status}` : '' }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
                <div v-for="item in quickStats" :key="item.label" class="my-record-stat-card rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3 text-center">
                  <div class="text-[11px] font-black uppercase tracking-[0.16em] text-gray-400">{{ item.label }}</div>
                  <div class="mt-2 text-2xl font-black" :class="item.className">{{ item.value }}</div>
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-3xl border border-gray-100 bg-white p-2 shadow-sm">
            <el-tabs v-model="activeTab" class="my-records-tabs">
              <el-tab-pane label="比賽紀錄" name="matches">
                <div class="p-3 md:p-4">
                  <MatchGroups
                    :groups="groupedPastMatches"
                    empty-text="目前尚無歷史比賽紀錄。"
                    tone="past"
                    @open-match="openMatchDetail"
                  />
                </div>
              </el-tab-pane>

              <el-tab-pane label="未來賽程" name="future_matches">
                <div class="p-3 md:p-4">
                  <MatchGroups
                    :groups="groupedFutureMatches"
                    empty-text="目前尚無未來賽程。"
                    tone="future"
                    @open-match="openMatchDetail"
                  />
                </div>
              </el-tab-pane>

              <el-tab-pane label="打擊成績" name="batting">
                <StatsPanel
                  kind="batting"
                  :rows="filteredBattingRows"
                  :all-rows-count="battingRows.length"
                  :summary="filteredBattingSummary"
                  :tournaments="availableBattingTournaments"
                  v-model:selected-tournament="battingSelectedTournament"
                  v-model:show-chart="showBattingChart"
                  :chart-option="battingRadarChartOption"
                />
              </el-tab-pane>

              <el-tab-pane label="投球成績" name="pitching">
                <StatsPanel
                  kind="pitching"
                  :rows="filteredPitchingRows"
                  :all-rows-count="pitchingRows.length"
                  :summary="filteredPitchingSummary"
                  :tournaments="availablePitchingTournaments"
                  v-model:selected-tournament="pitchingSelectedTournament"
                  v-model:show-chart="showPitchingChart"
                  :chart-option="pitchingRadarChartOption"
                  :whip="filteredPitchingWhip"
                />
              </el-tab-pane>
            </el-tabs>
          </section>
        </template>
      </div>
    </div>

    <MatchDetailDialog
      v-model="detailVisible"
      :match-id="selectedMatchId"
      :match-record="selectedMatchForDialog"
      readonly
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, resolveComponent, watch, type PropType } from 'vue'
import dayjs from 'dayjs'
import { Calendar, Coordinate, DataAnalysis, Location, Refresh, Trophy } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { RadarChart } from 'echarts/charts'
import { LegendComponent, RadarComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import MatchDetailDialog from '@/components/match-records/MatchDetailDialog.vue'
import { getMyPlayerMatchRecords, listMyPlayerRecordMembers } from '@/services/myPlayerRecords'
import type { MyPlayerRecordMember } from '@/types/myPlayerRecords'
import type { MatchRecord } from '@/types/match'
import {
  filterMatchesForPlayer,
  formatInnings,
  getPlayerBattingGameRows,
  getPlayerPitchingGameRows,
  summarizePlayerBattingStats,
  summarizePlayerPitchingStats,
  type TournamentBattingGameRow,
  type TournamentBattingRow,
  type TournamentPitchingGameRow,
  type TournamentPitchingRow
} from '@/utils/matchRecordStats'

use([CanvasRenderer, RadarChart, TooltipComponent, LegendComponent, RadarComponent])

type RecordsTab = 'matches' | 'future_matches' | 'batting' | 'pitching'
type MatchGroupTone = 'past' | 'future'

interface MatchGroup {
  month: string
  matches: MatchRecord[]
}

const members = ref<MyPlayerRecordMember[]>([])
const selectedMemberId = ref('')
const memberMatches = ref<MatchRecord[]>([])
const isBootstrapping = ref(true)
const isRefreshing = ref(false)
const activeTab = ref<RecordsTab>('matches')
const battingSelectedTournament = ref('')
const pitchingSelectedTournament = ref('')
const showBattingChart = ref(true)
const showPitchingChart = ref(true)
const selectedMatchId = ref<string | null>(null)
const detailVisible = ref(false)

const selectedMember = computed(() =>
  members.value.find((member) => member.member_id === selectedMemberId.value) || null
)

const selectedPlayerIdentity = computed(() => ({
  name: selectedMember.value?.name || '',
  jersey_number: selectedMember.value?.jersey_number || null
}))

const playerMatches = computed(() => (
  selectedMember.value
    ? filterMatchesForPlayer(memberMatches.value, selectedPlayerIdentity.value)
    : []
))

const today = computed(() => dayjs().format('YYYY-MM-DD'))

const pastMatches = computed(() =>
  [...playerMatches.value]
    .filter((match) => match.match_date && match.match_date <= today.value)
    .sort((left, right) => compareMatchScheduleDesc(left, right))
)

const futureMatches = computed(() =>
  [...playerMatches.value]
    .filter((match) => match.match_date && match.match_date > today.value)
    .sort((left, right) => compareMatchScheduleAsc(left, right))
)

const groupedPastMatches = computed(() => groupMatchesByMonth(pastMatches.value, true))
const groupedFutureMatches = computed(() => groupMatchesByMonth(futureMatches.value, false))

const battingRows = computed(() => getPlayerBattingGameRows(playerMatches.value, selectedPlayerIdentity.value))
const pitchingRows = computed(() => getPlayerPitchingGameRows(playerMatches.value, selectedPlayerIdentity.value))

const availableBattingTournaments = computed(() => getTournamentOptionsFromRows(battingRows.value))
const availablePitchingTournaments = computed(() => getTournamentOptionsFromRows(pitchingRows.value))

const filteredBattingRows = computed(() => filterRowsByTournament(battingRows.value, battingSelectedTournament.value))
const filteredPitchingRows = computed(() => filterRowsByTournament(pitchingRows.value, pitchingSelectedTournament.value))

const filteredBattingMatches = computed(() => filterMatchesByStatGroup(playerMatches.value, battingSelectedTournament.value))
const filteredPitchingMatches = computed(() => filterMatchesByStatGroup(playerMatches.value, pitchingSelectedTournament.value))

const overallBattingSummary = computed(() => summarizePlayerBattingStats(playerMatches.value, selectedPlayerIdentity.value))
const filteredBattingSummary = computed(() => summarizePlayerBattingStats(filteredBattingMatches.value, selectedPlayerIdentity.value))
const filteredPitchingSummary = computed(() => summarizePlayerPitchingStats(filteredPitchingMatches.value, selectedPlayerIdentity.value))

const filteredPitchingWhip = computed(() => calculateWhip(filteredPitchingSummary.value))

const selectedMatchForDialog = computed(() =>
  memberMatches.value.find((match) => match.id === selectedMatchId.value) || null
)

const quickStats = computed(() => [
  { label: '出賽數', value: String(pastMatches.value.length), className: 'text-slate-800' },
  { label: '安打', value: String(overallBattingSummary.value.h || 0), className: 'text-slate-800' },
  { label: '打點', value: String(overallBattingSummary.value.rbi || 0), className: 'text-primary' },
  { label: '打擊率', value: formatRatio(overallBattingSummary.value.avg), className: 'text-primary' }
])

const battingRadarChartOption = computed(() => {
  const summary = filteredBattingSummary.value
  return {
    tooltip: { trigger: 'item' },
    radar: {
      indicator: [
        { name: 'AVG', max: 1 },
        { name: 'OBP', max: 1 },
        { name: 'SLG', max: 2 },
        { name: 'OPS', max: 3 },
        { name: 'H', max: Math.max(10, summary.h || 0) },
        { name: 'RBI', max: Math.max(10, summary.rbi || 0) }
      ],
      splitNumber: 4,
      axisName: { color: '#64748b', fontSize: 11 }
    },
    series: [{
      name: '打擊成績',
      type: 'radar',
      data: [{
        name: '打擊綜合',
        value: [
          summary.avg || 0,
          summary.obp || 0,
          summary.slg || 0,
          summary.ops || 0,
          summary.h || 0,
          summary.rbi || 0
        ],
        areaStyle: { color: 'rgba(216, 143, 34, 0.22)' },
        lineStyle: { color: '#d88f22', width: 2 },
        itemStyle: { color: '#d88f22' }
      }]
    }]
  }
})

const pitchingRadarChartOption = computed(() => {
  const summary = filteredPitchingSummary.value
  const innings = summary.ip_outs > 0 ? summary.ip_outs / 3 : 0
  const era = Number(summary.era || 0)
  const whip = Number(filteredPitchingWhip.value || 0)

  return {
    tooltip: { trigger: 'item' },
    radar: {
      indicator: [
        { name: 'IP', max: Math.max(10, innings) },
        { name: 'SO', max: Math.max(10, summary.so || 0) },
        { name: 'NP', max: Math.max(80, summary.np || 0) },
        { name: 'ERA', max: Math.max(10, era) },
        { name: 'WHIP', max: Math.max(5, whip) }
      ],
      splitNumber: 4,
      axisName: { color: '#64748b', fontSize: 11 }
    },
    series: [{
      name: '投球成績',
      type: 'radar',
      data: [{
        name: '投球綜合',
        value: [innings, summary.so || 0, summary.np || 0, era, whip],
        areaStyle: { color: 'rgba(59, 130, 246, 0.2)' },
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' }
      }]
    }]
  }
})

const initialize = async () => {
  isBootstrapping.value = true

  try {
    members.value = await listMyPlayerRecordMembers()
    selectedMemberId.value = pickInitialMemberId(members.value)

    if (selectedMemberId.value) {
      await loadRecordsForMember(selectedMemberId.value, false)
    }
  } catch (error: any) {
    console.error('Failed to load my player records:', error)
    ElMessage.error(error?.message || '讀取我的成績失敗')
  } finally {
    isBootstrapping.value = false
  }
}

const loadRecordsForMember = async (memberId: string, showRefreshing: boolean) => {
  if (showRefreshing) {
    isRefreshing.value = true
  }

  try {
    memberMatches.value = await getMyPlayerMatchRecords(memberId)
  } catch (error: any) {
    console.error('Failed to load player match records:', error)
    memberMatches.value = []
    ElMessage.error(error?.message || '讀取球員成績失敗')
  } finally {
    if (showRefreshing) {
      isRefreshing.value = false
    }
  }
}

const refreshCurrentMemberData = async () => {
  if (!selectedMemberId.value) return
  await loadRecordsForMember(selectedMemberId.value, true)
}

const pickInitialMemberId = (items: MyPlayerRecordMember[]) => (
  items.find((member) => member.is_linked)?.member_id ||
  items[0]?.member_id ||
  ''
)

const resetStatFilters = () => {
  battingSelectedTournament.value = ''
  pitchingSelectedTournament.value = ''
  activeTab.value = 'matches'
}

const buildMemberOptionLabel = (member: MyPlayerRecordMember) => {
  const tags = [
    member.jersey_number ? `#${member.jersey_number}` : '',
    member.role || '',
    member.team_group || ''
  ].filter(Boolean)

  return tags.length > 0 ? `${member.name} (${tags.join(' / ')})` : member.name
}

const openMatchDetail = (matchId: string) => {
  selectedMatchId.value = matchId
  detailVisible.value = true
}

const getMatchDateValue = (match: MatchRecord) => {
  if (!match.match_date) return 0
  const startTime = String(match.match_time || '').match(/\d{1,2}:\d{2}/)?.[0] || '00:00'
  return dayjs(`${match.match_date}T${startTime}`).valueOf()
}

const compareMatchScheduleAsc = (left: MatchRecord, right: MatchRecord) =>
  getMatchDateValue(left) - getMatchDateValue(right)

const compareMatchScheduleDesc = (left: MatchRecord, right: MatchRecord) =>
  compareMatchScheduleAsc(right, left)

const groupMatchesByMonth = (matches: MatchRecord[], sortDesc: boolean): MatchGroup[] => {
  const groups = new Map<string, MatchRecord[]>()

  matches.forEach((match) => {
    const month = match.match_date && dayjs(match.match_date).isValid()
      ? dayjs(match.match_date).format('YYYY年 M月')
      : '未知日期'
    groups.set(month, [...(groups.get(month) || []), match])
  })

  return Array.from(groups.entries())
    .sort(([left], [right]) => sortDesc ? right.localeCompare(left) : left.localeCompare(right))
    .map(([month, items]) => ({ month, matches: items }))
}

const getMatchGroupName = (match: MatchRecord) =>
  String(match.tournament_name || match.match_name || '').trim()

const filterMatchesByStatGroup = (matches: MatchRecord[], groupName: string) => {
  const normalizedGroupName = groupName.trim()
  if (!normalizedGroupName) return matches
  return matches.filter((match) => getMatchGroupName(match) === normalizedGroupName)
}

const getTournamentOptionsFromRows = (rows: Array<TournamentBattingGameRow | TournamentPitchingGameRow>) =>
  Array.from(new Set(rows.map((row) => String(row.tournament_name || row.match_name || '').trim()).filter(Boolean)))
    .sort((left, right) => right.localeCompare(left, 'zh-Hant'))

const filterRowsByTournament = <T extends TournamentBattingGameRow | TournamentPitchingGameRow>(rows: T[], groupName: string) => {
  const normalizedGroupName = groupName.trim()
  if (!normalizedGroupName) return rows
  return rows.filter((row) => String(row.tournament_name || row.match_name || '').trim() === normalizedGroupName)
}

const formatRatio = (value: number) => Number(value || 0).toFixed(3)

const calculateWhip = (summary: TournamentPitchingRow) => {
  if (!summary.ip_outs) return '0.00'
  return ((Number(summary.bb || 0) + Number(summary.h || 0)) / (summary.ip_outs / 3)).toFixed(2)
}

const getMapsHref = (location?: string | null) => {
  const normalized = location?.trim()
  if (!normalized) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalized)}`
}

const getMatchResultMeta = (match: MatchRecord) => {
  if (match.home_score > match.opponent_score) return { label: '勝', className: 'border-green-100 bg-green-50 text-green-700' }
  if (match.home_score < match.opponent_score) return { label: '敗', className: 'border-red-100 bg-red-50 text-red-600' }
  return { label: '和', className: 'border-slate-100 bg-slate-50 text-slate-500' }
}

const getMatchCardStyle = (tone: MatchGroupTone) => ({
  backgroundColor: '#fff',
  backgroundImage: tone === 'past'
    ? 'linear-gradient(135deg, rgba(216, 143, 34, 0.18) 0%, rgba(216, 143, 34, 0.08) 18%, rgba(255, 255, 255, 0) 38%), linear-gradient(315deg, rgba(37, 99, 235, 0.14) 0%, rgba(37, 99, 235, 0.06) 17%, rgba(255, 255, 255, 0) 36%)'
    : 'linear-gradient(135deg, rgba(59, 130, 246, 0.18) 0%, rgba(59, 130, 246, 0.08) 18%, rgba(255, 255, 255, 0) 38%), linear-gradient(315deg, rgba(216, 143, 34, 0.16) 0%, rgba(216, 143, 34, 0.07) 17%, rgba(255, 255, 255, 0) 36%)',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '100% 100%'
})

const formatMatchDate = (match: MatchRecord) => {
  if (!match.match_date) return '日期未定'
  const parsed = dayjs(match.match_date)
  return parsed.isValid() ? `${parsed.format('MM/DD')} 週${'日一二三四五六'[parsed.day()]}` : match.match_date
}

const formatMatchTime = (match: MatchRecord) => match.match_time || '時間待確認'

const formatMatchTitle = (match: MatchRecord) => {
  if (match.opponent) return `中港熊戰 vs ${match.opponent}`
  return match.match_name || '賽事待確認'
}

const MatchGroups = defineComponent({
  name: 'MatchGroups',
  props: {
    groups: {
      type: Array as PropType<MatchGroup[]>,
      required: true
    },
    emptyText: {
      type: String,
      required: true
    },
    tone: {
      type: String as PropType<MatchGroupTone>,
      required: true
    }
  },
  emits: ['open-match'],
  setup(props, { emit }) {
    return () => {
      if (props.groups.length === 0) {
        return h('div', { class: 'flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-bold text-gray-400' }, props.emptyText)
      }

      return h('div', { class: 'space-y-8' }, props.groups.map((group) =>
        h('section', { key: group.month, class: 'space-y-3' }, [
          h('div', { class: 'inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-700' }, [
            h(Trophy, { class: props.tone === 'past' ? 'h-4 w-4 text-primary' : 'h-4 w-4 text-blue-500' }),
            group.month
          ]),
          h('div', { class: 'grid gap-3 md:grid-cols-2 xl:grid-cols-3' }, group.matches.map((match) => {
            const result = getMatchResultMeta(match)
            const mapsHref = getMapsHref(match.location)

            return h('article', {
              key: match.id,
              'data-test': `match-card-${match.id}`,
              class: 'rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md',
              style: getMatchCardStyle(props.tone)
            }, [
              h('button', {
                type: 'button',
                class: 'block w-full text-left',
                onClick: () => emit('open-match', match.id)
              }, [
                h('div', { class: 'flex items-start justify-between gap-3' }, [
                  h('div', { class: 'min-w-0' }, [
                    h('div', { class: props.tone === 'past' ? 'text-xs font-black text-primary' : 'text-xs font-black text-blue-500' }, `${formatMatchDate(match)}｜${formatMatchTime(match)}`),
                    h('h3', { class: 'mt-2 line-clamp-2 text-lg font-black leading-tight text-slate-900' }, formatMatchTitle(match))
                  ]),
                  props.tone === 'past'
                    ? h('span', { class: `shrink-0 rounded-full border px-3 py-1 text-xs font-black ${result.className}` }, result.label)
                    : h('span', { class: 'shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-600' }, '未來')
                ]),
                h('div', { class: 'mt-4 flex flex-wrap gap-2' }, [
                  match.category_group ? h('span', { class: 'rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500' }, match.category_group) : null,
                  match.match_level ? h('span', { class: 'rounded-full bg-primary/5 px-3 py-1 text-xs font-bold text-primary' }, match.match_level) : null,
                  match.tournament_name ? h('span', { class: 'rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500' }, match.tournament_name) : null
                ]),
                props.tone === 'past'
                  ? h('div', { class: 'mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-center font-mono text-2xl font-black text-slate-800' }, `${match.home_score ?? 0} : ${match.opponent_score ?? 0}`)
                  : null,
                h('div', { class: 'mt-4 flex items-center gap-2 text-sm font-bold text-gray-500' }, [
                  h(Location, { class: 'h-4 w-4 shrink-0' }),
                  h('span', { class: 'truncate' }, match.location || '地點待確認')
                ])
              ]),
              props.tone === 'future' && mapsHref
                ? h('a', {
                  href: mapsHref,
                  target: '_blank',
                  rel: 'noreferrer',
                  class: 'mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-black text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-600'
                }, [
                  h(Location, { class: 'h-4 w-4' }),
                  '開啟導航'
                ])
                : null
            ])
          }))
        ])
      ))
    }
  }
})

const StatsPanel = defineComponent({
  name: 'StatsPanel',
  props: {
    kind: {
      type: String as PropType<'batting' | 'pitching'>,
      required: true
    },
    rows: {
      type: Array as PropType<Array<TournamentBattingGameRow | TournamentPitchingGameRow>>,
      required: true
    },
    allRowsCount: {
      type: Number,
      required: true
    },
    summary: {
      type: Object as PropType<TournamentBattingRow | TournamentPitchingRow>,
      required: true
    },
    tournaments: {
      type: Array as PropType<string[]>,
      required: true
    },
    selectedTournament: {
      type: String,
      required: true
    },
    showChart: {
      type: Boolean,
      required: true
    },
    chartOption: {
      type: Object,
      required: true
    },
    whip: {
      type: String,
      default: '0.00'
    }
  },
  emits: ['update:selectedTournament', 'update:showChart'],
  setup(props, { emit }) {
    const ElOption = resolveComponent('el-option')
    const ElSelect = resolveComponent('el-select')
    const ElSwitch = resolveComponent('el-switch')
    const isBatting = computed(() => props.kind === 'batting')
    const panelTitle = computed(() => isBatting.value ? '打擊成績' : '投球成績')
    const panelIcon = computed(() => isBatting.value ? Trophy : Coordinate)

    return () => {
      if (props.allRowsCount === 0) {
        return h('div', { class: 'flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center' }, [
          h(panelIcon.value, { class: 'mb-3 h-10 w-10 text-gray-300' }),
          h('div', { class: 'text-base font-black text-slate-700' }, `目前尚無${panelTitle.value}`),
          h('p', { class: 'mt-2 text-sm font-bold text-gray-400' }, '比賽紀錄儲存個人成績後，這裡會自動彙總。')
        ])
      }

      return h('div', { class: 'space-y-5 p-3 md:p-4' }, [
        h('div', { class: 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between' }, [
          h('div', { class: 'flex items-center gap-3' }, [
            h('div', { class: isBatting.value ? 'flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary' : 'flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600' }, [
              h(panelIcon.value, { class: 'h-5 w-5' })
            ]),
            h('div', [
              h('h3', { class: 'text-lg font-black text-slate-900' }, panelTitle.value),
              h('p', { class: 'mt-1 text-xs font-bold text-gray-400' }, props.selectedTournament ? `目前篩選：${props.selectedTournament}` : '目前顯示全部賽事累計')
            ])
          ]),
          h('div', { class: 'flex flex-col gap-2 sm:flex-row sm:items-center' }, [
            h(ElSwitch, {
              modelValue: props.showChart,
              activeText: '顯示圖表',
              inactiveText: '隱藏圖表',
              inlinePrompt: true,
              'onUpdate:modelValue': (value: boolean) => emit('update:showChart', value)
            }),
            h(ElSelect, {
              modelValue: props.selectedTournament,
              class: 'w-full sm:w-56',
              clearable: true,
              filterable: true,
              placeholder: '全部盃賽',
              'onUpdate:modelValue': (value: string) => emit('update:selectedTournament', value || '')
            }, () => props.tournaments.map((name) => h(ElOption, { key: name, label: name, value: name })))
          ])
        ]),
        props.showChart
          ? h('div', { class: isBatting.value ? 'h-80 rounded-2xl border border-primary/10 bg-primary/5 p-4' : 'h-80 rounded-2xl border border-blue-100 bg-blue-50/60 p-4' }, [
            h(VChart, { class: 'h-full w-full', option: props.chartOption, autoresize: true })
          ])
          : null,
        isBatting.value
          ? h(BattingSummaryGrid, { summary: props.summary as TournamentBattingRow })
          : h(PitchingSummaryGrid, { summary: props.summary as TournamentPitchingRow, whip: props.whip }),
        isBatting.value
          ? h(BattingRowsTable, { rows: props.rows as TournamentBattingGameRow[] })
          : h(PitchingRowsTable, { rows: props.rows as TournamentPitchingGameRow[] })
      ])
    }
  }
})

const BattingSummaryGrid = defineComponent({
  name: 'BattingSummaryGrid',
  props: {
    summary: {
      type: Object as PropType<TournamentBattingRow>,
      required: true
    }
  },
  setup(props) {
    return () => h('div', { class: 'grid grid-cols-2 gap-3 rounded-2xl border border-gray-100 bg-white p-4 sm:grid-cols-4 xl:grid-cols-8' }, [
      ['PA', props.summary.pa], ['AB', props.summary.ab], ['H', props.summary.h], ['HR', props.summary.hr],
      ['RBI', props.summary.rbi], ['R', props.summary.r], ['BB', props.summary.bb], ['SO', props.summary.so]
    ].map(([label, value]) => h('div', { key: label, class: 'text-center' }, [
      h('div', { class: 'text-[11px] font-black text-gray-400' }, label),
      h('div', { class: 'mt-1 font-mono text-xl font-black text-slate-800' }, String(value))
    ])).concat([
      h('div', { key: 'AVG', class: 'text-center sm:col-span-2 xl:col-span-2' }, [
        h('div', { class: 'text-[11px] font-black text-gray-400' }, 'AVG'),
        h('div', { class: 'mt-1 font-mono text-2xl font-black text-primary' }, formatRatio(props.summary.avg))
      ]),
      h('div', { key: 'OBP', class: 'text-center sm:col-span-2 xl:col-span-2' }, [
        h('div', { class: 'text-[11px] font-black text-gray-400' }, 'OBP'),
        h('div', { class: 'mt-1 font-mono text-2xl font-black text-blue-600' }, formatRatio(props.summary.obp))
      ]),
      h('div', { key: 'SLG', class: 'text-center sm:col-span-2 xl:col-span-2' }, [
        h('div', { class: 'text-[11px] font-black text-gray-400' }, 'SLG'),
        h('div', { class: 'mt-1 font-mono text-2xl font-black text-green-600' }, formatRatio(props.summary.slg))
      ]),
      h('div', { key: 'OPS', class: 'text-center sm:col-span-2 xl:col-span-2' }, [
        h('div', { class: 'text-[11px] font-black text-gray-400' }, 'OPS'),
        h('div', { class: 'mt-1 font-mono text-2xl font-black text-amber-600' }, formatRatio(props.summary.ops))
      ])
    ]))
  }
})

const PitchingSummaryGrid = defineComponent({
  name: 'PitchingSummaryGrid',
  props: {
    summary: {
      type: Object as PropType<TournamentPitchingRow>,
      required: true
    },
    whip: {
      type: String,
      required: true
    }
  },
  setup(props) {
    return () => h('div', { class: 'grid grid-cols-2 gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-4 xl:grid-cols-8' }, [
      ['IP', props.summary.formattedIP], ['NP', props.summary.np], ['H', props.summary.h], ['BB', props.summary.bb],
      ['SO', props.summary.so], ['R', props.summary.r], ['ER', props.summary.er], ['HR', props.summary.hr]
    ].map(([label, value]) => h('div', { key: label, class: 'text-center' }, [
      h('div', { class: 'text-[11px] font-black text-blue-400' }, label),
      h('div', { class: 'mt-1 font-mono text-xl font-black text-slate-800' }, String(value))
    ])).concat([
      h('div', { key: 'ERA', class: 'text-center sm:col-span-2 xl:col-span-4' }, [
        h('div', { class: 'text-[11px] font-black text-blue-400' }, 'ERA'),
        h('div', { class: 'mt-1 font-mono text-3xl font-black text-blue-600' }, props.summary.era)
      ]),
      h('div', { key: 'WHIP', class: 'text-center sm:col-span-2 xl:col-span-4' }, [
        h('div', { class: 'text-[11px] font-black text-blue-400' }, 'WHIP'),
        h('div', { class: 'mt-1 font-mono text-3xl font-black text-sky-600' }, props.whip)
      ])
    ]))
  }
})

const BattingRowsTable = defineComponent({
  name: 'BattingRowsTable',
  props: {
    rows: {
      type: Array as PropType<TournamentBattingGameRow[]>,
      required: true
    }
  },
  setup(props) {
    return () => h('div', { class: 'overflow-x-auto rounded-2xl border border-gray-100 bg-white' }, [
      h('table', { class: 'w-full min-w-[780px] text-left' }, [
        h('thead', { class: 'bg-gray-50 text-xs font-black text-gray-500' }, [
          h('tr', ['比賽', 'PA', 'AB', 'H', 'HR', 'RBI', 'R', 'BB', 'SO', 'SB', 'AVG'].map((label) =>
            h('th', { key: label, class: label === '比賽' ? 'px-4 py-3' : 'px-3 py-3 text-center' }, label)
          ))
        ]),
        h('tbody', { class: 'divide-y divide-gray-100' }, props.rows.map((row) =>
          h('tr', { key: row.matchId, class: 'hover:bg-gray-50/70' }, [
            h('td', { class: 'px-4 py-3' }, [
              h('div', { class: 'font-black text-slate-800' }, row.match_name || row.opponent || '比賽'),
              h('div', { class: 'mt-1 text-xs font-bold text-gray-400' }, `${row.match_date || '日期未定'}｜${row.result}`)
            ]),
            ...[row.pa, row.ab, row.h, row.hr, row.rbi, row.r, row.bb, row.so, row.sb].map((value, index) =>
              h('td', { key: index, class: 'px-3 py-3 text-center font-mono text-sm font-bold text-slate-700' }, String(value || 0))
            ),
            h('td', { class: 'px-3 py-3 text-center font-mono text-sm font-black text-primary' }, formatRatio(row.avg))
          ])
        ))
      ])
    ])
  }
})

const PitchingRowsTable = defineComponent({
  name: 'PitchingRowsTable',
  props: {
    rows: {
      type: Array as PropType<TournamentPitchingGameRow[]>,
      required: true
    }
  },
  setup(props) {
    return () => h('div', { class: 'overflow-x-auto rounded-2xl border border-blue-100 bg-white' }, [
      h('table', { class: 'w-full min-w-[760px] text-left' }, [
        h('thead', { class: 'bg-blue-50 text-xs font-black text-blue-600' }, [
          h('tr', ['比賽', 'IP', 'NP', 'H', 'BB', 'SO', 'R', 'ER', 'ERA'].map((label) =>
            h('th', { key: label, class: label === '比賽' ? 'px-4 py-3' : 'px-3 py-3 text-center' }, label)
          ))
        ]),
        h('tbody', { class: 'divide-y divide-blue-50' }, props.rows.map((row) =>
          h('tr', { key: row.matchId, class: 'hover:bg-blue-50/50' }, [
            h('td', { class: 'px-4 py-3' }, [
              h('div', { class: 'font-black text-slate-800' }, row.match_name || row.opponent || '比賽'),
              h('div', { class: 'mt-1 text-xs font-bold text-blue-400' }, `${row.match_date || '日期未定'}｜${row.result}`)
            ]),
            h('td', { class: 'px-3 py-3 text-center font-mono text-sm font-bold text-slate-700' }, formatInnings(row.ip_outs)),
            ...[row.np, row.h, row.bb, row.so, row.r, row.er].map((value, index) =>
              h('td', { key: index, class: 'px-3 py-3 text-center font-mono text-sm font-bold text-slate-700' }, String(value || 0))
            ),
            h('td', { class: 'px-3 py-3 text-center font-mono text-sm font-black text-blue-600' }, row.era)
          ])
        ))
      ])
    ])
  }
})

watch(selectedMemberId, (memberId, previousMemberId) => {
  if (!memberId || !previousMemberId || memberId === previousMemberId) {
    return
  }

  resetStatFilters()
  void loadRecordsForMember(memberId, true)
})

watch(availableBattingTournaments, (options) => {
  if (battingSelectedTournament.value && !options.includes(battingSelectedTournament.value)) {
    battingSelectedTournament.value = ''
  }
})

watch(availablePitchingTournaments, (options) => {
  if (pitchingSelectedTournament.value && !options.includes(pitchingSelectedTournament.value)) {
    pitchingSelectedTournament.value = ''
  }
})

onMounted(() => {
  void initialize()
})
</script>

<style scoped>
.my-records-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0.5rem 0.75rem 0;
}

.my-records-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background-color: rgb(243 244 246);
}

.my-records-tabs :deep(.el-tabs__item) {
  font-weight: 900;
}

.my-record-summary-card {
  background-image:
    linear-gradient(135deg, rgba(216, 143, 34, 0.2) 0%, rgba(216, 143, 34, 0.08) 20%, rgba(255, 255, 255, 0) 42%),
    linear-gradient(315deg, rgba(37, 99, 235, 0.16) 0%, rgba(37, 99, 235, 0.07) 19%, rgba(255, 255, 255, 0) 40%);
  background-repeat: no-repeat;
  background-size: 100% 100%;
}

.my-record-stat-card {
  background-image:
    linear-gradient(135deg, rgba(216, 143, 34, 0.13) 0%, rgba(216, 143, 34, 0.06) 24%, rgba(255, 255, 255, 0) 46%),
    linear-gradient(315deg, rgba(37, 99, 235, 0.11) 0%, rgba(37, 99, 235, 0.05) 22%, rgba(255, 255, 255, 0) 44%);
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
</style>
