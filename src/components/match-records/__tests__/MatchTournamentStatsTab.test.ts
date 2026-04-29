// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import type { MatchRecord } from '@/types/match'
import MatchTournamentStatsTab from '../MatchTournamentStatsTab.vue'

const buildMatch = (overrides: Partial<MatchRecord> = {}): MatchRecord => ({
  id: 'match-1',
  match_name: '測試賽',
  tournament_name: '春季聯賽',
  opponent: '測試對手',
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
  batting_stats: [
    { name: '王小明', pa: 3, ab: 3, h1: 1, h2: 0, h3: 0, hr: 0, rbi: 1, r: 1, bb: 0, hbp: 0, so: 0, sb: 0 }
  ],
  pitching_stats: [],
  ...overrides
})

const mountTab = (matches = [buildMatch()]) => mount(MatchTournamentStatsTab, {
  props: {
    matches
  },
  global: {
    stubs: {
      ElDialog: true,
      ElIcon: { template: '<span><slot /></span>' },
      ElOption: { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
      ElSelect: {
        props: ['modelValue'],
        emits: ['update:modelValue'],
        template: `
          <select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
            <slot />
          </select>
        `
      },
      ElTable: true,
      ElTableColumn: true
    }
  }
})

describe('MatchTournamentStatsTab', () => {
  it('does not auto-select a tournament when options exist', () => {
    const wrapper = mountTab([
      buildMatch({ id: 'spring', tournament_name: '春季聯賽' }),
      buildMatch({ id: 'autumn', tournament_name: '秋季聯賽' })
    ])
    const vm = wrapper.vm as any

    expect(vm.tournamentOptions).toEqual(['秋季聯賽', '春季聯賽'])
    expect(vm.selectedTournament).toBe('')
    expect(vm.tournamentMatches).toEqual([])
    expect(wrapper.text()).toContain('請先選擇賽事名稱')
  })

  it('clears the selected tournament when it is no longer available', async () => {
    const wrapper = mountTab([
      buildMatch({ id: 'spring', tournament_name: '春季聯賽' }),
      buildMatch({ id: 'autumn', tournament_name: '秋季聯賽' })
    ])
    const vm = wrapper.vm as any

    vm.selectedTournament = '春季聯賽'
    await nextTick()

    expect(vm.tournamentMatches.map((match: MatchRecord) => match.id)).toEqual(['spring'])

    await wrapper.setProps({
      matches: [
        buildMatch({ id: 'autumn', tournament_name: '秋季聯賽' })
      ]
    })

    expect(vm.selectedTournament).toBe('')
    expect(vm.tournamentMatches).toEqual([])
  })
})
