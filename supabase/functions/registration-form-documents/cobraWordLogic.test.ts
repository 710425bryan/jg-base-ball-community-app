import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOMParser, XMLSerializer, type Node } from '@xmldom/xmldom'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { detectRegistrationProfile, generateRegistrationDocument, type GenerateDocumentInput } from './logic'
import { PLAYER_GRADE_OPTIONS } from '../../../src/utils/playerGrade'

const sourceXml = readFileSync(new URL('./fixtures/cobra-cup-document.xml', import.meta.url), 'utf8')
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml')
const fixture = (xml = sourceXml) => zipSync({
  '[Content_Types].xml': strToU8('<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  'word/document.xml': strToU8(xml),
  'word/styles.xml': strToU8('<styles>preserve-original-styles</styles>')
})
const input = (count: number): GenerateDocumentInput => ({
  fields: { team_name: '中港熊戰', leader_name: '領隊甲', head_coach_name: '教練乙', manager_name: '管理丙',
    coach_1_name: '教練丁', coach_2_name: '教練戊', contact_name: '聯絡己', contact_phone: '0900000000', address: '新北市新莊區中港路測試地址' },
  players: Array.from({ length: count }, (_, index) => ({
    id: `test-${index}`, name: `測試${String(index + 1).padStart(2, '0')}`, jersey_number: String(70 + index),
    birth_date: '2018-06-18', national_id: 'A100000001', grade: '二年級', notes: index === 0 ? '隊長' : '', portrait_auth: false
  }))
})
const xmlOf = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['word/document.xml'])
const serialized = (nodes: ArrayLike<Node>) => Array.from(nodes).map((node) => new XMLSerializer().serializeToString(node))

