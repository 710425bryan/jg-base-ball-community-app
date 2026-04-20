import dayjs, { type Dayjs } from 'dayjs'
import type { MatchRecord } from '@/types/match'

const TIME_TOKEN_PATTERN = /\d{1,2}:\d{2}/g
const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export type DashboardMatchResultTone = 'win' | 'lose' | 'draw' | 'pending'

export interface DashboardMatchResultMeta {
  label: 'W' | 'L' | 'D' | '-'
  tone: DashboardMatchResultTone
}

const extractTimeTokens = (matchTime?: string | null) => matchTime?.match(TIME_TOKEN_PATTERN) ?? []

const buildDateTime = (matchDate: string | undefined, time: string) => {
  if (!matchDate) return null

  const value = dayjs(`${matchDate}T${time}`)
  return value.isValid() ? value : null
}

export const getDashboardMatchStart = (match: Pick<MatchRecord, 'match_date' | 'match_time'>): Dayjs | null => {
  if (!match.match_date) return null

  const [startTime] = extractTimeTokens(match.match_time)
  return buildDateTime(match.match_date, startTime ?? '23:59')
}

export const getDashboardMatchEnd = (match: Pick<MatchRecord, 'match_date' | 'match_time'>): Dayjs | null => {
  if (!match.match_date) return null

  const [startTime, endTime] = extractTimeTokens(match.match_time)
  if (endTime) return buildDateTime(match.match_date, endTime)

  const start = buildDateTime(match.match_date, startTime ?? '23:59')
  if (!start) return null

  if (startTime) {
    return start.add(2, 'hour')
  }

  return start.endOf('day')
}

export const isDashboardMatchInProgress = (
  match: Pick<MatchRecord, 'match_date' | 'match_time'>,
  now: Dayjs = dayjs()
) => {
  const start = getDashboardMatchStart(match)
  const end = getDashboardMatchEnd(match)
  if (!start || !end) return false

  return (now.isAfter(start) || now.isSame(start)) && now.isBefore(end)
}

const compareByStartAsc = (a: MatchRecord, b: MatchRecord) => {
  const aStart = getDashboardMatchStart(a)?.valueOf() ?? Number.POSITIVE_INFINITY
  const bStart = getDashboardMatchStart(b)?.valueOf() ?? Number.POSITIVE_INFINITY
  return aStart - bStart
}

const compareByStartDesc = (a: MatchRecord, b: MatchRecord) => compareByStartAsc(b, a)

export const pickDashboardHeroMatch = (matches: MatchRecord[], now: Dayjs = dayjs()) => {
  const candidates = matches
    .filter((match) => {
      const end = getDashboardMatchEnd(match)
      return end ? end.valueOf() >= now.valueOf() : false
    })
    .sort(compareByStartAsc)

  const liveMatch = candidates.find((match) => isDashboardMatchInProgress(match, now))
  return liveMatch ?? candidates[0] ?? null
}

export const getDashboardUpcomingMatches = (matches: MatchRecord[], now: Dayjs = dayjs(), limit = 4) =>
  matches
    .filter((match) => {
      const end = getDashboardMatchEnd(match)
      return end ? end.valueOf() >= now.valueOf() : false
    })
    .sort(compareByStartAsc)
    .slice(0, limit)

export const getDashboardRecentMatches = (matches: MatchRecord[], now: Dayjs = dayjs(), limit = 4) =>
  matches
    .filter((match) => {
      const end = getDashboardMatchEnd(match)
      return end ? end.valueOf() < now.valueOf() : false
    })
    .sort(compareByStartDesc)
    .slice(0, limit)

export const getDashboardMatchResultMeta = (
  homeScore: number | null | undefined,
  opponentScore: number | null | undefined
): DashboardMatchResultMeta => {
  if (homeScore == null || opponentScore == null) {
    return { label: '-', tone: 'pending' }
  }

  if (homeScore > opponentScore) {
    return { label: 'W', tone: 'win' }
  }

  if (homeScore < opponentScore) {
    return { label: 'L', tone: 'lose' }
  }

  return { label: 'D', tone: 'draw' }
}

export const formatDashboardMatchMonth = (matchDate?: string | null) => {
  if (!matchDate) return ''

  const parsed = dayjs(matchDate)
  return parsed.isValid() ? MONTH_LABELS[parsed.month()] : ''
}

export const formatDashboardMatchDay = (matchDate?: string | null) => {
  if (!matchDate) return ''

  const parsed = dayjs(matchDate)
  return parsed.isValid() ? parsed.format('DD') : ''
}
