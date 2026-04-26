<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Plus, Minus, Position, DataAnalysis, Connection, Upload, Document, Check, Delete, Loading } from '@element-plus/icons-vue'
import type { MatchRecordInput, LineupEntry, InningLog, BattingStat, PitchingStat, LineScoreData } from '@/types/match'
import { useMatchesStore } from '@/stores/matches'
import { supabase } from '@/services/supabase'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { onMounted } from 'vue'
import { compressImage } from '@/utils/imageCompressor'
import MatchLiveController from './MatchLiveController.vue'
import { cloneLineScoreData, createDefaultLineScoreData, finalizeInningScore, getNextInning } from '@/utils/liveMatchScoreboard'

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

interface TeamMemberOption {
  id: string
  name: string
  role: string | null
  status: string | null
  jersey_number?: string | null
  avatar_url?: string | null
}

interface LiveBatterOption {
  name: string
  label: string
  number?: string
}

interface LiveBatterOptionGroup {
  label: string
  options: LiveBatterOption[]
}

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

// === FETCH TEAM MEMBERS FOR DROPDOWNS ===
const allMembers = ref<TeamMemberOption[]>([])
const activeMembers = computed(() => allMembers.value.filter(m => m.status === '在隊' || !m.status))
const coachOptions = computed(() => activeMembers.value.filter(m => m.role === '教練' || m.role === '管理群'))
const playerOptions = computed(() => activeMembers.value.filter(m => m.role === '球員' || m.role === '校隊'))

onMounted(async () => {
  const { data } = await supabase
    .from('team_members_safe')
    .select('id, name, role, status, jersey_number, avatar_url')
    .order('role')
    .order('name')
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
  tournament_name: null,
  home_score: 0,
  opponent_score: 0,
  coaches: '',
  players: '',
  note: '',
  photo_url: '',
  absent_players: [],
  lineup: [],
  current_lineup: [],
  inning_logs: [],
  batting_stats: [],
  pitching_stats: [],
  current_batter_name: '',
  current_inning: '一上',
  current_b: 0,
  current_s: 0,
  current_o: 0,
  base_1: false,
  base_2: false,
  base_3: false,
  bat_first: true,
  show_lineup_intro: false,
  show_line_score: false,
  show_3d_field: false,
  line_score_data: createDefaultLineScoreData()
})

// Default options (mocked for now, normally fetched from API)
const groupOptions = ['U10', 'U12', 'U15', '中港校隊', '社會教練組']
const levelOptions = ['友誼賽', '特訓課', '全國賽', '市級錦標賽']
const tournamentOptions = computed(() =>
  Array.from(
    new Set(
      matchesStore.matches
        .map((match) => String(match.tournament_name || '').trim())
        .filter(Boolean)
    )
  ).sort((left, right) => right.localeCompare(left, 'zh-Hant'))
)

// Proxy computed properties for multi-selects
const selectedCoaches = computed({
  get: () => formData.value.coaches ? formData.value.coaches.split(',').filter(Boolean) : [],
  set: (val) => formData.value.coaches = val.join(',')
})

const selectedPlayers = computed({
  get: () => formData.value.players ? formData.value.players.split(',').filter(Boolean) : [],
  set: (val) => formData.value.players = val.join(',')
})

const cloneLineup = (lineup?: LineupEntry[]) => JSON.parse(JSON.stringify(Array.isArray(lineup) ? lineup : [])) as LineupEntry[]
const cloneInningLogs = (logs?: InningLog[]) => JSON.parse(JSON.stringify(Array.isArray(logs) ? logs : [])) as InningLog[]
const cloneBattingStats = (stats?: BattingStat[]) => JSON.parse(JSON.stringify(Array.isArray(stats) ? stats : [])) as BattingStat[]
const clonePitchingStats = (stats?: PitchingStat[]) => JSON.parse(JSON.stringify(Array.isArray(stats) ? stats : [])) as PitchingStat[]

const defaultLineup = () =>
  Array.from({ length: 9 }).map((_, i) => ({
    order: i + 1,
    position: String(i + 1),
    name: '',
    number: ''
  }))

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value
  return fallback
}

