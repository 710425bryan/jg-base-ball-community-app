// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { RouterLinkStub, mount } from '@vue/test-utils'
import MyHomeTodayPanel from './MyHomeTodayPanel.vue'
import { createEmptyMyHomeSnapshot, type MyHomeSnapshot } from '@/types/myHome'

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn()
    })
  }
})

const buildSnapshot = (matchLevel: string | null): MyHomeSnapshot => ({
  ...createEmptyMyHomeSnapshot(),
  members: [
    {
      id: 'member-1',
      name: '測試球員',
      role: '球員',
      team_group: null,
      status: '在隊',
      jersey_number: null,
      avatar_url: null,
      point_balance: 3,
      reserved_training_points: 0,
      available_training_points: 3
    }
  ],
  next_event: {
    id: 'match-1',
    type: 'match',
    title: '週末特訓課',
    date: '2026-05-09',
    time: '09:00 - 12:00',
    location: '中港球場',
    opponent: null,
    category_group: 'U12',
    match_level: matchLevel,
    coaches: null,
    players: null,
    route: '/calendar?match_id=match-1'
  }
})

const mountPanel = (snapshot: MyHomeSnapshot) => mount(MyHomeTodayPanel, {
  props: {
    snapshot,
    selectedMemberId: 'member-1'
  },
  global: {
    stubs: {
      RouterLink: RouterLinkStub,
      'el-icon': true,
      'el-option': true,
      'el-select': true
    }
  }
})

describe('MyHomeTodayPanel', () => {
  it('links to training registration when Next Up is a training class', () => {
    const wrapper = mountPanel(buildSnapshot('特訓課'))

    expect(wrapper.text()).toContain('特訓報名')
    expect(wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to') === '/training')).toBe(true)
  })

  it('hides the training registration link for regular matches', () => {
    const wrapper = mountPanel(buildSnapshot('友誼賽'))

    expect(wrapper.text()).not.toContain('特訓報名')
    expect(wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to') === '/training')).toBe(false)
  })
})
