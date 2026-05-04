import type { MatchRecord, MatchRecordInput } from '@/types/match'

const TAIPEI_TIME_ZONE = 'Asia/Taipei'
const OUR_TEAM_ALIASES = ['中港', '中港熊戰', '中港國小']
const TITLE_TEAM_KEYWORDS = ['錦標賽', '邀請賽', '友誼賽', '聯賽', '嘉年華', '就是棒', '春季', '秋季', '棒球', '盃']
const VS_SEPARATOR = /\s*(?:v\.?\s*s\.?)\s*/i

interface ParsedICalEvent {
  id: string
  summary: string
  description: string
  location: string
  startRaw: string
  startTimeZone?: string
  endRaw: string
  endTimeZone?: string
}

interface ParsedDescription {
  category: string
  level: string
  gatherTime: string
  tournamentName: string
  matchFeeAmount: number | null
  coaches: string[]
  players: Array<{ number: string; name: string }>
  absentPlayers: string[]
}

interface SplitTitleSideResult {
  prefix: string
  team: string
  isOurTeam: boolean
}

interface ParsedTitle {
  tournamentName: string
  opponent: string
  warnings: string[]
}

export interface ParsedMatch {
  id: string
  rawTitle: string
  title: string
  tournamentName: string
  matchName: string
  opponent: string
  date: string
  startTime: string
  endTime: string
  matchTime: string
  location: string
  category: string
  level: string
  gatherTime: string
  matchFeeAmount: number | null
  coaches: string[]
  players: Array<{ number: string; name: string }>
  absentPlayers: string[]
  parseWarnings: string[]
  description: string
}

interface CalendarSyncItemBase {
  parsedMatch: ParsedMatch
  scheduleDiffs: CalendarSyncScheduleDiff[]
  playerCheck: CalendarSyncPlayerCheck
  validationIssues: CalendarSyncIssue[]
  isBlocked: boolean
}

export interface CalendarSyncCreateItem extends CalendarSyncItemBase {
  action: 'create'
  existingMatchId: null
  payload: MatchRecordInput
}

export interface CalendarSyncUpdateItem extends CalendarSyncItemBase {
  action: 'update'
  existingMatchId: string
  payload: Partial<MatchRecordInput>
}

export interface CalendarSyncSkipItem extends CalendarSyncItemBase {
  action: 'skip'
  existingMatchId: string
  payload: Partial<MatchRecordInput>
}

export type CalendarSyncItem = CalendarSyncCreateItem | CalendarSyncUpdateItem | CalendarSyncSkipItem

export interface CalendarSyncOptions {
  minimumMatchDate?: string
  rosterMembers?: CalendarSyncRosterMember[]
}

export interface CalendarSyncRosterMember {
  id?: string | null
  name?: string | null
  jersey_number?: string | number | null
  role?: string | null
  status?: string | null
}

export type CalendarSyncIssueSeverity = 'warning' | 'blocking'

export interface CalendarSyncIssue {
  severity: CalendarSyncIssueSeverity
  message: string
}

export interface CalendarSyncPlayerCheckItem {
  sourceName: string
  sourceNumber: string
  name: string
  number: string
  status: 'matched' | 'number_matched' | 'needs_review' | 'unchecked'
  message: string
}

export interface CalendarSyncPlayerCheck {
  total: number
  matched: number
  needsReview: number
  items: CalendarSyncPlayerCheckItem[]
}

export interface CalendarSyncScheduleDiff {
  field: keyof MatchRecordInput
  label: string
  before: string
  after: string
}

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

const normalizeTitleKey = (value: string) => collapseWhitespace(value).toLowerCase()

const normalizeTeamName = (value: string) => collapseWhitespace(value).replace(/^[\-:：]+/, '').trim()

const normalizeLooseNameKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .replace(/[\s·‧・．.]/g, '')
    .trim()
    .toLowerCase()

