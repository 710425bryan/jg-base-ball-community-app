<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Plus, Minus, Position, CloseBold, DataAnalysis, Connection, Upload, Document, Check, Delete, Loading } from '@element-plus/icons-vue'
import type { MatchRecordInput, LineupEntry, InningLog, BattingStat } from '@/types/match'
import { useMatchesStore } from '@/stores/matches'
import { supabase } from '@/services/supabase'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { onMounted } from 'vue'

const props = defineProps<{
  modelValue: boolean
  matchId: string | null
  mode: 'add' | 'edit'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const matchesStore = useMatchesStore()
const activeTab = ref('basic')
const submitting = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

// === FETCH TEAM MEMBERS FOR DROPDOWNS ===
const allMembers = ref<any[]>([])
const activeMembers = computed(() => allMembers.value.filter(m => m.status === '在隊' || !m.status))
const coachOptions = computed(() => activeMembers.value.filter(m => m.role === '教練' || m.role === '管理群'))
const playerOptions = computed(() => activeMembers.value.filter(m => m.role === '球員'))

onMounted(async () => {
  const { data } = await supabase.from('team_members').select('*')
  if (data) allMembers.value = data
})

// === FORM STATE ===
const formData = ref<MatchRecordInput>({
  match_name: '',
  opponent: '',
  match_date: dayjs().format('YYYY-MM-DD'),
  match_time: '',
  location: '',
  category_group: '',
  match_level: '',
  home_score: 0,
  opponent_score: 0,
  coaches: '',
  players: '',
  note: '',
  photo_url: '',
  absent_players: [],
  lineup: [],
  inning_logs: [],
  batting_stats: []
})

// Default options (mocked for now, normally fetched from API)
const groupOptions = ['U10', 'U12', 'U15', '中港校隊', '社會教練組']
const levelOptions = ['友誼賽', '特訓課', '全國賽', '市級錦標賽']

// Proxy computed properties for multi-selects
const selectedCoaches = computed({
  get: () => formData.value.coaches ? formData.value.coaches.split(',').filter(Boolean) : [],
  set: (val) => formData.value.coaches = val.join(',')
})

const selectedPlayers = computed({
  get: () => formData.value.players ? formData.value.players.split(',').filter(Boolean) : [],
  set: (val) => formData.value.players = val.join(',')
})

// Reset or load data
const initForm = async () => {
  activeTab.value = 'basic'
  if (props.mode === 'edit' && props.matchId) {
    const data = await matchesStore.matches.find(m => m.id === props.matchId)
    if (data) {
      // deep clone array fields
      formData.value = { 
        ...data,
        absent_players: [...data.absent_players || []],
        lineup: [...data.lineup || []],
        inning_logs: [...data.inning_logs || []],
        batting_stats: [...data.batting_stats || []]
      }
    }
  } else {
    formData.value = {
      match_name: '',
      opponent: '',
      match_date: dayjs().format('YYYY-MM-DD'),
      match_time: '',
      location: '',
      category_group: '',
      match_level: '友誼賽',
      home_score: 0,
      opponent_score: 0,
      coaches: '',
      players: '',
      note: '',
      photo_url: '',
      absent_players: [],
      lineup: Array.from({length: 9}).map((_, i) => ({ order: i+1, position: String(i+1), name: '', number: '' })),
      inning_logs: [],
      batting_stats: []
    }
  }
}

watch(() => props.modelValue, (val) => {
  if (val) initForm()
})

// === TAB 1: BASIC ===
const addAbsent = () => {
  formData.value.absent_players.push({ name: '', type: '事假' })
}
const removeAbsent = (index: number) => {
  formData.value.absent_players.splice(index, 1)
}

// === TAB 2: LINEUP ===
const posOptions = [
  { value: '1', label: '投手 P' },
  { value: '2', label: '捕手 C' },
  { value: '3', label: '一壘 1B' },
  { value: '4', label: '二壘 2B' },
  { value: '5', label: '三壘 3B' },
  { value: '6', label: '游擊 SS' },
  { value: '7', label: '左外 LF' },
  { value: '8', label: '中外 CF' },
  { value: '9', label: '右外 RF' },
  { value: 'DH', label: '指定打擊 DH' },
  { value: 'PH', label: '代打 PH' },
  { value: 'PR', label: '代跑 PR' },
  { value: '預備', label: '預備' },
]
const addLineup = () => {
  formData.value.lineup.push({ order: formData.value.lineup.length + 1, position: '預備', name: '', number: '' })
}
const removeLineup = (index: number) => {
  formData.value.lineup.splice(index, 1)
}
const moveLineup = (index: number, dir: -1 | 1) => {
  if (index + dir < 0 || index + dir >= formData.value.lineup.length) return
  const temp = formData.value.lineup[index]
  formData.value.lineup[index] = formData.value.lineup[index + dir]
  formData.value.lineup[index + dir] = temp
  // reorder
  formData.value.lineup.forEach((l, i) => l.order = i + 1)
}

const handleLineupPlayerChange = (lineupEntry: LineupEntry, playerName: string) => {
  if (!playerName) return
  const player = activeMembers.value.find(p => p.name === playerName)
  if (player && player.jersey_number) {
    lineupEntry.number = String(player.jersey_number)
  }
}

// === TAB 3: INNING LOGS (RAPID TOOL & MANUAL) ===
const currentInning = ref('一上')
const currentPlayerId = ref('')
const manualLogText = ref('')

const btnDirs = ['左外', '中外', '右外', '游擊', '三壘', '二壘', '一壘', '投手', '捕手']
const btnHits = [
  { label: '一安', class: 'text-blue-500 border-blue-200 bg-blue-50 hover:bg-blue-100' },
  { label: '二安', class: 'text-blue-500 border-blue-200 bg-blue-50 hover:bg-blue-100' },
  { label: '三安', class: 'text-blue-500 border-blue-200 bg-blue-50 hover:bg-blue-100' },
  { label: 'HR', class: 'text-red-500 border-red-200 bg-red-50 hover:bg-red-100' },
  { label: '內安', class: 'text-blue-500 border-blue-200 bg-blue-50 hover:bg-blue-100' },
  { label: '四壞', class: 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100' },
  { label: '觸身', class: 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100' },
  { label: '故意四壞', class: 'text-yellow-600 border-yellow-200 bg-yellow-50 hover:bg-yellow-100' },
  { label: '失誤', class: 'text-orange-500 border-orange-200 bg-orange-50 hover:bg-orange-100' },
  { label: '野選', class: 'text-orange-500 border-orange-200 bg-orange-50 hover:bg-orange-100' },
  { label: '不死三振', class: 'text-red-500 border-red-200 bg-red-50 hover:bg-red-100' }
]
const btnOuts = ['空振', '站振', '飛球接殺', '平飛接殺', '滾地刺殺', '界外接殺', '雙殺打', '內野必死', '其他出局']
const btnSpecial = [
  { label: '盜壘成功', class: 'text-teal-600 border-teal-200 bg-teal-50 hover:bg-teal-100' },
  { label: '盜壘刺', class: 'text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100' },
  { label: '高飛犧牲打', class: 'text-sky-500 border-sky-200 bg-sky-50 hover:bg-sky-100' },
  { label: '犧牲觸擊', class: 'text-sky-500 border-sky-200 bg-sky-50 hover:bg-sky-100' },
  { label: '牽制出局', class: 'text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100' },
  { label: '暴投推進', class: 'text-purple-500 border-purple-200 bg-purple-50 hover:bg-purple-100' },
  { label: '捕逸推進', class: 'text-purple-500 border-purple-200 bg-purple-50 hover:bg-purple-100' },
  { label: '妨礙打擊', class: 'text-red-400 border-red-200 bg-red-50 hover:bg-red-100' }
]

const appendLogText = (txt: string) => {
  if (manualLogText.value.length > 0 && !manualLogText.value.endsWith(' ')) {
    manualLogText.value += ' '
  }
  manualLogText.value += txt
}

const handlePlayerSelect = (orderStr: string) => {
  if (!orderStr) return
  const pName = formData.value.lineup.find(l => String(l.order) === orderStr)?.name
  if (pName) appendLogText(pName)
}

const sortInningLogs = () => {
  const order = ['一上','一下','二上','二下','三上','三下','四上','四下','五上','五下','六上','六下','七上','七下','八上','八下','九上','九下']
  formData.value.inning_logs.sort((a, b) => {
    let idxA = order.indexOf(a.inning)
    if (idxA === -1) idxA = 99
    let idxB = order.indexOf(b.inning)
    if (idxB === -1) idxB = 99
    return idxA - idxB
  })
}

const commitLog = () => {
  if (!manualLogText.value.trim()) return
  
  formData.value.inning_logs.push({
    inning: currentInning.value,
    log: manualLogText.value.trim()
  })
  
  sortInningLogs()

  // Auto connect to Tab 4 (Stats) text parsing
  const txt = manualLogText.value
  let matchedPlayer = formData.value.lineup.find(l => l.name && txt.includes(l.name))
  if (matchedPlayer && matchedPlayer.name) {
    const pName = matchedPlayer.name
    let statIndex = formData.value.batting_stats.findIndex(s => s.name === pName)
    if (statIndex === -1) {
      loadLineupToStats()
      statIndex = formData.value.batting_stats.findIndex(s => s.name === pName)
    }
    if (statIndex !== -1) {
      const s = formData.value.batting_stats[statIndex]
      let statAdded = false
      const abTerms = ['一安','二安','三安','HR','內安','空振','站振','飛球接殺','平飛接殺','滾地刺殺','界外接殺','雙殺打','內野必死','不死三振','失誤','野選']
      const paTerms = ['四壞','觸身','故意四壞','高飛犧牲打','犧牲觸擊','妨礙打擊'].concat(abTerms)
      
      if (paTerms.some(term => txt.includes(term))) {
         s.pa += 1
         if (abTerms.some(term => txt.includes(term))) s.ab += 1
         statAdded = true
      }
      
      if (txt.includes('一安') || txt.includes('內安')) s.h1 += 1
      if (txt.includes('二安')) s.h2 += 1
      if (txt.includes('三安')) s.h3 += 1
      if (txt.includes('HR')) { s.hr += 1; s.r += 1; s.rbi += 1; }
      if (txt.includes('四壞') || txt.includes('故意四壞')) s.bb += 1
      if (txt.includes('觸身')) s.hbp += 1
      if (txt.includes('空振') || txt.includes('站振') || txt.includes('不死三振')) s.so += 1
      if (txt.includes('盜壘成功')) s.sb += 1
      
      if (statAdded) ElMessage.success(`已為 ${pName} 自動試算部分打擊成績`)
    }
  }

  manualLogText.value = ''
}

const removeLog = (index: number) => {
  formData.value.inning_logs.splice(index, 1)
}

// === TAB 4: BATTING STATS ===
const loadLineupToStats = () => {
  const newStats: BattingStat[] = []
  formData.value.lineup.forEach(l => {
    if (l.name) {
      const exists = formData.value.batting_stats.find(s => s.name === l.name)
      if (exists) {
        newStats.push(exists)
      } else {
        newStats.push({
          name: l.name, number: l.number || '',
          pa: 0, ab: 0, h1: 0, h2: 0, h3: 0, hr: 0, rbi: 0, r: 0, bb: 0, hbp: 0, so: 0, sb: 0
        })
      }
    }
  })
  formData.value.batting_stats = newStats
  ElMessage.success('已同步先發打線上所有填寫名稱的球員')
}

// === SAVE ===
const handleSave = async () => {
  if (!formData.value.match_name || !formData.value.opponent) {
    ElMessage.error('請填寫賽事名稱與對手')
    activeTab.value = 'basic'
    return
  }
  
  submitting.value = true
  try {
    if (props.mode === 'add') {
      await matchesStore.createMatch(formData.value)
      ElMessage.success('新增比賽成功')
    } else {
      await matchesStore.updateMatch(props.matchId!, formData.value)
      ElMessage.success('更新比賽成功')
    }
    visible.value = false
  } catch (e: any) {
    ElMessage.error('儲存失敗：' + e.message)
  } finally {
    submitting.value = false
  }
}

// === DELETE ===
const handleDelete = async () => {
  if (!props.matchId) return
  
  try {
    await ElMessageBox.confirm('確定要刪除這筆比賽紀錄嗎？這項動作將無法復原。', '⚠️ 刪除確認', {
      confirmButtonText: '確定刪除',
      cancelButtonText: '取消',
      type: 'error'
    })
    
    submitting.value = true
    await matchesStore.deleteMatch(props.matchId)
    ElMessage.success('比賽紀錄已刪除')
    visible.value = false
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('刪除失敗：' + err.message)
    }
  } finally {
    submitting.value = false
  }
}

// === PHOTO UPLOAD ===
const fileInput = ref<HTMLInputElement | null>(null)
const uploadingPhoto = ref(false)

const handlePhotoUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  const file = target.files[0]
  
  uploadingPhoto.value = true
  try {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `matches/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('matches-photos')
      .upload(filePath, file)

    if (uploadError) throw new Error('圖片上傳失敗，請確認 Storage 是否已建立 matches-photos 儲存桶。')
    
    const { data } = supabase.storage.from('matches-photos').getPublicUrl(filePath)
    formData.value.photo_url = data.publicUrl
    ElMessage.success('圖片上傳成功')
  } catch (err: any) {
    ElMessage.error(err.message)
  } finally {
    uploadingPhoto.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <el-dialog v-model="visible" :title="mode === 'add' ? '新增比賽紀錄' : '編輯比賽紀錄'" width="100%" class="!rounded-2xl max-w-5xl custom-dialog" destroy-on-close align-center top="5vh">
    <div class="h-[75vh] flex flex-col md:flex-row -mx-4 -my-6 md:m-0 h-full">
      <!-- Left Sidebar Tabs (Desktop) / Top Tabs (Mobile) -->
      <div class="bg-gray-50 md:w-48 xl:w-56 shrink-0 border-b md:border-b-0 md:border-r border-gray-100 flex md:flex-col overflow-x-auto md:overflow-y-auto hide-scrollbar z-10 p-2 md:p-4 gap-1">
        <button @click="activeTab = 'basic'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'basic', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'basic'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[120px] md:min-w-0">
          <el-icon class="text-lg"><Document /></el-icon> <span>基本與賽況</span>
        </button>
        <button @click="activeTab = 'lineup'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'lineup', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'lineup'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[120px] md:min-w-0">
          <el-icon class="text-lg"><Position /></el-icon> <span>先發與陣容</span>
        </button>
        <button @click="activeTab = 'innings'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'innings', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'innings'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[120px] md:min-w-0">
          <el-icon class="text-lg"><Connection /></el-icon> <span>逐局轉播</span>
        </button>
        <button @click="activeTab = 'stats'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'stats', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'stats'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[120px] md:min-w-0">
          <el-icon class="text-lg"><DataAnalysis /></el-icon> <span>比賽成績</span>
        </button>
      </div>

      <!-- Main Form Area -->
      <div class="flex-1 overflow-y-auto p-4 md:p-8 bg-white max-h-[75vh]" id="modal-scroll-area">
        
        <!-- === TAB 1: BASIC === -->
        <div v-show="activeTab === 'basic'" class="space-y-6 animate-fade-in pr-2">
          
          <!-- Cover Photo Upload Area -->
          <div class="relative w-full h-48 md:h-64 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 overflow-hidden group hover:border-primary transition-colors cursor-pointer flex items-center justify-center" @click="!uploadingPhoto && fileInput?.click()">
            <template v-if="formData.photo_url">
              <el-image 
                :src="formData.photo_url" 
                class="w-full h-full object-cover" 
                :preview-src-list="[formData.photo_url]" 
                :initial-index="0"
                fit="cover" 
                hide-on-click-modal
                @click.stop
              />
              <div class="absolute top-4 right-4 bg-black/60 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 pointer-events-auto" @click.stop="fileInput?.click()" title="更換圖片">
                <el-icon class="text-xl"><Upload /></el-icon>
              </div>
            </template>
            <template v-else>
              <div class="text-gray-400 flex flex-col items-center justify-center w-full h-full pointer-events-auto">
                <el-icon class="text-4xl mb-2 group-hover:text-primary transition-colors" :class="{'is-loading': uploadingPhoto}"><Loading v-if="uploadingPhoto"/><Upload v-else/></el-icon>
                <span class="font-bold text-sm group-hover:text-primary transition-colors">{{ uploadingPhoto ? '上傳中...' : '點擊上傳賽事封面圖片' }}</span>
                <span class="text-xs mt-1 text-gray-400 font-normal text-center px-4">若無法上傳，請先至 Supabase Storage 建立名字為 `matches-photos` 的 Public 儲存桶</span>
              </div>
            </template>
            <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handlePhotoUpload" />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Left Info -->
            <div class="space-y-4">
               <div>
                 <label class="text-xs font-bold text-gray-500 mb-1 block">賽事名稱 <span class="text-red-500">*</span></label>
                 <el-input v-model="formData.match_name" placeholder="例如: 111學年度國小棒球聯賽" class="!w-full" size="large" />
               </div>
               <div>
                 <label class="text-xs font-bold text-gray-500 mb-1 block">對手隊伍 <span class="text-red-500">*</span></label>
                 <el-input v-model="formData.opponent" placeholder="例如: 大仁國小" class="!w-full" size="large" />
               </div>
               <div class="flex gap-4">
                 <div class="flex-1">
                   <label class="text-xs font-bold text-gray-500 mb-1 block">日期</label>
                   <el-date-picker v-model="formData.match_date" type="date" value-format="YYYY-MM-DD" class="!w-full" size="large" />
                 </div>
                 <div class="flex-1">
                   <label class="text-xs font-bold text-gray-500 mb-1 block">時間</label>
                   <el-input v-model="formData.match_time" placeholder="14:00 - 15:30" class="!w-full" size="large" />
                 </div>
               </div>
               <div>
                 <label class="text-xs font-bold text-gray-500 mb-1 block">地點</label>
                 <el-input v-model="formData.location" placeholder="例如: 櫻花棒球場" class="!w-full" size="large" />
               </div>
            </div>

            <!-- Right Info & Score -->
            <div class="space-y-4">
               <div class="flex gap-4">
                 <div class="flex-1">
                   <label class="text-xs font-bold text-gray-500 mb-1 block">賽事組別</label>
                   <el-select v-model="formData.category_group" filterable allow-create clearable placeholder="選擇或輸入" class="w-full" size="large">
                     <el-option v-for="g in groupOptions" :key="g" :label="g" :value="g" />
                   </el-select>
                 </div>
                 <div class="flex-1">
                   <label class="text-xs font-bold text-gray-500 mb-1 block">賽事等級</label>
                   <el-select v-model="formData.match_level" filterable allow-create clearable placeholder="選擇或輸入" class="w-full" size="large">
                     <el-option v-for="l in levelOptions" :key="l" :label="l" :value="l" />
                   </el-select>
                 </div>
               </div>

               <!-- Score Input Tool -->
               <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 mt-2">
                 <label class="text-xs font-black text-gray-800 tracking-wider mb-3 block text-center uppercase">Final Score</label>
                 <div class="flex items-center justify-center space-x-6">
                   <div class="text-center">
                     <div class="text-[10px] font-bold text-gray-400 mb-1">主隊 🐻</div>
                     <el-input-number v-model="formData.home_score" :min="0" :max="99" size="large" class="!w-28 font-black" />
                   </div>
                   <div class="text-xs font-black italic text-gray-300">VS</div>
                   <div class="text-center">
                     <div class="text-[10px] font-bold text-gray-400 mb-1">客隊 🛡️</div>
                     <el-input-number v-model="formData.opponent_score" :min="0" :max="99" size="large" class="!w-28 font-black" />
                   </div>
                 </div>
               </div>
            </div>
          </div>

          <div class="h-px w-full bg-gray-100 my-2"></div>

          <!-- People & Notes -->
          <div>
            <div class="flex flex-col sm:flex-row gap-4 mb-2">
              <div class="flex-1">
                <label class="text-xs font-bold text-gray-500 mb-1 block">隨隊教練</label>
                <el-select v-model="selectedCoaches" multiple filterable placeholder="選擇教練" class="w-full">
                  <el-option v-for="c in coachOptions" :key="c.name" :label="c.name" :value="c.name" />
                </el-select>
              </div>
              <div class="flex-[2]">
                <label class="text-xs font-bold text-gray-500 mb-1 block">出賽全體球員</label>
                <el-select v-model="selectedPlayers" multiple filterable placeholder="選擇負責出賽的球員" class="w-full">
                  <el-option v-for="p in playerOptions" :key="p.name" :label="`${p.name} ${p.jersey_number ? '(#'+p.jersey_number+')' : ''}`" :value="p.name" />
                </el-select>
              </div>
            </div>
          </div>

          <!-- Absent Players Dynamic List -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-bold text-gray-500 block">請假球員紀錄</label>
              <el-button size="small" type="primary" plain @click="addAbsent"><el-icon><Plus /></el-icon>新增請假人員</el-button>
            </div>
            <div class="space-y-2">
              <div v-for="(abs, i) in formData.absent_players" :key="i" class="flex items-center gap-2">
                <el-input v-model="abs.name" placeholder="球員名稱" class="w-1/3" />
                <el-select v-model="abs.type" placeholder="假別" class="w-1/4">
                  <el-option value="事假" label="事假" />
                  <el-option value="病假" label="病假" />
                  <el-option value="公假" label="公假" />
                  <el-option value="未到" label="曠課/未到" />
                </el-select>
                <el-button type="danger" circle size="small" plain @click="removeAbsent(i)"><el-icon><Minus /></el-icon></el-button>
              </div>
              <div v-if="!formData.absent_players.length" class="text-xs text-gray-400 p-3 bg-gray-50 rounded-lg text-center border border-dashed border-gray-200">
                本場賽事無人請假
              </div>
            </div>
          </div>

          <div>
             <label class="text-xs font-bold text-gray-500 mb-1 block">詳細賽事備註</label>
             <el-input v-model="formData.note" type="textarea" :rows="3" placeholder="有什麼想紀錄的..." />
          </div>

        </div>

        <!-- === TAB 2: LINEUP === -->
        <div v-show="activeTab === 'lineup'" class="space-y-4 animate-fade-in pr-2">
          <div class="flex items-center justify-between mb-4 bg-yellow-50 text-yellow-800 p-3 rounded-xl border border-yellow-100">
            <div>
              <h3 class="font-extrabold text-sm flex items-center"><el-icon class="mr-1.5"><Position /></el-icon>攻守打序設定</h3>
              <p class="text-xs mt-0.5 opacity-80">請依照棒次順序填寫，您也可以拖曳微調或增加替補球員。</p>
            </div>
            <el-button @click="addLineup" type="primary" size="small"><el-icon class="mr-1"><Plus /></el-icon>增加列</el-button>
          </div>

          <div class="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <!-- Header -->
            <div class="grid grid-cols-[60px_120px_1fr_100px_100px] gap-2 p-3 bg-gray-100/80 border-b border-gray-200 text-xs font-bold text-gray-500">
              <div class="text-center">棒次</div>
              <div>守位</div>
              <div>球員姓名</div>
              <div>背號</div>
              <div class="text-center">操作</div>
            </div>
            <!-- Rows -->
            <div v-for="(p, i) in formData.lineup" :key="i" class="grid grid-cols-[60px_120px_1fr_100px_100px] gap-2 p-2.5 items-center border-b border-gray-100 bg-white hover:bg-primary/5 transition-colors">
              <div class="text-center font-black text-gray-400 text-lg">{{ p.order }}</div>
              <div>
                <el-select v-model="p.position" size="small" class="w-full">
                  <el-option v-for="opt in posOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                </el-select>
              </div>
              <div>
                <el-select v-model="p.name" size="small" placeholder="選擇球員" filterable allow-create clearable @change="(val: string) => handleLineupPlayerChange(p, val)" class="w-full">
                  <el-option v-for="name in selectedPlayers" :key="name" :label="name" :value="name" />
                </el-select>
              </div>
              <div><el-input v-model="p.number" size="small" placeholder="#" /></div>
              <div class="flex items-center justify-center space-x-1">
                <el-button size="small" text @click="moveLineup(i, -1)" :disabled="i === 0">▲</el-button>
                <el-button size="small" text @click="moveLineup(i, 1)" :disabled="i === formData.lineup.length - 1">▼</el-button>
                <el-button type="danger" size="small" circle plain @click="removeLineup(i)"><el-icon><Minus /></el-icon></el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- === TAB 3: INNING LOGS === -->
        <div v-show="activeTab === 'innings'" class="space-y-6 animate-fade-in pr-2">
           
           <!-- Logs View & Action Area -->
           <div class="flex flex-col xl:flex-row gap-6">
              
             <!-- Rapid Composer Tool -->
             <div class="flex-1 bg-blue-50/30 p-4 rounded-xl border border-blue-100 flex flex-col space-y-4 shadow-sm relative">
               <h3 class="font-extrabold text-blue-800 text-sm flex items-center mb-1">
                 <el-icon class="mr-1.5"><Document /></el-icon> 快速紀錄工具 (組合拼湊)
               </h3>
               
               <!-- Player Dropdown -->
               <div class="flex gap-2 w-full">
                 <el-select v-model="currentPlayerId" placeholder="選擇球員..." class="flex-1" @change="handlePlayerSelect">
                   <el-option v-for="l in formData.lineup" :key="l.order" :value="String(l.order)" :label="`${l.order}棒 - ${l.name||'未填'}`" />
                 </el-select>
                 <el-button @click="handlePlayerSelect(currentPlayerId)" class="shrink-0" :disabled="!currentPlayerId">
                   插入名稱
                 </el-button>
               </div>

               <!-- Action Buttons -->
               <div class="space-y-3">
                 <div>
                   <label class="text-xs font-bold text-gray-500 mb-1.5 flex items-center"><el-icon class="mr-1"><Position /></el-icon>擊球方向 (可選)</label>
                   <div class="flex flex-wrap gap-1.5">
                     <button v-for="btn in btnDirs" :key="btn" @click="appendLogText(`${btn}方向`)" class="px-2 py-1 text-[11px] font-bold border border-gray-200 bg-white text-gray-600 rounded hover:bg-gray-100 transition-colors">{{ btn }}</button>
                   </div>
                 </div>
                 
                 <div>
                   <label class="text-xs font-bold text-gray-500 mb-1.5 flex items-center">⚾ 安打與上壘</label>
                   <div class="flex flex-wrap gap-1.5">
                     <button v-for="btn in btnHits" :key="btn.label" @click="appendLogText(btn.label)" :class="btn.class" class="px-2 py-1 text-[11px] font-bold border rounded transition-colors">{{ btn.label }}</button>
                   </div>
                 </div>

                 <div>
                   <label class="text-xs font-bold text-gray-500 mb-1.5 flex items-center">❌ 出局與三振</label>
                   <div class="flex flex-wrap gap-1.5">
                     <button v-for="btn in btnOuts" :key="btn" @click="appendLogText(btn)" class="px-2 py-1 text-[11px] font-bold border border-gray-200 bg-white text-gray-600 rounded hover:bg-gray-100 transition-colors">{{ btn }}</button>
                   </div>
                 </div>

                 <div>
                   <label class="text-xs font-bold text-gray-500 mb-1.5 flex items-center">🏃 推進跑壘與特殊</label>
                   <div class="flex flex-wrap gap-1.5">
                     <button v-for="btn in btnSpecial" :key="btn.label" @click="appendLogText(btn.label)" :class="btn.class" class="px-2 py-1 text-[11px] font-bold border rounded transition-colors">{{ btn.label }}</button>
                   </div>
                 </div>
               </div>
               
               <!-- Composer Input Bar -->
               <div class="mt-4 pt-4 border-t border-blue-100">
                 <label class="text-xs font-bold text-gray-500 mb-2 block">純手動新增 / 修改拼湊結果</label>
                 <div class="flex flex-col sm:flex-row gap-2">
                   <el-select v-model="currentInning" class="w-full sm:w-28 shrink-0">
                     <el-option v-for="i in ['一上','一下','二上','二下','三上','三下','四上','四下','五上','五下','六上','六下','七上','七下','八上','八下','九上','九下']" :key="i" :value="i" :label="i" />
                   </el-select>
                   <el-input v-model="manualLogText" placeholder="點選按鈕拼湊，或手動輸入..." class="flex-1" clearable />
                 </div>
                 <div class="mt-3 flex gap-2 w-full">
                   <el-button @click="commitLog" type="primary" class="font-bold flex-1" :disabled="!manualLogText.trim()"><el-icon class="mr-1"><Check /></el-icon> 送出本筆紀錄</el-button>
                   <el-button @click="manualLogText = ''" type="danger" plain icon="Delete" class="w-12 shrink-0"></el-button>
                 </div>
               </div>
               
             </div>

             <!-- Logs Wrapper -->
             <div class="flex-1 bg-white rounded-xl p-4 md:p-6 border border-gray-200 shadow-sm min-h-[400px] xl:max-h-[600px] overflow-y-auto custom-scrollbar">
                <h3 class="font-extrabold text-gray-800 text-sm mb-4 border-b border-gray-100 pb-2 flex justify-between items-center">
                  <span>即時文字轉播預覽</span>
                  <span class="text-xs text-gray-500 font-normal">順序將依局數自動排列</span>
                </h3>
                <el-timeline v-if="formData.inning_logs.length" class="mt-2 pl-2">
                  <el-timeline-item
                    v-for="(log, idx) in formData.inning_logs"
                    :key="idx"
                    :timestamp="log.inning"
                    placement="top"
                    color="#3b82f6"
                    center
                    class="relative group pb-4"
                  >
                    <div class="flex items-start justify-between">
                      <p class="text-[13px] font-bold text-gray-700 leading-relaxed max-w-[85%]">{{ log.log }}</p>
                      <el-button type="danger" link @click="removeLog(idx)" class="opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0 text-xs">移除</el-button>
                    </div>
                  </el-timeline-item>
                </el-timeline>
                <div v-else class="h-full flex items-center justify-center text-gray-400 font-bold italic text-sm py-20">
                  尚無任何文字轉播紀錄，請從左側新增
                </div>
             </div>

           </div>
           
        </div>

        <!-- === TAB 4: BATTING STATS === -->
        <div v-show="activeTab === 'stats'" class="space-y-4 animate-fade-in pr-2">
           <div class="flex items-center justify-between bg-primary/5 p-4 rounded-xl border border-primary/10">
             <div>
               <h3 class="font-extrabold text-primary text-sm">手動微調個人打擊成績</h3>
               <p class="text-xs text-primary/70 mt-0.5">請確認每個人的各項數據正確。如果之前使用了「快速紀錄工具」，這裡的數字會自動累加。</p>
             </div>
             <el-button @click="loadLineupToStats" type="primary" plain size="small" class="!font-bold bg-white">
               從先發陣容載入球員
             </el-button>
           </div>
           
           <div class="overflow-x-auto min-h-[300px] custom-scrollbar border border-gray-200 rounded-xl">
              <table class="w-full text-[11px] text-center border-collapse whitespace-nowrap">
                <thead>
                  <tr class="bg-gray-100 text-gray-600 font-black">
                    <th class="p-2 border-b border-gray-200 text-left pl-3 sticky left-0 z-10 bg-gray-100">球員名稱</th>
                    <th class="p-2 border-b border-gray-200" title="打席">PA</th>
                    <th class="p-2 border-b border-gray-200" title="打數">AB</th>
                    <th class="p-2 border-b border-gray-200" title="一壘安">1B</th>
                    <th class="p-2 border-b border-gray-200" title="二壘安">2B</th>
                    <th class="p-2 border-b border-gray-200" title="三壘安">3B</th>
                    <th class="p-2 border-b border-gray-200 text-red-600" title="全壘打">HR</th>
                    <th class="p-2 border-b border-gray-200 text-blue-600" title="打點">RBI</th>
                    <th class="p-2 border-b border-gray-200 text-orange-600" title="得分">R</th>
                    <th class="p-2 border-b border-gray-200" title="四死球">BB</th>
                    <th class="p-2 border-b border-gray-200" title="三振">SO</th>
                    <th class="p-2 border-b border-gray-200" title="盜壘">SB</th>
                    <th class="p-2 border-b border-gray-200">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(s, i) in formData.batting_stats" :key="i" class="border-b border-gray-100/50 hover:bg-gray-50 transition-colors">
                    <td class="p-1 pl-3 sticky left-0 z-10 bg-white">
                      <!-- Provide a small white bg wrapper to cover scrolling content underneath due to sticky -->
                      <div class="bg-inherit w-full h-full flex items-center pr-2">
                        <el-input v-model="s.name" size="small" class="w-20" />
                      </div>
                    </td>
                    <td class="p-1"><el-input-number v-model="s.pa" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-input-number v-model="s.ab" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-input-number v-model="s.h1" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-green-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.h2" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-green-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.h3" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-green-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.hr" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-red-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.rbi" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-blue-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.r" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-orange-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.bb" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-input-number v-model="s.so" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-input-number v-model="s.sb" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-button type="danger" size="small" text @click="formData.batting_stats.splice(i, 1)"><el-icon><Minus /></el-icon></el-button></td>
                  </tr>
                  <tr v-if="formData.batting_stats.length === 0">
                    <td colspan="13" class="p-8 text-gray-400 font-bold italic">
                      目前沒有打擊成績，請先「從先發陣容載入」或手動新增球員。
                    </td>
                  </tr>
                </tbody>
              </table>
           </div>
           
           <div class="flex justify-end pt-2">
             <el-button @click="formData.batting_stats.push({name:'', number:'', pa:0, ab:0, h1:0, h2:0, h3:0, hr:0, rbi:0, r:0, bb:0, hbp:0, so:0, sb:0})" size="small" plain><el-icon class="mr-1.5"><Plus /></el-icon>加入單地球員</el-button>
           </div>
        </div>

      </div>
    </div>
    
    <!-- Dialog Footer -->
    <template #footer>
      <div class="flex justify-between items-center px-4 w-full bg-white border-t border-gray-100 py-3 rounded-b-2xl">
        <div class="flex items-center">
          <el-button v-if="mode === 'edit'" type="danger" text @click="handleDelete" class="!font-bold !px-2 hover:bg-red-50">
            <el-icon class="mr-1"><Delete /></el-icon> 刪除紀錄
          </el-button>
          <span v-else class="text-xs text-gray-400 font-bold tracking-widest uppercase">Draft / Autosaved</span>
        </div>
        <div class="flex gap-3">
          <el-button @click="visible = false" class="!rounded-xl px-6">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSave" class="!rounded-xl px-8 font-bold shadow-md shadow-primary/30">
            儲存紀錄
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style>
/* Reset Element Plus Dialog body padding to allow edge-to-edge layout */
.custom-dialog .el-dialog__body {
  padding: 0 !important;
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #e2e8f0;
  border-radius: 6px;
}
</style>
