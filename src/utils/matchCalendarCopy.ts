import type { LineupEntry, MatchRecord } from '@/types/match'
import { getMatchGatherTime } from './matchPresentation'

const GOOGLE_CALENDAR_TEAM_NAME = '中港熊戰'

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

const splitListText = (value?: string | null) =>
  String(value || '')
    .split(/[、,，\n]/)
    .map((item) => collapseWhitespace(item))
    .filter(Boolean)

const formatTitleTime = (value?: string | null) =>
  collapseWhitespace(String(value || '')).replace(/\s*-\s*/g, '-')

const formatCurrencyAmount = (value?: number | null) => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) && amount > 0 ? String(amount) : ''
}

const formatLineupPlayer = (player: LineupEntry) => {
  const name = collapseWhitespace(player.name || '')
  if (!name) return ''

  const number = collapseWhitespace(String(player.number || ''))
  return number ? `${number} ${name}` : name
}

const getPlayerLines = (match: MatchRecord) => {
  const lineupPlayers = (match.lineup || [])
    .map(formatLineupPlayer)
    .filter(Boolean)

  if (lineupPlayers.length) {
    return lineupPlayers
  }

  return splitListText(match.players)
}

const getAbsentPlayerLines = (match: MatchRecord) =>
  (match.absent_players || [])
    .map((player) => {
      const name = collapseWhitespace(player.name || '')
      if (!name) return ''

      const type = collapseWhitespace(player.type || '請假')
      return `${name}（${type || '請假'}）`
    })
    .filter(Boolean)

export const formatMatchRecordGoogleCalendarSummary = (match: MatchRecord) => {
  const matchName = collapseWhitespace(match.tournament_name || match.match_name || '未命名賽事')
  const opponent = collapseWhitespace(match.opponent || '待確認')
  const time = formatTitleTime(match.match_time)

  return [match.cancelled_at ? '【已取消】' : '', matchName, `${GOOGLE_CALENDAR_TEAM_NAME} V.S ${opponent}`, time].filter(Boolean).join(' ')
}

export const formatMatchRecordForGoogleCalendar = (match: MatchRecord) => {
  const summary = formatMatchRecordGoogleCalendarSummary(match)
  const coaches = splitListText(match.coaches)
  const players = [...getPlayerLines(match), ...getAbsentPlayerLines(match)]
  const matchFeeAmount = formatCurrencyAmount(match.match_fee_amount)

  const descriptionLines = [
    ...(match.cancelled_at ? ['狀態：已取消，無須集合', `取消原因：${collapseWhitespace(match.cancellation_reason || '')}`] : []),
    `組別 / 類別：${collapseWhitespace(match.category_group || '')}`,
    `賽事等級：${collapseWhitespace(match.match_level || '')}`,
    `集合時間：${getMatchGatherTime(match)}`,
    `盃賽名稱：${collapseWhitespace(match.tournament_name || '')}`,
    '帶隊教練：',
    ...coaches,
    '',
    '參賽球員：',
    ...players
  ]

  if (matchFeeAmount) {
    descriptionLines.push(`比賽費用: ${matchFeeAmount}`)
  }

  return [
    summary,
    `日期：${collapseWhitespace(match.match_date || '')}`,
    `時間：${collapseWhitespace(match.match_time || '')}`,
    `地點：${collapseWhitespace(match.location || '')}`,
    '',
    ...descriptionLines
  ].join('\n').trim()
}
