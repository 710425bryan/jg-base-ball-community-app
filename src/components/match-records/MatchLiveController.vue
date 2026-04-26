<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Avatar, Close, DataAnalysis, EditPen, Position, Trophy, UserFilled, VideoCamera } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { LineScoreData } from '@/types/match'
import {
  applyLineStatDelta,
  applyScoreDelta,
  cloneLineScoreData,
  createDefaultLineScoreData,
  finalizeInningScore,
  getDefenseTeamKey,
  getDisplayStatKey,
  getDisplayTeamKey,
  getNextInning,
  getOffenseTeamKey,
} from '@/utils/liveMatchScoreboard'

type TeamKey = 'home' | 'opponent'
type DisplaySide = 'away' | 'home'
type LineStatKey = 'h' | 'e'

export interface LivePlayerOption {
  name: string
  label?: string
  number?: string | number | null
}

export interface LivePlayerOptionGroup {
  label: string
  options: LivePlayerOption[]
}

interface LiveStateUpdate {
  current_batter_name: string
  current_inning: string
  current_b: number
  current_s: number
  current_o: number
  base_1: boolean
  base_2: boolean
  base_3: boolean
  bat_first: boolean
  home_score: number
  opponent_score: number
  show_lineup_intro: boolean
  show_line_score: boolean
  show_3d_field: boolean
  line_score_data: LineScoreData
}

const props = withDefaults(defineProps<{
  batterOptions?: LivePlayerOptionGroup[] | LivePlayerOption[]
  initialBatter?: string | null
  initialB?: number | null
  initialS?: number | null
  initialO?: number | null
  initialBase1?: boolean | null
  initialBase2?: boolean | null
  initialBase3?: boolean | null
  isDefending?: boolean
  initialHomeScore?: number | null
  initialOpponentScore?: number | null
  initialInning?: string | null
  initialBatFirst?: boolean | null
  initialLineScoreData?: LineScoreData | null
  initialShowLineupIntro?: boolean | null
  initialShowLineScore?: boolean | null
  initialShow3dField?: boolean | null
  homeTeamName?: string
  opponentTeamName?: string
}>(), {
  batterOptions: () => [],
  initialBatter: '',
  initialB: 0,
  initialS: 0,
  initialO: 0,
  initialBase1: false,
  initialBase2: false,
  initialBase3: false,
  isDefending: false,
  initialHomeScore: 0,
  initialOpponentScore: 0,
  initialInning: '一上',
  initialBatFirst: true,
  initialLineScoreData: null,
  initialShowLineupIntro: false,
  initialShowLineScore: false,
  initialShow3dField: false,
  homeTeamName: '中港熊戰',
  opponentTeamName: '對手',
})

const emit = defineEmits<{
  (e: 'update', value: Partial<LiveStateUpdate>): void
  (e: 'record-action', value: { batter: string; action: string }): void
}>()

const batterSelectRef = ref<{ focus: () => void } | null>(null)
const fielderSelectRef = ref<{ focus: () => void } | null>(null)

const detectTouchSelectMode = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return ['(hover: none)', '(pointer: coarse)'].some((query) => {
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  })
}

const isTouchSelectMode = ref(detectTouchSelectMode())
const isAdvancedOpen = ref(false)

const currentBatter = ref(props.initialBatter || '')
const currentInning = ref(props.initialInning || '一上')
const currentB = ref(props.initialB || 0)
const currentS = ref(props.initialS || 0)
const currentO = ref(props.initialO || 0)
const currentBase1 = ref(Boolean(props.initialBase1))
const currentBase2 = ref(Boolean(props.initialBase2))
const currentBase3 = ref(Boolean(props.initialBase3))
const homeScore = ref(props.initialHomeScore || 0)
const opponentScore = ref(props.initialOpponentScore || 0)
const currentBatFirst = ref(props.initialBatFirst !== false)
const showLineupIntro = ref(Boolean(props.initialShowLineupIntro))
const showLineScore = ref(Boolean(props.initialShowLineScore))
const show3dField = ref(Boolean(props.initialShow3dField))
const lineScoreData = ref(cloneLineScoreData(props.initialLineScoreData || createDefaultLineScoreData()))

const currentRunner = ref('')
const currentScorer = ref('')
const currentFielder = ref('')
const lastRecordedBatter = ref('')

const displayAwayTeamKey = computed(() => getDisplayTeamKey('away', currentBatFirst.value))
const displayHomeTeamKey = computed(() => getDisplayTeamKey('home', currentBatFirst.value))
const displayAwayHKey = computed(() => getDisplayStatKey('away', 'h', currentBatFirst.value))
const displayAwayEKey = computed(() => getDisplayStatKey('away', 'e', currentBatFirst.value))
const displayHomeHKey = computed(() => getDisplayStatKey('home', 'h', currentBatFirst.value))
const displayHomeEKey = computed(() => getDisplayStatKey('home', 'e', currentBatFirst.value))
const normalizedHomeTeamName = computed(() => String(props.homeTeamName || '').trim() || '中港熊戰')
const normalizedOpponentTeamName = computed(() => String(props.opponentTeamName || '').trim() || '對手')
const statusLabel = computed(() => props.isDefending ? '防守半局' : '進攻半局')

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizePlayerOption = (option: LivePlayerOption | null | undefined) => {
  const name = String(option?.name ?? '').trim()
  const rawLabel = String(option?.label ?? name).trim()
  const number = String(option?.number ?? '').trim()
  if (!name && !rawLabel) return null

  const hasInlineNumber = number && (rawLabel.includes(`#${number}`) || rawLabel.includes(`背號${number}`))
  let label = rawLabel || name
  if (number && !hasInlineNumber) {
    label = /^\d+棒\s+/.test(label)
      ? label.replace(/^(\d+棒)\s+/, `$1 #${number} `)
      : `#${number} ${label}`.trim()
  }

  return {
    name: name || label,
    label: label || name,
    number,
  }
}