const normalizeRosterNumber = (value: unknown) => {
  const normalized = String(value ?? '').normalize('NFKC').replace(/^#/, '').trim()
  if (!normalized) return ''
  return /^\d+$/.test(normalized) ? String(Number(normalized)) : normalized
}

const isOurTeamName = (value: string) => {
  const normalized = normalizeLooseNameKey(normalizeTeamName(value))
  return OUR_TEAM_ALIASES.some((alias) => normalized === normalizeLooseNameKey(alias))
}

const splitTitleSide = (value: string): SplitTitleSideResult => {
  const normalized = collapseWhitespace(value)

  let bestIndex = -1
  let bestKeyword = ''

  for (const keyword of TITLE_TEAM_KEYWORDS) {
    const index = normalized.lastIndexOf(keyword)
    if (index > bestIndex) {
      bestIndex = index
      bestKeyword = keyword
    }
  }

  if (bestIndex === -1) {
    return { prefix: '', team: normalized, isOurTeam: isOurTeamName(normalized) }
  }

  const boundary = bestIndex + bestKeyword.length
  const prefix = normalized.slice(0, boundary).trim()
  const team = normalized.slice(boundary).trim()

  return { prefix, team, isOurTeam: isOurTeamName(team) }
}

const splitTitleSideWithTeamAlias = (value: string): SplitTitleSideResult => {
  const side = splitTitleSide(value)
  if (side.isOurTeam) return side

  const normalized = collapseWhitespace(value)
  const aliases = [...OUR_TEAM_ALIASES].sort((left, right) => right.length - left.length)

  for (const alias of aliases) {
    const index = normalized.lastIndexOf(alias)
    if (index === -1) continue

    const beforeAlias = normalized.slice(0, index).trim()
    const afterAlias = normalized.slice(index + alias.length).trim()

    if (afterAlias && !/^[\-:：,，、()（）\s]+$/.test(afterAlias)) {
      continue
    }

    return {
      prefix: side.prefix || beforeAlias,
      team: alias,
      isOurTeam: true
    }
  }

  return side
}

const stripLeadingTitleMarkers = (value: string) => {
  let output = collapseWhitespace(value)
  output = output.replace(/^((?:[0-9#*]\uFE0F?\u20E3|\d+)\s*)+/, '')
  output = output.replace(/^[\-:：\s]+/, '')
  return collapseWhitespace(output)
}

const stripTrailingTitleTime = (value: string) =>
  value.replace(/\s+\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?$/, '').trim()

const cleanTitle = (value: string) => stripTrailingTitleTime(stripLeadingTitleMarkers(value))

const decodeICalText = (value: string) =>
  value
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')

const formatDateTimeInTimeZone = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

  const parts = formatter.formatToParts(date)
  const partMap = new Map(parts.map((part) => [part.type, part.value]))

  return {
    date: `${partMap.get('year')}-${partMap.get('month')}-${partMap.get('day')}`,
    time: `${partMap.get('hour')}:${partMap.get('minute')}`
  }
}

const getTodayDateInTimeZone = (timeZone: string) => formatDateTimeInTimeZone(new Date(), timeZone).date

const parseICalDateTime = (rawValue: string, timeZone?: string) => {
  if (!rawValue) {
    return { date: '', time: '' }
  }

  if (/^\d{8}$/.test(rawValue)) {
    return {
      date: `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`,
      time: ''
    }
  }

  if (!/^\d{8}T\d{6}Z?$/.test(rawValue)) {
    return { date: '', time: '' }
  }

  const year = rawValue.slice(0, 4)
  const month = rawValue.slice(4, 6)
  const day = rawValue.slice(6, 8)
  const hour = rawValue.slice(9, 11)
  const minute = rawValue.slice(11, 13)

  if (rawValue.endsWith('Z')) {
    return formatDateTimeInTimeZone(new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`), TAIPEI_TIME_ZONE)
  }

  if (!timeZone || timeZone === TAIPEI_TIME_ZONE) {
    return {
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`
    }
  }

  return formatDateTimeInTimeZone(new Date(`${year}-${month}-${day}T${hour}:${minute}:00`), timeZone)
}

const buildMatchTime = (startTime: string, endTime: string) => {
  if (startTime && endTime) return `${startTime} - ${endTime}`
  return startTime || ''
}

const splitMultiValueLine = (value: string) =>
  value
    .split(/[、,，/]/)
    .map((item) => collapseWhitespace(item))
    .filter(Boolean)

const matchFeeLinePattern = /^比賽費用\s*[:：]\s*(.*)$/

const parseMatchFeeAmountValue = (value: string) => {
  const normalized = collapseWhitespace(value).replace(/元$/, '').trim()
  if (!/^[0-9][0-9,\s]*$/.test(normalized)) return null

  const amount = Number(normalized.replace(/[,\s]/g, ''))
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

const parseMatchFeeAmount = (line: string) => {
  const match = line.match(matchFeeLinePattern)
  if (!match) return null
  return parseMatchFeeAmountValue(match[1])
}

const isMatchFeePseudoPlayerLine = (line: string) => {
  const normalized = collapseWhitespace(line.normalize('NFKC'))
  return /^比賽費用(?:\s*:.*)?$/.test(normalized)
}

const parsePlayerLine = (line: string) => {
  if (isMatchFeePseudoPlayerLine(line)) {
    return null
  }

  const isAbsent = /[（(]請假[）)]/.test(line)
  let working = line.replace(/[（(]請假[）)]/g, '').trim()

  if (!working) {
    return null
  }

  let number = ''
  const leadingNumberMatch = working.match(/^(\d{1,3})\s+(.+)$/)
  if (leadingNumberMatch) {
    number = leadingNumberMatch[1]
    working = leadingNumberMatch[2].trim()
  } else {
    const orderedLineMatch = working.match(/^\d{1,3}\s*[.)、．-]\s*(.+)$/)
    if (orderedLineMatch) {
      working = orderedLineMatch[1].trim()
    }

    const trailingNumberMatch = working.match(/^(.+?)(\d{1,3})$/)
    if (trailingNumberMatch) {
      working = trailingNumberMatch[1].trim()
      number = trailingNumberMatch[2]
    }
  }

  const name = collapseWhitespace(working)
  if (!name) {
    return null
  }

  return {
    isAbsent,
    player: {
      number,
      name
    }
  }
}

const parseDescription = (description: string): ParsedDescription => {
  const result: ParsedDescription = {
    category: '',
    level: '',
    gatherTime: '',
    tournamentName: '',
    matchFeeAmount: null,
    coaches: [],
    players: [],
    absentPlayers: []
  }

  const lines = decodeICalText(description)
    .replace(/\r/g, '')
    .replace(/\u00A0/g, ' ')
    .split('\n')
    .map((line) => collapseWhitespace(line))

  let currentSection: 'coaches' | 'players' | null = null
  let awaitingMatchFeeAmount = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (awaitingMatchFeeAmount && result.matchFeeAmount == null) {
      const pendingAmount = parseMatchFeeAmountValue(line)
      if (pendingAmount != null) {
        result.matchFeeAmount = pendingAmount
        awaitingMatchFeeAmount = false
        currentSection = null
        continue
      }
      awaitingMatchFeeAmount = false
    }

    const categoryMatch = line.match(/^組別\s*\/\s*類別\s*[：:]\s*(.*)$/)
    if (categoryMatch) {
      result.category = categoryMatch[1].trim()
      currentSection = null
      continue
    }

    const levelMatch = line.match(/^賽事等級\s*[：:]\s*(.*)$/)
    if (levelMatch) {
      result.level = levelMatch[1].trim()
      currentSection = null
      continue
    }

    const gatherTimeMatch = line.match(/^集合時間\s*[：:]\s*(.*)$/)
    if (gatherTimeMatch) {
      result.gatherTime = gatherTimeMatch[1].trim()
      currentSection = null
      continue
    }

    const tournamentNameMatch = line.match(/^盃賽名稱\s*[：:]\s*(.*)$/)
    if (tournamentNameMatch) {
      result.tournamentName = tournamentNameMatch[1].trim()
      currentSection = null
      continue
    }

    const matchFeeMatch = line.match(matchFeeLinePattern)
    if (matchFeeMatch) {
      if (result.matchFeeAmount == null) {
        result.matchFeeAmount = parseMatchFeeAmount(line)
        awaitingMatchFeeAmount = result.matchFeeAmount == null && matchFeeMatch[1].trim() === ''
      }
      currentSection = null
      continue
    }

    const coachesMatch = line.match(/^帶隊教練\s*[：:]\s*(.*)$/)
    if (coachesMatch) {
      currentSection = 'coaches'
      const inlineCoachValue = coachesMatch[1].trim()
      if (inlineCoachValue) {
        result.coaches.push(...splitMultiValueLine(inlineCoachValue))
      }
      continue
    }

    const playersMatch = line.match(/^參賽球員\s*[：:]\s*(.*)$/)
    if (playersMatch) {
      currentSection = 'players'
      const inlinePlayerValue = playersMatch[1].trim()
      if (inlinePlayerValue) {
        const parsedInlinePlayer = parsePlayerLine(inlinePlayerValue)
        if (parsedInlinePlayer?.isAbsent) {
          result.absentPlayers.push(parsedInlinePlayer.player.name)
        } else if (parsedInlinePlayer) {
          result.players.push(parsedInlinePlayer.player)
        }
      }
      continue
    }

    if (currentSection === 'coaches') {
      result.coaches.push(...splitMultiValueLine(line))
      continue
    }

    if (currentSection === 'players') {
      const parsedPlayer = parsePlayerLine(line)
      if (!parsedPlayer) continue

      if (parsedPlayer.isAbsent) {
        result.absentPlayers.push(parsedPlayer.player.name)
      } else {
        result.players.push(parsedPlayer.player)
      }
    }
  }

  return {
    ...result,
    coaches: Array.from(new Set(result.coaches)),
    absentPlayers: Array.from(new Set(result.absentPlayers))
  }
}

const parseTitle = (title: string): ParsedTitle => {
  const parts = title.split(VS_SEPARATOR)
  if (parts.length < 2) {
    return {
      tournamentName: '',
      opponent: '',
      warnings: ['未偵測到對戰格式，對手需確認']
    }
  }

  const leftSide = splitTitleSideWithTeamAlias(parts[0])
  const rightSide = splitTitleSideWithTeamAlias(parts.slice(1).join(' '))

  const leftTeam = normalizeTeamName(leftSide.team || parts[0])
  const rightTeam = normalizeTeamName(rightSide.team || parts.slice(1).join(' '))
  const leftIsUs = leftSide.isOurTeam || isOurTeamName(leftTeam)
  const rightIsUs = rightSide.isOurTeam || isOurTeamName(rightTeam)

  let tournamentName = leftSide.prefix || rightSide.prefix || ''
  let opponent = ''
  const warnings: string[] = []

  if (leftIsUs && !rightIsUs) {
    opponent = rightTeam
  } else if (rightIsUs && !leftIsUs) {
    opponent = leftTeam
  } else if (leftIsUs && rightIsUs) {
    warnings.push('對戰雙方都像中港隊名，請確認對手')
  } else {
    warnings.push('未在對戰標題中偵測到中港隊名，請確認對手')
    opponent = rightTeam && !isOurTeamName(rightTeam) ? rightTeam : ''
  }

  if (!opponent) {
    warnings.push('未解析到對手，將以待確認顯示')
  }

  return {
    tournamentName: collapseWhitespace(tournamentName),
    opponent: collapseWhitespace(opponent),
    warnings: Array.from(new Set(warnings))
  }
}

const buildCalendarNote = (match: ParsedMatch) => {
  const lines = ['[Google Calendar 同步]']

  if (match.gatherTime) {
    lines.push(`集合時間: ${match.gatherTime}`)
  }

  if (match.rawTitle && match.rawTitle !== match.matchName) {
    lines.push(`原始標題: ${match.rawTitle}`)
  }

  return lines.join('\n')
}

const buildLineup = (players: ParsedMatch['players']) =>
  players.map((player, index) => ({
    order: index + 1,
    position: '未排',
    name: player.name,
    number: player.number || ''
  }))

const buildPlayersSummary = (players: ParsedMatch['players']) => players.map((player) => player.name).join(',')

const getCalendarTournamentName = (match: ParsedMatch) => collapseWhitespace(match.tournamentName || '')

const emptyPlayerCheck = (players: ParsedMatch['players'] = []): CalendarSyncPlayerCheck => ({
  total: players.length,
  matched: 0,
  needsReview: 0,
  items: players.map((player) => ({
    sourceName: player.name,
    sourceNumber: player.number || '',
    name: player.name,
    number: player.number || '',
    status: 'unchecked',
    message: ''
  }))
})

const isSameRosterMember = (left: CalendarSyncRosterMember, right: CalendarSyncRosterMember) => {
  if (left.id && right.id) return left.id === right.id
  return normalizeLooseNameKey(left.name) === normalizeLooseNameKey(right.name)
}

export const checkCalendarPlayersAgainstRoster = (
  players: ParsedMatch['players'] = [],
  rosterMembers?: CalendarSyncRosterMember[]
): CalendarSyncPlayerCheck => {
  const activeRoster = (rosterMembers || [])
    .filter((member) => {
      const role = String(member.role || '').trim()
      const status = String(member.status || '').trim()
      return Boolean(member.name) &&
        (!role || role === '球員' || role === '校隊') &&
        (!status || status === '在隊')
    })

  if (!activeRoster.length) {
    return emptyPlayerCheck(players)
  }

  const nameBuckets = new Map<string, CalendarSyncRosterMember[]>()
  const numberBuckets = new Map<string, CalendarSyncRosterMember[]>()

  activeRoster.forEach((member) => {
    const nameKey = normalizeLooseNameKey(member.name)
    if (nameKey) {
      nameBuckets.set(nameKey, [...(nameBuckets.get(nameKey) || []), member])
    }

    const numberKey = normalizeRosterNumber(member.jersey_number)
    if (numberKey) {
      numberBuckets.set(numberKey, [...(numberBuckets.get(numberKey) || []), member])
    }
  })

  const items = players.map<CalendarSyncPlayerCheckItem>((player) => {
    const sourceName = collapseWhitespace(player.name || '')
    const sourceNumber = normalizeRosterNumber(player.number)
    const nameMatches = nameBuckets.get(normalizeLooseNameKey(sourceName)) || []
    const numberMatches = sourceNumber ? numberBuckets.get(sourceNumber) || [] : []

    if (nameMatches.length === 1) {
      const matched = nameMatches[0]
      const matchedNumber = normalizeRosterNumber(matched.jersey_number)
      const numberPointsToDifferentMember = sourceNumber &&
        numberMatches.length > 0 &&
        !numberMatches.some((candidate) => isSameRosterMember(candidate, matched))
      const numberDiffersFromRoster = sourceNumber && matchedNumber && sourceNumber !== matchedNumber

      if (numberPointsToDifferentMember || numberDiffersFromRoster) {
        return {
          sourceName,
          sourceNumber,
          name: sourceName,
          number: sourceNumber || player.number || '',
          status: 'needs_review',
          message: matchedNumber
            ? `姓名命中「${matched.name}」，但背號與名單 #${matchedNumber} 不一致`
            : `姓名命中「${matched.name}」，但背號 #${sourceNumber} 指向其他隊員`
        }
      }

      return {
        sourceName,
        sourceNumber,
        name: collapseWhitespace(String(matched.name || sourceName)),
        number: matchedNumber || sourceNumber,
        status: 'matched',
        message: ''
      }
    }

    if (nameMatches.length > 1) {
      return {
        sourceName,
        sourceNumber,
        name: sourceName,
        number: sourceNumber,
        status: 'needs_review',
        message: `姓名「${sourceName}」命中多位隊員`
      }
    }

    if (sourceNumber && numberMatches.length === 1) {
      const matched = numberMatches[0]
      return {
        sourceName,
        sourceNumber,
        name: collapseWhitespace(String(matched.name || sourceName)),
        number: normalizeRosterNumber(matched.jersey_number) || sourceNumber,
        status: 'number_matched',
        message: `以唯一背號 #${sourceNumber} 對應`
      }
    }

    if (sourceNumber && numberMatches.length > 1) {
      return {
        sourceName,
        sourceNumber,
        name: sourceName,
        number: sourceNumber,
        status: 'needs_review',
        message: `背號 #${sourceNumber} 命中多位隊員`
      }
    }

    return {
      sourceName,
      sourceNumber,
      name: sourceName,
      number: sourceNumber,
      status: 'needs_review',
      message: `名單中找不到「${sourceName}」`
    }
  })

  return {
    total: items.length,
    matched: items.filter((item) => item.status === 'matched' || item.status === 'number_matched').length,
    needsReview: items.filter((item) => item.status === 'needs_review').length,
    items
  }
}

const getPayloadPlayers = (match: ParsedMatch, playerCheck: CalendarSyncPlayerCheck): ParsedMatch['players'] => {
  if (!playerCheck.items.length) return match.players

  return playerCheck.items.map((item) => ({
    name: item.status === 'needs_review' ? item.sourceName : item.name,
    number: item.status === 'needs_review' ? item.sourceNumber : item.number
  }))
}

export const createMatchRecordInput = (
  match: ParsedMatch,
  options: { players?: ParsedMatch['players'] } = {}
): MatchRecordInput => {
  const players = options.players || match.players

  return {
    google_calendar_event_id: match.id || null,
    match_name: match.matchName || match.title || '未命名賽事',
    tournament_name: getCalendarTournamentName(match) || null,
    match_fee_amount: match.matchFeeAmount,
    opponent: match.opponent || '待確認',
    match_date: match.date,
    match_time: match.matchTime,
    location: match.location,
    category_group: match.category,
    match_level: match.level,
    home_score: 0,
    opponent_score: 0,
    coaches: match.coaches.join(','),
    players: buildPlayersSummary(players),
    note: buildCalendarNote(match),
    photo_url: '',
    absent_players: match.absentPlayers.map((name) => ({ name, type: '請假' })),
    lineup: buildLineup(players),
    inning_logs: [],
    batting_stats: []
  }
}

const createMatchScheduleUpdateInput = (match: ParsedMatch): Partial<MatchRecordInput> => {
  const payload: Partial<MatchRecordInput> = {
    google_calendar_event_id: match.id || null,
    match_name: match.matchName || match.title || '未命名賽事',
    opponent: match.opponent || '待確認',
    match_date: match.date,
    match_time: match.matchTime,
    location: match.location,
    category_group: match.category,
    match_level: match.level,
    match_fee_amount: match.matchFeeAmount
  }

  const tournamentName = getCalendarTournamentName(match)
  if (tournamentName) {
    payload.tournament_name = tournamentName
  }

  return payload
}

const getStartTimeForMatchKey = (matchTime: string) => {
  const trimmed = matchTime.trim()
  if (!trimmed) return ''

  const rangeMatch = trimmed.match(/^(\d{2}:\d{2})\s*-\s*\d{2}:\d{2}$/)
  if (rangeMatch) {
    return rangeMatch[1]
  }

  const timeMatch = trimmed.match(/^(\d{2}:\d{2})/)
  return timeMatch?.[1] || ''
}

const buildParsedTitleCandidates = (match: ParsedMatch) =>
  Array.from(
    new Set(
      [match.rawTitle, match.title, match.matchName, match.tournamentName]
        .map((value) => normalizeTitleKey(value))
        .filter(Boolean)
    )
  )

const syncUpdateFields: Array<keyof MatchRecordInput> = [
  'google_calendar_event_id',
  'match_name',
  'tournament_name',
  'opponent',
  'match_date',
  'match_time',
  'location',
  'category_group',
  'match_level',
  'match_fee_amount'
]

const normalizeSyncValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? collapseWhitespace(value) : value
}

const formatSyncValue = (value: unknown) => {
  const normalized = normalizeSyncValue(value)
  return normalized === '' ? '空白' : String(normalized)
}

const scheduleFieldLabels: Partial<Record<keyof MatchRecordInput, string>> = {
  google_calendar_event_id: 'Google UID',
  match_name: '賽事名稱',
  tournament_name: '盃賽',
  opponent: '對手',
  match_date: '日期',
  match_time: '時間',
  location: '地點',
  category_group: '組別',
  match_level: '賽事等級',
  match_fee_amount: '比賽費用'
}

const isSyncPayloadEqual = (existing: MatchRecord, payload: Partial<MatchRecordInput>) =>
  syncUpdateFields.every((field) => {
    if (!(field in payload)) return true

    return normalizeSyncValue(existing[field]) === normalizeSyncValue(payload[field])
  })

const buildScheduleDiffs = (
  existing: MatchRecord | null,
  payload: Partial<MatchRecordInput>
): CalendarSyncScheduleDiff[] => {
  if (!existing) return []

  return syncUpdateFields
    .filter((field) => field in payload)
    .filter((field) => normalizeSyncValue(existing[field]) !== normalizeSyncValue(payload[field]))
    .map((field) => ({
      field,
      label: scheduleFieldLabels[field] || String(field),
      before: formatSyncValue(existing[field]),
      after: formatSyncValue(payload[field])
    }))
}

const isConfirmedOpponent = (value: unknown) => {
  const normalized = collapseWhitespace(String(value || ''))
  return Boolean(normalized && normalized !== '待確認')
}

const buildValidationIssues = (
  parsedMatch: ParsedMatch,
  playerCheck: CalendarSyncPlayerCheck,
  existingMatch: MatchRecord | null,
  payload: Partial<MatchRecordInput>
): CalendarSyncIssue[] => {
  const issues: CalendarSyncIssue[] = []

  parsedMatch.parseWarnings.forEach((message) => {
    issues.push({ severity: 'warning', message })
  })

  if (!parsedMatch.date) {
    issues.push({ severity: 'blocking', message: '未解析到比賽日期，請先確認 Google 行事曆時間' })
  }

  if (!parsedMatch.matchTime) {
    issues.push({ severity: 'warning', message: '未解析到完整比賽時間，請確認排程' })
  }

  if (playerCheck.needsReview > 0) {
    issues.push({ severity: 'warning', message: `${playerCheck.needsReview} 位參賽球員需人工確認` })
  }

  if (
    existingMatch &&
    !parsedMatch.opponent &&
    isConfirmedOpponent(existingMatch.opponent)
  ) {
    issues.push({
      severity: 'blocking',
      message: `Calendar 未解析到對手，避免覆蓋既有對手「${existingMatch.opponent}」`
    })
    delete payload.opponent
  }

  return Array.from(
    new Map(issues.map((issue) => [`${issue.severity}:${issue.message}`, issue])).values()
  )
}

const findFallbackExistingMatch = (existingMatches: MatchRecord[], parsedMatch: ParsedMatch) => {
  const parsedTitleCandidates = buildParsedTitleCandidates(parsedMatch)
  const parsedStartTime = parsedMatch.startTime

  return existingMatches.find((match) => {
    if (match.google_calendar_event_id) return false
    if (match.match_date !== parsedMatch.date) return false
    if (getStartTimeForMatchKey(match.match_time || '') !== parsedStartTime) return false

    const existingTitle = normalizeTitleKey(match.match_name || '')
    return parsedTitleCandidates.includes(existingTitle)
  }) || null
}

export const planCalendarSync = (
  existingMatches: MatchRecord[],
  parsedMatches: ParsedMatch[],
  options: CalendarSyncOptions = {}
): CalendarSyncItem[] => {
  const minimumMatchDate = options.minimumMatchDate || getTodayDateInTimeZone(TAIPEI_TIME_ZONE)

  return parsedMatches
    .filter((parsedMatch) => parsedMatch.date >= minimumMatchDate)
    .map((parsedMatch) => {
      const playerCheck = checkCalendarPlayersAgainstRoster(parsedMatch.players, options.rosterMembers)
      const createPayload = createMatchRecordInput(parsedMatch, {
        players: getPayloadPlayers(parsedMatch, playerCheck)
      })
      const updatePayload = createMatchScheduleUpdateInput(parsedMatch)

      const matchedByUid =
        parsedMatch.id
          ? existingMatches.find((match) => match.google_calendar_event_id === parsedMatch.id) || null
          : null

      const existingMatch = matchedByUid || findFallbackExistingMatch(existingMatches, parsedMatch)
      const validationIssues = buildValidationIssues(parsedMatch, playerCheck, existingMatch, updatePayload)
      const isBlocked = validationIssues.some((issue) => issue.severity === 'blocking')

      if (!existingMatch) {
        return {
          action: 'create',
          existingMatchId: null,
          parsedMatch,
          payload: createPayload,
          scheduleDiffs: [],
          playerCheck,
          validationIssues,
          isBlocked
        }
      }

      const scheduleDiffs = buildScheduleDiffs(existingMatch, updatePayload)

      if (isSyncPayloadEqual(existingMatch, updatePayload)) {
        return {
          action: 'skip',
          existingMatchId: existingMatch.id,
          parsedMatch,
          payload: updatePayload,
          scheduleDiffs,
          playerCheck,
          validationIssues,
          isBlocked
        }
      }

      return {
        action: 'update',
        existingMatchId: existingMatch.id,
        parsedMatch,
        payload: updatePayload,
        scheduleDiffs,
        playerCheck,
        validationIssues,
        isBlocked
      }
    })
}

export const parseMatchRecord = (event: ParsedICalEvent): ParsedMatch => {
  const rawTitle = collapseWhitespace(decodeICalText(event.summary || ''))
  const title = cleanTitle(rawTitle)
  const description = decodeICalText(event.description || '')
  const descriptionFields = parseDescription(description)
  const titleFields = parseTitle(title)
  const start = parseICalDateTime(event.startRaw, event.startTimeZone)
  const end = parseICalDateTime(event.endRaw, event.endTimeZone)

  const tournamentName = descriptionFields.tournamentName || titleFields.tournamentName
  const matchName = tournamentName || title || '未命名賽事'

  return {
    id: event.id || '',
    rawTitle,
    title,
    tournamentName,
    matchName,
    opponent: titleFields.opponent || '',
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    matchTime: buildMatchTime(start.time, end.time),
    location: collapseWhitespace(decodeICalText(event.location || '')),
    category: descriptionFields.category,
    level: descriptionFields.level,
    gatherTime: descriptionFields.gatherTime,
    matchFeeAmount: descriptionFields.matchFeeAmount,
    coaches: descriptionFields.coaches,
    players: descriptionFields.players,
    absentPlayers: descriptionFields.absentPlayers,
    parseWarnings: titleFields.warnings,
    description
  }
}

const unfoldICalLines = (text: string) => {
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const lines: string[] = []

  for (const rawLine of rawLines) {
    if ((rawLine.startsWith(' ') || rawLine.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += rawLine.slice(1)
    } else {
      lines.push(rawLine)
    }
  }

  return lines
}

const parsePropertyLine = (line: string) => {
  const separatorIndex = line.indexOf(':')
  if (separatorIndex === -1) return null

  const key = line.slice(0, separatorIndex)
  const value = line.slice(separatorIndex + 1)
  const [name, ...paramEntries] = key.split(';')
  const params = Object.fromEntries(
    paramEntries.map((entry) => {
      const [paramKey, paramValue = ''] = entry.split('=')
      return [paramKey.toUpperCase(), paramValue]
    })
  )

  return {
    name: name.toUpperCase(),
    params,
    value
  }
}

export const parseICalText = (text: string): ParsedMatch[] => {
  const lines = unfoldICalLines(text)
  const events: ParsedICalEvent[] = []
  let currentEvent: ParsedICalEvent | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {
        id: '',
        summary: '',
        description: '',
        location: '',
        startRaw: '',
        endRaw: ''
      }
      continue
    }

    if (line === 'END:VEVENT') {
      if (currentEvent?.summary && currentEvent.startRaw) {
        events.push(currentEvent)
      }
      currentEvent = null
      continue
    }

    if (!currentEvent) continue

    const property = parsePropertyLine(line)
    if (!property) continue

    switch (property.name) {
      case 'UID':
        currentEvent.id = property.value.trim()
        break
      case 'SUMMARY':
        currentEvent.summary = property.value
        break
      case 'DESCRIPTION':
        currentEvent.description = property.value
        break
      case 'LOCATION':
        currentEvent.location = property.value
        break
      case 'DTSTART':
        currentEvent.startRaw = property.value.trim()
        currentEvent.startTimeZone = property.params.TZID
        break
      case 'DTEND':
        currentEvent.endRaw = property.value.trim()
        currentEvent.endTimeZone = property.params.TZID
        break
      default:
        break
    }
  }

  return events.map(parseMatchRecord)
}

const fetchICalText = async (url: string) => {
  const proxyUrls = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`
  ]

  let lastError: unknown = null

  for (const proxyUrl of proxyUrls) {
    try {
      const response = await fetch(proxyUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      if (proxyUrl.includes('allorigins.win/get')) {
        const data = await response.json()
        if (!data?.contents) {
          throw new Error('Proxy returned empty content')
        }
        return data.contents as string
      }

      return await response.text()
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Unable to fetch iCal data')
}

export const fetchAndParseICal = async (url: string): Promise<ParsedMatch[]> => {
  try {
    const text = await fetchICalText(url)
    return parseICalText(text)
  } catch (error) {
    console.error('Failed to fetch or parse iCal data:', error)
    throw new Error('無法讀取 Google 行事曆，請確認連結正確且公開。')
  }
}
