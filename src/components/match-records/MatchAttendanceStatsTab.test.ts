// @vitest-environment jsdom
import { computed, defineComponent, h, inject, nextTick, provide, type ComputedRef, type InjectionKey } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchRecord } from '@/types/match'
import MatchAttendanceStatsTab from './MatchAttendanceStatsTab.vue'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  messageError: vi.fn()
}))

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: mocks.from
  }
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: mocks.messageError
  }
}))

const buildMatch = (overrides: Partial<MatchRecord> = {}): MatchRecord => ({
  id: overrides.id || 'match-1',
  match_name: '測試賽事',
  tournament_name: null,
  opponent: '測試對手',
  match_date: '2026-07-26',
  match_time: '08:50 - 10:10',
  location: '中港國小',
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

const tableRowsKey: InjectionKey<ComputedRef<any[]>> = Symbol('tableRows')

const ElTableStub = defineComponent({
  props: {
    data: {
      type: Array,
      default: () => []
    }
  },
  setup(props, { slots }) {
    provide(tableRowsKey, computed(() => props.data as any[]))
    return () => h('div', { 'data-testid': 'attendance-table' }, slots.default?.())
  }
})

const ElTableColumnStub = defineComponent({
  setup(_, { slots }) {
    const rows = inject(tableRowsKey, computed(() => []))
    return () => h('div', rows.value.flatMap((row) => slots.default?.({ row }) || []))
  }
})

const ElPopoverStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [
      h('div', { 'data-testid': 'popover-reference' }, slots.reference?.()),
      h('div', { 'data-testid': 'popover-content' }, slots.default?.())
    ])
  }
})

const mountTab = async () => {
  const wrapper = mount(MatchAttendanceStatsTab, {
    props: {
      matches: [
        buildMatch({
          id: 'cup-1',
          match_name: '古柏盃第一場',
          tournament_name: '古柏盃',
          opponent: '中大美洲獅',
          players: '黃煜文,王小明',
          absent_players: [{ name: '黃煜文', type: '事假' }]
        }),
        buildMatch({
          id: 'cup-2',
          match_name: '古柏盃第二場',
          tournament_name: '古柏盃',
          opponent: '三峽社區',
          match_date: '2026-07-20',
          match_time: '11:00 - 12:30',
          match_level: '二級',
          players: '黃煜文'
        })
      ]
    },
    global: {
      directives: {
        loading: () => undefined
      },
      stubs: {
        ElIcon: { template: '<span><slot /></span>' },
        ElPopover: ElPopoverStub,
        ElTable: ElTableStub,
        ElTableColumn: ElTableColumnStub
      }
    }
  })

  await flushPromises()
  await nextTick()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()

  const secondOrder = vi.fn().mockResolvedValue({
    data: [
      { name: '黃煜文', role: '校隊', team_group: '校隊', status: '在隊', jersey_number: '18' },
      { name: '王小明', role: '球員', team_group: '黑熊', status: '在隊', jersey_number: '7' }
    ],
    error: null
  })
  const firstOrder = vi.fn().mockReturnValue({ order: secondOrder })
  const select = vi.fn().mockReturnValue({ order: firstOrder })
  mocks.from.mockReturnValue({ select })
})

describe('MatchAttendanceStatsTab', () => {
  it('filters attendance rows by player name and jersey number', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as any
    const input = wrapper.find('input[aria-label="搜尋賽事出席球員姓名或背號"]')

    expect(vm.filteredAttendanceRows.map((row: any) => row.name)).toEqual(['王小明', '黃煜文'])

    await input.setValue('黃煜')
    expect(vm.filteredAttendanceRows.map((row: any) => row.name)).toEqual(['黃煜文'])
    expect(wrapper.text()).toContain('符合 1 / 2 人')

    await input.setValue('#7')
    expect(vm.filteredAttendanceRows.map((row: any) => row.name)).toEqual(['王小明'])
  })

  it('shows every called-up match with attendance status in the hover content', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as any
    const huang = vm.attendanceRows.find((row: any) => row.name === '黃煜文')

    expect(huang.calledUpMatches).toEqual([
      expect.objectContaining({ matchId: 'cup-1', opponent: '中大美洲獅', status: 'absent' }),
      expect.objectContaining({ matchId: 'cup-2', opponent: '三峽社區', status: 'attended' })
    ])
    expect(wrapper.find('[aria-label="黃煜文應出席2場，查看賽事"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('黃煜文的應出席賽事')
    expect(wrapper.text()).toContain('中大美洲獅')
    expect(wrapper.text()).toContain('三峽社區')
    expect(wrapper.text()).toContain('請假')
    expect(wrapper.text()).toContain('出席')
  })
})