const isOptionGroup = (value: LivePlayerOptionGroup | LivePlayerOption): value is LivePlayerOptionGroup =>
  Array.isArray((value as LivePlayerOptionGroup).options)

const normalizedBatterGroups = computed(() => {
  const sourceOptions = Array.isArray(props.batterOptions) ? props.batterOptions : []
  if (sourceOptions.length === 0) return []

  if (sourceOptions.some(isOptionGroup)) {
    return (sourceOptions as LivePlayerOptionGroup[])
      .map((group) => ({
        label: String(group?.label || '球員名單').trim() || '球員名單',
        options: (Array.isArray(group?.options) ? group.options : [])
          .map(normalizePlayerOption)
          .filter((option): option is NonNullable<ReturnType<typeof normalizePlayerOption>> => Boolean(option)),
      }))
      .filter((group) => group.options.length > 0)
  }

  const flatOptions = (sourceOptions as LivePlayerOption[])
    .map(normalizePlayerOption)
    .filter((option): option is NonNullable<ReturnType<typeof normalizePlayerOption>> => Boolean(option))

  return flatOptions.length > 0
    ? [{ label: '球員名單', options: flatOptions }]
    : []
})

const scoringPlayerOptions = computed(() => normalizedBatterGroups.value.flatMap((group) => group.options))
const battingLineupOptions = computed(() => {
  const groupedLineup = normalizedBatterGroups.value.find((group) => group.label === '打擊線與守備員')
  return groupedLineup?.options?.length ? groupedLineup.options : scoringPlayerOptions.value
})

const getScoreByTeamKey = (teamKey: TeamKey) => (teamKey === 'home' ? homeScore.value : opponentScore.value)
const displayAwayScore = computed(() => getScoreByTeamKey(displayAwayTeamKey.value))
const displayHomeScore = computed(() => getScoreByTeamKey(displayHomeTeamKey.value))
const displayAwayTeamName = computed(() =>
  getDisplayTeamKey('away', currentBatFirst.value) === 'home'
    ? normalizedHomeTeamName.value
    : normalizedOpponentTeamName.value
)
const displayHomeTeamName = computed(() =>
  getDisplayTeamKey('home', currentBatFirst.value) === 'home'
    ? normalizedHomeTeamName.value
    : normalizedOpponentTeamName.value
)

watch(() => props.initialBatter, (val) => currentBatter.value = val || '')
watch(() => props.initialB, (val) => currentB.value = normalizeNumber(val))
watch(() => props.initialS, (val) => currentS.value = normalizeNumber(val))
watch(() => props.initialO, (val) => currentO.value = normalizeNumber(val))
watch(() => props.initialBase1, (val) => currentBase1.value = Boolean(val))
watch(() => props.initialBase2, (val) => currentBase2.value = Boolean(val))
watch(() => props.initialBase3, (val) => currentBase3.value = Boolean(val))
watch(() => props.initialHomeScore, (val) => homeScore.value = normalizeNumber(val))
watch(() => props.initialOpponentScore, (val) => opponentScore.value = normalizeNumber(val))
watch(() => props.initialInning, (val) => currentInning.value = val || '一上')
watch(() => props.initialBatFirst, (val) => currentBatFirst.value = val !== false)
watch(() => props.initialShowLineupIntro, (val) => showLineupIntro.value = Boolean(val))
watch(() => props.initialShowLineScore, (val) => showLineScore.value = Boolean(val))
watch(() => props.initialShow3dField, (val) => show3dField.value = Boolean(val))
watch(() => props.initialLineScoreData, (val) => {
  lineScoreData.value = cloneLineScoreData(val)
}, { deep: true })

const buildStatePayload = (extraPayload: Partial<LiveStateUpdate> = {}): Partial<LiveStateUpdate> => ({
  current_batter_name: currentBatter.value,
  current_inning: currentInning.value,
  current_b: currentB.value,
  current_s: currentS.value,
  current_o: currentO.value,
  base_1: currentBase1.value,
  base_2: currentBase2.value,
  base_3: currentBase3.value,
  bat_first: currentBatFirst.value,
  home_score: homeScore.value,
  opponent_score: opponentScore.value,
  show_lineup_intro: showLineupIntro.value,
  show_line_score: showLineScore.value,
  show_3d_field: show3dField.value,
  line_score_data: cloneLineScoreData(lineScoreData.value),
  ...extraPayload,
})

const syncState = (extraPayload: Partial<LiveStateUpdate> = {}) => {
  emit('update', buildStatePayload(extraPayload))
}

const applyScoreState = (nextState: { homeScore: number; opponentScore: number; lineScoreData: LineScoreData }) => {
  homeScore.value = nextState.homeScore
  opponentScore.value = nextState.opponentScore
  lineScoreData.value = nextState.lineScoreData
}

const adjustScoreForTeam = (teamKey: TeamKey, delta: number, inning = currentInning.value) => {
  applyScoreState(applyScoreDelta({
    homeScore: homeScore.value,
    opponentScore: opponentScore.value,
    lineScoreData: lineScoreData.value,
  }, {
    teamKey,
    delta,
    inning,
  }))
}

const updateScore = (side: DisplaySide, delta: number) => {
  adjustScoreForTeam(getDisplayTeamKey(side, currentBatFirst.value), delta)
  syncState()
}

