import type { PitchingStat } from '@/types/match'
import { formatInnings } from '@/utils/matchRecordStats'

export const isValidPitchingOuts = (outs: unknown): outs is number =>
  typeof outs === 'number' && Number.isSafeInteger(outs) && outs >= 0

export const formatPitchingInnings = (outs: unknown) =>
  isValidPitchingOuts(outs) ? formatInnings(outs) : '—'

export const formatPitchingEra = (stat: PitchingStat) => {
  if (!isValidPitchingOuts(stat.ip)) return '—'
  return stat.ip > 0 ? (((stat.er || 0) * 7) / (stat.ip / 3)).toFixed(2) : '0.00'
}

export const createEmptyPitchingStat = (name = '', number = ''): PitchingStat => ({
  name,
  number,
  ip: 0,
  h: 0,
  h2: 0,
  h3: 0,
  hr: 0,
  r: 0,
  er: 0,
  bb: 0,
  so: 0,
  np: 0,
  ab: 0,
  go: 0,
  ao: 0
})
