import { describe, expect, it } from 'vitest'
import {
  buildGuardianAccountSyncRows,
  dedupePlayerSyncRows,
  getProtectedFeeFlagsPayloadForGoogleFormSync,
  isValidPlayerSyncEmail,
  normalizePlayerSyncEmail,
  splitPlayerSyncNames
} from './playerSync'

describe('playerSync', () => {
  it('preserves existing members protected fee flags during Google Form sync', () => {
    expect(getProtectedFeeFlagsPayloadForGoogleFormSync(true)).toEqual({})
  })

  it('defaults new members protected fee flags during Google Form sync', () => {
    expect(getProtectedFeeFlagsPayloadForGoogleFormSync(false)).toEqual({
      is_primary_payer: false,
      is_half_price: false,
      fee_billing_mode: 'role_default'
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

  it('normalizes and validates guardian email fields', () => {
    expect(normalizePlayerSyncEmail(' Parent@Example.COM ')).toBe('parent@example.com')
    expect(isValidPlayerSyncEmail('parent@example.com')).toBe(true)
    expect(isValidPlayerSyncEmail('parent@example,com')).toBe(false)
  })

  it('splits player names by common spreadsheet delimiters', () => {
    expect(splitPlayerSyncNames('小明、小華 / 小美；小安')).toEqual(['小明', '小華', '小美', '小安'])
  })

  it('groups duplicate guardian emails without creating duplicate account rows', () => {
    const rows = buildGuardianAccountSyncRows([
      {
        email: ' Parent@Example.COM ',
        guardianName: '王爸爸',
        playerNames: ['小明']
      },
      {
        email: 'parent@example.com',
        guardianName: '王媽媽',
        playerNames: ['小華、小美']
      },
      {
        email: 'invalid@example,com',
        guardianName: '略過',
        playerNames: ['小安']
      }
    ])

    expect(rows).toEqual([
      {
        email: 'parent@example.com',
        guardianName: '王媽媽',
        playerNames: ['小明', '小華', '小美']
      }
    ])
  })
})
