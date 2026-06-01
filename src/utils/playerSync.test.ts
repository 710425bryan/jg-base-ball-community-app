import { describe, expect, it } from 'vitest'
import {
  buildPlayerSyncCsvHeaderMap,
  buildGuardianAccountSyncRows,
  dedupePlayerSyncRows,
  getPlayerSyncCsvCell,
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

  it('reads Google Form sync cells by header instead of fixed column positions', () => {
    const headerMap = buildPlayerSyncCsvHeaderMap([
      '姓名',
      '身分',
      '中港校隊',
      '是否有兄弟姐妹也在熊戰社區',
      '出生年月日',
      '年級',
      '提早入學',
      '身分證字號',
      '投球慣用手',
      '打擊慣用方向',
      '主要聯絡人LINE ID',
      '主要聯絡人email',
      '主要聯絡人身分',
      '法定代理人',
      '法定代理人-手機',
      '清寒低收資格',
      '備註',
      '肖像授權同意權'
    ])
    const row = [
      '小明',
      '球員',
      '否',
      '',
      '2016/01/01',
      '三年級',
      '無',
      'A123456789',
      '右投',
      '右打',
      'line-id',
      'parent@example.com',
      '父親',
      '王爸爸',
      '0912345678',
      '否',
      '無',
      '已充分閱讀並同意'
    ]

    expect(getPlayerSyncCsvCell(row, headerMap, '姓名')).toBe('小明')
    expect(getPlayerSyncCsvCell(row, headerMap, '清寒低收資格')).toBe('否')
    expect(getPlayerSyncCsvCell(row, headerMap, '球衣號碼', '背號')).toBe('')
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
