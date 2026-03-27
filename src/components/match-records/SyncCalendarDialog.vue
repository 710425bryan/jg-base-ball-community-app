<template>
  <el-dialog v-model="visible" title="Google 行事曆同步" width="95%" class="max-w-2xl custom-dialog !rounded-2xl" destroy-on-close>
    
    <div class="space-y-6">
      <!-- Intro Section -->
      <div class="bg-blue-50/50 border border-blue-100 p-4 md:p-6 rounded-xl flex gap-4">
        <div class="hidden sm:flex mt-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path><path d="M16 18h.01"></path>
          </svg>
        </div>
        <div>
          <h3 class="font-extrabold text-blue-800 text-lg mb-2 leading-tight">使用 iCal 連結匯入</h3>
          <p class="text-sm text-blue-600/80 leading-relaxed mb-4 font-medium">
            這項工具可自動解析行事曆裡的 <span class="font-bold underline">標題</span>、<span class="font-bold underline">時間點</span> 甚至 <span class="font-bold underline">備註(教練/先發陣容)</span>，並抓取進比賽紀錄。它擁有 <strong>防重複防呆機制</strong>，相同時間且標題一致的賽事不會被重複寫入。
          </p>
          
          <div class="bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
            <label class="text-xs font-bold text-gray-500 mb-1 block">公開 iCal (.ics) 行事曆連結</label>
            <div class="flex gap-2">
              <el-input v-model="calendarUrl" placeholder="https://calendar.google.com/calendar/ical/..." clearable class="flex-1" />
              <el-button type="primary" :loading="isFetching" @click="handleFetch" class="!font-bold">
                解析檢查
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- Preview Section -->
      <div v-if="parsedMatches.length > 0" class="border border-gray-200 rounded-xl overflow-hidden">
        <div class="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h4 class="font-extrabold text-sm text-gray-700">準備新增的賽事 ({{ parsedMatches.length }} 筆)</h4>
        </div>
        
        <div class="max-h-[300px] overflow-y-auto custom-scrollbar p-2 bg-gray-50">
          <div v-for="(match, i) in parsedMatches" :key="i" class="bg-white border border-gray-100 rounded-lg p-3 mb-2 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center">
            
            <div class="flex-1 flex gap-3 items-center">
              <div class="bg-primary/10 text-primary font-black px-3 py-2 rounded-lg text-center leading-tight">
                <span class="text-[10px] block opacity-80 mb-0.5">YYYY-MM</span>
                {{ match.date }}
              </div>
              <div>
                <h5 class="font-bold text-gray-800 text-sm leading-tight mb-1">{{ match.title }}</h5>
                <div class="flex flex-wrap gap-2 text-xs font-medium text-gray-500">
                  <span class="bg-gray-100 px-2 py-0.5 rounded border border-gray-200" v-if="match.startTime">⏰ {{ match.startTime }}</span>
                  <span class="bg-gray-100 px-2 py-0.5 rounded border border-gray-200" v-if="match.location">📍 {{ match.location }}</span>
                  <span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100" v-if="match.players.length">先發解析: {{ match.players.length }} 名</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      
      <!-- No Data State after fetching -->
      <div v-if="hasFetched && parsedMatches.length === 0" class="text-center py-6 text-gray-500 font-bold border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
        目前沒有解析出新的賽事（可能因為已自動過濾過往曾匯入過的重複紀錄，或是表單格式不受支援）。
      </div>

    </div>

    <!-- Dialog Footer -->
    <template #footer>
      <div class="flex items-center justify-between border-t border-gray-100 pt-4 -mx-4 px-4 bg-gray-50 rounded-b-2xl">
        <span class="text-xs text-gray-400 font-bold">需由管理層執行同步寫入作業</span>
        <div class="flex gap-2">
           <el-button @click="visible = false" class="!rounded-xl">取消</el-button>
           <el-button type="primary" class="!rounded-xl font-bold shadow-md shadow-primary/30" @click="handleConfirmSync" :disabled="parsedMatches.length === 0" :loading="isSaving">
             完成匯入 ({{ parsedMatches.length }})
           </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { fetchAndParseICal, deduplicateAndSyncEvents, type ParsedMatch } from '@/utils/googleCalendarParser'