const adjustCurrentHalfScore = (delta: number) => {
  adjustScoreForTeam(getOffenseTeamKey(currentInning.value, currentBatFirst.value), delta)
}

const adjustLineStatForTeam = (teamKey: TeamKey, stat: LineStatKey, delta: number) => {
  lineScoreData.value = applyLineStatDelta(lineScoreData.value, {
    teamKey,
    stat,
    delta,
  })
}

const adjustCurrentHalfOffenseStat = (stat: LineStatKey, delta: number) => {
  adjustLineStatForTeam(getOffenseTeamKey(currentInning.value, currentBatFirst.value), stat, delta)
}

const adjustCurrentHalfDefenseStat = (stat: LineStatKey, delta: number) => {
  adjustLineStatForTeam(getDefenseTeamKey(currentInning.value, currentBatFirst.value), stat, delta)
}

const getOccupiedBaseCount = () => (
  Number(currentBase1.value) +
  Number(currentBase2.value) +
  Number(currentBase3.value)
)

const finalizeCurrentHalfLineScore = () => {
  lineScoreData.value = finalizeInningScore(lineScoreData.value, currentInning.value, currentBatFirst.value)
}

const advanceHalfInning = () => {
  finalizeCurrentHalfLineScore()
  currentB.value = 0
  currentS.value = 0
  currentO.value = 0
  currentBatter.value = ''
  currentFielder.value = ''
  lastRecordedBatter.value = ''
  currentBase1.value = false
  currentBase2.value = false
  currentBase3.value = false
  currentInning.value = getNextInning(currentInning.value)
}

const advanceNextBatter = () => {
  const battingLineup = [...battingLineupOptions.value]

  if (battingLineup.length > 0 && currentBatter.value) {
    const idx = battingLineup.findIndex((opt) => opt.name === currentBatter.value || opt.label === currentBatter.value)
    if (idx !== -1) {
      let nextIdx = (idx + 1) % battingLineup.length
      let attempts = 0

      while (attempts < battingLineup.length) {
        const nextOpt = battingLineup[nextIdx]
        if (nextOpt && /棒/.test(nextOpt.label)) {
          break
        }
        nextIdx = (nextIdx + 1) % battingLineup.length
        attempts += 1
      }

      if (attempts >= battingLineup.length) {
        nextIdx = 0
      }

      currentBatter.value = battingLineup[nextIdx]?.name || ''
      return
    }
  }

  currentBatter.value = ''
}

const updateBatter = () => {
  lastRecordedBatter.value = ''

  if (currentBatter.value) {
    currentB.value = 0
    currentS.value = 0
  }
  syncState()
}

const checkBatterSelected = () => {
  if (!currentBatter.value) {
    ElMessage.warning('請先選擇打者 / 投手')
    batterSelectRef.value?.focus()
    return false
  }
  return true
}

const checkFielderSelected = () => {
  if (!currentFielder.value) {
    ElMessage.warning('請先選擇守備失誤球員')
    fielderSelectRef.value?.focus()
    return false
  }
  return true
}

const decrementB = () => {
  if (currentB.value > 0) {
    currentB.value -= 1
    emit('record-action', { batter: currentBatter.value || '', action: '更正：收回上一顆壞球' })
    syncState()
  }
}

const decrementS = () => {
  if (currentS.value > 0) {
    currentS.value -= 1
    emit('record-action', { batter: currentBatter.value || '', action: '更正：收回上一顆好球' })
    syncState()
  }
}

const decrementO = () => {
  if (currentO.value > 0) {
    currentO.value -= 1
    emit('record-action', { batter: currentBatter.value || '', action: '更正：收回一個出局數' })
    syncState()
  }
}

const incrementB = () => {
  if (!checkBatterSelected()) return
  currentB.value += 1
  if (currentB.value >= 4) {
    handleQuickAction(props.isDefending ? '投出四壞' : '四壞')
    return
  }

  emit('record-action', { batter: currentBatter.value || '', action: props.isDefending ? '投出壞球' : '選到壞球' })
  syncState()
}

const incrementS = () => {
  if (!checkBatterSelected()) return
  currentS.value += 1
  if (currentS.value >= 3) {
    handleQuickAction(props.isDefending ? '空振對手' : '空振')
    return
  }

  emit('record-action', { batter: currentBatter.value || '', action: props.isDefending ? '投出好球' : '好球' })
  syncState()
}

const incrementO = () => {
  if (!checkBatterSelected()) return
  currentO.value += 1
  if (currentO.value >= 3) {
    emit('record-action', { batter: currentBatter.value || '', action: '三人出局，換替半局' })
    advanceHalfInning()
  } else {
    emit('record-action', { batter: currentBatter.value || '', action: '出局' })
    if (!props.isDefending) advanceNextBatter()
  }
  syncState()
}

const resetBS = () => {
  currentB.value = 0
  currentS.value = 0
  syncState()
}

const resetHalf = () => {
  advanceHalfInning()
  syncState()
}

const toggleBase = (baseNum: 1 | 2 | 3) => {
  if (baseNum === 1) currentBase1.value = !currentBase1.value
  if (baseNum === 2) currentBase2.value = !currentBase2.value
  if (baseNum === 3) currentBase3.value = !currentBase3.value
  syncState()
}

const handleScore = () => {
  if (!currentScorer.value) {
    ElMessage.warning('請先選擇得分球員')
    return
  }

  emit('record-action', { batter: currentScorer.value, action: '回來得分' })
  adjustCurrentHalfScore(1)
  syncState()
}

const handleRbi = () => {
  const targetBatter = lastRecordedBatter.value || currentBatter.value
  emit('record-action', { batter: targetBatter || '', action: '帶有1分打點' })
}

