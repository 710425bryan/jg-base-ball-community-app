import { describe, expect, it } from 'vitest'
import {
  buildMatchReminderBody,
  buildMatchReminderEventKey,
  buildMatchReminderUrl,
  extractMatchGatherTime,
  getTomorrowDateInTaipei
} from './matchReminderNotification'
import type { MatchRecord } from '@/types/match'

const buildMatch = (overrides: Partial<MatchRecord> = {}): MatchRecord => ({
  id: 'match-1',
  google_calendar_event_id: 'calendar-1',
  match_name: '春季聯賽 U12',
  tournament_name: '春季聯賽',
  opponent: '華興小學',
  match_date: '2026-05-02',
  match_time: '08:00 - 09:30',
  location: '迪化壘球場',
  category_group: 'U12',
  match_level: '一級',
  home_score: 0,
  opponent_score: 0,
  coaches: '張教練,王教練',
  players: '尤丞洋,楊晴恩',
  note: '[Google Calendar 同步]\n集合時間: 07:20',
  photo_url: '',
  absent_players: [],
  lineup: [],
  inning_logs: [],
  batting_stats: [],
  pitching_stats: [],
  ...overrides
})

describe('matchReminderNotification', () => {
  it('calculates tomorrow using Asia/Taipei timezone', () => {
    expect(getTomorrowDateInTaipei(new Date('2026-04-26T15:59:00.000Z'))).toBe('2026-04-27')
    expect(getTomorrowDateInTaipei(new Date('2026-04-26T16:00:00.000Z'))).toBe('2026-04-28')
  })

  it('builds a complete match reminder body', () => {
    expect(buildMatchReminderBody(buildMatch())).toBe([
      '賽事名稱：春季聯賽 U12',
      '盃賽名稱：春季聯賽',
      '對手隊伍：華興小學',
      '日期：2026-05-02',
      '時間：08:00 - 09:30',
      '集合時間：07:20',
      '地點：迪化壘球場',
      '教練：張教練,王教練',
      '球員：尤丞洋,楊晴恩'
    ].join('\n'))
  })

  it('parses gather time and falls back when it is missing', () => {
    expect(extractMatchGatherTime('集合時間： 12:30\n原始標題: 測試')).toBe('12:30')
    expect(extractMatchGatherTime('沒有集合時間')).toBe('未填寫')
  })

  it('builds stable event keys and target urls', () => {
    const match = buildMatch()

    expect(buildMatchReminderEventKey(match)).toBe('match_reminder:match-1:2026-05-02')
    expect(buildMatchReminderUrl(match)).toBe('/calendar?match_id=match-1')
  })
})
