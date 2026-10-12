// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MatchesGrid from './MatchesGrid.vue'
import MatchCard from './MatchCard.vue'
import type { MatchRecord } from '@/types/match'

const source = readFileSync('src/components/match-records/MatchesGrid.vue', 'utf8')

describe('MatchesGrid month headings', () => {
  it('keeps desktop month headings below the toolbar and mobile headings at the scroll top', () => {
    const monthHeading = source.match(/<div class="([^"]+)"[^>]*>\s*<h2[^>]*>\{\{ group\.month \}\}/)?.[1] || ''

    expect(monthHeading).toContain('-mx-4')
    expect(monthHeading).toContain('match-month-heading')
    expect(monthHeading).toContain('sticky')
    expect(monthHeading).toContain('z-10')
    expect(monthHeading).not.toContain('top-0')
    expect(source).toContain('top: var(--match-records-sticky-offset, 0px);')
    expect(source).toMatch(/\.match-month-heading\s*\{\s*top: 0;/)
    expect(source).toMatch(/@media \(min-width: 768px\)\s*\{\s*\.match-month-heading/)
  })
})

describe('MatchesGrid card composition', () => {
  const makeMatch = (id: string, match_date: string, match_time: string) => ({ id, match_date, match_time, match_name: id }) as MatchRecord

  it('preserves month grouping, ascending schedule and undated items last', () => {
    const wrapper = mount(MatchesGrid, {
      props: {
        sortDirection: 'asc',
        matches: [makeMatch('late', '2099-06-28', '15:00'), makeMatch('unknown', '', ''), makeMatch('july', '2099-07-01', ''), makeMatch('early', '2099-06-28', '08:00')]
      },
      global: { stubs: { MatchCard: true } }
    })
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual(['2099 年 6 月', '2099 年 7 月', '未設定日期'])
    expect(wrapper.findAllComponents(MatchCard).map((card) => card.props('match').id)).toEqual(['early', 'late', 'july', 'unknown'])
  })

  it('passes permission and notification state and forwards every card action', () => {
    const wrapper = mount(MatchesGrid, {
      props: { matches: [makeMatch('match-1', '2099-06-28', '08:00')], canEdit: false, canDelete: false, canNotify: true, notifyingMatchId: 'match-1' },
      global: { stubs: { MatchCard: true } }
    })
    const card = wrapper.getComponent(MatchCard)
    expect(card.props()).toMatchObject({ canEdit: false, canDelete: false, canNotify: true, notifyingMatchId: 'match-1' })
    for (const action of ['view', 'edit', 'delete', 'notify', 'cancel', 'restore']) {
      card.vm.$emit(action, 'match-1')
      expect(wrapper.emitted(action)).toEqual([['match-1']])
    }
  })
})
