import { describe, expect, it } from 'vitest'
import {
  buildEditableFieldPlayers,
  buildFieldSlotMap,
  mergeEditablePlayersWithHiddenEntries,
  moveEditablePlayerToSlot,
  normalizeLineupPosition,
  reorderEditablePlayers
} from './matchFieldEditor'

describe('matchFieldEditor helpers', () => {
  it('normalizes unsupported or empty positions into bench', () => {
    expect(normalizeLineupPosition('1')).toBe('1')
    expect(normalizeLineupPosition('DH')).toBe('DH')
    expect(normalizeLineupPosition('')).toBe('預備')
    expect(normalizeLineupPosition('投手')).toBe('預備')
  })

  it('moves duplicate occupied positions into the bench and keeps blank rows hidden', () => {
    const { editorPlayers, hiddenEntries } = buildEditableFieldPlayers([
      { order: 1, position: '1', name: '先發投手', number: '11' },
      { order: 2, position: '1', name: '中繼投手', number: '21' },
      { order: 3, position: '', name: '', number: '' }
    ])

    expect(editorPlayers).toHaveLength(2)
    expect(hiddenEntries).toHaveLength(1)
    expect(editorPlayers[0].position).toBe('1')
    expect(editorPlayers[1].position).toBe('預備')
  })

  it('maps field slots without including bench players', () => {
    const slotMap = buildFieldSlotMap([
      { editorId: 'a', order: 1, position: '1', name: '投手', number: '11', remark: '', photoUrl: '', initials: '投手' },
      { editorId: 'b', order: 2, position: '預備', name: '替補', number: '22', remark: '', photoUrl: '', initials: '替補' }
    ])

    expect(slotMap['1']?.name).toBe('投手')
    expect(slotMap['2']).toBeNull()
  })

  it('swaps occupied defensive positions without changing batting order', () => {
    const nextPlayers = moveEditablePlayerToSlot([
      { editorId: 'pitcher', order: 1, position: '1', name: '投手', number: '11', remark: '', photoUrl: '', initials: '投手' },
      { editorId: 'shortstop', order: 2, position: '6', name: '游擊', number: '22', remark: '', photoUrl: '', initials: '游擊' }
    ], 'shortstop', '1')

    expect(nextPlayers.find((player) => player.editorId === 'pitcher')?.position).toBe('6')
    expect(nextPlayers.find((player) => player.editorId === 'shortstop')?.position).toBe('1')
    expect(nextPlayers.find((player) => player.editorId === 'pitcher')?.order).toBe(1)
    expect(nextPlayers.find((player) => player.editorId === 'shortstop')?.order).toBe(2)
  })

  it('reorders batting order while preserving positions', () => {
    const reordered = reorderEditablePlayers([
      { editorId: 'a', order: 1, position: '7', name: '一棒', number: '15', remark: '', photoUrl: '', initials: '一棒' },
      { editorId: 'b', order: 2, position: '6', name: '二棒', number: '2', remark: '', photoUrl: '', initials: '二棒' },
      { editorId: 'c', order: 3, position: '1', name: '三棒', number: '18', remark: '', photoUrl: '', initials: '三棒' }
    ], ['c', 'a', 'b'])

    expect(reordered.map((player) => player.name)).toEqual(['三棒', '一棒', '二棒'])
    expect(reordered.map((player) => player.order)).toEqual([1, 2, 3])
    expect(reordered.find((player) => player.editorId === 'c')?.position).toBe('1')
  })

  it('merges draggable players with hidden rows after named players', () => {
    const merged = mergeEditablePlayersWithHiddenEntries([
      { editorId: 'a', order: 2, position: '6', name: '游擊', number: '8', remark: '', photoUrl: '', initials: '游擊' },
      { editorId: 'b', order: 1, position: '1', name: '投手', number: '11', remark: '', photoUrl: '', initials: '投手' }
    ], [
      { order: 99, position: '', name: '', number: '', remark: '' }
    ])

    expect(merged).toHaveLength(3)
    expect(merged[0].name).toBe('投手')
    expect(merged[1].name).toBe('游擊')
    expect(merged[2].name).toBe('')
    expect(merged[2].order).toBe(3)
  })
})
