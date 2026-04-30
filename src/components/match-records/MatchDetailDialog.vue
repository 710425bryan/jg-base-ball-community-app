<script setup lang="ts">
import { computed, watch } from 'vue'
import { Trophy, Location, Calendar, Position, Avatar, WarnTriangleFilled, ArrowLeft, ArrowRight, Delete, Edit, Document, Timer, DataAnalysis, VideoCamera } from '@element-plus/icons-vue'
import { useMatchesStore } from '@/stores/matches'
import type { MatchRecord } from '@/types/match'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import VisualField from '@/components/match-records/VisualField.vue'
import { normalizeExternalUrl } from '@/utils/externalUrl'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  matchId: string | null
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'edit'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const matchesStore = useMatchesStore()
const loading = computed(() => matchesStore.loading)

const matchData = computed(() => {
  if (!props.matchId) return null
  return matchesStore.matches.find(m => m.id === props.matchId) || null
})

watch(
  () => [visible.value, props.matchId] as const,
  ([isVisible, matchId]) => {
    if (!isVisible || !matchId) return
    void matchesStore.fetchMatch(matchId).catch((error) => {
      console.error('Unable to load match detail:', error)
      ElMessage.error('載入比賽詳情失敗，請稍後再試')
    })
  },
  { immediate: true }
)

const activeDetailLineup = computed(() => {
  const currentLineup = matchData.value?.current_lineup || []
  if (currentLineup.some((player) => String(player.name || '').trim())) {
    return currentLineup
  }
  return matchData.value?.lineup || []
})

const isFuture = computed(() => {
  if (!matchData.value?.match_date) return false
  return dayjs(matchData.value.match_date).isAfter(dayjs(), 'day')
})

const matchDateLabel = computed(() => {
  if (!matchData.value?.match_date) return '未設定日期'
  return dayjs(matchData.value.match_date).format('YYYY年M月D日')
})

const videoUrl = computed(() => normalizeExternalUrl(matchData.value?.video_url))

const handleDelete = async () => {
  if (!matchData.value) return
  try {
    await ElMessageBox.confirm('確定要刪除這場比賽紀錄嗎？這項動作無法復原。', '警告', {
      type: 'error',
      confirmButtonText: '確定刪除',
      confirmButtonClass: 'el-button--danger',
      cancelButtonText: '取消'
    })
    await matchesStore.deleteMatch(matchData.value.id)
    ElMessage.success('已刪除比賽紀錄')
    visible.value = false
  } catch (e) {
    // cancelled
  }
}

// Calculate team stats
const teamStats = computed(() => {
  if (!matchData.value?.batting_stats) return null
  const stats = matchData.value.batting_stats
  
  let totalPA = 0, totalAB = 0, totalH = 0, totalHR = 0, totalRBI = 0, totalR = 0
  
  stats.forEach(s => {
    totalPA += s.pa || 0
    totalAB += s.ab || 0
    totalH += (s.h1 || 0) + (s.h2 || 0) + (s.h3 || 0) + (s.hr || 0)
    totalHR += s.hr || 0
    totalRBI += s.rbi || 0
    totalR += s.r || 0
  })

  const avgStr = totalAB > 0 ? (totalH / totalAB).toFixed(3).replace(/^0/, '') : '.000'

  return { totalPA, totalAB, totalH, totalHR, totalRBI, totalR, avgStr }
})

const getAvg = (s: any) => {
  const h = (s.h1||0) + (s.h2||0) + (s.h3||0) + (s.hr||0)
  if (!s.ab || s.ab === 0) return '.000'
  return (h / s.ab).toFixed(3).replace(/^0/, '')
}

const isGreatAvg = (s: any) => {
  const h = (s.h1||0) + (s.h2||0) + (s.h3||0) + (s.hr||0)
  return (s.ab > 0) && (h / s.ab) >= 0.3
}

const pitchingStats = computed(() => matchData.value?.pitching_stats || [])

const formatIP = (outs: number) => {
  const parsedOuts = Number(outs) || 0
  return `${Math.floor(parsedOuts / 3)}.${parsedOuts % 3}`
}

const getEra = (s: any) => {
  const outs = Number(s.ip) || 0
  if (outs === 0) return '0.00'
  return (((Number(s.er) || 0) * 7) / (outs / 3)).toFixed(2)
}

