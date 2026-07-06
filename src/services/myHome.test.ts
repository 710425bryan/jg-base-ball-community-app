import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSupabaseRpcAvailabilityCache } from '@/utils/supabaseRpc'

const rpcMock = vi.fn()
const inMock = vi.fn()
const selectMock = vi.fn(() => ({ in: inMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
const apiMocks = vi.hoisted(() => ({
  listMyMatchFeeItems: vi.fn(),
  trainingDatesApi: {
    getMonthDates: vi.fn()
  },
  trainingProgramsApi: {
    listSettings: vi.fn()
  }
}))

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock
  }
}))

vi.mock('@/services/matchFees', () => ({
  listMyMatchFeeItems: apiMocks.listMyMatchFeeItems
}))

vi.mock('@/services/trainingDatesApi', () => ({
  trainingDatesApi: apiMocks.trainingDatesApi
}))

vi.mock('@/services/trainingProgramsApi', () => ({
  trainingProgramsApi: apiMocks.trainingProgramsApi
}))

describe('myHome service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseRpcAvailabilityCache()
    apiMocks.trainingProgramsApi.listSettings.mockResolvedValue([
      {
        program_key: 'chunggang_school_team',
        label: '中港校隊',
        team_group: '中港校隊',
        default_weekdays: [6],
        default_start_time: '09:00',
        default_end_time: '12:30',
        default_venue_name: '中港國小',
        default_venue_address: null,
        default_venue_maps_url: null,
        sort_order: 10,
        is_active: true,
        created_at: null,
        updated_at: null
      }
    ])
  })

  it('normalizes and enriches the personal home snapshot', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: {
          members: [{
            id: 'member-1',
            name: '小明',
            role: '校隊',
            team_group: '中港校隊',
            status: '在隊',
            jersey_number: 7
          }],
          training_locations: [],
          training_month_dates: ['2026-07-11', '2026-07-04'],
          payment_summary: {
            unpaid_count: '2',
            pending_review_count: '1',
            total_unpaid_amount: '3000'
          },
          equipment_summary: {
            active_request_count: '1'
          }
        },
        error: null
      })
      .mockResolvedValueOnce({
        data: [{
          member_id: 'member-1',
          point_balance: '12',
          reserved_points: '2',
          available_points: '10'
        }],
        error: null
      })
    inMock.mockResolvedValue({
      data: [{ id: 'member-1', status: '在隊', is_inactive_or_graduated: false }],
      error: null
    })
    apiMocks.listMyMatchFeeItems.mockResolvedValue([
      { payment_status: 'unpaid', amount: '500' },
      { payment_status: 'pending_review', amount: '300' }
    ])

    const { getMyHomeSnapshot } = await import('./myHome')
    const snapshot = await getMyHomeSnapshot('2026-07-05')

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'get_my_home_snapshot', {
      p_today: '2026-07-05'
    })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'list_my_training_members')
    expect(snapshot.members).toEqual([
      expect.objectContaining({
        id: 'member-1',
        name: '小明',
        jersey_number: '7',
        point_balance: 12,
        reserved_training_points: 2,
        available_training_points: 10,
        training_program: 'chunggang_school_team',
        training_program_label: '中港校隊'
      })
    ])
    expect(snapshot.payment_summary).toMatchObject({
      unpaid_count: 2,
      pending_review_count: 1,
      total_unpaid_amount: 3000
    })
    expect(snapshot.match_fee_summary).toEqual({
      unpaid_count: 1,
      pending_review_count: 1,
      unpaid_amount: 500
    })
    expect(snapshot.training_month_dates.map((item) => item.date)).toEqual(['2026-07-04', '2026-07-11'])
  })

  it('fetches member program dates when an older snapshot only includes default training dates', async () => {
    apiMocks.trainingProgramsApi.listSettings.mockResolvedValue([
      {
        program_key: 'chunggang_school_team',
        label: '中港校隊',
        team_group: '中港校隊',
        default_weekdays: [6],
        default_start_time: '09:00',
        default_end_time: '12:30',
        default_venue_name: '中港國小',
        default_venue_address: null,
        default_venue_maps_url: null,
        sort_order: 10,
        is_active: true,
        created_at: null,
        updated_at: null
      },
      {
        program_key: 'junior_high_school_team',
        label: '國中校隊',
        team_group: '國中校隊',
        default_weekdays: [0],
        default_start_time: '09:00',
        default_end_time: '12:00',
        default_venue_name: '新泰國中',
        default_venue_address: null,
        default_venue_maps_url: null,
        sort_order: 20,
        is_active: true,
        created_at: null,
        updated_at: null
      }
    ])
    rpcMock.mockResolvedValueOnce({
      data: {
        members: [{
          id: 'member-junior',
          name: '國中球員',
          role: '校隊',
          team_group: '新泰熊戰',
          status: '在隊',
          point_balance: 0,
          reserved_training_points: 0,
          available_training_points: 0
        }],
        training_locations: [],
        training_month_dates: ['2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25'],
        payment_summary: {},
        equipment_summary: {}
      },
      error: null
    })
    inMock.mockResolvedValue({
      data: [{
        id: 'member-junior',
        status: '在隊',
        is_inactive_or_graduated: false,
        training_program: 'junior_high_school_team'
      }],
      error: null
    })
    apiMocks.trainingDatesApi.getMonthDates.mockResolvedValue({
      month_start: '2026-07-01',
      month: '2026-07',
      program_key: 'junior_high_school_team',
      program_label: '國中校隊',
      training_dates: ['2026-07-04', '2026-07-11', '2026-07-19', '2026-07-26'],
      note: null,
      is_default: false,
      updated_at: '2026-07-06T00:00:00.000Z'
    })
    apiMocks.listMyMatchFeeItems.mockResolvedValue([])

    const { getMyHomeSnapshot } = await import('./myHome')
    const snapshot = await getMyHomeSnapshot('2026-07-05')

    expect(apiMocks.trainingDatesApi.getMonthDates).toHaveBeenCalledWith('2026-07', {
      programKey: 'junior_high_school_team',
      programLabel: '國中校隊',
      defaultWeekdays: [0]
    })
    expect(snapshot.members[0]).toMatchObject({
      training_program: 'junior_high_school_team',
      training_program_label: '國中校隊'
    })
    expect(snapshot.training_month_dates.map((item) => item.date)).toEqual([
      '2026-07-04',
      '2026-07-11',
      '2026-07-19',
      '2026-07-26'
    ])
    expect(snapshot.training_month_dates_by_program.chunggang_school_team.map((item) => item.date)).toEqual([
      '2026-07-04',
      '2026-07-11',
      '2026-07-18',
      '2026-07-25'
    ])
    expect(snapshot.training_month_dates_by_program.junior_high_school_team.map((item) => item.date)).toEqual([
      '2026-07-04',
      '2026-07-11',
      '2026-07-19',
      '2026-07-26'
    ])
  })

  it('returns and caches an empty snapshot when the RPC is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'get_my_home_snapshot missing'
      }
    })

    const { getMyHomeSnapshot } = await import('./myHome')

    expect(await getMyHomeSnapshot('2026-07-05')).toMatchObject({
      members: [],
      training_locations: [],
      payment_summary: {
        unpaid_count: 0
      }
    })
    expect(await getMyHomeSnapshot('2026-07-06')).toMatchObject({
      members: []
    })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(apiMocks.trainingProgramsApi.listSettings).not.toHaveBeenCalled()
  })
})