describe('second Cobra Cup Word template', () => {
  it('recognizes the supplied split-run title and exact 14-row structure', () => {
    expect(detectRegistrationProfile(fixture())).toMatchObject({ key: 'cobra_cup_docx', fileType: 'docx', minPlayers: 10, maxPlayers: 14, hasPhotoSlots: false })
  })

  it.each([10, 14])('fills %i players in order and keeps the title, footer, table geometry and other package parts', (count) => {
    const output = generateRegistrationDocument(fixture(), 'cobra_cup_docx', input(count))
    const document = parse(xmlOf(output))
    const original = parse(sourceXml)
    const rows = document.getElementsByTagNameNS(ns, 'tr')
    const cells = rows[3].getElementsByTagNameNS(ns, 'tc')
    expect(Array.from(cells).map((cell) => cell.textContent)).toEqual(['70', '測試01', '2018/06/18', 'A100000001', '二年級', '隊長'])
    expect(rows[2 + count].textContent).toContain(String(69 + count))
    for (let index = count; index < 14; index += 1) expect(rows[3 + index].textContent).toBe('')
    expect(rows[1].textContent).toContain('聯絡人電話：0900000000')
    expect(rows[1].textContent).toContain('地  址：新北市新莊區中港路測試地址')
    expect(rows[1].getElementsByTagNameNS(ns, 'br')).toHaveLength(1)
    const originalRows = original.getElementsByTagNameNS(ns, 'tr')
    for (const rowIndex of [0, 2, 17]) expect(rows[rowIndex].toString()).toBe(originalRows[rowIndex].toString())
    for (const tag of ['sectPr', 'tblPr', 'tblGrid', 'tcPr', 'trPr']) {
      expect(serialized(document.getElementsByTagNameNS(ns, tag))).toEqual(serialized(original.getElementsByTagNameNS(ns, tag)))
    }
    expect(unzipSync(output)['word/styles.xml']).toEqual(unzipSync(fixture())['word/styles.xml'])
    expect(Object.keys(unzipSync(output)).some((name) => name.includes('/media/'))).toBe(false)
  })

  it.each([0, 9, 15])('rejects %i players and mismatched profile metadata', (count) => {
    expect(() => generateRegistrationDocument(fixture(), 'cobra_cup_docx', input(count))).toThrow('10 至 14')
    expect(() => generateRegistrationDocument(fixture(), 'chairperson_cup_u9', input(10))).toThrow('metadata')
  })

  it.each(PLAYER_GRADE_OPTIONS.map(({ value }) => value))('fits the real roster grade %s without removing any text', (grade) => {
    for (const count of [10, 14]) {
      const data = input(count)
      data.players.forEach((player) => { player.grade = grade })
      const document = parse(xmlOf(generateRegistrationDocument(fixture(), 'cobra_cup_docx', data)))
      const rows = document.getElementsByTagNameNS(ns, 'tr')
      for (let index = 0; index < count; index += 1) {
        const gradeCell = rows[3 + index].getElementsByTagNameNS(ns, 'tc')[4]
        expect(gradeCell.textContent).toBe(grade)
        expect(gradeCell.getElementsByTagNameNS(ns, 'br')).toHaveLength(1)
        const fontSizes = Array.from(gradeCell.getElementsByTagNameNS(ns, 'sz'))
          .map((size) => Number(size.getAttributeNS(ns, 'val')) / 2)
        expect(fontSizes.every((size) => size >= 9)).toBe(true)
        expect(gradeCell.getElementsByTagNameNS(ns, 'snapToGrid')[0].getAttributeNS(ns, 'val')).toBe('0')
      }
      for (const tag of ['sectPr', 'tblPr', 'tblGrid', 'tcPr', 'trPr']) {
        expect(serialized(document.getElementsByTagNameNS(ns, tag))).toEqual(serialized(parse(sourceXml).getElementsByTagNameNS(ns, tag)))
      }
      expect(data.players[0].grade).toBe(grade)
    }
  })

  it('rejects missing fields and text that cannot fit instead of truncating', () => {
    const missingAddress = input(10)
    missingAddress.fields.address = ''
    expect(() => generateRegistrationDocument(fixture(), 'cobra_cup_docx', missingAddress)).toThrow('地址')
    for (const field of ['name', 'jersey_number', 'birth_date', 'national_id', 'grade'] as const) {
      const missing = input(10)
      missing.players[0][field] = ''
      expect(() => generateRegistrationDocument(fixture(), 'cobra_cup_docx', missing)).toThrow('第 1 位球員缺少')
    }
    const longText = input(10)
    longText.players[0].notes = '過長備註'.repeat(30)
    expect(() => generateRegistrationDocument(fixture(), 'cobra_cup_docx', longText)).toThrow('文字過長')
    const longGrade = input(10)
    longGrade.players[0].grade = '國小一年級加上過長補充文字'
    expect(() => generateRegistrationDocument(fixture(), 'cobra_cup_docx', longGrade)).toThrow('年級文字過長')
  })

  it('rejects changed headers, removed rows and merged player cells even with the correct title', () => {
    expect(() => detectRegistrationProfile(fixture(sourceXml.replace('身分證字號', '其他資料')))).toThrow('尚未支援')
    const missingRow = parse(sourceXml)
    const row = missingRow.getElementsByTagNameNS(ns, 'tr')[5]
    row.parentNode!.removeChild(row)
    expect(() => detectRegistrationProfile(fixture(missingRow.toString()))).toThrow('尚未支援')
    const merged = parse(sourceXml)
    const cell = merged.getElementsByTagNameNS(ns, 'tr')[3].getElementsByTagNameNS(ns, 'tcPr')[0]
    cell.appendChild(merged.createElementNS(ns, 'w:gridSpan'))
    expect(() => detectRegistrationProfile(fixture(merged.toString()))).toThrow('尚未支援')
  })

  it('escapes text and still applies the shared external-relationship rejection', () => {
    const special = input(10)
    special.fields.team_name = '熊<&隊'
    expect(parse(xmlOf(generateRegistrationDocument(fixture(), 'cobra_cup_docx', special))).documentElement.textContent).toContain('熊<&隊')
    const files = unzipSync(fixture())
    files['word/_rels/document.xml.rels'] = strToU8('<Relationships><Relationship TargetMode="External" Target="https://example.com"/></Relationships>')
    expect(() => detectRegistrationProfile(zipSync(files))).toThrow('外部關聯')
  })
})
