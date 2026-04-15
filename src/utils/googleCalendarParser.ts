import type { MatchRecord, MatchRecordInput } from '@/types/match'

const TAIPEI_TIME_ZONE = 'Asia/Taipei'
const OUR_TEAM_ALIASES = ['中港', '中港熊戰', '中港國小']
const TITLE_TEAM_KEYWORDS = ['錦標賽', '邀請賽', '友誼賽', '聯賽', '嘉年華', '就是棒', '春季', '秋季', '盃']
const VS_SEPARATOR = /\s+(?:v\.?\s*s\.?)\s+/i

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
  coaches: string[]
  players: Array<{ number: string; name: string }>
  absentPlayers: string[]
}

interface SplitTitleSideResult {
  prefix: string
  team: string
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
  coaches: string[]
  players: Array<{ number: string; name: string }>
  absentPlayers: string[]
  description: string
}

export interface CalendarSyncItem {
  action: 'create' | 'update' | 'skip'
  existingMatchId: string | null
  parsedMatch: ParsedMatch
  payload: MatchRecordInput
}

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

const normalizeTitleKey = (value: string) => collapseWhitespace(value).toLowerCase()

const normalizeTeamName = (value: string) => collapseWhitespace(value).replace(/^[\-:：]+/, '').trim()

const isOurTeamName = (value: string) => {
  const normalized = normalizeTeamName(value)
  return OUR_TEAM_ALIASES.some((alias) => normalized === alias)
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
    return { prefix: '', team: normalized }
  }

  const boundary = bestIndex + bestKeyword.length
  const prefix = normalized.slice(0, boundary).trim()
  const team = normalized.slice(boundary).trim()

  return { prefix, team }
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

const parsePlayerLine = (line: string) => {
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

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

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

const parseTitle = (title: string) => {
  const parts = title.split(VS_SEPARATOR)
  if (parts.length < 2) {
    return {
      tournamentName: '',
      opponent: ''
    }
  }

  const leftSide = splitTitleSide(parts[0])
  const rightSide = splitTitleSide(parts.slice(1).join(' '))

  const leftTeam = normalizeTeamName(leftSide.team || parts[0])
  const rightTeam = normalizeTeamName(rightSide.team || parts.slice(1).join(' '))
  const leftIsUs = isOurTeamName(leftTeam)
  const rightIsUs = isOurTeamName(rightTeam)

  let tournamentName = leftSide.prefix || rightSide.prefix || ''
  let opponent = ''

  if (leftIsUs && !rightIsUs) {
    opponent = rightTeam
  } else if (rightIsUs && !leftIsUs) {
    opponent = leftTeam
  } else {
    opponent = rightTeam && !isOurTeamName(rightTeam) ? rightTeam : ''
  }

  return {
    tournamentName: collapseWhitespace(tournamentName),
    opponent: collapseWhitespace(opponent)
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

export const createMatchRecordInput = (match: ParsedMatch): MatchRecordInput => ({
  google_calendar_event_id: match.id || null,
  match_name: match.matchName || match.title || '未命名賽事',
  opponent: match.opponent || '待確認',
  match_date: match.date,
  match_time: match.matchTime,
  location: match.location,
  category_group: match.category,
  match_level: match.level,
  home_score: 0,
  opponent_score: 0,
  coaches: match.coaches.join(','),
  players: buildPlayersSummary(match.players),
  note: buildCalendarNote(match),
  photo_url: '',
  absent_players: match.absentPlayers.map((name) => ({ name, type: '請假' })),
  lineup: buildLineup(match.players),
  inning_logs: [],
  batting_stats: []
})

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

const isSyncPayloadEqual = (existing: MatchRecord, payload: MatchRecordInput) =>
  JSON.stringify({
    google_calendar_event_id: existing.google_calendar_event_id || null,
    match_name: existing.match_name,
    opponent: existing.opponent,
    match_date: existing.match_date,
    match_time: existing.match_time,
    location: existing.location || '',
    category_group: existing.category_group || '',
    match_level: existing.match_level || '',
    home_score: existing.home_score,
    opponent_score: existing.opponent_score,
    coaches: existing.coaches || '',
    players: existing.players || '',
    note: existing.note || '',
    photo_url: existing.photo_url || '',
    absent_players: existing.absent_players || [],
    lineup: existing.lineup || [],
    inning_logs: existing.inning_logs || [],
    batting_stats: existing.batting_stats || []
  }) ===
  JSON.stringify({
    google_calendar_event_id: payload.google_calendar_event_id || null,
    match_name: payload.match_name,
    opponent: payload.opponent,
    match_date: payload.match_date,
    match_time: payload.match_time,
    location: payload.location || '',
    category_group: payload.category_group || '',
    match_level: payload.match_level || '',
    home_score: payload.home_score,
    opponent_score: payload.opponent_score,
    coaches: payload.coaches || '',
    players: payload.players || '',
    note: payload.note || '',
    photo_url: payload.photo_url || '',
    absent_players: payload.absent_players || [],
    lineup: payload.lineup || [],
    inning_logs: payload.inning_logs || [],
    batting_stats: payload.batting_stats || []
  })

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

export const planCalendarSync = (existingMatches: MatchRecord[], parsedMatches: ParsedMatch[]): CalendarSyncItem[] =>
  parsedMatches.map((parsedMatch) => {
    const payload = createMatchRecordInput(parsedMatch)

    const matchedByUid =
      parsedMatch.id
        ? existingMatches.find((match) => match.google_calendar_event_id === parsedMatch.id) || null
        : null

    const existingMatch = matchedByUid || findFallbackExistingMatch(existingMatches, parsedMatch)

    if (!existingMatch) {
      return {
        action: 'create',
        existingMatchId: null,
        parsedMatch,
        payload
      }
    }

    if (isSyncPayloadEqual(existingMatch, payload)) {
      return {
        action: 'skip',
        existingMatchId: existingMatch.id,
        parsedMatch,
        payload
      }
    }

    return {
      action: 'update',
      existingMatchId: existingMatch.id,
      parsedMatch,
      payload
    }
  })

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
    coaches: descriptionFields.coaches,
    players: descriptionFields.players,
    absentPlayers: descriptionFields.absentPlayers,
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
