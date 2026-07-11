import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { createEmptyMyHomeSnapshot, type MyHomeSnapshot } from '@/types/myHome'
import {
  buildMyHomeTodoItems,
  canShowMyHomeTrainingRegistrationAction,
  getSelectedMyHomeMember,
  isMyHomeMemberInEventPlayers,
  isMyHomeNextEventExpired,
  normalizeMyHomeNextEvent
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

  it('builds match fee todos that route to the unified payment page', () => {
    const todos = buildMyHomeTodoItems(buildSnapshot({
      members: [
        { id: 'm1', name: '小安', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null }
      ],
      match_fee_summary: {
        unpaid_count: 2,
        pending_review_count: 0,
        unpaid_amount: 1600
      }
    }), 'm1')

    expect(todos).toContainEqual(expect.objectContaining({
      key: 'match-fee-payment',
      route: '/my-payments'
    }))
  })

  it('shows the next event todo only when the selected member is in the event player list', () => {
    const snapshot = buildSnapshot({
      members: [
        { id: 'm1', name: '小安', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null },
        { id: 'm2', name: '小宇', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null }
      ],
      next_event: {
        id: 'match-1',
        type: 'match',
        title: '週末盃賽',
        date: '2026-05-09',
        time: '09:00',
        location: null,
        opponent: null,
        category_group: null,
        match_level: '正式賽',
        coaches: null,
        players: '小宇',
        route: '/calendar?match_id=match-1'
      }
    })

    expect(buildMyHomeTodoItems(snapshot, 'm1', '2026-05-01').some((todo) => todo.key === 'next-event')).toBe(false)
    expect(buildMyHomeTodoItems(snapshot, 'm2', '2026-05-01').some((todo) => todo.key === 'next-event')).toBe(true)
  })

  it('matches event players by jersey number when the roster entry includes a number', () => {
    const member = { id: 'm1', name: '小安', role: '球員', team_group: null, status: '在隊', jersey_number: '8', avatar_url: null }
    const event = {
      id: 'match-1',
      type: 'match',
      title: '週末盃賽',
      date: '2026-05-09',
      time: '09:00',
      location: null,
      opponent: null,
      category_group: null,
      match_level: '正式賽',
      coaches: null,
      players: '#8 小宇',
      route: '/calendar?match_id=match-1'
    } as const

    expect(isMyHomeMemberInEventPlayers(event, member)).toBe(true)
  })

  it('shows leave action only when today or tomorrow has a relevant training or rostered event', () => {
    const snapshot = buildSnapshot({
      members: [
        { id: 'm1', name: '小安', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null }
      ]
    })

    expect(buildMyHomeTodoItems(snapshot, 'm1', '2026-05-01').some((todo) => todo.key === 'leave-action')).toBe(false)

    expect(buildMyHomeTodoItems({
      ...snapshot,
      training_month_dates: [
        { date: '2026-05-02', weekday: '週六', label: '5/2 週六', is_today: false, is_past: false }
      ]
    }, 'm1', '2026-05-01').some((todo) => todo.key === 'leave-action')).toBe(true)

    expect(buildMyHomeTodoItems({
      ...snapshot,
      next_event: {
        id: 'match-1',
        type: 'match',
        title: '週末盃賽',
        date: '2026-05-02',
        time: '09:00',
        location: null,
        opponent: null,
        category_group: null,
        match_level: '正式賽',
        coaches: null,
        players: '小安',
        route: '/calendar?match_id=match-1'
      }
    }, 'm1', '2026-05-01').some((todo) => todo.key === 'leave-action')).toBe(true)
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

  it('normalizes Next Up to the calendar schedule route', () => {
    expect(normalizeMyHomeNextEvent({
      id: 'match-1',
      type: 'match',
      title: 'Morning game',
      date: '2026-04-20',
      time: '09:00 - 11:00',
      training_registration_status: 'waitlisted',
      is_training_registration_open: true,
      route: '/match-records?match_id=match-1'
    })).toMatchObject({
      id: 'match-1',
      type: 'match',
      title: 'Morning game',
      date: '2026-04-20',
      training_registration_status: 'waitlisted',
      is_training_registration_open: true,
      route: '/calendar?match_id=match-1'
    })
  })

  it('drops stale attendance payloads from the personal Next Up slot', () => {
    expect(normalizeMyHomeNextEvent({
      id: 'attendance-1',
      type: 'attendance',
      title: 'Roll call',
      date: '2026-04-20',
      route: '/calendar'
    })).toBeNull()
  })

  it('detects when the current next event time range has already ended', () => {
    const snapshot = buildSnapshot({
      next_event: {
        id: 'match-1',
        type: 'match',
        title: 'Morning game',
        date: '2026-04-20',
        time: '09:00 - 11:00',
        location: null,
        opponent: null,
        category_group: null,
        match_level: null,
        coaches: null,
        players: null,
        route: '/calendar?match_id=match-1'
      }
    })

    expect(isMyHomeNextEventExpired(snapshot.next_event, dayjs('2026-04-20T10:30:00'))).toBe(false)
    expect(isMyHomeNextEventExpired(snapshot.next_event, dayjs('2026-04-20T11:00:00'))).toBe(true)
  })

  it('uses a two hour window for next events with only a start time', () => {
    const snapshot = buildSnapshot({
      next_event: {
        id: 'match-1',
        type: 'match',
        title: 'Single time game',
        date: '2026-04-20',
        time: '09:00',
        location: null,
        opponent: null,
        category_group: null,
        match_level: null,
        coaches: null,
        players: null,
        route: '/calendar?match_id=match-1'
      }
    })

    expect(isMyHomeNextEventExpired(snapshot.next_event, dayjs('2026-04-20T10:59:00'))).toBe(false)
    expect(isMyHomeNextEventExpired(snapshot.next_event, dayjs('2026-04-20T11:00:00'))).toBe(true)
  })

  it('shows the training registration shortcut for active registrations while the session is open', () => {
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
      route: '/match-records?match_id=match-1',
      training_registration_status: 'applied',
      is_training_registration_open: true
    } as const

    expect(canShowMyHomeTrainingRegistrationAction(nextEvent)).toBe(true)
    expect(canShowMyHomeTrainingRegistrationAction({
      ...nextEvent,
      training_registration_status: 'selected'
    })).toBe(true)
    expect(canShowMyHomeTrainingRegistrationAction({
      ...nextEvent,
      training_registration_status: 'waitlisted'
    })).toBe(true)

    expect(canShowMyHomeTrainingRegistrationAction({
      ...nextEvent,
      is_training_registration_open: false
    })).toBe(false)
    expect(canShowMyHomeTrainingRegistrationAction({
      ...nextEvent,
      training_registration_status: 'cancelled'
    })).toBe(false)
    expect(canShowMyHomeTrainingRegistrationAction({
      ...nextEvent,
      training_registration_status: 'rejected'
    })).toBe(false)

    expect(canShowMyHomeTrainingRegistrationAction({
      ...nextEvent,
      match_level: '正式賽'
    })).toBe(false)
  })
})
