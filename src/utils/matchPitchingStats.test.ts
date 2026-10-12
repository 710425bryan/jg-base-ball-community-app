import { describe, expect, it } from 'vitest'
import {
  createEmptyPitchingStat,
  formatPitchingEra,
  formatPitchingInnings,
  isValidPitchingOuts
} from './matchPitchingStats'

describe('matchPitchingStats', () => {
  it.each([[0, '0.0'], [1, '0.1'], [2, '0.2'], [3, '1.0'], [5, '1.2'], [9, '3.0']])(
    'formats %s whole outs as %s innings', (outs, expected) => {
      expect(isValidPitchingOuts(outs)).toBe(true)
      expect(formatPitchingInnings(outs)).toBe(expected)
    }
  )

  it.each([0.66, 0.33, 1.2, -1, NaN, Infinity, null, undefined, '', '2'])('rejects invalid outs %s without rounding or treating them as innings', (outs) => {
    expect(isValidPitchingOuts(outs)).toBe(false)
    expect(formatPitchingInnings(outs)).toBe('—')
  })

  it('calculates the existing seven-inning ERA using outs divided by three', () => {
    const stat = { ...createEmptyPitchingStat('投手', '8'), er: 1 }
    expect(formatPitchingEra({ ...stat, ip: 2 })).toBe('10.50')
    expect(formatPitchingEra({ ...stat, ip: 9 })).toBe('2.33')
    expect(formatPitchingEra({ ...stat, ip: 0 })).toBe('0.00')
    expect(formatPitchingEra({ ...stat, ip: 0.66 })).toBe('—')
  })

  it('starts independent new pitcher rows with zero whole outs', () => {
    const first = createEmptyPitchingStat('投手', '8')
    first.ip = 2
    expect(first).toMatchObject({ name: '投手', number: '8', ip: 2, er: 0, so: 0 })
    expect(createEmptyPitchingStat()).toMatchObject({ name: '', number: '', ip: 0 })
  })
})
