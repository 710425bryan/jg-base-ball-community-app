import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import type { MatchRecord } from '@/types/match'
import {
  getDashboardMatchResultMeta,
  getDashboardRecentMatches,
  getDashboardUpcomingMatches,
  isDashboardMatchInProgress,
  pickDashboardHeroMatch
} from './dashboardHome'

const createMatch = (
  id: string,
  matchDate: string,
  matchTime: string,
  homeScore = 0,
  opponentScore = 0
): MatchRecord => ({
  id,
  match_name: `比賽 ${id}`,
  opponent: `對手 ${id}`,
  match_date: matchDate,
  match_time: matchTime,
  location: '新北市球場',
  category_group: 'U12',
  match_level: '友誼賽',
  home_score: homeScore,
  opponent_score: opponentScore,
  coaches: '',
  players: '',
  note: '',
  photo_url: '',
  absent_players: [],
  lineup: [],
  inning_logs: [],
  batting_stats: []
})

describe('dashboard home helpers', () => {
  it('prioritizes an in-progress match for the hero banner', () => {
    const now = dayjs('2026-04-20T14:30:00')
    const matches = [
      createMatch('future', '2026-04-21', '09:00 - 11:00'),
      createMatch('live', '2026-04-20', '14:00 - 16:00'),
      createMatch('later', '2026-04-20', '17:00 - 18:00')
    ]

    const heroMatch = pickDashboardHeroMatch(matches, now)

    expect(heroMatch?.id).toBe('live')
    expect(isDashboardMatchInProgress(heroMatch!, now)).toBe(true)
  })

  it('falls back to the nearest upcoming match when nothing is live', () => {
    const now = dayjs('2026-04-20T08:30:00')
    const matches = [
      createMatch('tomorrow', '2026-04-21', '10:00 - 12:00'),
      createMatch('next', '2026-04-20', '09:00 - 11:00'),
      createMatch('later', '2026-04-20', '15:00 - 17:00')
    ]

    expect(pickDashboardHeroMatch(matches, now)?.id).toBe('next')
  })

  it('splits and limits upcoming and recent matches using schedule order', () => {
    const now = dayjs('2026-04-20T12:00:00')
    const matches = [
      createMatch('recent-1', '2026-04-18', '09:00 - 11:00'),
      createMatch('recent-2', '2026-04-19', '09:00 - 11:00'),
      createMatch('recent-3', '2026-04-17', '09:00 - 11:00'),
      createMatch('recent-4', '2026-04-16', '09:00 - 11:00'),
      createMatch('recent-5', '2026-04-15', '09:00 - 11:00'),
      createMatch('upcoming-1', '2026-04-20', '13:00 - 15:00'),
      createMatch('upcoming-2', '2026-04-21', '08:00 - 10:00'),
      createMatch('upcoming-3', '2026-04-22', '08:00 - 10:00'),
      createMatch('upcoming-4', '2026-04-23', '08:00 - 10:00'),
      createMatch('upcoming-5', '2026-04-24', '08:00 - 10:00')
    ]

    expect(getDashboardUpcomingMatches(matches, now).map((match) => match.id)).toEqual([
      'upcoming-1',
      'upcoming-2',
      'upcoming-3',
      'upcoming-4'
    ])

    expect(getDashboardRecentMatches(matches, now).map((match) => match.id)).toEqual([
      'recent-2',
      'recent-1',
      'recent-3',
      'recent-4'
    ])
  })

  it('maps scores to W/L/D labels', () => {
    expect(getDashboardMatchResultMeta(5, 3)).toEqual({ label: 'W', tone: 'win' })
    expect(getDashboardMatchResultMeta(2, 6)).toEqual({ label: 'L', tone: 'lose' })
    expect(getDashboardMatchResultMeta(4, 4)).toEqual({ label: 'D', tone: 'draw' })
  })
})
