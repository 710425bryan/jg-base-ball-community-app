<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DataAnalysis, Trophy } from '@element-plus/icons-vue'
import type { MatchRecord } from '@/types/match'
import {
  aggregateTournamentBattingStats,
  aggregateTournamentPitchingStats,
  filterMatchesByTournament,
  getTournamentPlayerBattingGameRows,
  getTournamentPlayerPitchingGameRows,
  getTournamentNames
} from '@/utils/matchRecordStats'
import type { TournamentBattingGameRow, TournamentPitchingGameRow } from '@/utils/matchRecordStats'

const props = defineProps<{
  matches: MatchRecord[]
}>()

const selectedTournament = ref('')
const selectedPlayerName = ref('')
const playerDetailVisible = ref(false)

const tournamentOptions = computed(() => getTournamentNames(props.matches))

watch(tournamentOptions, (options) => {
  if (selectedTournament.value && !options.includes(selectedTournament.value)) {
    selectedTournament.value = ''
    selectedPlayerName.value = ''
    playerDetailVisible.value = false
  }
}, { immediate: true })

const tournamentMatches = computed(() =>
  selectedTournament.value
    ? filterMatchesByTournament(props.matches, selectedTournament.value)
    : []
)

const battingRows = computed(() => aggregateTournamentBattingStats(tournamentMatches.value))
const pitchingRows = computed(() => aggregateTournamentPitchingStats(tournamentMatches.value))

type BattingDetailRow = TournamentBattingGameRow & { isTotal?: boolean }
type PitchingDetailRow = TournamentPitchingGameRow & { isTotal?: boolean }

const selectedPlayerBattingGameRows = computed(() =>
  getTournamentPlayerBattingGameRows(tournamentMatches.value, selectedPlayerName.value)
)

const selectedPlayerPitchingGameRows = computed(() =>
  getTournamentPlayerPitchingGameRows(tournamentMatches.value, selectedPlayerName.value)
)

const selectedPlayerBattingRows = computed<BattingDetailRow[]>(() => {
  const total = battingRows.value.find((row) => row.name === selectedPlayerName.value)
  if (!total) return selectedPlayerBattingGameRows.value

  return [
    ...selectedPlayerBattingGameRows.value,
    {
      ...total,
      matchId: '__batting_total__',
      match_date: '總計',
      opponent: '',
      result: '',
      isTotal: true
    }
  ]
})

const selectedPlayerPitchingRows = computed<PitchingDetailRow[]>(() => {
  const total = pitchingRows.value.find((row) => row.name === selectedPlayerName.value)
  if (!total) return selectedPlayerPitchingGameRows.value

  return [
    ...selectedPlayerPitchingGameRows.value,
    {
      ...total,
      matchId: '__pitching_total__',
      match_date: '總計',
      opponent: '',
      result: '',
      isTotal: true
    }
  ]
})

const openPlayerDetail = (playerName: string) => {
  selectedPlayerName.value = playerName
  playerDetailVisible.value = true
}

const clickableStatsRowClass = () => 'cursor-pointer'

const detailRowClass = ({ row }: { row: { isTotal?: boolean } }) =>
  row.isTotal ? 'match-detail-total-row' : ''

const formatRatio = (value: number) => Number(value || 0).toFixed(3)

const getMatchResultMeta = (match: MatchRecord) => {
  if (match.home_score > match.opponent_score) return { label: '勝', class: 'bg-green-50 text-green-700 border-green-100' }
  if (match.home_score < match.opponent_score) return { label: '敗', class: 'bg-red-50 text-red-600 border-red-100' }
  return { label: '和', class: 'bg-slate-50 text-slate-500 border-slate-100' }
}
</script>