// Reset or load data
const initForm = async () => {
  activeTab.value = 'basic'
  currentLineupMode.value = 'synced'
  if (props.mode === 'edit' && props.matchId) {
    const data = await matchesStore.matches.find(m => m.id === props.matchId)
    if (data) {
      currentLineupMode.value = data.current_lineup?.length ? 'manual' : 'synced'
      // deep clone array fields
      formData.value = { 
        ...data,
        absent_players: JSON.parse(JSON.stringify(data.absent_players || [])),
        lineup: cloneLineup(data.lineup),
        current_lineup: cloneLineup(data.current_lineup?.length ? data.current_lineup : data.lineup),
        inning_logs: cloneInningLogs(data.inning_logs),
        batting_stats: cloneBattingStats(data.batting_stats),
        pitching_stats: clonePitchingStats(data.pitching_stats),
        current_batter_name: data.current_batter_name || '',
        current_inning: data.current_inning || '一上',
        current_b: normalizeNumber(data.current_b),
        current_s: normalizeNumber(data.current_s),
        current_o: normalizeNumber(data.current_o),
        base_1: normalizeBoolean(data.base_1),
        base_2: normalizeBoolean(data.base_2),
        base_3: normalizeBoolean(data.base_3),
        bat_first: data.bat_first !== false,
        show_lineup_intro: normalizeBoolean(data.show_lineup_intro),
        show_line_score: normalizeBoolean(data.show_line_score),
        show_3d_field: normalizeBoolean(data.show_3d_field),
        line_score_data: cloneLineScoreData(data.line_score_data)
      }
      currentInning.value = formData.value.current_inning || '一上'
    }
  } else {
    const lineup = defaultLineup()
    formData.value = {
      match_name: '',
      opponent: '',
      match_date: dayjs().format('YYYY-MM-DD'),
      match_time: '',
      location: '',
      category_group: '',
      match_level: '友誼賽',
      tournament_name: null,
      home_score: 0,
      opponent_score: 0,
      coaches: '',
      players: '',
      note: '',
      photo_url: '',
      absent_players: [],
      lineup,
      current_lineup: cloneLineup(lineup),
      inning_logs: [],
      batting_stats: [],
      pitching_stats: [],
      current_batter_name: '',
      current_inning: '一上',
      current_b: 0,
      current_s: 0,
      current_o: 0,
      base_1: false,
      base_2: false,
      base_3: false,
      bat_first: true,
      show_lineup_intro: false,
      show_line_score: false,
      show_3d_field: false,
      line_score_data: createDefaultLineScoreData()
    }
    currentInning.value = '一上'
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

const availablePlayerNames = computed(() => {
  const names = new Set<string>()
  selectedPlayers.value.forEach((name) => names.add(name))
  playerOptions.value.forEach((player) => names.add(player.name))
  formData.value.lineup.forEach((player) => {
    if (player.name) names.add(player.name)
  })
  formData.value.current_lineup?.forEach((player) => {
    if (player.name) names.add(player.name)
  })
  return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
})

const currentLineupMode = ref<'synced' | 'manual'>('synced')

const syncCurrentLineupFromStarting = () => {
  formData.value.current_lineup = cloneLineup(formData.value.lineup)
  currentLineupMode.value = 'synced'
  ElMessage.success('已套用先發與打線為目前場上名單')
}

const addCurrentLineup = () => {
  if (!formData.value.current_lineup) formData.value.current_lineup = []
  formData.value.current_lineup.push({
    order: formData.value.current_lineup.length + 1,
    position: '預備',
    name: '',
    number: ''
  })
  currentLineupMode.value = 'manual'
}

const removeCurrentLineup = (index: number) => {
  formData.value.current_lineup?.splice(index, 1)
  formData.value.current_lineup?.forEach((player, idx) => player.order = idx + 1)
  currentLineupMode.value = 'manual'
}

const moveCurrentLineup = (index: number, dir: -1 | 1) => {
  const lineup = formData.value.current_lineup
  if (!lineup || index + dir < 0 || index + dir >= lineup.length) return
  const temp = lineup[index]
  lineup[index] = lineup[index + dir]
  lineup[index + dir] = temp
  lineup.forEach((player, idx) => player.order = idx + 1)
  currentLineupMode.value = 'manual'
}

const handleCurrentLineupPlayerChange = (lineupEntry: LineupEntry, playerName: string) => {
  currentLineupMode.value = 'manual'
  handleLineupPlayerChange(lineupEntry, playerName)
}

// === TAB 3: INNING LOGS ===
const currentInning = ref('一上')
const activeLogIndex = ref(-1)

const inningOptions = ['一上','一下','二上','二下','三上','三下','四上','四下','五上','五下','六上','六下','七上','七下','八上','八下','九上','九下','延長']

const sortInningLogs = () => {
  formData.value.inning_logs.sort((a, b) => {
    let idxA = inningOptions.indexOf(a.inning)
    if (idxA === -1) idxA = 99
    let idxB = inningOptions.indexOf(b.inning)
    if (idxB === -1) idxB = 99
    return idxA - idxB
  })
}

const isOffensiveHalf = (inning: string) => {
  const isTop = inning.includes('上')
  return formData.value.bat_first !== false ? isTop : !isTop
}

const lineupHasNamedPlayers = (lineup?: LineupEntry[]) =>
  Array.isArray(lineup) && lineup.some((player) => String(player.name || '').trim())

const activeGameLineup = computed(() =>
  lineupHasNamedPlayers(formData.value.current_lineup)
    ? formData.value.current_lineup || []
    : formData.value.lineup
)

const currentPitcher = computed(() =>
  activeGameLineup.value.find((player) => player.position === '1' && player.name)?.name || ''
)

const liveBatterOptions = computed<LiveBatterOptionGroup[]>(() => {
  const seen = new Set<string>()
  const groups: LiveBatterOptionGroup[] = []
  const makeOption = (name: string, label = name, number = '') => ({
    name,
    label,
    number
  })
  const pushGroup = (label: string, options: LiveBatterOption[]) => {
    if (options.length) groups.push({ label, options })
  }
  const isPitcher = (player: LineupEntry) =>
    player.position === '1' || String(player.remark || '').includes('投')

  const pitcherOptions: LiveBatterOption[] = []
  activeGameLineup.value.forEach((player) => {
    if (!player.name || !isPitcher(player) || seen.has(player.name)) return
    seen.add(player.name)
    pitcherOptions.push(makeOption(player.name, `P ${player.name}`, player.number || ''))
  })
  formData.value.pitching_stats?.forEach((stat) => {
    if (!stat.name || seen.has(stat.name)) return
    seen.add(stat.name)
    pitcherOptions.push(makeOption(stat.name, `P ${stat.name}`, stat.number || getStatPlayerNumber(stat.name)))
  })
  pushGroup('投手 (先發/後援)', pitcherOptions)

  const lineupOptions: LiveBatterOption[] = []
  activeGameLineup.value.forEach((player) => {
    if (!player.name || seen.has(player.name)) return
    seen.add(player.name)
    const order = Number(player.order)
    const orderLabel = Number.isFinite(order) && order > 0 ? `${order}棒 ` : ''
    lineupOptions.push(makeOption(player.name, `${orderLabel}${player.name}`, player.number || ''))
  })
  pushGroup('打擊線與守備員', lineupOptions)

  const otherOptions = availablePlayerNames.value
    .filter((name) => name && !seen.has(name))
    .map((name) => {
      seen.add(name)
      return makeOption(name, name, getStatPlayerNumber(name))
    })
  pushGroup('其他球員', otherOptions)

  return groups
})

const findOrCreateInningLog = (inning = formData.value.current_inning || '一上') => {
  let logIndex = formData.value.inning_logs.findIndex((log) => log.inning === inning)
  if (logIndex === -1) {
    formData.value.inning_logs.push({
      inning,
      log: '',
      selectedPlayerId: isOffensiveHalf(inning) ? '' : currentPitcher.value
    })
    sortInningLogs()
    logIndex = formData.value.inning_logs.findIndex((log) => log.inning === inning)
  }
  activeLogIndex.value = logIndex
  return formData.value.inning_logs[logIndex]
}

const handleLiveStateUpdate = (updates: Partial<MatchRecordInput>) => {
  const nextUpdates = { ...updates }
  if (nextUpdates.line_score_data) {
    nextUpdates.line_score_data = cloneLineScoreData(nextUpdates.line_score_data as LineScoreData)
  }

  Object.assign(formData.value, nextUpdates)

  if (typeof updates.current_inning === 'string' && updates.current_inning) {
    currentInning.value = updates.current_inning
    findOrCreateInningLog(updates.current_inning)
  }
}

const appendLiveActionToCurrentLog = ({ batter, action }: { batter?: string; action: string }) => {
  const inning = formData.value.current_inning || '一上'
  const log = findOrCreateInningLog(inning)
  if (!isOffensiveHalf(inning) && !log.selectedPlayerId) {
    log.selectedPlayerId = currentPitcher.value || formData.value.current_batter_name || ''
  }

  const lineupPlayer = activeGameLineup.value.find((player) => player.name === batter)
  const order = Number(lineupPlayer?.order)
  const orderLabel = Number.isFinite(order) && order > 0 ? `${order}棒 ` : ''
  const actor = batter ? `${orderLabel}${batter}` : ''
  const entry = actor ? `${actor} ${action}` : action
  const previousLog = String(log.log || '').trimEnd()
  log.log = previousLog ? `${previousLog}\n${entry}` : entry
}

const addInningLog = () => {
  const targetInning = formData.value.current_inning || '一上'
  const targetLog = findOrCreateInningLog(targetInning)
  if (!targetLog.selectedPlayerId && !isOffensiveHalf(targetInning)) {
    targetLog.selectedPlayerId = currentPitcher.value
  }
}

const finishLogEdit = () => {
  ElMessage.success('已保留本局逐字紀錄，請記得儲存比賽紀錄')
}

const updateCurrentInning = (inning: string) => {
  formData.value.current_inning = inning
  currentInning.value = inning
  findOrCreateInningLog(inning)
}

const removeLog = (index: number) => {
  formData.value.inning_logs.splice(index, 1)
  if (activeLogIndex.value === index) activeLogIndex.value = -1
}

// === TAB 4/5: STATS ===
const createEmptyBattingStat = (name = '', number = ''): BattingStat => ({
  name,
  number,
  pa: 0,
  ab: 0,
  h1: 0,
  h2: 0,
  h3: 0,
  hr: 0,
  rbi: 0,
  r: 0,
  bb: 0,
  hbp: 0,
  so: 0,
  sb: 0
})

const createEmptyPitchingStat = (name = '', number = ''): PitchingStat => ({
  name,
  number,
  ip: 0,
  h: 0,
  h2: 0,
  h3: 0,
  hr: 0,
  r: 0,
  er: 0,
  bb: 0,
  so: 0,
  np: 0,
  ab: 0,
  go: 0,
  ao: 0
})

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

const loadCurrentLineupToPitchingStats = () => {
  const pitcherCandidates = activeGameLineup.value.filter((player) => player.name && (player.position === '1' || player.remark?.includes('投')))
  const existingNames = new Set(formData.value.pitching_stats?.map((stat) => stat.name) || [])
  if (!formData.value.pitching_stats) formData.value.pitching_stats = []

  pitcherCandidates.forEach((player) => {
    if (!existingNames.has(player.name)) {
      formData.value.pitching_stats?.push(createEmptyPitchingStat(player.name, player.number || ''))
      existingNames.add(player.name)
    }
  })

  ElMessage.success(pitcherCandidates.length ? '已載入目前場上投手資料' : '目前場上名單沒有標記投手')
}

const getHits = (stat: BattingStat) => (stat.h1 || 0) + (stat.h2 || 0) + (stat.h3 || 0) + (stat.hr || 0)
const getAvg = (stat: BattingStat) => stat.ab > 0 ? (getHits(stat) / stat.ab).toFixed(3).replace(/^0/, '') : '.000'
const formatIP = (outs: number) => `${Math.floor((Number(outs) || 0) / 3)}.${(Number(outs) || 0) % 3}`
const getEra = (stat: PitchingStat) => stat.ip > 0 ? (((stat.er || 0) * 7) / (stat.ip / 3)).toFixed(2) : '0.00'

const getStatPlayerNumber = (name: string) =>
  activeGameLineup.value.find((player) => player.name === name)?.number ||
  formData.value.lineup.find((player) => player.name === name)?.number ||
  ''

const ensureBattingStat = (name: string) => {
  let stat = formData.value.batting_stats.find((item) => item.name === name)
  if (!stat) {
    stat = createEmptyBattingStat(name, getStatPlayerNumber(name))
    formData.value.batting_stats.push(stat)
  }
  return stat
}

const ensurePitchingStat = (name: string) => {
  if (!formData.value.pitching_stats) formData.value.pitching_stats = []
  let stat = formData.value.pitching_stats.find((item) => item.name === name)
  if (!stat) {
    stat = createEmptyPitchingStat(name, getStatPlayerNumber(name))
    formData.value.pitching_stats.push(stat)
  }
  return stat
}

const resetBattingNumbers = () => {
  formData.value.batting_stats.forEach((stat) => {
    Object.assign(stat, createEmptyBattingStat(stat.name, stat.number || getStatPlayerNumber(stat.name)))
  })
}

const resetPitchingNumbers = () => {
  formData.value.pitching_stats?.forEach((stat) => {
    Object.assign(stat, createEmptyPitchingStat(stat.name, stat.number || getStatPlayerNumber(stat.name)))
  })
}

const recalculateBattingStatsFromLogs = () => {
  if (!formData.value.batting_stats.length) loadLineupToStats()
  resetBattingNumbers()

  const offensiveLogs = formData.value.inning_logs.filter((log) => isOffensiveHalf(log.inning))
  let applied = 0

  offensiveLogs.forEach((log) => {
    const text = log.log || ''
    activeGameLineup.value.forEach((player) => {
      if (!player.name || !text.includes(player.name)) return
      const stat = ensureBattingStat(player.name)

      const hasAtBat = ['一安', '二安', '三安', 'HR', '全壘打', '內安', '空振', '站振', '三振', '飛球接殺', '平飛接殺', '滾地刺殺', '界外接殺', '雙殺打', '失誤', '野選'].some((term) => text.includes(term))
      const hasPlateAppearance = hasAtBat || ['四壞', '觸身', '高飛犧牲打', '犧牲觸擊', '妨礙打擊'].some((term) => text.includes(term))

      if (hasPlateAppearance) stat.pa += 1
      if (hasAtBat) stat.ab += 1
      if (text.includes('一安') || text.includes('內安')) stat.h1 += 1
      if (text.includes('二安')) stat.h2 += 1
      if (text.includes('三安')) stat.h3 += 1
      if (text.includes('HR') || text.includes('全壘打')) stat.hr += 1
      if (text.includes('四壞')) stat.bb += 1
      if (text.includes('觸身')) stat.hbp += 1
      if (text.includes('空振') || text.includes('站振') || text.includes('三振')) stat.so += 1
      if (text.includes('盜壘成功')) stat.sb += 1
      if (text.includes('回來得分') || text.includes('得分')) stat.r += 1

      const rbiMatch = text.match(/(?:帶有|得到|貢獻)?(\d+)分打點/)
      if (rbiMatch) stat.rbi += Number(rbiMatch[1]) || 0
      if (hasPlateAppearance) applied += 1
    })
  })

  ElMessage.success(`已根據逐局轉播重新計算打擊成績（${applied} 筆）`)
}

const recalculatePitchingStatsFromLogs = () => {
  if (!formData.value.pitching_stats?.length) loadCurrentLineupToPitchingStats()
  resetPitchingNumbers()

  const defensiveLogs = formData.value.inning_logs.filter((log) => !isOffensiveHalf(log.inning))
  let applied = 0

  defensiveLogs.forEach((log) => {
    const pitcherName = log.selectedPlayerId || currentPitcher.value
    if (!pitcherName) return

    const stat = ensurePitchingStat(pitcherName)
    const text = log.log || ''
    const atBatTerms = ['被一安', '被二安', '被三安', '被全壘打', '被內安', '空振', '三振', '滾地', '飛球', '雙殺', '失誤', '野選']

    if (atBatTerms.some((term) => text.includes(term))) stat.ab += 1
    if (text.includes('被一安') || text.includes('被內安')) stat.h += 1
    if (text.includes('被二安')) { stat.h += 1; stat.h2 += 1 }
    if (text.includes('被三安')) { stat.h += 1; stat.h3 += 1 }
    if (text.includes('被全壘打')) { stat.h += 1; stat.hr += 1 }
    if (text.includes('投出四壞') || text.includes('保送') || text.includes('四壞')) stat.bb += 1
    if (text.includes('空振') || text.includes('三振')) stat.so += 1
    if (text.includes('投手失分') || text.includes('掉分') || text.includes('失分')) stat.r += 1
    if (text.includes('投手責失') || text.includes('責失')) stat.er += 1
    if (text.includes('滾地')) { stat.ip += 1; stat.go += 1 }
    if (text.includes('飛球') || text.includes('接殺')) { stat.ip += 1; stat.ao += 1 }
    if (text.includes('三人出局')) stat.ip = Math.max(stat.ip, Math.ceil(stat.ip / 3) * 3)
    applied += 1
  })

  ElMessage.success(`已根據逐局轉播重新計算投手成績（${applied} 局）`)
}

const clampCount = (value: number, max: number) => Math.min(Math.max(value, 0), max)
const countControls: Array<{ key: 'current_b' | 'current_s' | 'current_o'; label: string; max: number }> = [
  { key: 'current_b', label: 'B', max: 3 },
  { key: 'current_s', label: 'S', max: 2 },
  { key: 'current_o', label: 'O', max: 2 }
]

const adjustCount = (key: 'current_b' | 'current_s' | 'current_o', delta: number) => {
  const max = key === 'current_b' ? 3 : 2
  formData.value[key] = clampCount(normalizeNumber(formData.value[key]) + delta, max)
}

const toggleBase = (base: 'base_1' | 'base_2' | 'base_3') => {
  formData.value[base] = !formData.value[base]
}

const resetCount = () => {
  formData.value.current_b = 0
  formData.value.current_s = 0
}

const resetHalfInning = () => {
  formData.value.line_score_data = finalizeInningScore(
    formData.value.line_score_data,
    formData.value.current_inning,
    formData.value.bat_first !== false
  )
  formData.value.current_b = 0
  formData.value.current_s = 0
  formData.value.current_o = 0
  formData.value.base_1 = false
  formData.value.base_2 = false
  formData.value.base_3 = false
  const nextInning = getNextInning(formData.value.current_inning || '一上')
  updateCurrentInning(nextInning)
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
    if (!lineupHasNamedPlayers(formData.value.current_lineup)) {
      formData.value.current_lineup = cloneLineup(formData.value.lineup)
    }
    formData.value.line_score_data = cloneLineScoreData(formData.value.line_score_data)
    formData.value.tournament_name = formData.value.tournament_name?.trim() || null
    sortInningLogs()

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
    const compressedFile = await compressImage(file, 1920, 1080)

    const fileExt = compressedFile.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `matches/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('matches-photos')
      .upload(filePath, compressedFile)

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
  <el-dialog v-model="visible" :title="mode === 'add' ? '新增比賽紀錄' : '編輯比賽紀錄'" width="100%" class="!rounded-2xl max-w-6xl custom-dialog" destroy-on-close align-center top="5vh">
    <div class="h-[75vh] flex flex-col md:flex-row -mx-4 -my-6 md:m-0 h-full">
      <!-- Left Sidebar Tabs (Desktop) / Top Tabs (Mobile) -->
      <div class="bg-gray-50 md:w-48 xl:w-56 shrink-0 border-b md:border-b-0 md:border-r border-gray-100 flex md:flex-col overflow-x-auto md:overflow-y-auto hide-scrollbar z-10 p-2 md:p-4 gap-1">
        <button @click="activeTab = 'basic'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'basic', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'basic'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[120px] md:min-w-0">
          <el-icon class="text-lg"><Document /></el-icon> <span>基本與賽況</span>
        </button>
        <button @click="activeTab = 'sync'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'sync', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'sync'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[120px] md:min-w-0">
          <el-icon class="text-lg"><Connection /></el-icon> <span>同步編輯</span>
        </button>
        <button @click="activeTab = 'lineup'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'lineup', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'lineup'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[120px] md:min-w-0">
          <el-icon class="text-lg"><Position /></el-icon> <span>先發與打線</span>
        </button>
        <button @click="activeTab = 'innings'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'innings', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'innings'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[120px] md:min-w-0">
          <el-icon class="text-lg"><Connection /></el-icon> <span>逐局轉播</span>
        </button>
        <button @click="activeTab = 'batting'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'batting', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'batting'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[150px] md:min-w-0">
          <el-icon class="text-lg"><DataAnalysis /></el-icon> <span>比賽成績 (打擊)</span>
        </button>
        <button @click="activeTab = 'pitching'" :class="{'bg-white text-primary shadow-sm border border-gray-200': activeTab === 'pitching', 'text-gray-500 hover:bg-gray-100 border border-transparent': activeTab !== 'pitching'}" class="px-4 py-3 md:py-4 rounded-xl flex items-center justify-center md:justify-start gap-2.5 font-bold transition-all shrink-0 min-w-[150px] md:min-w-0">
          <el-icon class="text-lg"><DataAnalysis /></el-icon> <span>比賽成績 (投手)</span>
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
                 <label class="text-xs font-bold text-gray-500 mb-1 block">盃賽名稱</label>
                 <el-select
                   v-model="formData.tournament_name"
                   filterable
                   allow-create
                   clearable
                   default-first-option
                   placeholder="選擇或輸入盃賽名稱"
                   class="!w-full"
                   size="large"
                 >
                   <el-option v-for="name in tournamentOptions" :key="name" :label="name" :value="name" />
                 </el-select>
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

        <!-- === TAB 2: SYNC WORKSPACE === -->
        <div v-show="activeTab === 'sync'" class="space-y-5 animate-fade-in pr-1">
          <div class="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(320px,0.9fr)_minmax(360px,1.1fr)] xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
            <section class="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h3 class="text-sm font-extrabold text-slate-900">目前場上名單</h3>
                  <div class="mt-1 flex flex-wrap gap-1.5">
                    <el-tag size="small" effect="plain" class="font-bold">共 {{ formData.current_lineup?.length || 0 }} 人</el-tag>
                    <el-tag size="small" type="success" effect="plain" class="font-bold">{{ currentPitcher ? `投手 ${currentPitcher}` : '未標記投手' }}</el-tag>
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <el-tag :type="currentLineupMode === 'synced' ? 'success' : 'warning'" effect="plain" class="font-bold">
                    {{ currentLineupMode === 'synced' ? '跟隨先發' : '獨立編輯' }}
                  </el-tag>
                  <el-button size="small" type="primary" plain @click="syncCurrentLineupFromStarting">套用先發打線</el-button>
                  <el-button size="small" color="#D99026" class="!text-white" @click="addCurrentLineup"><el-icon class="mr-1"><Plus /></el-icon>新增</el-button>
                </div>
              </div>

              <div class="overflow-x-auto custom-scrollbar pb-1">
                <div class="min-w-[560px] space-y-2">
                  <div class="grid grid-cols-[48px_116px_minmax(170px,1fr)_72px_96px] gap-2 px-2 text-[11px] font-black tracking-widest text-slate-400">
                    <div class="text-center">棒次</div>
                    <div>守位</div>
                    <div>球員</div>
                    <div>背號</div>
                    <div class="text-center">排序</div>
                  </div>
                  <div v-for="(p, i) in formData.current_lineup" :key="`current-${i}`" class="grid grid-cols-[48px_116px_minmax(170px,1fr)_72px_96px] gap-2 items-center rounded-xl border border-slate-100 bg-white p-2">
                    <div class="text-center text-sm font-black text-slate-400">{{ p.order }}</div>
                    <el-select v-model="p.position" size="small" class="w-full" @change="currentLineupMode = 'manual'">
                      <el-option v-for="opt in posOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </el-select>
                    <el-select v-model="p.name" size="small" placeholder="球員姓名" filterable allow-create clearable class="w-full" @change="(val: string) => handleCurrentLineupPlayerChange(p, val)">
                      <el-option v-for="name in availablePlayerNames" :key="`current-name-${name}`" :label="name" :value="name" />
                    </el-select>
                    <el-input v-model="p.number" size="small" placeholder="#" @change="currentLineupMode = 'manual'" />
                    <div class="flex justify-center gap-1">
                      <el-button size="small" text @click="moveCurrentLineup(i, -1)" :disabled="i === 0">▲</el-button>
                      <el-button size="small" text @click="moveCurrentLineup(i, 1)" :disabled="i === (formData.current_lineup?.length || 0) - 1">▼</el-button>
                      <el-button type="danger" size="small" circle plain @click="removeCurrentLineup(i)"><el-icon><Minus /></el-icon></el-button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="!formData.current_lineup?.length" class="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">
                尚未建立目前場上名單
              </div>
            </section>

            <section class="min-w-0 space-y-4 md:sticky md:top-0">
              <MatchLiveController
                :batter-options="liveBatterOptions"
                :initial-batter="formData.current_batter_name || ''"
                :initial-b="formData.current_b || 0"
                :initial-s="formData.current_s || 0"
                :initial-o="formData.current_o || 0"
                :initial-base1="Boolean(formData.base_1)"
                :initial-base2="Boolean(formData.base_2)"
                :initial-base3="Boolean(formData.base_3)"
                :is-defending="!isOffensiveHalf(formData.current_inning || '一上')"
                :initial-home-score="formData.home_score || 0"
                :initial-opponent-score="formData.opponent_score || 0"
                :initial-inning="formData.current_inning || '一上'"
                :initial-bat-first="formData.bat_first !== false"
                :initial-line-score-data="formData.line_score_data"
                :initial-show-lineup-intro="Boolean(formData.show_lineup_intro)"
                :initial-show-line-score="Boolean(formData.show_line_score)"
                :initial-show3d-field="Boolean(formData.show_3d_field)"
                home-team-name="中港熊戰"
                :opponent-team-name="formData.opponent || '對手'"
                @update="handleLiveStateUpdate"
                @record-action="appendLiveActionToCurrentLog"
              />

              <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-extrabold text-slate-900">逐局轉播紀錄</h3>
                    <p class="mt-1 text-xs font-semibold text-slate-500">{{ formData.current_inning || '一上' }} · {{ isOffensiveHalf(formData.current_inning || '一上') ? '我們進攻' : '我們防守' }}</p>
                  </div>
                  <el-button size="small" type="primary" plain @click="addInningLog">
                    <el-icon class="mr-1"><Plus /></el-icon>開啟本局
                  </el-button>
                </div>
                <div class="max-h-[260px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  <div v-for="(log, idx) in formData.inning_logs" :key="`sync-log-${log.inning}-${idx}`" class="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div class="mb-1 flex items-center justify-between gap-2">
                      <el-tag :type="isOffensiveHalf(log.inning) ? 'primary' : 'warning'" effect="plain" class="font-bold">{{ log.inning }}</el-tag>
                      <el-button size="small" text type="primary" @click="activeLogIndex = idx; activeTab = 'innings'">編輯</el-button>
                    </div>
                    <div class="line-clamp-3 whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600" :class="{ 'italic text-slate-400': !log.log }">
                      {{ log.log || '尚無逐字轉播紀錄' }}
                    </div>
                  </div>
                  <div v-if="!formData.inning_logs.length" class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
                    尚無逐局轉播紀錄
                  </div>
                </div>
              </div>
            </section>
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
                  <el-option v-for="name in availablePlayerNames" :key="name" :label="name" :value="name" />
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
        <div v-show="activeTab === 'innings'" class="space-y-5 animate-fade-in pr-2">
          <MatchLiveController
            :batter-options="liveBatterOptions"
            :initial-batter="formData.current_batter_name || ''"
            :initial-b="formData.current_b || 0"
            :initial-s="formData.current_s || 0"
            :initial-o="formData.current_o || 0"
            :initial-base1="Boolean(formData.base_1)"
            :initial-base2="Boolean(formData.base_2)"
            :initial-base3="Boolean(formData.base_3)"
            :is-defending="!isOffensiveHalf(formData.current_inning || '一上')"
            :initial-home-score="formData.home_score || 0"
            :initial-opponent-score="formData.opponent_score || 0"
            :initial-inning="formData.current_inning || '一上'"
            :initial-bat-first="formData.bat_first !== false"
            :initial-line-score-data="formData.line_score_data"
            :initial-show-lineup-intro="Boolean(formData.show_lineup_intro)"
            :initial-show-line-score="Boolean(formData.show_line_score)"
            :initial-show3d-field="Boolean(formData.show_3d_field)"
            home-team-name="中港熊戰"
            :opponent-team-name="formData.opponent || '對手'"
            @update="handleLiveStateUpdate"
            @record-action="appendLiveActionToCurrentLog"
          />

          <div class="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 md:flex-row md:items-end md:justify-between">
            <div class="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-[150px_minmax(180px,1fr)]">
              <label>
                <span class="mb-1 block text-xs font-bold text-slate-500">目前局數</span>
                <el-select :model-value="formData.current_inning" class="w-full" @update:model-value="updateCurrentInning">
                  <el-option v-for="inning in inningOptions" :key="inning" :label="inning" :value="inning" />
                </el-select>
              </label>
              <div>
                <span class="mb-1 block text-xs font-bold text-slate-500">目前場上投手</span>
                <div class="flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
                  {{ currentPitcher || '尚未在目前場上名單標記投手' }}
                </div>
              </div>
            </div>
            <el-button type="primary" class="font-bold" @click="addInningLog">
              <el-icon class="mr-1"><Plus /></el-icon>建立 / 開啟本局
            </el-button>
          </div>

          <div class="space-y-3">
            <div v-for="(log, idx) in formData.inning_logs" :key="`${log.inning}-${idx}`" class="rounded-2xl border bg-white p-4 shadow-sm transition-all" :class="activeLogIndex === idx ? 'border-primary ring-2 ring-primary/10' : 'border-slate-200'">
              <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex flex-wrap items-center gap-2">
                  <el-tag :type="isOffensiveHalf(log.inning) ? 'primary' : 'warning'" effect="dark" class="font-bold">{{ log.inning }}</el-tag>
                  <span class="text-sm font-bold text-slate-700">{{ isOffensiveHalf(log.inning) ? '我們進攻' : '我們防守' }}</span>
                  <span v-if="!isOffensiveHalf(log.inning) && log.selectedPlayerId" class="text-xs font-semibold text-slate-400">投手：{{ log.selectedPlayerId }}</span>
                </div>
                <div class="flex gap-2">
                  <el-button v-if="activeLogIndex !== idx" size="small" type="primary" plain @click="activeLogIndex = idx">編輯此局</el-button>
                  <el-button type="danger" circle plain size="small" @click="removeLog(idx)"><el-icon><Delete /></el-icon></el-button>
                </div>
              </div>

              <div v-if="activeLogIndex !== idx" class="min-h-[72px] whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm font-medium leading-relaxed text-slate-700" :class="{ 'italic text-slate-400': !log.log }">
                {{ log.log || '尚無逐字轉播紀錄' }}
              </div>

              <div v-else class="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                <div v-if="!isOffensiveHalf(log.inning)" class="max-w-xs">
                  <span class="mb-1 block text-xs font-bold text-slate-500">本半局投手</span>
                  <el-select v-model="log.selectedPlayerId" filterable allow-create clearable class="w-full">
                    <el-option v-for="name in availablePlayerNames" :key="`log-p-${name}`" :label="name" :value="name" />
                  </el-select>
                </div>
                <el-input v-model="log.log" type="textarea" :autosize="{ minRows: 6, maxRows: 16 }" placeholder="請逐字輸入本半局賽況，例如：一棒 陳奕樺 中外野一安，一壘有人" />
                <div class="flex justify-end">
                  <el-button color="#22c55e" class="!text-white font-bold" @click="finishLogEdit">
                    <el-icon class="mr-1"><Check /></el-icon>完成本局
                  </el-button>
                </div>
              </div>
            </div>

            <div v-if="!formData.inning_logs.length" class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-sm font-bold text-slate-400">
              尚無逐局轉播紀錄，請先建立目前局數。
            </div>
          </div>
        </div>

        <!-- === TAB 4: BATTING STATS === -->
        <div v-show="activeTab === 'batting'" class="space-y-4 animate-fade-in pr-2">
           <div class="flex items-center justify-between bg-primary/5 p-4 rounded-xl border border-primary/10">
             <div>
               <h3 class="font-extrabold text-primary text-sm">手動微調個人打擊成績</h3>
               <p class="text-xs text-primary/70 mt-0.5">PA、AB、安打、打點、跑壘</p>
             </div>
             <div class="flex flex-wrap justify-end gap-2">
               <el-button @click="loadLineupToStats" type="primary" plain size="small" class="!font-bold bg-white">
                 從先發載入
               </el-button>
               <el-button @click="recalculateBattingStatsFromLogs" color="#D99026" size="small" class="!font-bold !text-white">
                 從逐局重算
               </el-button>
             </div>
           </div>
           
           <div class="overflow-x-auto min-h-[300px] custom-scrollbar border border-gray-200 rounded-xl">
              <table class="w-full text-[11px] text-center border-collapse whitespace-nowrap">
                <thead>
                  <tr class="bg-gray-100 text-gray-600 font-black">
                    <th class="p-2 border-b border-gray-200 text-left pl-3 sticky left-0 z-10 bg-gray-100">球員名稱</th>
                    <th class="p-2 border-b border-gray-200" title="打擊率">AVG</th>
                    <th class="p-2 border-b border-gray-200" title="安打">H</th>
                    <th class="p-2 border-b border-gray-200" title="打席">PA</th>
                    <th class="p-2 border-b border-gray-200" title="打數">AB</th>
                    <th class="p-2 border-b border-gray-200" title="一壘安">1B</th>
                    <th class="p-2 border-b border-gray-200" title="二壘安">2B</th>
                    <th class="p-2 border-b border-gray-200" title="三壘安">3B</th>
                    <th class="p-2 border-b border-gray-200 text-red-600" title="全壘打">HR</th>
                    <th class="p-2 border-b border-gray-200 text-blue-600" title="打點">RBI</th>
                    <th class="p-2 border-b border-gray-200 text-orange-600" title="得分">R</th>
                    <th class="p-2 border-b border-gray-200" title="四死球">BB</th>
                    <th class="p-2 border-b border-gray-200" title="觸身">HBP</th>
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
                    <td class="p-1 font-mono font-black text-primary">{{ getAvg(s) }}</td>
                    <td class="p-1 font-mono font-bold">{{ getHits(s) }}</td>
                    <td class="p-1"><el-input-number v-model="s.pa" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-input-number v-model="s.ab" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-input-number v-model="s.h1" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-green-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.h2" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-green-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.h3" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-green-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.hr" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-red-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.rbi" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-blue-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.r" :controls="false" :min="0" size="small" class="!w-10 !px-0 bg-orange-50" /></td>
                    <td class="p-1"><el-input-number v-model="s.bb" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-input-number v-model="s.hbp" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-input-number v-model="s.so" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-input-number v-model="s.sb" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                    <td class="p-1"><el-button type="danger" size="small" text @click="formData.batting_stats.splice(i, 1)"><el-icon><Minus /></el-icon></el-button></td>
                  </tr>
                  <tr v-if="formData.batting_stats.length === 0">
                    <td colspan="16" class="p-8 text-gray-400 font-bold italic">
                      目前沒有打擊成績，請先「從先發陣容載入」或手動新增球員。
                    </td>
                  </tr>
                </tbody>
              </table>
           </div>
           
           <div class="flex justify-end pt-2">
             <el-button @click="formData.batting_stats.push(createEmptyBattingStat())" size="small" plain><el-icon class="mr-1.5"><Plus /></el-icon>加入單一球員</el-button>
           </div>
        </div>

        <!-- === TAB 5: PITCHING STATS === -->
        <div v-show="activeTab === 'pitching'" class="space-y-4 animate-fade-in pr-2">
          <div class="flex items-center justify-between bg-slate-100 p-4 rounded-xl border border-slate-200">
            <div>
              <h3 class="font-extrabold text-slate-800 text-sm">投手成績輸入</h3>
              <p class="text-xs text-slate-500 mt-0.5">局數、被安打、保送、三振、用球數</p>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
              <el-button @click="loadCurrentLineupToPitchingStats" type="primary" plain size="small" class="!font-bold bg-white">
                載入目前投手
              </el-button>
              <el-button @click="recalculatePitchingStatsFromLogs" color="#D99026" size="small" class="!font-bold !text-white">
                從逐局重算
              </el-button>
            </div>
          </div>

          <div class="overflow-x-auto min-h-[300px] custom-scrollbar border border-gray-200 rounded-xl">
            <table class="w-full text-[11px] text-center border-collapse whitespace-nowrap">
              <thead>
                <tr class="bg-gray-100 text-gray-600 font-black">
                  <th class="p-2 border-b border-gray-200 text-left pl-3 sticky left-0 z-10 bg-gray-100">投手</th>
                  <th class="p-2 border-b border-gray-200">IP</th>
                  <th class="p-2 border-b border-gray-200">出局數</th>
                  <th class="p-2 border-b border-gray-200">AB</th>
                  <th class="p-2 border-b border-gray-200">H</th>
                  <th class="p-2 border-b border-gray-200">2B</th>
                  <th class="p-2 border-b border-gray-200">3B</th>
                  <th class="p-2 border-b border-gray-200">HR</th>
                  <th class="p-2 border-b border-gray-200">R</th>
                  <th class="p-2 border-b border-gray-200">ER</th>
                  <th class="p-2 border-b border-gray-200">BB</th>
                  <th class="p-2 border-b border-gray-200">SO</th>
                  <th class="p-2 border-b border-gray-200">NP</th>
                  <th class="p-2 border-b border-gray-200">GO</th>
                  <th class="p-2 border-b border-gray-200">AO</th>
                  <th class="p-2 border-b border-gray-200">ERA</th>
                  <th class="p-2 border-b border-gray-200">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(s, i) in formData.pitching_stats" :key="`pitch-${i}`" class="border-b border-gray-100/50 hover:bg-gray-50 transition-colors">
                  <td class="p-1 pl-3 sticky left-0 z-10 bg-white">
                    <div class="flex items-center gap-1 pr-2">
                      <el-input v-model="s.name" size="small" class="w-24" placeholder="姓名" />
                      <el-input v-model="s.number" size="small" class="!w-14" placeholder="#" />
                    </div>
                  </td>
                  <td class="p-1 font-mono font-black text-primary">{{ formatIP(s.ip) }}</td>
                  <td class="p-1"><el-input-number v-model="s.ip" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.ab" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.h" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.h2" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.h3" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.hr" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.r" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.er" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.bb" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.so" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.np" :controls="false" :min="0" size="small" class="!w-12 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.go" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1"><el-input-number v-model="s.ao" :controls="false" :min="0" size="small" class="!w-10 !px-0" /></td>
                  <td class="p-1 font-mono font-black text-primary">{{ getEra(s) }}</td>
                  <td class="p-1"><el-button type="danger" size="small" text @click="formData.pitching_stats?.splice(i, 1)"><el-icon><Minus /></el-icon></el-button></td>
                </tr>
                <tr v-if="!formData.pitching_stats?.length">
                  <td colspan="17" class="p-8 text-gray-400 font-bold italic">
                    目前沒有投手成績，請先載入目前投手或手動新增。
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex justify-end pt-2">
            <el-button @click="formData.pitching_stats?.push(createEmptyPitchingStat())" size="small" plain><el-icon class="mr-1.5"><Plus /></el-icon>新增投手</el-button>
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
