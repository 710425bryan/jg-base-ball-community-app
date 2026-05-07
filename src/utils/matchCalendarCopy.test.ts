import { describe, expect, it } from 'vitest'
import type { MatchRecord } from '@/types/match'
import {
  formatMatchRecordForGoogleCalendar,
  formatMatchRecordGoogleCalendarSummary
} from './matchCalendarCopy'

const makeMatch = (overrides: Partial<MatchRecord> = {}): MatchRecord => ({
  id: 'match-1',
  match_name: '就是棒春季聯賽',
  opponent: '華興小學',
  match_date: '2026-03-28',
  match_time: '08:00 - 09:30',
  location: '迪化壘球場, 103台灣臺北市大同區延平北路四段179號',
  category_group: 'U12',
  match_level: '一級',
  tournament_name: '就是棒春季聯賽',
  match_fee_amount: 250,
  home_score: 0,
  opponent_score: 0,
  coaches: '張教練、王教練',
  players: '尤丞洋,楊晴恩',
  absent_players: [{ name: '謝準', type: '請假' }],
  lineup: [
    { order: 1, position: '未排', name: '尤丞洋', number: '15' },
    { order: 2, position: '未排', name: '楊晴恩', number: '2' }
  ],
  inning_logs: [],
  batting_stats: [],
  note: '[Google Calendar 同步]\n集合時間: 12:00\n原始標題: 1️⃣0️⃣就是棒春季聯賽 中港國小 V.S 華興小學 08:00-09:30',
  ...overrides
})

describe('matchCalendarCopy', () => {
  it('formats the summary like the Google Calendar match title', () => {
    expect(formatMatchRecordGoogleCalendarSummary(makeMatch())).toBe(
      '就是棒春季聯賽 中港國小 V.S 華興小學 08:00-09:30'
    )
  })

  it('copies match data with Google Calendar description labels', () => {
    expect(formatMatchRecordForGoogleCalendar(makeMatch())).toBe([
      '就是棒春季聯賽 中港國小 V.S 華興小學 08:00-09:30',
      '日期：2026-03-28',
      '時間：08:00 - 09:30',
      '地點：迪化壘球場, 103台灣臺北市大同區延平北路四段179號',
      '',
      '組別 / 類別：U12',
      '賽事等級：一級',
      '集合時間：12:00',
      '盃賽名稱：就是棒春季聯賽',
      '帶隊教練：',
      '張教練',
      '王教練',
      '',
      '參賽球員：',
      '15 尤丞洋',
      '2 楊晴恩',
      '謝準（請假）',
      '比賽費用: 250'
    ].join('\n'))
  })

  it('falls back to comma-separated players when lineup is empty', () => {
    const text = formatMatchRecordForGoogleCalendar(makeMatch({
      lineup: [],
      players: '尤丞洋,楊晴恩'
    }))

    expect(text).toContain('參賽球員：\n尤丞洋\n楊晴恩')
  })
})
