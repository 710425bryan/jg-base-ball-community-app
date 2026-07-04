import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const getSessionMock = vi.fn()
const invokeMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock
    },
    functions: {
      invoke: invokeMock
    },
    rpc: rpcMock
  }
}))

describe('trainingDatesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gets month dates with normalized program key and sorted in-month dates', async () => {
    rpcMock.mockResolvedValue({
      data: {
        month_start: '2026-07-01',
        program_key: 'junior_high',
        program_label: '國中校隊',
        is_default: false,
        training_dates: ['2026-08-01', '2026-07-11', '2026-07-04'],
        note: '暑訓'
      },
      error: null
    })

    const { trainingDatesApi } = await import('./trainingDatesApi')

    expect(await trainingDatesApi.getMonthDates('2026-07', {
      programKey: 'Junior High',
      programLabel: '國中校隊'
    })).toMatchObject({
      month_start: '2026-07-01',
      month: '2026-07',
      program_key: 'junior_high',
      program_label: '國中校隊',
      training_dates: ['2026-07-04', '2026-07-11'],
      note: '暑訓',
      is_default: false
    })
    expect(rpcMock).toHaveBeenCalledWith('get_training_month_dates', {
      p_month: '2026-07-01',
      p_program_key: 'junior_high'
    })
  })

  it('saves month dates and normalizes notification diffs', async () => {
    rpcMock.mockResolvedValue({
      data: {
        changed: true,
        month_start: '2026-07-01',
        program_key: 'default',
        program_label: '中港校隊',
        training_dates: ['2026-07-11', '2026-07-04'],
        added_dates: ['2026-07-11'],
        removed_dates: ['2026-07-18'],
        updated_at: '2026-07-01T00:00:00.000Z'
      },
      error: null
    })

    const { trainingDatesApi } = await import('./trainingDatesApi')

    expect(await trainingDatesApi.saveMonthDates({
      month: '2026-07',
      trainingDates: ['2026-07-11', 'bad', '2026-07-04'],
      note: ''
    })).toMatchObject({
      changed: true,
      training_dates: ['2026-07-04', '2026-07-11'],
      added_dates: ['2026-07-11'],
      removed_dates: ['2026-07-18']
    })
  })

  it('dispatches notifications with the current session bearer token', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-1' } },
      error: null
    })
    invokeMock.mockResolvedValue({ data: { success: true, dry_run: true }, error: null })

    const { trainingDatesApi } = await import('./trainingDatesApi')
    const result = await trainingDatesApi.dispatchNotifications({
      changed: true,
      month_start: '2026-07-01',
      program_key: 'junior_high',
      program_label: '國中校隊',
      training_dates: ['2026-07-04'],
      added_dates: ['2026-07-04'],
      removed_dates: [],
      note: null,
      updated_at: 'changed-key'
    }, { dryRun: true })

    expect(result).toEqual({ success: true, dry_run: true })
    expect(invokeMock).toHaveBeenCalledWith('send-training-date-notifications', {
      headers: { Authorization: 'Bearer token-1' },
      body: {
        month_start: '2026-07-01',
        program_key: 'junior_high',
        program_label: '國中校隊',
        training_dates: ['2026-07-04'],
        added_dates: ['2026-07-04'],
        removed_dates: [],
        change_key: 'changed-key',
        dry_run: true
      }
    })
  })
})