const handlePitcherRunAllowed = (isEarned: boolean) => {
  if (!checkBatterSelected()) return

  const actionStr = isEarned ? '投手責失' : '投手失分'
  emit('record-action', { batter: currentBatter.value || '', action: actionStr })
  adjustCurrentHalfScore(1)
  syncState()
}

const handleDefensiveError = () => {
  if (!checkFielderSelected()) return

  emit('record-action', { batter: currentFielder.value, action: '守備失誤' })
  adjustCurrentHalfDefenseStat('e', 1)
  syncState()
}

const handleSteal = (actionString: '盜壘成功' | '盜壘刺') => {
  if (!currentRunner.value) {
    ElMessage.warning('請先選擇跑壘員')
    return
  }

  emit('record-action', { batter: currentRunner.value, action: actionString })
  if (actionString === '盜壘刺') {
    incrementO()
  }
}

const handleQuickAction = (action: string) => {
  if (!checkBatterSelected()) return

  lastRecordedBatter.value = currentBatter.value
  const recordedBatter = currentBatter.value || ''
  const isHitAction = ['一安', '二安', '三安', '全壘打', '內安', '被一安', '被二安', '被三安', '被全壘打', '被內安'].includes(action)
  let isInningEnded = false

  if (isHitAction) {
    adjustCurrentHalfOffenseStat('h', 1)
  }

  if (['四壞', '投出保送', '觸身', '投出觸身', '投出四壞'].includes(action)) {
    if (currentBase1.value) {
      if (currentBase2.value) {
        if (currentBase3.value) {
          adjustCurrentHalfScore(1)
        }
        currentBase3.value = true
      }
      currentBase2.value = true
    }
    currentBase1.value = true
    currentB.value = 0
    currentS.value = 0
  } else if (['一安', '被一安', '內安', '失誤上壘', '不死三振'].includes(action)) {
    currentBase1.value = true
    currentB.value = 0
    currentS.value = 0
  } else if (['二安', '被二安'].includes(action)) {
    currentBase2.value = true
    currentB.value = 0
    currentS.value = 0
  } else if (['三安', '被三安'].includes(action)) {
    currentBase3.value = true
    currentB.value = 0
    currentS.value = 0
  } else if (['全壘打', '被全壘打'].includes(action)) {
    adjustCurrentHalfScore(1 + getOccupiedBaseCount())
    currentBase1.value = false
    currentBase2.value = false
    currentBase3.value = false
    currentB.value = 0
    currentS.value = 0
  } else if (['空振', '站振', '空振對手', '滾地球刺殺', '投出滾地出局', '飛球接殺', '投出飛球出局', '出局', '雙殺打', '製造雙殺打', '犧牲觸擊', '對手犧牲觸擊'].includes(action)) {
    const addOuts = ['雙殺打', '製造雙殺打'].includes(action) ? 2 : 1
    currentO.value += addOuts
    if (currentO.value >= 3) {
      currentO.value = 0
      currentBase1.value = false
      currentBase2.value = false
      currentBase3.value = false
      isInningEnded = true
    }
    currentB.value = 0
    currentS.value = 0
  } else if (action === '擦棒界外') {
    if (currentS.value < 2) {
      currentS.value += 1
    }
  } else {
    currentB.value = 0
    currentS.value = 0
  }

  if (isInningEnded) {
    advanceHalfInning()
  }

  emit('record-action', { batter: recordedBatter, action })

  if (!props.isDefending) {
    if (isInningEnded) {
      currentBatter.value = ''
    } else {
      advanceNextBatter()
    }
  } else if (isInningEnded) {
    currentBatter.value = ''
  }

  syncState()
}

const toggleLineScore = () => {
  showLineScore.value = !showLineScore.value
  syncState()
}

const toggle3dField = () => {
  show3dField.value = !show3dField.value
  syncState()
}

const triggerIntro = (start = true) => {
  showLineupIntro.value = start
  syncState()
}

const getInningScore = (index: number, teamKey: TeamKey) => {
  return lineScoreData.value.innings?.[index]?.[teamKey] ?? ''
}

const setInningScore = (index: number, teamKey: TeamKey, event: Event) => {
  const target = event.target as HTMLInputElement | null
  if (!target || !lineScoreData.value.innings?.[index]) return

  lineScoreData.value.innings[index][teamKey] = target.value
  syncState()
}

const getLineStat = (key: string) => {
  return lineScoreData.value[key] ?? 0
}

const setLineStat = (key: string, event: Event) => {
  const target = event.target as HTMLInputElement | null
  if (!target) return

  lineScoreData.value[key] = normalizeNumber(target.value)
  syncState()
}

const selectInputText = (event: FocusEvent) => {
  const target = event.target as HTMLInputElement | null
  target?.select()
}
</script>

