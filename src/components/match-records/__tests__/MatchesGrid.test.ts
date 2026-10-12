// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { MatchRecord } from '@/types/match'
import MatchesGrid from '../MatchesGrid.vue'

const makeMatch = (overrides: Partial<MatchRecord>): MatchRecord => ({
  id: 'match-1',
  match_name: '測試賽',
  opponent: '測試對手',
  match_date: '2020-01-01',
  match_time: '10:00 - 12:00',
  location: '測試球場',
  category_group: 'U12',
  match_level: '友誼賽',
  tournament_name: null,
  home_score: 0,
  opponent_score: 0,
  coaches: '',
  players: '',
  absent_players: [],
  lineup: [],
  inning_logs: [],
  batting_stats: [],
  ...overrides
})

const mountGrid = (matches: MatchRecord[]) => mount(MatchesGrid, {
  props: {
    matches,
    canEdit: false,
    canDelete: false
  },
  global: {
    stubs: {
      ElIcon: { template: '<span><slot /></span>' },
      ElDropdown: { template: '<div><slot /><slot name="dropdown" /></div>' },
      ElDropdownMenu: { template: '<div><slot /></div>' },
      ElDropdownItem: { template: '<div><slot /></div>' }
    }
  }
})

describe('MatchesGrid result presentation', () => {
  it('pairs clear Chinese result labels with the correct historical scores', () => {
    const wrapper = mountGrid([
      makeMatch({ id: 'win', match_name: '勝場紀錄', home_score: 5, opponent_score: 3 }),
      makeMatch({ id: 'loss', match_name: '敗場紀錄', home_score: 2, opponent_score: 4 }),
      makeMatch({ id: 'draw', match_name: '平手紀錄', home_score: 6, opponent_score: 6 })
    ])

    for (const [name, result, homeScore, opponentScore] of [
      ['勝場紀錄', '勝利', '5', '3'],
      ['敗場紀錄', '敗場', '2', '4'],
      ['平手紀錄', '平手', '6', '6']
    ]) {
      const card = wrapper.get(`article[aria-label="${name}"]`)
      expect(card.get('[data-testid="match-result"]').text()).toBe(result)
      expect(card.get('[data-testid="home-score"]').text()).toBe(homeScore)
      expect(card.get('[data-testid="opponent-score"]').text()).toBe(opponentScore)
    }
  })

  it('does not present a future score as a played result', () => {
    const wrapper = mountGrid([makeMatch({ match_date: '2099-01-01', home_score: 5, opponent_score: 3 })])
    expect(wrapper.get('[data-testid="match-result"]').text()).toBe('未賽')
    expect(wrapper.find('[data-testid="home-score"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="opponent-score"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('中港熊戰')
    expect(wrapper.text()).toContain('測試對手')
  })

  it('replaces the result with cancellation and keeps the original schedule visible', () => {
    const wrapper = mountGrid([makeMatch({
      home_score: 5,
      opponent_score: 3,
      note: '集合時間：09:30',
      cancelled_at: '2020-01-01T00:00:00Z',
      cancellation_reason: '場地積水'
    })])
    expect(wrapper.get('[data-testid="match-result"]').text()).toBe('已取消')
    expect(wrapper.text()).toContain('無須集合')
    expect(wrapper.text()).toContain('場地積水')
    expect(wrapper.get('[data-testid="gather-time"]').text()).toBe('原集合時間09:30')
    expect(wrapper.get('[data-testid="match-time"]').text()).toBe('原比賽時間10:00 - 12:00')
    expect(wrapper.find('[data-testid="home-score"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="opponent-score"]').exists()).toBe(false)
    expect(wrapper.find('a[aria-label^="導航"]').exists()).toBe(false)
  })
})
