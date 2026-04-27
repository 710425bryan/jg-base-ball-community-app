import { describe, expect, it } from 'vitest'
import { buildUtf8BomCsv, escapeCsvCell, UTF8_BOM } from './csvExport'

describe('csvExport', () => {
  it('adds UTF-8 BOM and CRLF line endings for Windows spreadsheet apps', () => {
    const csv = buildUtf8BomCsv([
      ['姓名', '備註'],
      ['小明', '中文資料']
    ])

    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(csv).toBe(`${UTF8_BOM}姓名,備註\r\n小明,中文資料`)
  })

  it('escapes commas, quotes, and newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('他說 "OK"')).toBe('"他說 ""OK"""')
    expect(escapeCsvCell('第一行\n第二行')).toBe('"第一行\n第二行"')
  })
})
