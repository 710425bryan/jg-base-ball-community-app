import type { LineScoreData } from '@/types/match'

export const INNING_SEQUENCE = [
  '一上', '一下',
  '二上', '二下',
  '三上', '三下',
  '四上', '四下',
  '五上', '五下',
  '六上', '六下',
  '七上', '七下',
  '八上', '八下',
  '九上', '九下',
  '延長',
] as const

type TeamKey = 'home' | 'opponent'
type LineStatKey = 'h' | 'e'
type DisplaySide = 'away' | 'home'

const INNING_NUMBER_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
}

export interface ScoreState {
  homeScore: number
  opponentScore: number
  lineScoreData?: LineScoreData | null
}

export const createDefaultLineScoreData = (): LineScoreData => ({
  innings: Array.from({ length: 9 }, () => ({ home: '', opponent: '' })),
  home_h: 0,
  home_e: 0,
  opponent_h: 0,
  opponent_e: 0,
})

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const cloneLineScoreData = (value?: LineScoreData | null): LineScoreData => {
  const base = createDefaultLineScoreData()

  if (!value || typeof value !== 'object') {
    return base
  }

  const innings = Array.isArray(value.innings) ? value.innings : []
  base.innings = Array.from({ length: 9 }, (_, index) => {
    const entry = innings[index] || {}
    return {
      home: entry.home ?? '',
      opponent: entry.opponent ?? entry.away ?? '',
    }
  })

  base.home_h = normalizeNumber(value.home_h ?? value.homeH)
  base.home_e = normalizeNumber(value.home_e ?? value.homeE)
  base.opponent_h = normalizeNumber(value.opponent_h ?? value.awayH)
  base.opponent_e = normalizeNumber(value.opponent_e ?? value.awayE)

  return base
}

export const getInningNumber = (inning?: string | null) => {
  const label = String(inning || '')
  const matchedToken = label.match(/[一二三四五六七八九1-9]/)?.[0]

  if (!matchedToken) {
    return null
  }

  return INNING_NUMBER_MAP[matchedToken] ?? null
}

export const isTopHalf = (inning?: string | null) => String(inning || '').includes('上')

export const isHomeTeamBatting = (inning?: string | null, batFirst = true) => {
  if (!inning) {
    return true
  }

  return batFirst ? isTopHalf(inning) : !isTopHalf(inning)
}

export const getOffenseTeamKey = (inning?: string | null, batFirst = true): TeamKey =>
  isHomeTeamBatting(inning, batFirst) ? 'home' : 'opponent'

export const getDefenseTeamKey = (inning?: string | null, batFirst = true): TeamKey =>
  getOffenseTeamKey(inning, batFirst) === 'home' ? 'opponent' : 'home'

export const getDisplayTeamKey = (side: DisplaySide, batFirst = true): TeamKey => {
  if (side === 'away') {
    return batFirst ? 'home' : 'opponent'
  }

  return batFirst ? 'opponent' : 'home'
}

export const getDisplayStatKey = (side: DisplaySide, stat: LineStatKey, batFirst = true) =>
  `${getDisplayTeamKey(side, batFirst)}_${stat}` as const

export const applyLineStatDelta = (
  lineScoreData: LineScoreData | null | undefined,
  options: { teamKey?: string | null; stat?: string | null; delta?: number },
) => {
  const normalizedTeamKey: TeamKey = options.teamKey === 'opponent' ? 'opponent' : 'home'
  const normalizedStat: LineStatKey = options.stat === 'e' ? 'e' : 'h'
  const nextData = cloneLineScoreData(lineScoreData)
  const targetKey = `${normalizedTeamKey}_${normalizedStat}` as keyof LineScoreData

  nextData[targetKey] = Math.max(0, Number(nextData[targetKey] || 0) + (options.delta || 0))

  return nextData
}

export const applyScoreDelta = (
  state: ScoreState | null | undefined,
  options: { teamKey?: string | null; delta?: number; inning?: string | null },
) => {
  const normalizedTeamKey: TeamKey = options.teamKey === 'opponent' ? 'opponent' : 'home'
  const nextState = {
    homeScore: normalizeNumber(state?.homeScore),
    opponentScore: normalizeNumber(state?.opponentScore),
    lineScoreData: cloneLineScoreData(state?.lineScoreData),
  }

  if (normalizedTeamKey === 'home') {
    nextState.homeScore = Math.max(0, nextState.homeScore + (options.delta || 0))
  } else {
    nextState.opponentScore = Math.max(0, nextState.opponentScore + (options.delta || 0))
  }

  const inningNumber = getInningNumber(options.inning)
  if (!inningNumber || inningNumber < 1 || inningNumber > 9) {
    return nextState
  }

  const entry = nextState.lineScoreData.innings?.[inningNumber - 1]
  if (!entry) {
    return nextState
  }

  const currentValue = Number(entry[normalizedTeamKey] || 0)
  entry[normalizedTeamKey] = Math.max(0, currentValue + (options.delta || 0))

  return nextState
}

export const finalizeInningScore = (
  lineScoreData: LineScoreData | null | undefined,
  inning?: string | null,
  batFirst = true,
) => {
  const nextData = cloneLineScoreData(lineScoreData)
  const inningNumber = getInningNumber(inning)

  if (!inningNumber || inningNumber < 1 || inningNumber > 9) {
    return nextData
  }

  const teamKey = getOffenseTeamKey(inning, batFirst)
  const currentValue = nextData.innings?.[inningNumber - 1]?.[teamKey]

  if (currentValue === '' || currentValue === null || currentValue === undefined) {
    nextData.innings![inningNumber - 1][teamKey] = 0
  }

  return nextData
}

export const getNextInning = (currentInning?: string | null) => {
  const currentIndex = INNING_SEQUENCE.indexOf((currentInning || '') as typeof INNING_SEQUENCE[number])

  if (currentIndex === -1 || currentIndex >= INNING_SEQUENCE.length - 1) {
    return currentInning || '一上'
  }

  return INNING_SEQUENCE[currentIndex + 1]
}