<template>
  <div class="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-sm select-none">
    <div class="flex flex-col gap-3 border-b border-slate-700 pb-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-2">
        <el-icon class="text-blue-300 text-xl"><VideoCamera /></el-icon>
        <div>
          <h3 class="m-0 text-lg font-black tracking-wide text-slate-100">實況導播控台</h3>
          <div class="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
            <span>{{ currentInning }}</span>
            <span>{{ statusLabel }}</span>
            <span>儲存後同步</span>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <el-radio-group
          v-model="currentBatFirst"
          size="small"
          class="live-bat-first-toggle"
          @change="syncState()"
        >
          <el-radio-button :value="false"><span class="font-bold">先守</span></el-radio-button>
          <el-radio-button :value="true"><span class="font-bold">先攻</span></el-radio-button>
        </el-radio-group>
        <el-tag effect="dark" :type="isDefending ? 'warning' : 'success'" class="!border-slate-600 font-bold">
          {{ statusLabel }}
        </el-tag>
      </div>
    </div>

    <div class="relative z-10 mt-4 flex flex-col flex-wrap items-stretch gap-4 md:flex-row">
      <div
        class="flex min-w-[160px] flex-1 flex-col gap-2 rounded-lg border p-2.5 transition-colors"
        :class="isDefending ? 'border-blue-500/50 bg-blue-950/30' : 'border-slate-700 bg-slate-800/80'"
      >
        <span v-if="!isDefending" class="flex items-center gap-1 text-[11px] font-black tracking-widest text-slate-400">
          <el-icon><UserFilled /></el-icon> 目前打者
        </span>
        <span v-else class="flex items-center gap-1 text-[11px] font-black tracking-widest text-blue-300">
          <el-icon><Avatar /></el-icon> 目前投手
        </span>
        <el-select
          ref="batterSelectRef"
          v-model="currentBatter"
          :placeholder="isDefending ? '選擇投手' : '選擇打者'"
          :filterable="!isTouchSelectMode"
          clearable
          class="w-full live-dark-select"
          @change="updateBatter"
        >
          <el-option label="-- 清空 --" value="" />
          <el-option-group v-for="group in normalizedBatterGroups" :key="group.label" :label="group.label">
            <el-option v-for="opt in group.options" :key="opt.name" :label="opt.label" :value="opt.name" />
          </el-option-group>
        </el-select>
      </div>

      <div class="flex shrink-0 flex-col justify-center border-slate-700/70 pr-0 md:border-r md:pr-4">
        <span class="mb-1 text-center text-[10px] font-black tracking-widest text-slate-400">局數</span>
        <el-select
          v-model="currentInning"
          size="small"
          class="w-[92px] live-dark-select"
          placeholder="局數"
          @change="syncState()"
        >
          <el-option v-for="inn in ['一上','一下','二上','二下','三上','三下','四上','四下','五上','五下','六上','六下','七上','七下','八上','八下','九上','九下','延長']" :key="inn" :label="inn" :value="inn" />
        </el-select>
      </div>

      <div class="flex shrink-0 flex-col justify-center border-slate-700/70 pr-0 md:border-r md:pr-4">
        <div class="flex gap-2">
          <div class="flex flex-col items-center gap-1">
            <span class="max-w-[92px] truncate text-center text-[10px] font-black tracking-wide text-slate-400" :title="displayAwayTeamName">
              {{ displayAwayTeamName }}
            </span>
            <div class="flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 p-0.5 shadow-inner">
              <button type="button" class="live-score-button" @click="updateScore('away', -1)">-</button>
              <span class="w-8 text-center font-mono text-xl font-black text-primary">{{ displayAwayScore }}</span>
              <button type="button" class="live-score-button" @click="updateScore('away', 1)">+</button>
            </div>
          </div>
          <div class="flex items-end pb-1 text-xs font-black text-slate-600">VS</div>
          <div class="flex flex-col items-center gap-1">
            <span class="max-w-[92px] truncate text-center text-[10px] font-black tracking-wide text-slate-400" :title="displayHomeTeamName">
              {{ displayHomeTeamName }}
            </span>
            <div class="flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 p-0.5 shadow-inner">
              <button type="button" class="live-score-button" @click="updateScore('home', -1)">-</button>
              <span class="w-8 text-center font-mono text-xl font-black text-slate-100">{{ displayHomeScore }}</span>
              <button type="button" class="live-score-button" @click="updateScore('home', 1)">+</button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid min-w-[190px] flex-1 grid-cols-3 gap-2">
        <button type="button" class="live-count-button group" title="點擊增加壞球" @click="incrementB" @contextmenu.prevent="decrementB">
          <span class="mb-1 text-lg font-black text-green-400 transition-transform group-hover:scale-110">B</span>
          <span class="flex gap-1.5">
            <span v-for="i in 3" :key="`b-${i}`" class="h-[18px] w-[18px] rounded-full shadow-inner transition-colors" :class="i <= currentB ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.45)]' : 'border border-slate-700 bg-slate-950'" />
          </span>
          <span class="live-count-minus" @click.stop="decrementB">-</span>
        </button>
        <button type="button" class="live-count-button group" title="點擊增加好球" @click="incrementS" @contextmenu.prevent="decrementS">
          <span class="mb-1 text-lg font-black text-orange-400 transition-transform group-hover:scale-110">S</span>
          <span class="flex gap-1.5">
            <span v-for="i in 2" :key="`s-${i}`" class="h-[18px] w-[18px] rounded-full shadow-inner transition-colors" :class="i <= currentS ? 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.45)]' : 'border border-slate-700 bg-slate-950'" />
          </span>
          <span class="live-count-minus" @click.stop="decrementS">-</span>
        </button>
        <button type="button" class="live-count-button group" title="點擊增加出局數" @click="incrementO" @contextmenu.prevent="decrementO">
          <span class="mb-1 text-lg font-black text-red-400 transition-transform group-hover:scale-110">O</span>
          <span class="flex gap-1.5">
            <span v-for="i in 2" :key="`o-${i}`" class="h-[18px] w-[18px] rounded-full shadow-inner transition-colors" :class="i <= currentO ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.45)]' : 'border border-slate-700 bg-slate-950'" />
          </span>
          <span class="live-count-minus" @click.stop="decrementO">-</span>
        </button>
      </div>

      <div class="relative mx-2 flex h-[64px] w-[64px] shrink-0 items-center justify-center self-center">
        <div class="absolute h-9 w-9 rotate-45 border border-slate-500"></div>
        <button type="button" title="二壘" class="live-base top-[2px]" :class="currentBase2 ? 'live-base-on' : 'live-base-off'" @click="toggleBase(2)" />
        <button type="button" title="三壘" class="live-base left-[4px]" :class="currentBase3 ? 'live-base-on' : 'live-base-off'" @click="toggleBase(3)" />
        <button type="button" title="一壘" class="live-base right-[4px]" :class="currentBase1 ? 'live-base-on' : 'live-base-off'" @click="toggleBase(1)" />
        <div class="absolute bottom-[4px] z-10 h-[14px] w-[14px] rounded-full border border-slate-500 bg-slate-300 shadow-sm"></div>
      </div>

      <div class="flex min-w-[82px] shrink-0 flex-col justify-center gap-2">
        <el-button size="small" type="info" plain class="!m-0 w-full !rounded-md border-slate-600 bg-slate-800/50 !text-slate-300" @click="resetBS">清空 B/S</el-button>
        <el-button size="small" type="danger" plain class="!m-0 w-full !rounded-md border-red-900 bg-red-950/30 !text-red-300" @click="resetHalf">換半局</el-button>
      </div>

      <div class="flex w-[160px] shrink-0 flex-col justify-center gap-2 border-slate-700/70 pl-0 md:border-l md:pl-3">
        <div class="flex gap-1">
          <el-button size="small" color="#8b5cf6" class="!m-0 h-8 flex-1 !rounded-md !px-1 text-[11px] font-bold !text-white" @click="triggerIntro(true)">
            播開場
          </el-button>
          <el-button size="small" type="info" plain class="!m-0 h-8 !w-8 !rounded-md !p-0 border-slate-600 bg-slate-800/50 !text-slate-300" @click="triggerIntro(false)">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
        <el-button size="small" :type="isAdvancedOpen ? 'warning' : 'info'" :plain="!isAdvancedOpen" class="!m-0 h-8 w-full !rounded-md text-[11px] font-bold" @click="isAdvancedOpen = !isAdvancedOpen">
          進階控制
        </el-button>
      </div>
    </div>

    <div v-if="!isDefending" class="relative z-10 mt-4 flex flex-wrap items-center gap-2 border-t border-slate-700/70 pt-3">
      <span class="mr-1 flex items-center gap-1 text-[11px] font-black tracking-widest text-slate-400">
        <el-icon><EditPen /></el-icon> 快速紀錄
      </span>
      <el-button size="small" type="success" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('一安')">1B 一安</el-button>
      <el-button size="small" type="success" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('二安')">2B 二安</el-button>
      <el-button size="small" type="success" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('三安')">3B 三安</el-button>
      <el-button size="small" color="#f59e0b" plain class="!m-0 !rounded text-[11px] font-bold !text-yellow-500" @click="handleQuickAction('全壘打')">HR 全壘打</el-button>
      <el-button size="small" type="primary" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('四壞')">BB 保送</el-button>
      <el-button size="small" type="warning" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('觸身')">HBP 觸身</el-button>
      <el-button size="small" type="info" plain class="!m-0 !rounded border-slate-600 bg-slate-800/80 text-[11px] font-bold !text-slate-300" @click="handleQuickAction('擦棒界外')">擦棒界外</el-button>
      <el-button size="small" type="danger" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('空振')">K 三振</el-button>
      <el-button size="small" type="info" plain class="!m-0 !rounded border-slate-600 bg-slate-800/80 text-[11px] font-bold !text-slate-300" @click="handleQuickAction('滾地球刺殺')">GO 滾地出局</el-button>
      <el-button size="small" type="info" plain class="!m-0 !rounded border-slate-600 bg-slate-800/80 text-[11px] font-bold !text-slate-300" @click="handleQuickAction('飛球接殺')">FO 飛球出局</el-button>
      <el-button size="small" type="warning" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('犧牲觸擊')">SAC 觸擊</el-button>
      <el-button size="small" type="danger" plain class="!m-0 !rounded bg-red-950/20 text-[11px] font-bold" @click="handleQuickAction('失誤上壘')">E 失誤上壘</el-button>
    </div>

    <div v-else class="relative z-10 mt-4 flex flex-wrap items-center gap-2 border-t border-blue-700/60 pt-3">
      <div class="flex items-center gap-2 rounded-md border border-blue-700/50 bg-slate-950/40 px-2 py-1">
        <span class="text-[10px] font-black tracking-widest text-blue-200">失誤球員</span>
        <el-select
          ref="fielderSelectRef"
          v-model="currentFielder"
          placeholder="選擇守備員"
          size="small"
          :filterable="!isTouchSelectMode"
          clearable
          class="w-[150px] live-dark-select"
        >
          <el-option-group v-for="group in normalizedBatterGroups" :key="`fielder-${group.label}`" :label="group.label">
            <el-option v-for="opt in group.options" :key="`fielder-${opt.name}`" :label="opt.label" :value="opt.name" />
          </el-option-group>
        </el-select>
      </div>
      <span class="mr-1 flex items-center gap-1 text-[11px] font-black tracking-widest text-blue-300">
        <el-icon><EditPen /></el-icon> 投球紀錄
      </span>
      <el-button size="small" type="danger" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('空振對手')">K 奪三振</el-button>
      <el-button size="small" type="info" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('擦棒界外')">擦棒界外</el-button>
      <el-button size="small" type="info" plain class="!m-0 !rounded border-blue-600 bg-blue-800/80 text-[11px] font-bold !text-blue-300" @click="handleQuickAction('投出滾地出局')">滾地出局</el-button>
      <el-button size="small" type="info" plain class="!m-0 !rounded border-blue-600 bg-blue-800/80 text-[11px] font-bold !text-blue-300" @click="handleQuickAction('投出飛球出局')">飛球出局</el-button>
      <el-button size="small" type="info" plain class="!m-0 !rounded border-blue-600 bg-blue-800/80 text-[11px] font-bold !text-blue-300" @click="handleQuickAction('製造雙殺打')">雙殺打</el-button>
      <el-button size="small" type="primary" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('投出四壞')">投出保送</el-button>
      <el-button size="small" type="primary" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('投出觸身')">投出觸身</el-button>
      <el-button size="small" type="success" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('被一安')">被一安</el-button>
      <el-button size="small" type="success" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('被二安')">被二安</el-button>
      <el-button size="small" type="success" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleQuickAction('被三安')">被三安</el-button>
      <el-button size="small" color="#f59e0b" plain class="!m-0 !rounded text-[11px] font-bold !text-yellow-500" @click="handleQuickAction('被全壘打')">被全壘打</el-button>
      <el-button size="small" type="warning" plain class="!m-0 !rounded border-orange-600 bg-orange-900/30 text-[11px] font-bold !text-orange-400" @click="handleQuickAction('對手犧牲觸擊')">犧牲觸擊</el-button>
      <el-button size="small" type="danger" plain class="!m-0 !rounded border-red-600 bg-red-900/30 text-[11px] font-bold" @click="handleQuickAction('對手失誤上壘')">失誤上壘</el-button>
      <el-button size="small" type="danger" plain class="!m-0 !rounded border-rose-500 bg-rose-900/30 text-[11px] font-bold !text-rose-300" @click="handleDefensiveError">守備失誤</el-button>
      <span class="mx-1 h-4 w-px bg-slate-600"></span>
      <el-button size="small" color="#f97316" plain class="!m-0 !rounded text-[11px] font-bold" @click="handlePitcherRunAllowed(false)">掉分</el-button>
      <el-button size="small" type="danger" class="!m-0 !rounded text-[11px] font-bold shadow-md" @click="handlePitcherRunAllowed(true)">責失分</el-button>
    </div>

    <div v-if="!isDefending" class="relative z-10 mt-4 flex flex-wrap items-center gap-3 border-t border-blue-700/50 pt-3">
      <div class="flex items-center gap-2 border-slate-700 pr-0 sm:border-r sm:pr-3">
        <span class="flex items-center gap-1 text-[11px] font-black tracking-widest text-pink-300">
          <el-icon><Trophy /></el-icon> 得分
        </span>
        <el-select v-model="currentScorer" placeholder="選擇球員" size="small" :filterable="!isTouchSelectMode" class="w-[120px] live-dark-select">
          <el-option-group v-for="group in normalizedBatterGroups" :key="`scorer-${group.label}`" :label="group.label">
            <el-option v-for="opt in group.options" :key="`scorer-${opt.name}`" :label="opt.label" :value="opt.name" />
          </el-option-group>
        </el-select>
        <el-button size="small" color="#ec4899" class="!m-0 !rounded text-[11px] font-bold shadow-md" @click="handleScore">回來得分</el-button>
      </div>
      <div class="flex items-center gap-1 border-slate-700 pr-0 sm:border-r sm:pr-3">
        <span class="mr-1 text-[11px] font-black tracking-widest text-blue-300">打點</span>
        <el-button size="small" type="warning" class="!m-0 !rounded text-[11px] font-bold shadow-md" @click="handleRbi">RBI +1</el-button>
      </div>
      <div class="flex items-center gap-2">
        <span class="flex items-center gap-1 text-[11px] font-black tracking-widest text-teal-300">
          <el-icon><Position /></el-icon> 跑壘
        </span>
        <el-select v-model="currentRunner" placeholder="選擇跑壘員" size="small" :filterable="!isTouchSelectMode" class="w-[130px] live-dark-select">
          <el-option-group v-for="group in normalizedBatterGroups" :key="`runner-${group.label}`" :label="group.label">
            <el-option v-for="opt in group.options" :key="`runner-${opt.name}`" :label="opt.label" :value="opt.name" />
          </el-option-group>
        </el-select>
        <el-button size="small" color="#0d9488" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleSteal('盜壘成功')">盜壘成功</el-button>
        <el-button size="small" type="danger" plain class="!m-0 !rounded text-[11px] font-bold" @click="handleSteal('盜壘刺')">盜壘刺局</el-button>
      </div>
    </div>

    <div v-if="isAdvancedOpen" class="relative z-10 mt-3 grid grid-cols-1 gap-4 border-t border-slate-700/70 pt-3 md:grid-cols-[220px_minmax(0,1fr)]">
      <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
        <span class="flex items-center gap-1 text-xs font-black tracking-wider text-blue-300">
          <el-icon><DataAnalysis /></el-icon> 疊加顯示
        </span>
        <el-button size="small" :type="show3dField ? 'primary' : 'info'" :plain="!show3dField" class="!m-0 w-full !rounded-md text-xs font-bold" @click="toggle3dField">
          3D 跑者透視圖
        </el-button>
        <el-button size="small" :type="showLineScore ? 'warning' : 'info'" :plain="!showLineScore" class="!m-0 w-full !rounded-md text-xs font-bold" @click="toggleLineScore">
          9局完整計分板
        </el-button>
      </div>

      <div class="overflow-x-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <table class="min-w-[560px] w-full rounded border border-slate-700 bg-slate-950 text-center font-mono text-[11px]">
          <thead>
            <tr class="border-b border-slate-700 bg-blue-950/50 text-blue-200">
              <th class="w-[90px] px-2 py-1 text-left font-sans font-bold">隊伍</th>
              <th v-for="i in 9" :key="`th-${i}`" class="w-[35px] border-l border-slate-700/60 px-1 py-1">{{ i }}</th>
              <th class="border-l border-slate-600 bg-slate-800/50 px-1 py-1 text-primary">R</th>
              <th class="bg-slate-800/50 px-1 py-1 text-slate-300">H</th>
              <th class="bg-slate-800/50 px-1 py-1 text-slate-300">E</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-slate-700/60 hover:bg-slate-800/50">
              <td class="max-w-[90px] truncate px-2 py-1.5 text-left font-sans font-bold text-slate-300" :title="displayAwayTeamName">{{ displayAwayTeamName }}</td>
              <td v-for="i in 9" :key="`away-${i}`" class="border-l border-slate-700/60 px-0.5">
                <input :value="getInningScore(i - 1, displayAwayTeamKey)" class="live-line-input" @input="setInningScore(i - 1, displayAwayTeamKey, $event)" @focus="selectInputText" />
              </td>
              <td class="border-l border-slate-600 bg-slate-800/30 font-black text-primary">{{ displayAwayScore }}</td>
              <td class="bg-slate-800/30 px-0.5">
                <input :value="getLineStat(displayAwayHKey)" class="live-line-input font-bold text-white" @input="setLineStat(displayAwayHKey, $event)" @focus="selectInputText" />
              </td>
              <td class="bg-slate-800/30 px-0.5">
                <input :value="getLineStat(displayAwayEKey)" class="live-line-input font-bold text-white" @input="setLineStat(displayAwayEKey, $event)" @focus="selectInputText" />
              </td>
            </tr>
            <tr class="hover:bg-slate-800/50">
              <td class="max-w-[90px] truncate px-2 py-1.5 text-left font-sans font-bold text-slate-300" :title="displayHomeTeamName">{{ displayHomeTeamName }}</td>
              <td v-for="i in 9" :key="`home-${i}`" class="border-l border-slate-700/60 px-0.5">
                <input :value="getInningScore(i - 1, displayHomeTeamKey)" class="live-line-input" @input="setInningScore(i - 1, displayHomeTeamKey, $event)" @focus="selectInputText" />
              </td>
              <td class="border-l border-slate-600 bg-slate-800/30 font-black text-primary">{{ displayHomeScore }}</td>
              <td class="bg-slate-800/30 px-0.5">
                <input :value="getLineStat(displayHomeHKey)" class="live-line-input font-bold text-white" @input="setLineStat(displayHomeHKey, $event)" @focus="selectInputText" />
              </td>
              <td class="bg-slate-800/30 px-0.5">
                <input :value="getLineStat(displayHomeEKey)" class="live-line-input font-bold text-white" @input="setLineStat(displayHomeEKey, $event)" @focus="selectInputText" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-score-button {
  display: flex;
  width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  background: rgb(51 65 85 / 0.55);
  color: rgb(203 213 225);
  font-weight: 700;
  transition: background-color 0.15s ease, transform 0.15s ease;
}

