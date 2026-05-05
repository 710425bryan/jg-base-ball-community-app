import { describe, expect, it } from 'vitest'
import { createEmptyMyHomeSnapshot, type MyHomeSnapshot } from '@/types/myHome'
import {
  buildMyHomeTodoItems,
  canShowMyHomeTrainingRegistrationAction,
  getSelectedMyHomeMember
} from '@/utils/myHomeSnapshot'

const buildSnapshot = (overrides: Partial<MyHomeSnapshot> = {}): MyHomeSnapshot => ({
  ...createEmptyMyHomeSnapshot(),
  ...overrides
})

describe('myHomeSnapshot utilities', () => {
  it('selects the requested linked member, or falls back to the first member', () => {
    const members = [
      { id: 'm1', name: '小安', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null },
      { id: 'm2', name: '小宇', role: '校隊', team_group: null, status: '在隊', jersey_number: '8', avatar_url: null }
    ]

    expect(getSelectedMyHomeMember(members, 'm2')?.name).toBe('小宇')
    expect(getSelectedMyHomeMember(members, 'missing')?.name).toBe('小安')
  })

  it('shows a binding todo when the account has no linked members', () => {
    const todos = buildMyHomeTodoItems(buildSnapshot())

    expect(todos).toHaveLength(1)
    expect(todos[0].key).toBe('member-binding')
  })

  it('builds payment and equipment todos for a linked member', () => {
    const todos = buildMyHomeTodoItems(buildSnapshot({
      members: [
        { id: 'm1', name: '小安', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null }
      ],
      payment_summary: {
        unpaid_count: 2,
        pending_review_count: 0,
        total_unpaid_amount: 3500,
        next_due: null
      },
      equipment_summary: {
        active_request_count: 1,
        ready_for_pickup_count: 1,
        picked_up_unpaid_count: 0,
        pending_payment_count: 0,
        unpaid_amount: 0,
        latest_request: null
      }
    }), 'm1')

    expect(todos.map((todo) => todo.key)).toContain('payment-unpaid')
    expect(todos.map((todo) => todo.key)).toContain('equipment-ready')
  })

  it('shows today leave state for the selected member only', () => {
    const todos = buildMyHomeTodoItems(buildSnapshot({
      members: [
        { id: 'm1', name: '小安', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null },
        { id: 'm2', name: '小宇', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null }
      ],
      today_leaves: [
        {
          id: 'l1',
          member_id: 'm2',
          member_name: '小宇',
          leave_type: '事假',
          start_date: '2026-04-28',
          end_date: '2026-04-28',
          reason: null
        }
      ]
    }), 'm2')

    expect(todos.some((todo) => todo.key === 'today-leave')).toBe(true)
  })

  it('shows the training registration shortcut only when the next training session is open', () => {
    const nextEvent = {
      id: 'match-1',
      type: 'match',
      title: '打擊特訓課',
      date: '2026-05-06',
      time: '09:00',
      location: '中港國小',
      opponent: null,
      category_group: null,
      match_level: '特訓課',
      coaches: null,
      players: null,
      route: '/match-records?match_id=match-1'
    } as const

    expect(canShowMyHomeTrainingRegistrationAction(nextEvent, [
      { match_id: 'match-1', is_registration_open: true }
    ])).toBe(true)

    expect(canShowMyHomeTrainingRegistrationAction(nextEvent, [
      { match_id: 'match-1', is_registration_open: false }
    ])).toBe(false)

    expect(canShowMyHomeTrainingRegistrationAction({
      ...nextEvent,
      match_level: '正式賽'
    }, [
      { match_id: 'match-1', is_registration_open: true }
    ])).toBe(false)
  })
})
