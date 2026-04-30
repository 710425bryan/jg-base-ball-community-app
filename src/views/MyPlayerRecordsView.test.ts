// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MyPlayerRecordsView from './MyPlayerRecordsView.vue'
import type { MatchRecord } from '@/types/match'

const serviceMocks = vi.hoisted(() => ({
  listMembers: vi.fn(),
  getRecords: vi.fn()
}))

vi.mock('@/services/myPlayerRecords', () => ({
  listMyPlayerRecordMembers: serviceMocks.listMembers,
  getMyPlayerMatchRecords: serviceMocks.getRecords
}))

vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ RadarChart: {} }))
vi.mock('echarts/components', () => ({
  LegendComponent: {},
  RadarComponent: {},
  TooltipComponent: {}
}))
vi.mock('vue-echarts', () => ({
  default: {
    name: 'VChart',
    props: ['option'],
    template: '<div data-test="v-chart"></div>'
  }
}))

vi.mock('@/components/match-records/MatchDetailDialog.vue', () => ({
  default: {
    name: 'MatchDetailDialog',
    props: {
      modelValue: Boolean,
      matchId: String,
      matchRecord: Object,
      readonly: Boolean
    },
    template: '<div data-test="match-detail-dialog" :data-match-id="matchId" :data-readonly="readonly ? \'true\' : \'false\'"></div>'
  }
}))

const members = [
  {
    member_id: 'all-team-member',
    name: '李小華',
    role: '球員',
    team_group: '黑熊',
    status: 'active',
    jersey_number: '8',
    avatar_url: null,
    is_linked: false
  },
  {
    member_id: 'linked-member',
    name: '王小明',
    role: '校隊',
    team_group: '校隊',
    status: 'active',
    jersey_number: '10',
    avatar_url: null,
    is_linked: true
  }
]

const buildMatch = (overrides: Partial<MatchRecord> = {}): MatchRecord => ({
  id: overrides.id || 'past-1',
  match_name: '春季聯賽',
  opponent: '台東新生',
  match_date: '2000-01-01',
  match_time: '09:00 - 11:00',
  location: '新莊棒球場',
  category_group: 'U12',
  match_level: '正式賽',
  tournament_name: '春季聯賽',
  home_score: 5,
  opponent_score: 3,
  coaches: '',
  players: '王小明',
  note: '',
  photo_url: '',
  absent_players: [],
  lineup: [],
  current_lineup: [],
  inning_logs: [],
  batting_stats: [
    { name: '王小明', number: '10', pa: 4, ab: 3, h1: 1, h2: 1, h3: 0, hr: 0, rbi: 2, r: 1, bb: 1, hbp: 0, so: 1, sb: 1 }
  ],
  pitching_stats: [
    { name: '王小明', number: '10', ip: 3, h: 1, h2: 0, h3: 0, hr: 0, r: 0, er: 0, bb: 0, so: 2, np: 15, ab: 4, go: 1, ao: 1 }
  ],
  ...overrides
})

const globalStubs = {
  'el-avatar': {
    props: ['src', 'size'],
    template: '<div data-test="avatar"><slot /></div>'
  },
  'el-icon': {
    template: '<i><slot /></i>'
  },
  'el-option': {
    props: ['label', 'value'],
    template: '<option :value="value">{{ label }}</option>'
  },
  'el-select': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<select data-test="member-select-stub" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
  },
  'el-switch': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<button type="button" data-test="switch-stub" @click="$emit(\'update:modelValue\', !modelValue)"></button>'
  },
  'el-tab-pane': {
    props: ['label', 'name'],
    template: '<section><slot /></section>'
  },
  'el-tabs': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div><slot /></div>'
  }
}

const mountView = async () => {
  const wrapper = mount(MyPlayerRecordsView, {
    global: {
      stubs: globalStubs
    }
  })

  await flushPromises()
  await nextTick()
  return wrapper
}

describe('MyPlayerRecordsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMocks.listMembers.mockResolvedValue(members)
    serviceMocks.getRecords.mockResolvedValue([buildMatch()])
  })

  it('shows an empty state when there are no viewable players', async () => {
    serviceMocks.listMembers.mockResolvedValue([])

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="empty-members"]').exists()).toBe(true)
    expect(serviceMocks.getRecords).not.toHaveBeenCalled()
  })

  it('defaults to the linked player even when all-team members are returned first', async () => {
    const wrapper = await mountView()

    expect((wrapper.vm as any).selectedMemberId).toBe('linked-member')
    expect(serviceMocks.getRecords).toHaveBeenCalledWith('linked-member')
  })

  it('allows switching to another returned player', async () => {
    const wrapper = await mountView()

    ;(wrapper.vm as any).selectedMemberId = 'all-team-member'
    await nextTick()
    await flushPromises()

    expect(serviceMocks.getRecords).toHaveBeenLastCalledWith('all-team-member')
  })

  it('opens match details in readonly mode', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-test="match-card-past-1"] button').trigger('click')
    await nextTick()

    const dialog = wrapper.find('[data-test="match-detail-dialog"]')
    expect(dialog.attributes('data-match-id')).toBe('past-1')
    expect(dialog.attributes('data-readonly')).toBe('true')
  })
})