.live-score-button:hover {
  background: rgb(71 85 105);
}

.live-score-button:active {
  transform: scale(0.95);
}

.live-count-button {
  position: relative;
  display: flex;
  min-height: 78px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(51 65 85);
  border-radius: 0.5rem;
  background: rgb(30 41 59 / 0.9);
  padding: 0.5rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.16);
  transition: background-color 0.15s ease, transform 0.15s ease;
}

.live-count-button:hover {
  background: rgb(51 65 85);
}

.live-count-button:active {
  transform: scale(0.97);
}

.live-count-minus {
  position: absolute;
  right: 0.25rem;
  top: 0.25rem;
  display: flex;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(71 85 105 / 0.55);
  border-radius: 0.25rem;
  background: rgb(51 65 85 / 0.75);
  color: rgb(148 163 184);
  font-size: 0.75rem;
  font-weight: 700;
}

.live-base {
  position: absolute;
  z-index: 10;
  width: 14px;
  height: 14px;
  cursor: pointer;
  border-radius: 2px;
  transform: rotate(45deg);
  box-shadow: 0 4px 8px rgb(0 0 0 / 0.18);
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.live-base:hover {
  transform: rotate(45deg) scale(1.2);
}

.live-base-on {
  border: 1px solid rgb(254 240 138);
  background: rgb(250 204 21);
  box-shadow: 0 0 8px rgb(250 204 21 / 0.62);
}

.live-base-off {
  border: 1px solid rgb(100 116 139);
  background: rgb(51 65 85);
}

.live-line-input {
  width: 100%;
  height: 1.35rem;
  border-radius: 0.25rem;
  background: transparent;
  text-align: center;
  outline: none;
}

.live-line-input:focus {
  background: rgb(51 65 85);
}

:deep(.live-dark-select .el-input__wrapper) {
  background-color: #0f172a !important;
  box-shadow: 0 0 0 1px #334155 inset !important;
  border-radius: 6px;
}

:deep(.live-dark-select .el-input__inner) {
  color: #f8fafc;
  font-weight: 700;
}

:deep(.live-bat-first-toggle .el-radio-button__inner) {
  border-color: rgb(71 85 105 / 0.8);
  background: rgb(15 23 42 / 0.85);
  color: rgb(226 232 240);
  box-shadow: none;
}

:deep(.live-bat-first-toggle .el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: #2563eb;
  border-color: #3b82f6;
  color: white;
}
</style>
