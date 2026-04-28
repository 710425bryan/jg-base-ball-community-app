import { describe, expect, it } from 'vitest'
import {
  buildLineupRowsFromParsedResult,
  buildRosterCandidates
} from './lineupPhotoParser'

describe('lineupPhotoParser', () => {
  it('sorts parsed starters by batting order and appends unique reserves', () => {
    const result = buildLineupRowsFromParsedResult({
      lineup: [
        { order: 2, position: '6', name: '林大華', number: '7' },
        { order: 1, position: '5', name: '王小明', number: '10' },
        { order: 2, position: '', name: '', number: '' },
        { order: 12, position: '9', name: '超出範圍', number: '99' },
        { order: 'x', position: '1', name: '無效棒次', number: '1' }
      ],
      reserves: [
        { name: '陳替補', number: '18' },
        { name: '陳替補', number: '18' },
        { name: '王小明', number: '10' },
        { name: '', number: '0' }
      ]
    })

    expect(result.lineup).toHaveLength(10)
    expect(result.lineup[0]).toMatchObject({ order: 1, position: '5', name: '王小明', number: '10' })
    expect(result.lineup[1]).toMatchObject({ order: 2, position: '6', name: '林大華', number: '7' })
    expect(result.lineup[8]).toMatchObject({ order: 9, position: '', name: '', number: '' })
    expect(result.lineup[9]).toMatchObject({ order: 10, position: '預備', name: '陳替補', number: '18' })
    expect(result.playerNames).toEqual(['王小明', '林大華', '陳替補'])
    expect(result.players).toBe('王小明,林大華,陳替補')
  })

  it('dedupes roster candidates and fills jersey number from the richest source', () => {
    const roster = buildRosterCandidates({
      selectedPlayers: ['王小明', '林大華'],
      playerOptions: [
        { name: '王小明', jersey_number: '10' },
        { name: '林大華', jersey_number: '' },
        { name: '陳替補', jersey_number: '18' }
      ],
      lineups: [[
        { order: 1, position: '5', name: '林大華', number: '7' },
        { order: 2, position: '6', name: '王小明', number: '' }
      ]]
    })

    expect(roster).toEqual([
      { name: '王小明', uniform_number: '10' },
      { name: '林大華', uniform_number: '7' },
      { name: '陳替補', uniform_number: '18' }
    ])
  })
})
