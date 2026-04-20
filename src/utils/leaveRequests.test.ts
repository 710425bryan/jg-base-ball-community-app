import { describe, expect, it } from 'vitest'
import {
  buildLeaveRequestRecords,
  createDefaultLeaveRequestFormState
} from './leaveRequests'

describe('leaveRequests', () => {
  it('builds one record for single-day leave', () => {
    const form = createDefaultLeaveRequestFormState()

    const records = buildLeaveRequestRecords({
      memberId: 'member-1',
      form: {
        ...form,
        leave_mode: '單日請假',
        date_single: '2026-04-20'
      }
    })

    expect(records).toEqual([{
      member_id: 'member-1',
      leave_type: '事假',
      start_date: '2026-04-20',
      end_date: '2026-04-20',
      reason: null
    }])
  })

  it('builds one record for multi-day leave', () => {
    const form = createDefaultLeaveRequestFormState()

    const records = buildLeaveRequestRecords({
      memberId: 'member-2',
      form: {
        ...form,
        leave_mode: '連續多日',
        date_range: ['2026-04-20', '2026-04-22']
      }
    })

    expect(records).toEqual([{
      member_id: 'member-2',
      leave_type: '事假',
      start_date: '2026-04-20',
      end_date: '2026-04-22',
      reason: null
    }])
  })

  it('expands recurring leave into multiple records', () => {
    const form = createDefaultLeaveRequestFormState()

    const records = buildLeaveRequestRecords({
      memberId: 'member-3',
      form: {
        ...form,
        leave_mode: '固定週期',
        recurring_days: [1, 3],
        recurring_range: ['2026-04-20', '2026-04-27']
      }
    })

    expect(records).toEqual([
      {
        member_id: 'member-3',
        leave_type: '事假',
        start_date: '2026-04-20',
        end_date: '2026-04-20',
        reason: null
      },
      {
        member_id: 'member-3',
        leave_type: '事假',
        start_date: '2026-04-22',
        end_date: '2026-04-22',
        reason: null
      },
      {
        member_id: 'member-3',
        leave_type: '事假',
        start_date: '2026-04-27',
        end_date: '2026-04-27',
        reason: null
      }
    ])
  })

  it('throws when recurring range contains no matching dates', () => {
    const form = createDefaultLeaveRequestFormState()

    expect(() => buildLeaveRequestRecords({
      memberId: 'member-4',
      form: {
        ...form,
        leave_mode: '固定週期',
        recurring_days: [0],
        recurring_range: ['2026-04-20', '2026-04-25']
      }
    })).toThrow('所選期限內沒有符合該星期的日期')
  })
})
