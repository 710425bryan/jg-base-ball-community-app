import { describe, expect, it } from 'vitest'
import { dedupePlayerSyncRows, getProtectedFeeFlagsPayloadForGoogleFormSync } from './playerSync'

describe('playerSync', () => {
  it('preserves existing members protected fee flags during Google Form sync', () => {
    expect(getProtectedFeeFlagsPayloadForGoogleFormSync(true)).toEqual({})
  })

  it('defaults new members protected fee flags during Google Form sync', () => {
    expect(getProtectedFeeFlagsPayloadForGoogleFormSync(false)).toEqual({
      is_primary_payer: false,
      is_half_price: false
    })
  })

  it('deduplicates sync rows by key and keeps the latest row data', () => {
    const { rows, duplicateCount } = dedupePlayerSyncRows(
      [
        { id: 'member-1', name: '小明', role: '球員' },
        { id: 'member-2', name: '小華', role: '球員' },
        { id: 'member-1', name: '小明', role: '校隊' }
      ],
      (row) => row.id
    )

    expect(duplicateCount).toBe(1)
    expect(rows).toEqual([
      { id: 'member-1', name: '小明', role: '校隊' },
      { id: 'member-2', name: '小華', role: '球員' }
    ])
  })

  it('does not merge rows when the dedupe key is blank', () => {
    const { rows, duplicateCount } = dedupePlayerSyncRows(
      [
        { name: '未命名-1' },
        { name: '未命名-2' }
      ],
      () => ''
    )

    expect(duplicateCount).toBe(0)
    expect(rows).toEqual([
      { name: '未命名-1' },
      { name: '未命名-2' }
    ])
  })
})
