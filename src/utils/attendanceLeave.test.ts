import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_STATUS_LEAVE,
  ATTENDANCE_STATUS_UNSET,
  buildAttendanceLeaveMemberIdSet,
  buildAttendanceLeaveSummaryRows,
  filterAttendanceLeaveRecordsForEvent,
  getDefaultAttendanceStatusForMember,
  leaveTimeSegmentOverlapsEventTime,
  normalizeAttendanceDate,
  normalizeRollCallStatus
} from './attendanceLeave'

describe('attendance leave helpers', () => {
  it('builds leave member ids from leave_requests.user_id', () => {
    const ids = buildAttendanceLeaveMemberIdSet([
      { user_id: 'member-1' },
      { user_id: ' member-2 ' },
      { user_id: null },
      { member_id: 'legacy-member' }
    ])

    expect(Array.from(ids).sort()).toEqual(['legacy-member', 'member-1', 'member-2'])
  })

  it('defaults only overlapping leave members to leave', () => {
    const leaveMemberIds = buildAttendanceLeaveMemberIdSet([{ user_id: 'member-1' }])

    expect(getDefaultAttendanceStatusForMember('member-1', leaveMemberIds)).toBe(ATTENDANCE_STATUS_LEAVE)
    expect(getDefaultAttendanceStatusForMember('member-2', leaveMemberIds)).toBe(ATTENDANCE_STATUS_UNSET)
  })

  it('can use leave as the visual fallback for unrecorded roll call members', () => {
    const leaveMemberIds = buildAttendanceLeaveMemberIdSet([{ user_id: 'member-1' }])

    expect(getDefaultAttendanceStatusForMember('member-2', leaveMemberIds, ATTENDANCE_STATUS_LEAVE))
      .toBe(ATTENDANCE_STATUS_LEAVE)
  })

  it('hides legacy pending status in the roll call UI', () => {
    expect(normalizeRollCallStatus('待點名')).toBe(ATTENDANCE_STATUS_UNSET)
    expect(normalizeRollCallStatus('出席')).toBe('出席')
  })

  it('normalizes leave type statuses to the roll call leave status', () => {
    expect(normalizeRollCallStatus('事假')).toBe(ATTENDANCE_STATUS_LEAVE)
    expect(normalizeRollCallStatus('病假')).toBe(ATTENDANCE_STATUS_LEAVE)
    expect(normalizeRollCallStatus('公假')).toBe(ATTENDANCE_STATUS_LEAVE)
    expect(normalizeRollCallStatus('其他')).toBe(ATTENDANCE_STATUS_LEAVE)
  })

  it('normalizes date-like values before querying leave ranges', () => {
    expect(normalizeAttendanceDate('2026-05-16T00:00:00+08:00')).toBe('2026-05-16')
    expect(normalizeAttendanceDate('2026-05-16')).toBe('2026-05-16')
  })

  it('keeps all leave rows visible while marking which ones belong to the roll call list', () => {
    const rows = buildAttendanceLeaveSummaryRows([
      {
        id: 'leave-1',
        user_id: 'member-1',
        leave_type: '事假',
        team_members: { id: 'member-1', name: '小明', role: '球員' }
      },
      {
        id: 'leave-2',
        user_id: 'member-2',
        leave_type: '病假',
        team_members: { id: 'member-2', name: '小華', role: '球員' }
      }
    ], [
      { id: 'member-1', name: '小明', role: '球員', jersey_number: 7 }
    ])

    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.member_id === 'member-1')).toMatchObject({
      name: '小明',
      jersey_number: 7,
      in_roll_call_list: true
    })
    expect(rows.find((row) => row.member_id === 'member-2')).toMatchObject({
      name: '小華',
      in_roll_call_list: false
    })
  })

  it('checks leave segment overlap against event times', () => {
    expect(leaveTimeSegmentOverlapsEventTime('morning', '09:00 - 12:00')).toBe(true)
    expect(leaveTimeSegmentOverlapsEventTime('morning', '13:00 - 15:00')).toBe(false)
    expect(leaveTimeSegmentOverlapsEventTime('afternoon', '13:00 - 15:00')).toBe(true)
    expect(leaveTimeSegmentOverlapsEventTime('morning', '')).toBe(true)
    expect(leaveTimeSegmentOverlapsEventTime('full_day', '13:00 - 15:00')).toBe(true)
  })

  it('filters leave rows by event time segment', () => {
    const rows = filterAttendanceLeaveRecordsForEvent([
      { id: 'leave-1', user_id: 'member-1', leave_time_segment: 'morning' },
      { id: 'leave-2', user_id: 'member-2', leave_time_segment: 'afternoon' },
      { id: 'leave-3', user_id: 'member-3', leave_time_segment: 'full_day' }
    ], '13:00 - 15:00')

    expect(rows.map((row) => row.id)).toEqual(['leave-2', 'leave-3'])
  })
})
