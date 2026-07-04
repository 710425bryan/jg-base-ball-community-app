import { describe, expect, it } from 'vitest'
import { leaveTimeSegmentOverlapsEventTime } from './attendanceLeave'
import { buildTrainingLocationLeaveEventTimeText } from './trainingLocationLeave'

describe('training location leave helpers', () => {
  it('uses the morning leave window when venue times are empty', () => {
    const eventTimeText = buildTrainingLocationLeaveEventTimeText({
      start_time: null,
      end_time: null
    })

    expect(eventTimeText).toBe('09:00 - 12:00')
    expect(leaveTimeSegmentOverlapsEventTime('afternoon', eventTimeText)).toBe(false)
    expect(leaveTimeSegmentOverlapsEventTime('morning', eventTimeText)).toBe(true)
    expect(leaveTimeSegmentOverlapsEventTime('full_day', eventTimeText)).toBe(true)
  })

  it('treats the default 12:30 venue end as a morning leave window', () => {
    const eventTimeText = buildTrainingLocationLeaveEventTimeText({
      start_time: '09:00',
      end_time: '12:30'
    })

    expect(eventTimeText).toBe('09:00 - 12:00')
    expect(leaveTimeSegmentOverlapsEventTime('afternoon', eventTimeText)).toBe(false)
  })

  it('keeps afternoon venues matched to afternoon leave', () => {
    const eventTimeText = buildTrainingLocationLeaveEventTimeText({
      start_time: '13:00',
      end_time: '15:00'
    })

    expect(eventTimeText).toBe('13:00 - 15:00')
    expect(leaveTimeSegmentOverlapsEventTime('afternoon', eventTimeText)).toBe(true)
    expect(leaveTimeSegmentOverlapsEventTime('morning', eventTimeText)).toBe(false)
  })

  it('falls back to the default morning start when only an end time exists', () => {
    expect(buildTrainingLocationLeaveEventTimeText({
      start_time: '',
      end_time: '11:30'
    })).toBe('09:00 - 11:30')
  })
})
