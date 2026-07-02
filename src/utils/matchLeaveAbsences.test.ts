import { describe, expect, it } from 'vitest'
import { resolveMatchLeaveAbsenceEventTime } from './matchLeaveAbsences'

describe('match leave absence helpers', () => {
  it('uses the match time field before note fallback', () => {
    expect(resolveMatchLeaveAbsenceEventTime('13:30 - 17:30', '集合時間: 09:00')).toBe('13:30 - 17:30')
  })

  it('falls back to the gather time in calendar notes', () => {
    expect(resolveMatchLeaveAbsenceEventTime('', '[Google Calendar 同步]\n集合時間: 13:30\n原始標題: 新泰太陽 vs 中港熊戰'))
      .toBe('13:30')
  })

  it('normalizes afternoon dot time notation', () => {
    expect(resolveMatchLeaveAbsenceEventTime('', '集合時間: 下午1.30')).toBe('13:30')
  })
})
