import type { BattingStat, LineupEntry, PitchingStat } from '@/types/match'

export const MATCH_AUDIO_TEXT_ONLY = '__text_only__'

export const MATCH_AUDIO_ACTION_TERMS = [
  '一安',
  '二安',
  '三安',
  '全壘打',
  '內安',
  '四壞',
  '觸身',
  '空振',
  '站振',
  '飛球接殺',
  '平飛接殺',
  '滾地刺殺',
  '界外接殺',
  '雙殺打',
  '失誤上壘',
  '野選',
  '盜壘成功',
  '盜壘刺',
  '回來得分',
  '帶有1分打點',
  '被一安',
  '被二安',
  '被三安',
  '被全壘打',
  '被內安',
  '投出四壞',
  '投出觸身',
  '投出滾地出局',
  '投出飛球出局',
  '投手失分',
  '投手責失',
  '三人出局',
  '好球',
  '壞球',
  '其他',
] as const

export type MatchAudioActionTerm = typeof MATCH_AUDIO_ACTION_TERMS[number]

export interface MatchAudioRosterPlayer {
  name: string
  number?: string
}

export interface MatchAudioRosterInput {
  players?: string | null
  lineups?: Array<LineupEntry[] | null | undefined>
  battingStats?: BattingStat[] | null
  pitchingStats?: PitchingStat[] | null
}

export interface MatchAudioStructuredEventInput {
  player_name?: string | null
  raw_player_name?: string | null
  action?: string | null
  detail?: string | null
  unknown_names?: Array<string | null | undefined> | null
  confidence?: number | null
}

export interface MatchAudioStructuredResultInput {
  events?: MatchAudioStructuredEventInput[] | null
  warnings?: Array<string | null | undefined> | null
  summary?: string | null
}

export interface MatchAudioNormalizedEvent {
  playerName: string
  rawPlayerName: string
  action: MatchAudioActionTerm
  detail: string
  unknownNames: string[]
  confidence: number
}

export interface MatchAudioUnresolvedPlayer {
  rawName: string
  reason: string
  suggestedPlayers: string[]
}

export interface MatchAudioTranscriptionResult {
  transcript: string
  suggestedLog: string
  events: MatchAudioNormalizedEvent[]
  unresolvedPlayers: MatchAudioUnresolvedPlayer[]
  warnings: string[]
  summary: string
}

export type MatchAudioResolutionValue = string | typeof MATCH_AUDIO_TEXT_ONLY
export type MatchAudioResolutionMap = Record<string, MatchAudioResolutionValue | undefined>

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeNameKey = (value: unknown) => normalizeText(value).replace(/\s+/g, '')

const parsePlayerNames = (players?: string | null) =>
  normalizeText(players)
    .split(',')
    .map((name) => normalizeText(name))
    .filter(Boolean)

const buildLine = (playerName: string, action: MatchAudioActionTerm, detail = '') => {
  const displayAction = action === '其他' && detail ? detail : action
  const suffix = detail && action !== '其他' && detail !== action ? `（${detail}）` : ''
  return playerName ? `${playerName} ${displayAction}${suffix}` : `${displayAction}${suffix}`
}

const findSimilarPlayers = (rawName: string, roster: MatchAudioRosterPlayer[]) => {
  const rawKey = normalizeNameKey(rawName)
  if (!rawKey) return []

  return roster
    .filter((player) => {
      const playerKey = normalizeNameKey(player.name)
      return playerKey && (
        playerKey.includes(rawKey) ||
        rawKey.includes(playerKey) ||
        player.name[0] === rawName[0]
      )
    })
    .map((player) => player.name)
    .slice(0, 5)
}

export const buildMatchAudioRoster = ({
  players,
  lineups = [],
  battingStats = [],
  pitchingStats = [],
}: MatchAudioRosterInput) => {
  const roster = new Map<string, MatchAudioRosterPlayer>()

  const addPlayer = (nameValue: unknown, numberValue?: unknown) => {
    const name = normalizeText(nameValue)
    if (!name) return

    const key = normalizeNameKey(name)
    const number = normalizeText(numberValue)
    const existing = roster.get(key)
    if (!existing) {
      roster.set(key, { name, number })
      return
    }

    if (!existing.number && number) {
      roster.set(key, { ...existing, number })
    }
  }

  parsePlayerNames(players).forEach((name) => addPlayer(name))
  lineups.forEach((lineup) => {
    lineup?.forEach((player) => addPlayer(player.name, player.number))
  })
  battingStats?.forEach((stat) => addPlayer(stat.name, stat.number))
  pitchingStats?.forEach((stat) => addPlayer(stat.name, stat.number))

  return Array.from(roster.values())
}

