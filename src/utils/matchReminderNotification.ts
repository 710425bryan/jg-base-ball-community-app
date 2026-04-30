import type { MatchRecord } from '@/types/match'

const TAIPEI_TIME_ZONE = 'Asia/Taipei'
const EMPTY_VALUE = '未填寫'

const formatDateInTimeZone = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  const parts = formatter.formatToParts(date)
  const partMap = new Map(parts.map((part) => [part.type, part.value]))

  return `${partMap.get('year')}-${partMap.get('month')}-${partMap.get('day')}`
}

const addDaysToDateString = (dateString: string, days: number) => {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))

  return date.toISOString().slice(0, 10)
}

const normalizeDisplayValue = (value: unknown) => {
  if (value === null || value === undefined) return EMPTY_VALUE
  const normalized = String(value).replace(/\s+/g, ' ').trim()
  return normalized || EMPTY_VALUE
}

export const getTomorrowDateInTaipei = (now = new Date()) =>
  addDaysToDateString(formatDateInTimeZone(now, TAIPEI_TIME_ZONE), 1)

export const extractMatchGatherTime = (note?: string | null) => {
  const match = String(note || '').match(/集合時間\s*[：:]\s*([^\n\r]+)/)
  return normalizeDisplayValue(match?.[1])
}

export const buildMatchReminderEventKey = (match: Pick<MatchRecord, 'id' | 'match_date'>) =>
  `match_reminder:${match.id}:${match.match_date}`

export const buildMatchReminderUrl = (match: Pick<MatchRecord, 'id'>) =>
  `/calendar?match_id=${encodeURIComponent(match.id)}`

export const buildMatchReminderTitle = (match: Pick<MatchRecord, 'match_name'>) =>
  `明日賽事提醒：${normalizeDisplayValue(match.match_name)}`

export const buildMatchReminderBody = (match: Pick<
  MatchRecord,
  'match_name' |
  'tournament_name' |
  'opponent' |
  'match_date' |
  'match_time' |
  'location' |
  'coaches' |
  'players' |
  'note'
>) => [
  `賽事名稱：${normalizeDisplayValue(match.match_name)}`,
  `盃賽名稱：${normalizeDisplayValue(match.tournament_name)}`,
  `對手隊伍：${normalizeDisplayValue(match.opponent)}`,
  `日期：${normalizeDisplayValue(match.match_date)}`,
  `時間：${normalizeDisplayValue(match.match_time)}`,
  `集合時間：${extractMatchGatherTime(match.note)}`,
  `地點：${normalizeDisplayValue(match.location)}`,
  `教練：${normalizeDisplayValue(match.coaches)}`,
  `球員：${normalizeDisplayValue(match.players)}`
].join('\n')
