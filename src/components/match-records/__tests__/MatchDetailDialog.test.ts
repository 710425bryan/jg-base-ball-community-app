// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchDetailDialog from '../MatchDetailDialog.vue'
import type { MatchRecord } from '@/types/match'
import { getMatchLeaveAbsences } from '@/services/matchLeaveAbsences'

const mocks = vi.hoisted(() => ({
  deleteMatch: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
  success: vi.fn()
}))

vi.mock('@/components/match-records/VisualField.vue', () => ({
  default: { template: '<div data-testid="visual-field-stub" />' }
}))

vi.mock('@/stores/matches', () => ({
  useMatchesStore: () => ({
    matches: [],
    loading: false,
    fetchMatch: vi.fn(),
    deleteMatch: mocks.deleteMatch
  })
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: mocks.error,
    success: mocks.success
  },
  ElMessageBox: {
    confirm: mocks.confirm
  }
}))

vi.mock('@/services/matchLeaveAbsences', () => ({
  getMatchLeaveAbsences: vi.fn(async () => [])
}))

const baseMatch: MatchRecord = {
  id: 'match-1',
  match_name: '測試盃',
  opponent: '測試國小',
  match_date: '2099-06-28',
  match_time: '13:00 - 15:00',
  location: '測試球場',
  home_score: 0,
  opponent_score: 0,
  coaches: '張教練',
  players: '王小明,李小華',
  absent_players: [],
  note: '[Google Calendar 同步]\n集合時間: 13:00',
  lineup: [],
  current_lineup: [],
  inning_logs: [],
  batting_stats: [],
  pitching_stats: []
}

const mountDialog = async (matchRecord: MatchRecord = baseMatch) => {
  const wrapper = mount(MatchDetailDialog, {
    props: {
      modelValue: true,
      matchId: matchRecord.id,
      matchRecord
    },
    global: {
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: '<div v-if="modelValue"><slot /></div>'
        },
        ElIcon: { template: '<span><slot /></span>' },
        ElTable: {
          inheritAttrs: false,
          props: ['data'],
          template: '<div v-bind="$attrs" data-horizontal-scroll-owner><slot /><slot name="append" /></div>'
        },
        ElTableColumn: true,
        ElTimeline: { template: '<div><slot /></div>' },
        ElTimelineItem: { template: '<div><slot /></div>' },
        VisualField: true
      }
    }
  })

  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMatchLeaveAbsences).mockReset()
  vi.mocked(getMatchLeaveAbsences).mockResolvedValue([])
})