import { useMatchesStore } from '@/stores/matches'
import type { MatchRecordInput } from '@/types/match'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const matchesStore = useMatchesStore()
const calendarUrl = ref('https://calendar.google.com/calendar/ical/jg.baseball.bear%40gmail.com/public/basic.ics')
const isFetching = ref(false)
const hasFetched = ref(false)
const isSaving = ref(false)

const parsedMatches = ref<ParsedMatch[]>([])

const handleFetch = async () => {
  if (!calendarUrl.value) {
    ElMessage.warning('請輸入 iCal 網址')
    return
  }
  
  isFetching.value = true
  hasFetched.value = false
  parsedMatches.value = []
  
  try {
    // 實作抓取與解析 (utils)
    const newEvents = await fetchAndParseICal(calendarUrl.value)
    
    // 與 Store 中已有的資料進行去重複比對
    // 為了去重複，我們需要將 store 裡現有的資料轉為 ParsedMatch 格式傳進去
    const existingParsed: ParsedMatch[] = matchesStore.matches.map(m => ({
      id: m.id, // Supabase UUID
      title: m.match_name,
      tournamentName: '',
      opponent: m.opponent,
      date: m.match_date,
      startTime: m.match_time,
      endTime: '',
      location: m.location || '',
      locationAddress: '',
      category: m.category_group || '',
      level: m.match_level || '',
      gatherTime: '',
      coaches: m.coaches ? m.coaches.split(',') : [],
      players: (m.lineup || []).map((l:any) => ({ name: l.name, number: l.number })),
      absentPlayers: (m.absent_players || []).map((a:any) => a.name)
    }))
    
    // newEvents 丟進去比對，會過濾掉重複的，只取「新增的」事件
    const allExpected = deduplicateAndSyncEvents(existingParsed, newEvents)
    // 找出只存在於 newEvents 但被保留的
    const existingIds = mappedExistingIds(existingParsed)
    parsedMatches.value = allExpected.filter(m => !existingIds.includes(m.id))
    
    hasFetched.value = true
    if (parsedMatches.value.length) {
      ElMessage.success(`解析成功！找到 ${parsedMatches.value.length} 筆新賽事。`)
    }
  } catch (error: any) {
    ElMessage.error('解析失敗：' + error.message)
  } finally {
    isFetching.value = false
  }
}

const mappedExistingIds = (existing: ParsedMatch[]) => {
    return existing.map(e => e.id)
}

const handleConfirmSync = async () => {
    if (parsedMatches.value.length === 0) return
    isSaving.value = true
    
    try {
        // 將 ParsedMatch 轉化為要塞入 Supabase 的 MatchRecordInput 格式
        for (const match of parsedMatches.value) {
            const input: MatchRecordInput = {
                match_name: match.tournamentName || match.title || '未命名賽事',
                opponent: match.opponent || '未知對手',
                match_date: match.date || dayjs().format('YYYY-MM-DD'),
                match_time: match.startTime || '00:00',
                location: match.location,
                category_group: match.category,
                match_level: match.level || '友誼賽', // 預設
                coaches: match.coaches.join(','),
                players: match.players.map(p => p.name).join(','),
                note: `[行事曆自動匯入]\n集合時間: ${match.gatherTime}`,
                home_score: 0,
                opponent_score: 0,
                photo_url: '',
                absent_players: match.absentPlayers.map(name => ({ name, type: '事假' })),
                inning_logs: [],
                batting_stats: [],
                lineup: []
            }
            // 解析 Lineup 到先發名單
            if (match.players.length > 0) {
               input.lineup = match.players.map((p, i) => ({
                   order: i + 1,
                   position: '預備',
                   name: p.name,
                   number: p.number
               }))
               // 填充到 9 個
               while(input.lineup.length < 9) {
                   input.lineup.push({ order: input.lineup.length + 1, position: '預備', name: '', number: ''})
               }
            } else {
               input.lineup = Array.from({length: 9}).map((_, i) => ({ order: i+1, position: String(i+1), name: '', number: '' }))
            }
            
            await matchesStore.createMatch(input)
        }
        
        ElMessage.success('賽事已全部同步至資料庫。')
        visible.value = false
        matchesStore.fetchMatches() // Refresh the view
    } catch(err: any) {
        ElMessage.error('匯入過程中發生錯誤: ' + err.message)
    } finally {
        isSaving.value = false
    }
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #e2e8f0;
  border-radius: 6px;
}
</style>
