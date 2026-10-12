import { describe, expect, it } from 'vitest'
import { getMatchGatherTime, getMatchMapsUrl, isMatchCancelled } from './matchPresentation'

describe('match presentation', () => {
  it.each([
    ['集合時間: 07:30', '07:30'],
    ['[Google Calendar 同步]\r\n  集合時間： 12:00 \r\n原始標題：比賽', '12:00'],
    ['集合時間：下午 1 點半', '下午 1 點半'],
    ['集合時間：\n原始標題：比賽', ''],
    ['請於集合時間前抵達', ''],
    [undefined, '']
  ])('extracts only a labelled gathering time from %s', (note, expected) => {
    expect(getMatchGatherTime({ note })).toBe(expected)
  })

  it('requires a cancellation timestamp, not a missing score or reason', () => {
    expect(isMatchCancelled({})).toBe(false)
    expect(isMatchCancelled({ cancelled_at: null })).toBe(false)
    expect(isMatchCancelled({ cancelled_at: '2026-10-12T02:00:00Z' })).toBe(true)
  })

  it('encodes the complete location for a maps search', () => {
    expect(getMatchMapsUrl(' 大都會球場 A & B ')).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('大都會球場 A & B')}`)
    expect(getMatchMapsUrl('  ')).toBe('')
  })
})
