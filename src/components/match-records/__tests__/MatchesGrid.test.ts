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
      ElButton: { template: '<button type="button"><slot /></button>' },
      ElIcon: { template: '<span><slot /></span>' },
      ElTooltip: { template: '<span><slot /></span>' }
    }
  }
})

describe('MatchesGrid result badges', () => {
  it('shows emoji with win, loss, and draw result labels', () => {
    const wrapper = mountGrid([
      makeMatch({ id: 'win', home_score: 5, opponent_score: 3 }),
      makeMatch({ id: 'loss', home_score: 2, opponent_score: 4 }),
      makeMatch({ id: 'draw', home_score: 6, opponent_score: 6 })
    ])

    expect(wrapper.text()).toContain('🏆W')
    expect(wrapper.text()).toContain('💔L')
    expect(wrapper.text()).toContain('🤝T')
  })
})