describe('MatchDetailDialog leave request absence display', () => {
  it('shows manual absences, latest leave request absences, and match notes', async () => {
    vi.mocked(getMatchLeaveAbsences).mockResolvedValueOnce([
      {
        name: '王小明',
        type: '事假',
        source: 'leave_request',
        member_id: 'member-1',
        leave_request_ids: ['leave-1'],
        start_date: '2099-06-28',
        end_date: '2099-06-28'
      }
    ])

    const wrapper = await mountDialog({
      ...baseMatch,
      absent_players: [
        { name: '手動球員', type: '病假' },
        {
          name: '舊假單球員',
          type: '事假',
          source: 'leave_request',
          member_id: 'member-old',
          leave_request_ids: ['leave-old']
        }
      ]
    })

    const text = wrapper.text()

    expect(getMatchLeaveAbsences).toHaveBeenCalledWith('match-1')
    expect(text).toContain('手動球員')
    expect(text).toContain('王小明')
    expect(text).toContain('假單同步')
    expect(text).toContain('集合時間: 13:00')
    expect(text).not.toContain('舊假單球員')
  })

  it('refreshes leave request absences for historical matches', async () => {
    vi.mocked(getMatchLeaveAbsences).mockResolvedValueOnce([
      {
        name: '黃煜文',
        type: '事假',
        source: 'leave_request',
        member_id: 'member-huang',
        leave_request_ids: ['leave-historical'],
        start_date: '2026-07-26',
        end_date: '2026-07-26',
        leave_time_segment: 'full_day'
      }
    ])

    const wrapper = await mountDialog({
      ...baseMatch,
      id: 'historical-match',
      match_name: '古柏盃',
      match_date: '2026-07-26',
      match_time: '08:50 - 10:10',
      players: '黃煜文,王小明'
    })

    expect(getMatchLeaveAbsences).toHaveBeenCalledWith('historical-match')
    expect(wrapper.text()).toContain('黃煜文')
    expect(wrapper.text()).toContain('假單同步・全日')
  })

  it('shows the database reason when fee payment history blocks match deletion', async () => {
    mocks.confirm.mockResolvedValue(undefined)
    mocks.deleteMatch.mockRejectedValue(new Error('此比賽仍有待確認或已付款的費用'))
    const wrapper = await mountDialog()

    await wrapper.get('[title="刪除紀錄"]').trigger('click')
    await flushPromises()

    expect(mocks.deleteMatch).toHaveBeenCalledWith('match-1')
    expect(mocks.error).toHaveBeenCalledWith('此比賽仍有待確認或已付款的費用')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('MatchDetailDialog team stats layout', () => {
  const statsMatch: MatchRecord = {
    ...baseMatch,
    batting_stats: [
      {
        name: '王小明',
        number: '10',
        pa: 3,
        ab: 3,
        h1: 1,
        h2: 1,
        h3: 0,
        hr: 0,
        rbi: 1,
        r: 1,
        bb: 0,
        hbp: 0,
        so: 0,
        sb: 1
      }
    ],
    pitching_stats: [
      {
        name: '李小華',
        number: '18',
        ip: 9,
        ab: 10,
        h: 2,
        h2: 1,
        h3: 0,
        hr: 0,
        r: 1,
        er: 1,
        bb: 1,
        so: 4,
        np: 42,
        go: 3,
        ao: 2
      }
    ]
  }

  it('places both team stats boards in a full-width section after the desktop grid', async () => {
    const wrapper = await mountDialog(statsMatch)
    const mainGrid = wrapper.get('[data-testid="match-detail-main-grid"]')
    const statsSections = wrapper.get('[data-testid="team-stats-sections"]')

    expect(statsSections.classes()).toContain('w-full')
    expect(statsSections.element.parentElement).toBe(mainGrid.element.parentElement)
    expect(statsSections.element.previousElementSibling).toBe(mainGrid.element)
    expect(statsSections.findAll('.team-stats-board')).toHaveLength(2)
    statsSections.findAll('.team-stats-board').forEach((board) => {
      expect(board.classes()).toContain('w-full')
    })
  })

  it('keeps the score board in normal document flow while scrolling', async () => {
    const wrapper = await mountDialog()
    const scoreBoard = wrapper.get('[data-testid="match-score-board"]')

    expect(scoreBoard.classes()).not.toContain('sticky')
    expect(scoreBoard.classes()).not.toContain('fixed')
    expect(scoreBoard.classes().some((className) => className.startsWith('top-') || className.includes(':top-'))).toBe(false)
  })

  it.each(['batting', 'pitching'])('uses only the Element Plus scroll surface for %s stats', async (statsType) => {
    const wrapper = await mountDialog(statsMatch)
    const board = wrapper.get(`[data-testid="${statsType}-stats-board"]`)
    const table = board.get(`[data-testid="${statsType}-stats-table"]`)
    const summary = board.get(`[data-testid="${statsType}-stats-summary"]`)

    expect(board.findAll('[data-horizontal-scroll-owner]')).toHaveLength(1)
    expect(board.findAll('.overflow-x-auto')).toHaveLength(0)
    expect(table.classes().some((className) => className.startsWith('min-w-['))).toBe(false)
    expect(table.element.contains(summary.element)).toBe(true)
  })
})