<template>
  <section class="space-y-5">
    <div class="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <el-icon class="text-xl"><DataAnalysis /></el-icon>
        </div>
        <div>
          <h2 class="text-base font-black text-slate-900">賽事成績</h2>
          <p class="mt-0.5 text-xs font-semibold text-slate-500">依比賽紀錄內的盃賽名稱彙總，未填時使用賽事名稱</p>
        </div>
      </div>

      <el-select
        v-model="selectedTournament"
        class="w-full md:w-80"
        size="large"
        filterable
        clearable
        placeholder="選擇盃賽或賽事名稱"
        :disabled="tournamentOptions.length === 0"
      >
        <el-option v-for="name in tournamentOptions" :key="name" :label="name" :value="name" />
      </el-select>
    </div>

    <div v-if="!selectedTournament" class="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
      <el-icon class="mb-3 text-5xl text-slate-300"><Trophy /></el-icon>
      <h3 class="text-base font-black text-slate-700">
        {{ tournamentOptions.length === 0 ? '尚無可彙總的賽事紀錄' : '請先選擇賽事名稱' }}
      </h3>
      <p class="mt-2 max-w-md text-sm font-medium text-slate-500">
        {{ tournamentOptions.length === 0 ? '目前篩選範圍內沒有可用的比賽紀錄資料。' : '選擇盃賽或賽事名稱後，再彙總該賽事的球員成績。' }}
      </p>
    </div>

    <template v-else>
      <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 class="text-sm font-black text-slate-800">賽程列表</h3>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">共 {{ tournamentMatches.length }} 場</span>
        </div>
        <el-table :data="tournamentMatches" stripe style="width: 100%" empty-text="無賽程資料">
          <el-table-column prop="match_date" label="日期" width="120" sortable />
          <el-table-column prop="opponent" label="對手" min-width="130" show-overflow-tooltip />
          <el-table-column label="結果" width="90" align="center">
            <template #default="{ row }">
              <span class="inline-flex rounded border px-2 py-0.5 text-xs font-black" :class="getMatchResultMeta(row).class">
                {{ getMatchResultMeta(row).label }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="比分" width="110" align="center">
            <template #default="{ row }">
              <span class="font-mono text-sm font-black text-slate-700">{{ row.home_score }} : {{ row.opponent_score }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-100 px-4 py-3">
          <h3 class="text-sm font-black text-slate-800">全隊打擊成績</h3>
        </div>
        <el-table
          :data="battingRows"
          stripe
          border
          style="width: 100%"
          empty-text="無打擊資料"
          :default-sort="{ prop: 'avg', order: 'descending' }"
          :row-class-name="clickableStatsRowClass"
          @row-click="(row: any) => openPlayerDetail(row.name)"
        >
          <el-table-column prop="name" label="姓名" min-width="110" fixed sortable />
          <el-table-column prop="pa" label="打席" min-width="80" align="right" sortable />
          <el-table-column prop="ab" label="打數" min-width="80" align="right" sortable />
          <el-table-column prop="avg" label="打擊率" min-width="100" align="right" sortable>
            <template #default="{ row }"><span class="font-bold text-blue-600">{{ formatRatio(row.avg) }}</span></template>
          </el-table-column>
          <el-table-column prop="h" label="安打" min-width="80" align="right" sortable />
          <el-table-column prop="h1" label="一安" min-width="80" align="right" sortable />
          <el-table-column prop="h2" label="二安" min-width="80" align="right" sortable />
          <el-table-column prop="h3" label="三安" min-width="80" align="right" sortable />
          <el-table-column prop="hr" label="全壘" min-width="80" align="right" sortable />
          <el-table-column prop="rbi" label="打點" min-width="90" align="right" sortable />
          <el-table-column prop="r" label="得分" min-width="80" align="right" sortable />
          <el-table-column prop="bb" label="四壞" min-width="80" align="right" sortable />
          <el-table-column prop="hbp" label="觸身" min-width="90" align="right" sortable />
          <el-table-column prop="so" label="三振" min-width="80" align="right" sortable />
          <el-table-column prop="sb" label="盜壘" min-width="80" align="right" sortable />
          <el-table-column prop="obp" label="上壘率" min-width="100" align="right" sortable>
            <template #default="{ row }"><span class="font-bold text-teal-600">{{ formatRatio(row.obp) }}</span></template>
          </el-table-column>
          <el-table-column prop="slg" label="長打率" min-width="100" align="right" sortable>
            <template #default="{ row }"><span class="font-bold text-orange-600">{{ formatRatio(row.slg) }}</span></template>
          </el-table-column>
          <el-table-column prop="ops" label="攻擊指數" min-width="100" align="right" sortable>
            <template #default="{ row }"><span class="font-bold text-purple-600">{{ formatRatio(row.ops) }}</span></template>
          </el-table-column>
        </el-table>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-100 px-4 py-3">
          <h3 class="text-sm font-black text-slate-800">全隊投手成績</h3>
        </div>
        <el-table
          :data="pitchingRows"
          stripe
          border
          style="width: 100%"
          empty-text="無投手資料"
          :default-sort="{ prop: 'ip_outs', order: 'descending' }"
          :row-class-name="clickableStatsRowClass"
          @row-click="(row: any) => openPlayerDetail(row.name)"
        >
          <el-table-column prop="name" label="球員" min-width="110" fixed sortable />
          <el-table-column prop="formattedIP" label="局數" min-width="90" align="right" sortable sort-by="ip_outs" />
          <el-table-column prop="h" label="被安" min-width="80" align="right" sortable />
          <el-table-column prop="h2" label="被二安" min-width="80" align="right" sortable />
          <el-table-column prop="h3" label="被三安" min-width="80" align="right" sortable />
          <el-table-column prop="hr" label="被全壘" min-width="80" align="right" sortable />
          <el-table-column prop="r" label="失分" min-width="80" align="right" sortable />
          <el-table-column prop="er" label="責失" min-width="80" align="right" sortable />
          <el-table-column prop="bb" label="四壞" min-width="80" align="right" sortable />
          <el-table-column prop="so" label="三振" min-width="80" align="right" sortable />
          <el-table-column prop="np" label="球數" min-width="90" align="right" sortable />
          <el-table-column prop="baa" label="被打擊率" min-width="100" align="right" sortable>
            <template #default="{ row }"><span v-if="row.hasDetailed">{{ formatRatio(row.baa) }}</span><span v-else class="text-slate-300">-</span></template>
          </el-table-column>
          <el-table-column prop="slga" label="被長打率" min-width="100" align="right" sortable>
            <template #default="{ row }"><span v-if="row.hasDetailed">{{ formatRatio(row.slga) }}</span><span v-else class="text-slate-300">-</span></template>
          </el-table-column>
          <el-table-column prop="era" label="防禦率" min-width="100" align="right" sortable>
            <template #default="{ row }"><span class="font-bold text-blue-600">{{ row.era }}</span></template>
          </el-table-column>
          <el-table-column prop="go_ao" label="滾飛比" min-width="100" align="right" sortable>
            <template #default="{ row }"><span v-if="row.hasDetailed">{{ row.go_ao }}</span><span v-else class="text-slate-300">-</span></template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <el-dialog
      v-model="playerDetailVisible"
      width="95%"
      class="max-w-6xl !rounded-2xl"
      destroy-on-close
      append-to-body
    >
      <template #header>
        <div class="min-w-0 pr-8">
          <h3 class="truncate text-base font-black text-red-600">
            {{ selectedPlayerName }} - {{ selectedTournament }} 成績
          </h3>
        </div>
      </template>

      <div class="space-y-7">
        <section>
          <div class="mb-3 flex items-center gap-2">
            <span class="h-5 w-1.5 rounded-full bg-blue-500"></span>
            <h4 class="text-base font-black text-blue-700">打擊部分</h4>
          </div>
          <el-table
            :data="selectedPlayerBattingRows"
            border
            stripe
            size="small"
            style="width: 100%"
            empty-text="此球員在本賽事無打擊成績"
            :row-class-name="detailRowClass"
          >
            <el-table-column prop="match_date" label="日期" width="110" fixed />
            <el-table-column prop="opponent" label="對手" min-width="130" show-overflow-tooltip />
            <el-table-column prop="result" label="結果" width="90" />
            <el-table-column prop="pa" label="打席" width="70" align="right" />
            <el-table-column prop="ab" label="打數" width="70" align="right" />
            <el-table-column prop="h" label="安打" width="70" align="right" />
            <el-table-column prop="h2" label="二壘" width="70" align="right" />
            <el-table-column prop="h3" label="三壘" width="70" align="right" />
            <el-table-column prop="hr" label="全壘" width="70" align="right" />
            <el-table-column prop="rbi" label="打點" width="70" align="right" />
            <el-table-column prop="r" label="得分" width="70" align="right" />
            <el-table-column prop="bb" label="四壞" width="70" align="right" />
            <el-table-column prop="so" label="三振" width="70" align="right" />
            <el-table-column prop="sb" label="盜壘" width="70" align="right" />
            <el-table-column prop="avg" label="打擊率" width="90" align="right">
              <template #default="{ row }"><span class="font-bold text-blue-600">{{ formatRatio(row.avg) }}</span></template>
            </el-table-column>
            <el-table-column prop="obp" label="上壘率" width="90" align="right">
              <template #default="{ row }"><span class="font-bold text-teal-600">{{ formatRatio(row.obp) }}</span></template>
            </el-table-column>
            <el-table-column prop="slg" label="長打率" width="90" align="right">
              <template #default="{ row }">{{ formatRatio(row.slg) }}</template>
            </el-table-column>
            <el-table-column prop="ops" label="攻擊指數" width="90" align="right">
              <template #default="{ row }">{{ formatRatio(row.ops) }}</template>
            </el-table-column>
          </el-table>
        </section>

        <section>
          <div class="mb-3 flex items-center gap-2">
            <span class="h-5 w-1.5 rounded-full bg-orange-500"></span>
            <h4 class="text-base font-black text-orange-700">投球部分</h4>
          </div>
          <el-table
            :data="selectedPlayerPitchingRows"
            border
            stripe
            size="small"
            style="width: 100%"
            empty-text="此球員在本賽事無投球成績"
            :row-class-name="detailRowClass"
          >
            <el-table-column prop="match_date" label="日期" width="110" fixed />
            <el-table-column prop="opponent" label="對手" min-width="130" show-overflow-tooltip />
            <el-table-column prop="result" label="結果" width="90" />
            <el-table-column prop="formattedIP" label="局數" width="70" align="right" />
            <el-table-column prop="ab" label="打數" width="70" align="right" />
            <el-table-column prop="h" label="安打" width="70" align="right" />
            <el-table-column prop="h2" label="二壘" width="70" align="right" />
            <el-table-column prop="h3" label="三壘" width="70" align="right" />
            <el-table-column prop="hr" label="全壘" width="70" align="right" />
            <el-table-column prop="bb" label="四死" width="70" align="right" />
            <el-table-column prop="so" label="三振" width="70" align="right" />
            <el-table-column prop="r" label="失分" width="70" align="right" />
            <el-table-column prop="er" label="責失" width="70" align="right" />
            <el-table-column prop="baa" label="被打擊率" width="100" align="right">
              <template #default="{ row }"><span>{{ formatRatio(row.baa) }}</span></template>
            </el-table-column>
            <el-table-column prop="slga" label="被長打率" width="100" align="right">
              <template #default="{ row }"><span>{{ formatRatio(row.slga) }}</span></template>
            </el-table-column>
            <el-table-column prop="era" label="防禦率" width="90" align="right" />
            <el-table-column prop="go_ao" label="滾飛比" width="90" align="right" />
          </el-table>
        </section>
      </div>
    </el-dialog>
  </section>
</template>

<style scoped>
:deep(.el-table__row.cursor-pointer) {
  cursor: pointer;
}

:deep(.el-table__row.cursor-pointer:hover > td) {
  background-color: #eff6ff !important;
}

:deep(.match-detail-total-row > td) {
  background-color: #f1f5f9 !important;
  font-weight: 800;
}
</style>
