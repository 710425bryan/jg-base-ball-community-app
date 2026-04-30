import { describe, expect, it } from 'vitest'
import {
  aggregateTournamentBattingStats,
  aggregateTournamentPitchingStats,
  calculateMatchAttendanceStats,
  filterMatchesByTournament,
  getTournamentPlayerBattingGameRows,
  getTournamentPlayerPitchingGameRows,
  getTournamentNames
} from './matchRecordStats'
import type { MatchRecord } from '@/types/match'

const buildMatch = (overrides: Partial<MatchRecord> = {}): MatchRecord => ({
  id: overrides.id || 'match-1',
  match_name: '測試賽',
  tournament_name: null,
  opponent: '對手',
  match_date: '2026-04-01',
  match_time: '08:00 - 09:30',
  location: '',
  category_group: 'U12',
  match_level: '一級',
  home_score: 0,
  opponent_score: 0,
  coaches: '',
  players: '',
  note: '',
  photo_url: '',
  absent_players: [],
  lineup: [],
  inning_logs: [],
  batting_stats: [],
  pitching_stats: [],
  ...overrides
})

describe('matchRecordStats', () => {
  it('lists and filters stat groups by tournament_name with match_name fallback', () => {
    const matches = [
      buildMatch({ id: 'a', match_name: '春季聯賽 Game 1', tournament_name: '春季聯賽' }),
      buildMatch({ id: 'b', match_name: '秋季聯賽' }),
      buildMatch({ id: 'c', match_name: '' })
    ]

    expect(getTournamentNames(matches)).toEqual(['秋季聯賽', '春季聯賽'])
    expect(filterMatchesByTournament(matches, '春季聯賽').map((match) => match.id)).toEqual(['a'])
  })

  it('aggregates batting totals and rate stats including legacy H fields', () => {
    const rows = aggregateTournamentBattingStats([
      buildMatch({
        id: 'bat-1',
        batting_stats: [
          { name: '王小明', pa: 4, ab: 3, h1: 1, h2: 1, h3: 0, hr: 0, rbi: 2, r: 1, bb: 1, hbp: 0, so: 0, sb: 1 }
        ]
      }),
      buildMatch({
        id: 'bat-2',
        batting_stats: [
          { name: '王小明', pa: 2, ab: 2, h: 2, h1: 0, h2: 0, h3: 0, hr: 0, rbi: 1, r: 1, bb: 0, hbp: 0, so: 1, sb: 0 } as any
        ]
      })
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: '王小明',
      pa: 6,
      ab: 5,
      h: 4,
      h1: 3,
      h2: 1,
      rbi: 3,
      r: 2,
      bb: 1,
      so: 1,
      sb: 1
    })
    expect(rows[0].avg).toBeCloseTo(0.8)
    expect(rows[0].obp).toBeCloseTo(5 / 6)
    expect(rows[0].slg).toBeCloseTo(1)
    expect(rows[0].ops).toBeCloseTo(1 + 5 / 6)
  })

  it('aggregates pitching totals and derived stats', () => {
    const rows = aggregateTournamentPitchingStats([
      buildMatch({
        id: 'pitch-1',
        pitching_stats: [
          { name: '李投手', ip: 6, h: 2, h2: 1, h3: 0, hr: 1, r: 2, er: 1, bb: 1, so: 3, np: 30, ab: 8, go: 4, ao: 2 }
        ]
      }),
      buildMatch({
        id: 'pitch-2',
        pitching_stats: [
          { name: '李投手', ip: 3, h: 1, h2: 0, h3: 0, hr: 0, r: 0, er: 0, bb: 0, so: 1, np: 15, ab: 4, go: 1, ao: 0 }
        ]
      })
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: '李投手',
      ip_outs: 9,
      formattedIP: '3.0',
      h: 3,
      h2: 1,
      hr: 1,
      r: 2,
      er: 1,
      bb: 1,
      so: 4,
      np: 45,
      ab: 12,
      go: 5,
      ao: 2,
      hasDetailed: true,
      era: '2.33',
      go_ao: '2.50'
    })
    expect(rows[0].baa).toBeCloseTo(0.25)
    expect(rows[0].slga).toBeCloseTo(7 / 12)
  })

  it('calculates attendance from match player and absent lists with roster metadata fallback', () => {
    const rows = calculateMatchAttendanceStats([
      buildMatch({
        id: 'att-1',
        match_level: '一級',
        players: '王小明,李小華',
        absent_players: [{ name: '陳新生', type: '事假' }]
      }),
      buildMatch({
        id: 'att-2',
        match_level: '二級',
        players: '王小明',
        absent_players: [{ name: '李小華', type: '病假' }]
      })
    ], [
      { name: '王小明', jersey_number: '10', team_group: '黑熊(中組)' },
      { name: '李小華', jersey_number: '12', team_group: '校隊' }
    ])

    const amy = rows.find((row) => row.name === '王小明')
    const bob = rows.find((row) => row.name === '李小華')
    const missingRoster = rows.find((row) => row.name === '陳新生')

    expect(amy).toMatchObject({ number: '10', category: '黑熊(中組)', calledUp: 2, attended: 2, absentTotal: 0, attendanceRate: 100 })
    expect(bob).toMatchObject({ number: '12', category: '校隊', calledUp: 2, attended: 1, absentTotal: 1, absentLevel2: 1, attendanceRate: 50 })
    expect(missingRoster).toMatchObject({ number: '', category: '', calledUp: 1, attended: 0, absentTotal: 1, absentLevel1: 1, attendanceRate: 0 })
  })

  it('builds per-game batting and pitching detail rows for one tournament player', () => {
    const matches = [
      buildMatch({
        id: 'detail-1',
        opponent: '台東新生',
        match_date: '2026-04-22',
        home_score: 6,
        opponent_score: 7,
        batting_stats: [
          { name: '鍾韋橙', pa: 3, ab: 2, h1: 1, h2: 0, h3: 0, hr: 0, rbi: 0, r: 0, bb: 1, hbp: 0, so: 0, sb: 0 }
        ],
        pitching_stats: []
      }),
      buildMatch({
        id: 'detail-2',
        opponent: '基隆晉級隊',
        match_date: '2026-04-23',
        home_score: 12,
        opponent_score: 0,
        batting_stats: [
          { name: '鍾韋橙', pa: 4, ab: 4, h1: 2, h2: 0, h3: 0, hr: 0, rbi: 1, r: 0, bb: 0, hbp: 0, so: 0, sb: 2 }
        ],
        pitching_stats: [
          { name: '鍾韋橙', ip: 4, h: 0, h2: 0, h3: 0, hr: 0, r: 0, er: 0, bb: 0, so: 2, np: 18, ab: 5, go: 1, ao: 2 }
        ]
      })
    ]

    const battingRows = getTournamentPlayerBattingGameRows(matches, '鍾韋橙')
    const pitchingRows = getTournamentPlayerPitchingGameRows(matches, '鍾韋橙')

    expect(battingRows).toHaveLength(2)
    expect(battingRows[0]).toMatchObject({
      matchId: 'detail-1',
      match_date: '2026-04-22',
      opponent: '台東新生',
      result: '敗 6-7',
      pa: 3,
      ab: 2,
      h: 1,
      bb: 1
    })
    expect(battingRows[0].avg).toBeCloseTo(0.5)
    expect(battingRows[0].obp).toBeCloseTo(2 / 3)

    expect(pitchingRows).toHaveLength(1)
    expect(pitchingRows[0]).toMatchObject({
      matchId: 'detail-2',
      match_date: '2026-04-23',
      opponent: '基隆晉級隊',
      result: '勝 12-0',
      formattedIP: '1.1',
      ab: 5,
      so: 2,
      era: '0.00'
    })
  })
})
