// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchDetailDialog from '../MatchDetailDialog.vue'
import type { MatchRecord } from '@/types/match'
import { getMatchLeaveAbsences } from '@/services/matchLeaveAbsences'

vi.mock('@/components/match-records/VisualField.vue', () => ({
  default: { template: '<div data-testid="visual-field-stub" />' }
}))

vi.mock('@/stores/matches', () => ({
  useMatchesStore: () => ({
    matches: [],
    loading: false,
    fetchMatch: vi.fn(),
    deleteMatch: vi.fn()
  })
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
        ElTable: true,
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
})