const pitchingTeamStats = computed(() => {
  let outs = 0
  let h = 0
  let r = 0
  let er = 0
  let bb = 0
  let so = 0
  let np = 0

  pitchingStats.value.forEach((stat: any) => {
    outs += Number(stat.ip) || 0
    h += Number(stat.h) || 0
    r += Number(stat.r) || 0
    er += Number(stat.er) || 0
    bb += Number(stat.bb) || 0
    so += Number(stat.so) || 0
    np += Number(stat.np) || 0
  })

  const era = outs > 0 ? ((er * 7) / (outs / 3)).toFixed(2) : '0.00'
  return { outs, h, r, er, bb, so, np, era }
})
</script>

<template>
  <el-dialog v-model="visible" width="100%" class="!rounded-2xl md:max-w-5xl !p-0 !bg-gray-50 custom-dialog-body overflow-hidden" :show-close="false" destroy-on-close align-center top="2vh">
    <AppLoadingState v-if="loading" text="載入比賽詳情中..." min-height="24rem" />
    <div v-else-if="matchData" class="flex h-full flex-col md:h-[85vh]">
      
      <!-- Top Action Bar (Fixed Absolute) -->
      <div class="mobile-dialog-safe-top-actions absolute top-0 left-0 right-0 z-50 flex justify-between items-center p-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
         <!-- Back/Close -->
         <button @click="visible = false" class="pointer-events-auto bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full w-11 h-11 flex items-center justify-center text-white transition-colors">
           <el-icon class="text-xl"><ArrowLeft /></el-icon>
         </button>
         <!-- Right Actions -->
         <div v-if="!props.readonly" class="flex items-center gap-2 pointer-events-auto">
            <button @click="emit('edit')" class="bg-primary hover:bg-primary/90 rounded-full w-11 h-11 flex items-center justify-center text-white shadow shadow-primary/30 transition-colors tooltip" title="編輯紀錄">
              <el-icon class="text-xl"><Edit /></el-icon>
            </button>
            <button @click="handleDelete" class="bg-red-500/80 hover:bg-red-500 rounded-full w-11 h-11 flex items-center justify-center text-white shadow transition-colors tooltip" title="刪除紀錄">
              <el-icon class="text-xl"><Delete /></el-icon>
            </button>
         </div>
      </div>

      <!-- Scrollable Content -->
      <div class="flex-1 overflow-y-auto w-full custom-scrollbar scroll-smooth">
        <!-- 1. Header & Banner -->
        <div class="relative w-full h-80 md:h-[400px] overflow-hidden bg-gray-900 shrink-0">
          <img v-if="matchData.photo_url" :src="matchData.photo_url" class="absolute inset-0 w-full h-full object-cover opacity-60" />
          <div v-else class="absolute inset-0 bg-gradient-to-br from-slate-800 to-indigo-950 opacity-80 backdrop-blur-3xl"></div>
          
          <!-- Banner Content -->
          <div class="absolute inset-0 flex flex-col justify-end p-6 md:p-10 pb-20 md:pb-28 bg-gradient-to-t from-gray-950 via-gray-900/60 to-transparent">
             <div class="flex flex-wrap gap-2 mb-3">
               <span v-if="matchData.category_group" class="bg-primary text-white text-xs font-black px-2.5 py-1 rounded shadow">{{ matchData.category_group }}</span>
               <span v-if="matchData.match_level" class="bg-white/20 text-white backdrop-blur text-xs font-bold px-2.5 py-1 rounded border border-white/10">{{ matchData.match_level }}</span>
             </div>
             <h2 class="text-3xl md:text-5xl font-black text-white leading-tight mb-2 tracking-tight">{{ matchData.match_name }}</h2>
             <div class="flex flex-col sm:flex-row sm:items-center text-gray-300 text-sm font-medium gap-3 sm:gap-5 mt-1">
               <span class="flex items-center"><el-icon class="mr-1.5"><Calendar /></el-icon> {{ matchData.match_date }} {{ matchData.match_time }}</span>
               <a v-if="matchData.location" :href="`https://maps.google.com/?q=${matchData.location}`" target="_blank" class="flex items-center text-blue-300 hover:text-blue-100 underline underline-offset-4 transition-colors relative z-20 pointer-events-auto">
                 <el-icon class="mr-1.5"><Location /></el-icon> {{ matchData.location }}
               </a>
             </div>
          </div>
        </div>

        <!-- Content Padding -->
        <div class="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
          
          <!-- 2. Score Board -->
          <div class="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 md:p-8 flex justify-between items-center xl:w-2/3 mx-auto -mt-16 md:-mt-20 sticky top-16 md:top-20 z-30">
             <!-- Home -->
             <div class="flex flex-col items-center flex-1">
               <span class="text-gray-400 font-bold tracking-widest text-xs mb-2">HOME 主隊</span>
               <span class="text-xl md:text-3xl font-black text-gray-800 mb-2 truncate max-w-full">中港熊戰</span>
               <span class="text-5xl md:text-7xl font-black tracking-tighter" :class="matchData.home_score > matchData.opponent_score ? 'text-primary' : 'text-gray-800'">
                 {{ isFuture ? '-' : matchData.home_score }}
               </span>
             </div>
             <!-- VS -->
             <div class="flex flex-col items-center px-3 md:px-8 shrink-0">
               <span class="mb-2 text-[11px] md:text-xs font-black text-gray-400 whitespace-nowrap">{{ matchDateLabel }}</span>
               <div class="bg-gray-100 text-gray-400 font-black italic text-lg px-3 py-1 rounded-lg">VS</div>
               <span v-if="!isFuture" class="mt-4 font-black text-sm tracking-widest" :class="{
                 'text-green-500': matchData.home_score > matchData.opponent_score,
                 'text-red-500': matchData.home_score < matchData.opponent_score,
                 'text-yellow-500': matchData.home_score === matchData.opponent_score
               }">
                 {{ matchData.home_score > matchData.opponent_score ? 'YOU WIN' : (matchData.home_score < matchData.opponent_score ? 'YOU LOSE' : 'TIE') }}
               </span>
             </div>
             <!-- Away -->
             <div class="flex flex-col items-center flex-1">
               <span class="text-gray-400 font-bold tracking-widest text-xs mb-2">AWAY 客隊</span>
               <span class="text-xl md:text-3xl font-black text-gray-800 mb-2 truncate max-w-full" :title="matchData.opponent">{{ matchData.opponent }}</span>
               <span class="text-5xl md:text-7xl font-black tracking-tighter" :class="matchData.opponent_score > matchData.home_score ? 'text-red-500' : 'text-gray-800'">
                 {{ isFuture ? '-' : matchData.opponent_score }}
               </span>
             </div>
          </div>

          <!-- Main Stats Grid Layout -->
          <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            <!-- Left Column: Info & Lineup & Inning Logs -->
            <div class="xl:col-span-1 space-y-6">
               
               <!-- 3. Descriptions -->
               <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                 <h3 class="font-extrabold text-gray-800 mb-4 flex items-center border-b border-gray-100 pb-3">
                   <el-icon class="mr-2 text-primary text-xl"><Document /></el-icon> 賽事備註
                 </h3>
                 <div class="space-y-4 text-sm">
                   <div v-if="matchData.coaches" class="flex flex-col">
                     <span class="text-gray-500 font-bold text-xs mb-1">隨隊教練</span>
                     <span class="text-gray-800 font-medium">{{ matchData.coaches }}</span>
                   </div>
                   <div v-if="matchData.players" class="flex flex-col">
                     <span class="text-gray-500 font-bold text-xs mb-1">出賽名單</span>
                     <span class="text-gray-800 font-medium leading-relaxed">{{ matchData.players }}</span>
                   </div>
                   <div v-if="videoUrl" class="flex flex-col">
                     <span class="text-gray-500 font-bold text-xs mb-1">比賽影片</span>
                     <a
                       :href="videoUrl"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="inline-flex w-fit items-center gap-1.5 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 transition-colors hover:border-sky-200 hover:bg-sky-100"
                     >
                       <el-icon class="text-sm"><VideoCamera /></el-icon>
                       <span>觀看影片</span>
                     </a>
                   </div>
                   <div v-if="matchData.absent_players?.length" class="flex flex-col">
                     <span class="text-gray-500 font-bold text-xs mb-1">請假球員</span>
                     <div class="flex flex-wrap gap-2">
                       <span v-for="(p, i) in matchData.absent_players" :key="i" class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
                         <span class="font-bold">{{ p.name }}</span> <span class="text-[10px] bg-white border border-gray-200 px-1 rounded">{{ p.type }}</span>
                       </span>
                     </div>
                   </div>
                   <div v-if="matchData.note" class="flex flex-col pt-2 mt-2 border-t border-gray-50">
                     <span class="text-gray-500 font-bold text-xs mb-1">詳細備註</span>
                     <p class="text-gray-700 whitespace-pre-wrap">{{ matchData.note }}</p>
                   </div>
                 </div>
               </div>

               <!-- 5. Inning Logs (Timeline) -->
               <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm overflow-hidden">
                 <h3 class="font-extrabold text-gray-800 mb-5 flex items-center border-b border-gray-100 pb-3">
                   <el-icon class="mr-2 text-blue-500 text-xl"><Timer /></el-icon> 逐局戰況
                 </h3>
                 <div v-if="matchData.inning_logs?.length" class="pr-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                   <el-timeline class="pl-2 mt-2">
                     <el-timeline-item
                       v-for="(log, idx) in matchData.inning_logs"
                       :key="idx"
                       :timestamp="log.inning"
                       placement="top"
                       color="#D88F22"
                       center
                     >
                       <p class="text-sm font-medium text-gray-700 leading-relaxed">{{ log.log }}</p>
                     </el-timeline-item>
                   </el-timeline>
                 </div>
                 <div v-else class="text-center text-gray-400 font-bold py-10 italic">該賽事無轉播紀錄</div>
               </div>

            </div>

            <!-- Right Column: Lineup Field & Stats Table -->
            <div class="xl:col-span-2 space-y-6">
              
              <!-- 4. Visual Field & Lineup -->
              <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative w-full overflow-hidden">
                <h3 class="font-extrabold text-gray-800 mb-5 flex items-center border-b border-gray-100 pb-3">
                  <el-icon class="mr-2 text-green-600 text-xl"><Trophy /></el-icon> 攻守名單
                </h3>
                <div v-if="activeDetailLineup.length">
                  <VisualField :lineup="activeDetailLineup" />
                </div>
                <div v-else class="text-center text-gray-400 font-bold py-20 italic">尚未設定打序陣容</div>
              </div>

              <!-- 6. Batting Stats Board -->
              <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm overflow-hidden flex flex-col w-full min-w-0">
                <h3 class="font-extrabold text-gray-800 mb-4 flex items-center border-b border-gray-100 pb-3 shrink-0">
                  <el-icon class="mr-2 text-red-500 text-xl"><DataAnalysis /></el-icon> 團隊打擊成績
                </h3>
                <div v-if="matchData.batting_stats?.length" class="overflow-x-auto custom-scrollbar pb-2">
                  <el-table 
                    :data="matchData.batting_stats" 
                    size="small" 
                    class="w-full text-xs font-medium min-w-[600px]" 
                    border
                    :header-cell-style="{fontWeight:'black', padding:'6px 2px', textAlign:'center'}"
                    :cell-style="{padding:'6px 2px', textAlign:'center', color: '#1f2937'}"
                  >
                    <!-- Fixed Player Col -->
                    <el-table-column fixed label="打者" min-width="90" align="left">
                      <template #default="{ row }">
                        <div class="flex items-center space-x-1 pl-1">
                          <span class="text-[10px] text-gray-400 w-4">{{ row.number }}</span>
                          <span class="font-bold truncate" :class="{'text-primary': isGreatAvg(row)}">{{ row.name }}</span>
                        </div>
                      </template>
                    </el-table-column>
                    <!-- Stats Cols -->
                    <el-table-column label="AVG" width="50"><template #default="{ row }"><span class="font-bold" :class="{'text-primary': isGreatAvg(row)}">{{ getAvg(row) }}</span></template></el-table-column>
                    <el-table-column prop="pa" label="PA" width="45" title="打席"></el-table-column>
                    <el-table-column prop="ab" label="AB" width="45" title="打數"></el-table-column>
                    <el-table-column prop="r" label="R" width="45" title="得分" class-name="bg-orange-50/30 font-bold"></el-table-column>
                    <el-table-column label="H" width="45" title="安打總數"><template #default="{ row }">{{ (row.h1||0)+(row.h2||0)+(row.h3||0)+(row.hr||0) }}</template></el-table-column>
                    <el-table-column prop="h1" label="1B" width="40"></el-table-column>
                    <el-table-column prop="h2" label="2B" width="40"></el-table-column>
                    <el-table-column prop="h3" label="3B" width="40"></el-table-column>
                    <el-table-column prop="hr" label="HR" width="40" class-name="font-black text-red-500"></el-table-column>
                    <el-table-column prop="rbi" label="RBI" width="45" title="打點" class-name="bg-blue-50/30 font-bold"></el-table-column>
                    <el-table-column label="BB" width="40" title="四死球"><template #default="{ row }">{{ (row.bb||0) + (row.hbp||0) }}</template></el-table-column>
                    <el-table-column prop="so" label="SO" width="40" title="三振" class-name="text-gray-400"></el-table-column>
                    <el-table-column prop="sb" label="SB" width="40" title="盜壘"></el-table-column>
                  </el-table>
                  
                  <!-- Totals Line -->
                  <div class="bg-primary/10 border-t border-primary/20 rounded-b-lg mt-2 xl:w-[600px] flex items-center justify-between px-4 py-2 text-xs">
                    <span class="font-black text-primary">TEAM TOTALS</span>
                    <div class="flex gap-4 font-bold text-gray-800">
                      <span>AVG：<span class="text-primary">{{ teamStats?.avgStr }}</span></span>
                      <span>PA：{{ teamStats?.totalPA }}</span>
                      <span>AB：{{ teamStats?.totalAB }}</span>
                      <span>H：{{ teamStats?.totalH }}</span>
                      <span>HR：{{ teamStats?.totalHR }}</span>
                      <span>R：{{ teamStats?.totalR }}</span>
                      <span>RBI：{{ teamStats?.totalRBI }}</span>
                    </div>
                  </div>
                </div>
                <div v-else class="text-center text-gray-400 font-bold py-10 italic">無打擊成績紀錄</div>
              </div>

              <!-- 7. Pitching Stats Board -->
              <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm overflow-hidden flex flex-col w-full min-w-0">
                <h3 class="font-extrabold text-gray-800 mb-4 flex items-center border-b border-gray-100 pb-3 shrink-0">
                  <el-icon class="mr-2 text-blue-500 text-xl"><DataAnalysis /></el-icon> 團隊投手成績
                </h3>
                <div v-if="pitchingStats.length" class="overflow-x-auto custom-scrollbar pb-2">
                  <el-table
                    :data="pitchingStats"
                    size="small"
                    class="w-full text-xs font-medium min-w-[760px]"
                    border
                    :header-cell-style="{fontWeight:'black', padding:'6px 2px', textAlign:'center'}"
                    :cell-style="{padding:'6px 2px', textAlign:'center', color: '#1f2937'}"
                  >
                    <el-table-column fixed label="投手" min-width="90" align="left">
                      <template #default="{ row }">
                        <div class="flex items-center space-x-1 pl-1">
                          <span class="text-[10px] text-gray-400 w-4">{{ row.number }}</span>
                          <span class="font-bold truncate">{{ row.name }}</span>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column label="IP" width="50"><template #default="{ row }">{{ formatIP(row.ip) }}</template></el-table-column>
                    <el-table-column prop="ab" label="AB" width="45"></el-table-column>
                    <el-table-column prop="h" label="H" width="45"></el-table-column>
                    <el-table-column prop="h2" label="2B" width="45"></el-table-column>
                    <el-table-column prop="h3" label="3B" width="45"></el-table-column>
                    <el-table-column prop="hr" label="HR" width="45"></el-table-column>
                    <el-table-column prop="r" label="R" width="45"></el-table-column>
                    <el-table-column prop="er" label="ER" width="45"></el-table-column>
                    <el-table-column prop="bb" label="BB" width="45"></el-table-column>
                    <el-table-column prop="so" label="SO" width="45"></el-table-column>
                    <el-table-column prop="np" label="NP" width="50"></el-table-column>
                    <el-table-column prop="go" label="GO" width="45"></el-table-column>
                    <el-table-column prop="ao" label="AO" width="45"></el-table-column>
                    <el-table-column label="ERA" width="60"><template #default="{ row }">{{ getEra(row) }}</template></el-table-column>
                  </el-table>

                  <div class="bg-blue-50 border-t border-blue-100 rounded-b-lg mt-2 xl:w-[760px] flex items-center justify-between px-4 py-2 text-xs">
                    <span class="font-black text-blue-600">TEAM TOTALS</span>
                    <div class="flex gap-4 font-bold text-gray-800">
                      <span>IP：<span class="text-blue-600">{{ formatIP(pitchingTeamStats.outs) }}</span></span>
                      <span>H：{{ pitchingTeamStats.h }}</span>
                      <span>R：{{ pitchingTeamStats.r }}</span>
                      <span>ER：{{ pitchingTeamStats.er }}</span>
                      <span>BB：{{ pitchingTeamStats.bb }}</span>
                      <span>SO：{{ pitchingTeamStats.so }}</span>
                      <span>NP：{{ pitchingTeamStats.np }}</span>
                      <span>ERA：{{ pitchingTeamStats.era }}</span>
                    </div>
                  </div>
                </div>
                <div v-else class="text-center text-gray-400 font-bold py-10 italic">無投手成績紀錄</div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style>
/* Un-scoped CSS for element-plus dialog inner overrides */
.custom-dialog-body .el-dialog__header {
  display: none !important;
}
.custom-dialog-body .el-dialog__body {
  padding: 0 !important;
  border-radius: 1rem;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 6px;
}

</style>