export const normalizeMatchAudioStructuredResult = ({
  structuredResult,
  roster,
  transcript,
}: {
  structuredResult: MatchAudioStructuredResultInput | null | undefined
  roster: MatchAudioRosterPlayer[]
  transcript?: string | null
}): MatchAudioTranscriptionResult => {
  const rosterByKey = new Map(roster.map((player) => [normalizeNameKey(player.name), player]))
  const unresolvedByKey = new Map<string, MatchAudioUnresolvedPlayer>()
  const warnings = new Set<string>()
  const events: MatchAudioNormalizedEvent[] = []

  const rememberUnresolved = (rawName: string, reason: string) => {
    const normalizedRawName = normalizeText(rawName)
    if (!normalizedRawName) return

    const key = normalizeNameKey(normalizedRawName)
    if (unresolvedByKey.has(key)) return

    unresolvedByKey.set(key, {
      rawName: normalizedRawName,
      reason,
      suggestedPlayers: findSimilarPlayers(normalizedRawName, roster),
    })
  }

  const inputEvents = Array.isArray(structuredResult?.events) ? structuredResult.events : []
  inputEvents.forEach((event) => {
    const requestedPlayerName = normalizeText(event?.player_name)
    const inputRawPlayerName = normalizeText(event?.raw_player_name)
    const matchedPlayer = rosterByKey.get(normalizeNameKey(requestedPlayerName))
    const unknownNames = Array.isArray(event?.unknown_names)
      ? event.unknown_names.map((name) => normalizeText(name)).filter(Boolean)
      : []
    const rawPlayerName = inputRawPlayerName || (!matchedPlayer ? requestedPlayerName : '') || unknownNames[0] || ''

    if (requestedPlayerName && !matchedPlayer) {
      rememberUnresolved(requestedPlayerName, 'AI 回傳的人名不在本場名單內')
    }
    if (!matchedPlayer && rawPlayerName) {
      rememberUnresolved(rawPlayerName, 'AI 無法確認此人是否為本場球員')
    }
    unknownNames.forEach((name) => rememberUnresolved(name, 'AI 標記為待確認人名'))

    const rawAction = normalizeText(event?.action)
    const action = MATCH_AUDIO_ACTION_TERMS.includes(rawAction as MatchAudioActionTerm)
      ? rawAction as MatchAudioActionTerm
      : '其他'
    const detail = normalizeText(event?.detail)
    const confidence = Number(event?.confidence)

    events.push({
      playerName: matchedPlayer?.name || '',
      rawPlayerName,
      action,
      detail,
      unknownNames,
      confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0,
    })
  })

  if (Array.isArray(structuredResult?.warnings)) {
    structuredResult.warnings
      .map((warning) => normalizeText(warning))
      .filter(Boolean)
      .forEach((warning) => warnings.add(warning))
  }

  if (!events.length && normalizeText(transcript)) {
    warnings.add('AI 未整理出可套用的逐局事件，請改用原文手動整理。')
  }

  return {
    transcript: normalizeText(transcript),
    suggestedLog: buildMatchAudioLogText(events, {}),
    events,
    unresolvedPlayers: Array.from(unresolvedByKey.values()),
    warnings: Array.from(warnings),
    summary: normalizeText(structuredResult?.summary),
  }
}

export const buildMatchAudioLogText = (
  events: MatchAudioNormalizedEvent[],
  resolutions: MatchAudioResolutionMap = {}
) => events
  .map((event) => {
    const resolution = event.rawPlayerName ? resolutions[event.rawPlayerName] : undefined
    const playerName = event.playerName ||
      (resolution && resolution !== MATCH_AUDIO_TEXT_ONLY ? normalizeText(resolution) : '')

    return buildLine(playerName, event.action, event.detail)
  })
  .filter(Boolean)
  .join('\n')

export const hasUnresolvedMatchAudioPlayers = (
  unresolvedPlayers: MatchAudioUnresolvedPlayer[],
  resolutions: MatchAudioResolutionMap = {}
) => unresolvedPlayers.some((player) => !resolutions[player.rawName])
